import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { sourcePdfPath, resultPagePath, type ResultKind } from "@/lib/storage";

/**
 * Authenticated file server for document assets. Streams stored files from
 * STORAGE_DIR only after verifying the session owns the document, replacing the
 * previous public/ static URLs.
 *
 *   ?type=source                 → the original uploaded PDF
 *   ?type=original&page=N        → clean rendered page image
 *   ?type=pixel&page=N           → sanitized page image
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
  const type = req.nextUrl.searchParams.get("type") ?? "original";
  const pageParam = req.nextUrl.searchParams.get("page");

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

  try {
    if (type === "source") {
      const data = await readFile(sourcePdfPath(doc.filePath));
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (type !== "original" && type !== "pixel") {
      return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    }

    const page = Number(pageParam);
    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    const data = await readFile(
      resultPagePath(user.id, id, type as ResultKind, page)
    );
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}
