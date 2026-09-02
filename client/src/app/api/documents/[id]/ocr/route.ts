import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import {
  loadPdf,
  renderPage,
  sanitizePage,
  ocrPage,
  createOcrWorker,
  type OcrWorker,
} from "@/lib/pipeline";
import { sourcePdfPath } from "@/lib/storage";
import { rateLimit } from "@/lib/rateLimit";
import { safeErrorMessage } from "@/lib/safeError";

/**
 * Tesseract OCR over every page of a document.
 *
 * - OCR runs on the SANITIZED image (the same pipeline the Pixel panel uses),
 *   not the raw render, so hidden low-contrast text is picked up.
 * - Word-level boxes + per-page confidence are persisted to the pdfPage table.
 * - Runs are idempotent: an existing run's page rows are cleared and overwritten
 *   rather than rejected.
 * - Each page is isolated (one bad page does not abort the run) and retried once
 *   with backoff. Progress + per-page results/errors stream as NDJSON.
 */

const OCR_RATE_MAX = 3;
const OCR_RATE_WINDOW_MS = 10 * 60 * 1000; // 3 runs / 10 minutes / user

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 600));
    return fn();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const doc = await prisma.pdfDocument.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user || doc.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Per-user rate limit on OCR runs.
  const limit = rateLimit(`ocr:${user.id}`, OCR_RATE_MAX, OCR_RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit reached. Try again in ${limit.retryAfterSeconds}s.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let pdfDoc: Awaited<ReturnType<typeof loadPdf>>;
  let numPages: number;
  try {
    const pdfBuffer = await readFile(sourcePdfPath(doc.filePath));
    pdfDoc = await loadPdf(pdfBuffer);
    numPages = pdfDoc.numPages;
  } catch (e) {
    console.error("OCR load error:", e);
    return NextResponse.json({ error: safeErrorMessage(e) }, { status: 500 });
  }

  // Idempotent re-run: drop any previously persisted pages for this document.
  await prisma.pdfPage.deleteMany({ where: { documentId: id } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      let worker: OcrWorker | null = null;
      let succeeded = 0;
      try {
        worker = await createOcrWorker();

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          emit({ type: "progress", page: pageNum, totalPages: numPages });

          try {
            const result = await withRetry(async () => {
              const { buffer } = await renderPage(pdfDoc, pageNum);
              const sanitized = await sanitizePage(buffer);
              return ocrPage(worker, sanitized);
            });

            await prisma.pdfPage.create({
              data: {
                documentId: id,
                pageNumber: pageNum,
                confidence: result.confidence,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                wordsJson: result.words as any,
              },
            });
            succeeded += 1;

            emit({
              type: "page_done",
              page: pageNum,
              totalPages: numPages,
              text: result.text,
              confidence: result.confidence,
              wordCount: result.words.length,
            });
          } catch (pageErr) {
            // One bad page must not kill the whole run.
            console.error(`OCR page ${pageNum} failed:`, pageErr);
            emit({
              type: "page_error",
              page: pageNum,
              totalPages: numPages,
              error: safeErrorMessage(pageErr),
            });
          }
        }

        await prisma.pdfDocument.update({
          where: { id },
          data: {
            ocrRan: true,
            ocrResultDir: null,
            ocrPageCount: succeeded,
            pageCount: numPages,
          },
        });

        emit({ type: "complete", pageCount: numPages, succeeded });
      } catch (err) {
        console.error("OCR streaming error:", err);
        emit({ type: "error", error: safeErrorMessage(err) });
      } finally {
        if (worker) {
          try {
            await worker.terminate();
          } catch {
            /* ignore terminate errors */
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
