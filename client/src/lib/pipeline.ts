import path from "path";

/**
 * Shared PDF → image → OCR pipeline.
 *
 * Every panel (Original render, Pixel sanitization, OCR) derives from the same
 * scale-2.0 pdfjs render, so bounding boxes produced during OCR map onto the
 * rendered page images by a pure display-size ratio.
 *
 * Stages:
 *   renderPage(pdf, n)     → raw white-background PNG of a page (no processing)
 *   sanitizePage(buffer)   → sharp chain that reveals hidden low-contrast text
 *   ocrPage(worker, buf)   → Tesseract word-level output on a (sanitized) image
 */

export const RENDER_SCALE = 2.0;

/** Directory that holds the committed eng.traineddata (no runtime CDN fetch). */
export function tessdataDir(): string {
  return path.join(process.cwd(), "tessdata");
}

export type RenderedPage = {
  buffer: Buffer;
  width: number;
  height: number;
};

// pdfjs types are awkward to import in a Node/server context; the loaded doc is
// opaque here and only used through getPage()/numPages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocument = any;

/** Load a pdfjs document from raw PDF bytes. */
export async function loadPdf(pdfBuffer: Buffer): Promise<PdfDocument> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
  });
  return loadingTask.promise;
}

/**
 * Render a single page to a clean PNG at RENDER_SCALE. node-canvas starts
 * transparent, which turns everything black after processing, so we paint a
 * white background first.
 */
export async function renderPage(
  pdfDoc: PdfDocument,
  pageNumber: number
): Promise<RenderedPage> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  await page.render({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvasContext: ctx as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas: canvas as any,
    viewport,
  }).promise;

  return { buffer: canvas.toBuffer("image/png"), width, height };
}

/**
 * Pixel sanitization pipeline. This does NOT invert colors — it flattens alpha
 * onto white, converts to grayscale, stretches the histogram to the full
 * 0–255 range (which surfaces near-white hidden text), then sharpens edges.
 */
export async function sanitizePage(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 3 })
    .png()
    .toBuffer();
}

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrPageResult = {
  text: string;
  confidence: number;
  words: OcrWord[];
};

// tesseract.js Worker type; kept loose to avoid a hard type import here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OcrWorker = any;

/**
 * Create a Tesseract worker configured to load eng.traineddata from the local
 * tessdata/ directory. The committed traineddata is uncompressed, so gzip is
 * disabled; cacheMethod:"none" avoids writing a cache copy back to disk. A
 * local (non-URL) langPath makes tesseract.js read from the filesystem instead
 * of fetching from the jsdelivr CDN.
 */
export async function createOcrWorker(): Promise<OcrWorker> {
  const { createWorker, OEM } = await import("tesseract.js");
  const dir = tessdataDir();
  return createWorker("eng", OEM.LSTM_ONLY, {
    langPath: dir,
    cachePath: dir,
    gzip: false,
    cacheMethod: "none",
  });
}

/**
 * Run OCR on an image buffer (expected to be the SANITIZED page) and return
 * word-level output. Words are flattened out of the block/paragraph/line tree
 * that Tesseract returns when `blocks` output is requested.
 */
export async function ocrPage(
  worker: OcrWorker,
  buffer: Buffer
): Promise<OcrPageResult> {
  const { data } = await worker.recognize(
    buffer,
    {},
    { text: true, blocks: true }
  );

  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word?.text) continue;
          words.push({
            text: word.text,
            confidence: word.confidence ?? 0,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
          });
        }
      }
    }
  }

  return {
    text: typeof data.text === "string" ? data.text : "",
    confidence: data.confidence ?? 0,
    words,
  };
}

/**
 * Reconstruct readable text from persisted word boxes (used when re-hydrating
 * OCR results after a reload, where the raw Tesseract text isn't stored). Words
 * are grouped into lines by vertical proximity and ordered left-to-right.
 */
export function wordsToText(words: OcrWord[]): string {
  if (words.length === 0) return "";

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const heights = sorted.map((w) => w.bbox.y1 - w.bbox.y0);
  const avgHeight =
    heights.reduce((sum, h) => sum + h, 0) / (heights.length || 1);
  const threshold = Math.max(avgHeight * 0.6, 4);

  const lines: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let lineY = sorted[0].bbox.y0;

  for (const word of sorted) {
    if (current.length > 0 && word.bbox.y0 - lineY > threshold) {
      lines.push(current);
      current = [];
    }
    current.push(word);
    lineY = word.bbox.y0;
  }
  if (current.length > 0) lines.push(current);

  return lines
    .map((line) =>
      [...line]
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
        .map((w) => w.text)
        .join(" ")
    )
    .join("\n");
}
