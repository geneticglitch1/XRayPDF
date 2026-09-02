import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile, writeFile, mkdir } from "fs/promises";
import { loadPdf, renderPage } from "@/lib/pipeline";
import { sourcePdfPath, resultsDir, resultPagePath } from "@/lib/storage";

/**
 * Server-side PDF page renderer: renders EVERY page of the PDF as a clean PNG
 * image (no processing) via the shared pipeline. Used by the "Original" panel
 * so all three panels display consistently via server-rendered images.
 *
 * Result images are stored under STORAGE_DIR and served through the
 * authenticated /asset route (never as public static files).
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

  // Always regenerate so stale cached renders don't persist.
  try {
    const pdfBuffer = await readFile(sourcePdfPath(doc.filePath));
    const pdfDoc = await loadPdf(pdfBuffer);
    const numPages = pdfDoc.numPages;

    await mkdir(resultsDir(user.id, id, "original"), { recursive: true });

    const pages: { page: number; path: string }[] = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const { buffer } = await renderPage(pdfDoc, pageNum);
      await writeFile(resultPagePath(user.id, id, "original", pageNum), buffer);
      pages.push({
        page: pageNum,
        path: `/api/documents/${id}/asset?type=original&page=${pageNum}`,
      });
    }

    if (doc.pageCount === 0) {
      await prisma.pdfDocument.update({
        where: { id },
        data: { pageCount: numPages },
      });
    }

    return NextResponse.json({ pages, pageCount: numPages });
  } catch (e) {
    console.error("Render error:", e);
    return NextResponse.json({ error: "Page rendering failed" }, { status: 500 });
  }
}
