import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { wordsToText, type OcrWord } from "@/lib/pipeline";

/**
 * Persisted OCR words for a single page (used by the confidence-heatmap
 * overlay so it survives reloads). Returns per-word boxes + confidence, the
 * page-level confidence, and text reconstructed from the words.
 *
 *   GET /api/documents/[id]/ocr/words?page=N
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const page = Number(req.nextUrl.searchParams.get("page"));
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

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

  const row = await prisma.pdfPage.findUnique({
    where: { documentId_pageNumber: { documentId: id, pageNumber: page } },
  });
  if (!row) {
    return NextResponse.json(
      { error: "No OCR data for this page" },
      { status: 404 }
    );
  }

  const words = (row.wordsJson as unknown as OcrWord[]) ?? [];
  return NextResponse.json({
    page,
    confidence: row.confidence,
    words,
    text: wordsToText(words),
  });
}
