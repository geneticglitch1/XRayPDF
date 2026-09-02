-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdfDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "pixelResultDir" TEXT,
    "ocrResultDir" TEXT,
    "ocrRan" BOOLEAN NOT NULL DEFAULT false,
    "fileSize" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "pixelPageCount" INTEGER NOT NULL DEFAULT 0,
    "ocrPageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdfDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdfPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "wordsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdfPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "pdfDocument_userId_idx" ON "pdfDocument"("userId");

-- CreateIndex
CREATE INDEX "pdfPage_documentId_idx" ON "pdfPage"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "pdfPage_documentId_pageNumber_key" ON "pdfPage"("documentId", "pageNumber");

-- AddForeignKey
ALTER TABLE "pdfDocument" ADD CONSTRAINT "pdfDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdfPage" ADD CONSTRAINT "pdfPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "pdfDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

