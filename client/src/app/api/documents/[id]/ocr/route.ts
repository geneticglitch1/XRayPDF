import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Tesseract OCR: runs OCR on EVERY page of the PDF.
 * Streams progress back to the client via newline-delimited JSON.
 * Only allowed ONCE per document. Must be explicitly triggered.
 */
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

  if (doc.ocrRan) {
    // Return existing results
    if (doc.ocrResultDir && doc.ocrPageCount > 0) {
      const pages = Array.from({ length: doc.ocrPageCount }, (_, i) => ({
        page: i + 1,
        path: `${doc.ocrResultDir}/page_${i + 1}.txt`,
      }));
      return NextResponse.json({
        pages,
        pageCount: doc.ocrPageCount,
        alreadyRan: true,
      });
    }
    return NextResponse.json(
      { error: "OCR has already been run", alreadyRan: true },
      { status: 409 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user || doc.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const pdfPath = path.join(process.cwd(), "public", doc.filePath);
    const pdfBuffer = await readFile(pdfPath);

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const resultsDir = path.join(
      process.cwd(),
      "public",
      "results",
      user.id,
      id,
      "ocr"
    );
    await mkdir(resultsDir, { recursive: true });

    const publicDir = `/results/${user.id}/${id}/ocr`;

    // Stream progress to the client via newline-delimited JSON
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const { createCanvas } = await import("canvas");
          const Tesseract = await import("tesseract.js");

          const allPages: { page: number; path: string }[] = [];

          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            // Send progress event
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "progress",
                  page: pageNum,
                  totalPages: numPages,
                }) + "\n"
              )
            );

            const page = await pdfDoc.getPage(pageNum);
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            const width = Math.floor(viewport.width);
            const height = Math.floor(viewport.height);

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext("2d");

            await page.render({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              canvasContext: ctx as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              canvas: canvas as any,
              viewport,
            }).promise;

            const imageBuffer = canvas.toBuffer("image/png");
            const tempImgPath = path.join(
              resultsDir,
              `page_${pageNum}_temp.png`
            );
            await writeFile(tempImgPath, imageBuffer);

            const { data } = await Tesseract.recognize(tempImgPath, "eng");

            // Save per-page OCR text
            const ocrFileName = `page_${pageNum}.txt`;
            const ocrPath = path.join(resultsDir, ocrFileName);
            await writeFile(ocrPath, data.text, "utf-8");

            const publicPath = `${publicDir}/${ocrFileName}`;
            allPages.push({ page: pageNum, path: publicPath });

            // Send page-complete event
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "page_done",
                  page: pageNum,
                  totalPages: numPages,
                  text: data.text,
                  confidence: data.confidence,
                  path: publicPath,
                }) + "\n"
              )
            );
          }

          // Update DB
          await prisma.pdfDocument.update({
            where: { id },
            data: {
              ocrRan: true,
              ocrResultDir: publicDir,
              ocrPageCount: numPages,
              pageCount: numPages,
            },
          });

          // Send final complete event
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "complete",
                pages: allPages,
                pageCount: numPages,
              }) + "\n"
            )
          );
          controller.close();
        } catch (err) {
          console.error("OCR streaming error:", err);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: "OCR processing failed",
              }) + "\n"
            )
          );
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
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(
      { error: "OCR processing failed" },
      { status: 500 }
    );
  }
}
