import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { readFile, mkdir } from "fs/promises";
import path from "path";

/**
 * Pixel-level analysis: renders EVERY page of the PDF as a PNG,
 * inverts colors and boosts contrast to reveal hidden white-on-white text.
 * Returns an array of per-page result image paths.
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

  // If already processed, return existing results
  if (doc.pixelResultDir && doc.pixelPageCount > 0) {
    const pages = Array.from({ length: doc.pixelPageCount }, (_, i) => ({
      page: i + 1,
      path: `${doc.pixelResultDir}/page_${i + 1}.png`,
    }));
    return NextResponse.json({ pages, pageCount: doc.pixelPageCount });
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
      "pixel"
    );
    await mkdir(resultsDir, { recursive: true });

    const publicDir = `/results/${user.id}/${id}/pixel`;
    const pages: { page: number; path: string }[] = [];

    const { createCanvas } = await import("canvas");

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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

      const resultFileName = `page_${pageNum}.png`;
      const resultPath = path.join(resultsDir, resultFileName);

      await sharp(imageBuffer)
        .negate({ alpha: false })
        .normalize()
        .sharpen()
        .toFile(resultPath);

      pages.push({
        page: pageNum,
        path: `${publicDir}/${resultFileName}`,
      });
    }

    await prisma.pdfDocument.update({
      where: { id },
      data: {
        pixelResultDir: publicDir,
        pixelPageCount: numPages,
        pageCount: numPages,
      },
    });

    return NextResponse.json({ pages, pageCount: numPages });
  } catch (e) {
    console.error("Pixel analysis error:", e);
    return NextResponse.json(
      { error: "Pixel analysis failed" },
      { status: 500 }
    );
  }
}
