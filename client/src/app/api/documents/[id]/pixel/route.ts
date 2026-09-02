import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile, writeFile, mkdir } from "fs/promises";
import { loadPdf, renderPage, sanitizePage } from "@/lib/pipeline";
import { sourcePdfPath, resultsDir, resultPagePath } from "@/lib/storage";

/**
 * Pixel-level analysis: renders EVERY page of the PDF and runs the shared
 * sanitize pipeline (flatten→grayscale→normalize→sharpen) to reveal hidden
 * white-on-white / low-contrast text. Returns per-page result image paths that
 * are served through the authenticated /asset route.
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

  // Always regenerate so stale cached outputs don't persist.
  try {
    const pdfBuffer = await readFile(sourcePdfPath(doc.filePath));
    const pdfDoc = await loadPdf(pdfBuffer);
    const numPages = pdfDoc.numPages;

    await mkdir(resultsDir(user.id, id, "pixel"), { recursive: true });

    const pages: { page: number; path: string }[] = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const { buffer } = await renderPage(pdfDoc, pageNum);
      const sanitized = await sanitizePage(buffer);
      await writeFile(resultPagePath(user.id, id, "pixel", pageNum), sanitized);
      pages.push({
        page: pageNum,
        path: `/api/documents/${id}/asset?type=pixel&page=${pageNum}`,
      });
    }

    await prisma.pdfDocument.update({
      where: { id },
      data: {
        pixelResultDir: `results/${user.id}/${id}/pixel`,
        pixelPageCount: numPages,
        pageCount: numPages,
      },
    });

    return NextResponse.json({ pages, pageCount: numPages });
  } catch (e) {
    console.error("Pixel analysis error:", e);
    return NextResponse.json({ error: "Pixel analysis failed" }, { status: 500 });
  }
}
