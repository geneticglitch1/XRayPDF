# XRayPDF

XRayPDF is a web app for sanitizing PDFs by extracting suspicious hidden content and producing cleaner outputs.

Instead of only "finding" hidden text, the pipeline is designed to help you remove or neutralize hidden layers by generating processed page images and exportable PDFs.

## What the app does

- Uploads a PDF (up to 10MB)
- Renders each page server-side into images
- Runs pixel sanitization on each page to neutralize low-contrast/hidden overlays
- Runs per-page Tesseract OCR for text verification
- Lets you review outputs in a 3-panel viewer (Original / Pixel / OCR)
- Lets you download per-page files or convert processed pages into a single PDF

## Extraction + removal workflow

1. **Render original pages**
   - Each PDF page is rasterized to a PNG on the server.
   - This gives a deterministic image baseline for analysis.

2. **Pixel sanitization (removal path)**
   - Every rendered page goes through image processing (`sharp`):
     - flatten alpha to white background
     - grayscale
     - normalize contrast
     - sharpen edges
   - Goal: make suspicious low-contrast hidden layers obvious and easier to remove/ignore in sanitized exports.

3. **OCR verification (trust but verify)**
   - Tesseract runs page-by-page on server-rendered images.
   - OCR text output helps validate what was present, even when visuals are ambiguous.
   - If a processed image is not convincing, use OCR text as the secondary evidence channel.

4. **Download + PDF conversion**
   - Download all per-page PNG/TXT files directly.
   - Use the **PDF** button (Original and Pixel panels) to convert page images into one downloadable PDF.

## How to use OCR output to find hidden text

If the image result looks unclear:

- Open the OCR panel and inspect text per page.
- Check low-confidence pages manually in the image panels.
- Compare OCR text against expected visible text from the original.
- Unexpected words, extra lines, or mismatched answers can indicate hidden content that the eye missed.

## Stack

- Next.js App Router
- Prisma + PostgreSQL
- NextAuth (Google)
- `pdfjs-dist` for PDF parsing
- `@napi-rs/canvas` for server-side rendering
- `sharp` for image processing
- `tesseract.js` for OCR
- `pdf-lib` for image-to-PDF export

## Local development

```bash
cd client
npm install
npm run dev
```

Open http://localhost:3000

## Production Docker

Build:

```bash
cd client
docker build -t xraypdf:latest .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e NEXTAUTH_SECRET="your-secret" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e GOOGLE_CLIENT_ID="your-google-client-id" \
  -e GOOGLE_CLIENT_SECRET="your-google-client-secret" \
  xraypdf:latest
```

## Notes

- OCR is designed as a verification step and should be reviewed with page images.
- For best results, re-run analysis on a fresh upload if source PDF structure changes.
