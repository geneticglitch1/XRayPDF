import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DOCUMENTS = 5;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("pdf") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit" },
      { status: 400 }
    );
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  // Enforce 5-document limit — delete oldest if at cap
  if (user.documents.length >= MAX_DOCUMENTS) {
    const oldest = user.documents[0];
    await prisma.pdfDocument.delete({ where: { id: oldest.id } });
    // Note: could also delete files from disk here
  }

  const fileId = uuidv4();
  const uploadsDir = path.join(process.cwd(), "public", "uploads", user.id);
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `${fileId}.pdf`;
  const filePath = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const publicPath = `/uploads/${user.id}/${fileName}`;

  // Detect page count from the uploaded PDF
  let pageCount = 0;
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdfDoc = await loadingTask.promise;
    pageCount = pdfDoc.numPages;
  } catch {
    // fallback: if pdfjs fails, just store 0
  }

  const doc = await prisma.pdfDocument.create({
    data: {
      userId: user.id,
      originalName: file.name,
      filePath: publicPath,
      fileSize: file.size,
      pageCount,
    },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
