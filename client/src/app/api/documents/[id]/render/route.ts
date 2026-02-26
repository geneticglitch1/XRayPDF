import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Server-side PDF page renderer: renders EVERY page of the PDF as a
 * clean PNG image (no processing). Used by the "Original" panel so
 * all three panels display consistently via server-rendered images.
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

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user || doc.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const publicDir = `/results/${user.id}/${id}/original`;
  const resultsDir = path.join(process.cwd(), "public", publicDir);

  // Always regenerate so stale cached renders don't persist.

  try {
    const pdfPath = path.join(process.cwd(), "public", doc.filePath);
    const pdfBuffer = await readFile(pdfPath);

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    await mkdir(resultsDir, { recursive: true });

    const pages: { page: number; path: string }[] = [];
    const { createCanvas } = await import("@napi-rs/canvas");

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // Fill white background — node-canvas defaults to transparent
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      await page.render({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasContext: ctx as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas: canvas as any,
        viewport,
      }).promise;

      const resultFileName = `page_${pageNum}.png`;
      const resultPath = path.join(resultsDir, resultFileName);

      // Write the raw rendered PNG — no sharp processing
      const buffer = canvas.toBuffer("image/png");
      const { writeFile } = await import("fs/promises");
      await writeFile(resultPath, buffer);

      pages.push({
        page: pageNum,
        path: `${publicDir}/${resultFileName}`,
      });
    }

    // Update pageCount if not set
    if (doc.pageCount === 0) {
      await prisma.pdfDocument.update({
        where: { id },
        data: { pageCount: numPages },
      });
    }

    return NextResponse.json({ pages, pageCount: numPages });
  } catch (e) {
    console.error("Render error:", e);
    return NextResponse.json(
      { error: "Page rendering failed" },
      { status: 500 }
    );
  }
}
