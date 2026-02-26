import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

type ExportType = "original" | "pixel";

function parsePageNumber(fileName: string): number {
  const match = fileName.match(/^page_(\d+)\.png$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("type");
  const type: ExportType = typeParam === "pixel" ? "pixel" : "original";

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
    const resultsDir = path.join(
      process.cwd(),
      "public",
      "results",
      user.id,
      id,
      type
    );

    const files = (await readdir(resultsDir))
      .filter((fileName) => /^page_\d+\.png$/.test(fileName))
      .sort((a, b) => parsePageNumber(a) - parsePageNumber(b));

    if (files.length === 0) {
      return NextResponse.json(
        { error: `No ${type} pages found. Render/process the document first.` },
        { status: 409 }
      );
    }

    const pdfDoc = await PDFDocument.create();

    for (const fileName of files) {
      const imagePath = path.join(resultsDir, fileName);
      const imageBytes = await readFile(imagePath);
      const pngImage = await pdfDoc.embedPng(imageBytes);
      const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pngImage.width,
        height: pngImage.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const safeBaseName = doc.originalName.replace(/\.pdf$/i, "").replace(/\s+/g, "_");
    const outputName = `${safeBaseName}_${type}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${outputName}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json({ error: "Failed to export PDF" }, { status: 500 });
  }
}
