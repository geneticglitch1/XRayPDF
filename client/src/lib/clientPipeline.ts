/**
 * The whole XRayPDF pipeline, running in the browser.
 *
 * Nothing here touches the network except to load our own worker and WASM
 * assets from our own origin. The PDF bytes never leave the tab: they go from
 * the file input into an ArrayBuffer, through pdf.js, onto a canvas, and back
 * out as a Blob the browser saves locally.
 *
 * Stages:
 *   loadPdf(bytes)            → pdf.js document
 *   renderPage(doc, n, bg)    → ImageData of the page on a chosen backdrop
 *   analyzePage(white, black) → all ink as dark-on-white, plus a hidden mask
 *   composeReveal(analysis)   → that image with hidden ink flagged in vermilion
 *   ocrPage(...)              → optional Tesseract pass (lazy-loaded)
 *   buildFlattenedPdf(pages)  → rasterized PDF with no text layer
 */

export const RENDER_SCALE = 2;

/**
 * Ceiling on rendered pixels per page. A 2× render of a large-format page can
 * run to tens of megapixels, and several of those held at once will crash a
 * mobile tab. Pages above this get scaled down proportionally.
 */
const MAX_PIXELS_PER_PAGE = 4_000_000;

// pdf.js has no exported document type that survives a dynamic import cleanly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDocument = any;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** Load pdf.js once, pointing it at the worker we serve ourselves. */
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjsPromise;
}

export async function loadPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await getPdfjs();
  // pdf.js transfers and neuters the buffer it is given, which breaks a second
  // pass over the same file (re-running with different settings). Hand it a copy.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

export type RenderedPage = {
  pageNumber: number;
  width: number;
  height: number;
  onWhite: ImageData;
  onBlack: ImageData;
};

/**
 * Rasterize one page twice, on a white backdrop and on a black one.
 *
 * Both renders come from a single getPage() on purpose. pdf.js caches page
 * proxies, so asking for the same page twice hands back the same object — and
 * cleanup() after the first render tears down state the second render then
 * waits on forever. One page, two draws, one cleanup at the end.
 */
export async function renderPage(
  pdfDoc: PdfDocument,
  pageNumber: number
): Promise<RenderedPage> {
  const page = await pdfDoc.getPage(pageNumber);

  try {
    const base = page.getViewport({ scale: RENDER_SCALE });
    const overage = (base.width * base.height) / MAX_PIXELS_PER_PAGE;
    const scale = overage > 1 ? RENDER_SCALE / Math.sqrt(overage) : RENDER_SCALE;
    const viewport = scale === RENDER_SCALE ? base : page.getViewport({ scale });

    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));

    const draw = async (backdrop: string): Promise<ImageData> => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Could not get a 2D canvas context");

      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, width, height);
      // pdf.js paints its own white backdrop unless given one, which would
      // quietly overwrite the fill above and make both renders identical.
      await page.render({ canvasContext: ctx, viewport, canvas, background: backdrop })
        .promise;
      return ctx.getImageData(0, 0, width, height);
    };

    // Sequential, not Promise.all: pdf.js serializes render tasks on a page
    // anyway, and overlapping them risks the same shared-state trouble.
    const onWhite = await draw("#ffffff");
    const onBlack = await draw("#000000");

    return { pageNumber, width, height, onWhite, onBlack };
  } finally {
    page.cleanup();
  }
}

/** Luminance, the same weighting an image library's grayscale would use. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export type HiddenScan = {
  /** Share of the page that carries ink invisible against white, 0–1. */
  hiddenRatio: number;
  hiddenPixels: number;
  /**
   * True when the page paints its own opaque background, which defeats the
   * black-backdrop trick. The measurement is broken rather than interesting,
   * so we say so instead of reporting a page-sized false positive.
   */
  unreliable: boolean;
};

export type PageAnalysis = {
  /**
   * Every mark on the page — visible and invisible alike — as dark ink on
   * white. This is what OCR reads and what the reveal view is built from.
   */
  allInk: ImageData;
  /** Per-pixel flag: this mark is invisible against a white page. */
  hiddenMask: Uint8Array;
  scan: HiddenScan;
};

/**
 * Find ink that is present but invisible against white paper.
 *
 * Contrast stretching cannot do this. Text painted in pure #FFFFFF rasterizes
 * to bytes identical to blank paper, so there is no difference in the image to
 * amplify — as far as the pixels are concerned the page really is blank. (The
 * original server pipeline had the same blind spot: a page with ordinary black
 * text already spans 0–255, so `normalize()` mapped it onto itself.)
 *
 * So we ask the renderer twice instead. Draw the page on white, then again on
 * black. Ink that is white or near-white vanishes into the first and blazes in
 * the second; ordinary dark ink does the reverse. Inverting the black-backed
 * render and taking the darker of the two per pixel yields an image in which
 * every mark is dark on white, whatever colour it was drawn in. Anything dark
 * there but paper-white in the plain render was never meant to be seen.
 */
export function analyzePage(
  onWhite: ImageData,
  onBlack: ImageData,
  { whiteFloor = 250, inkCeiling = 200 } = {}
): PageAnalysis {
  const { width, height } = onWhite;
  const white = onWhite.data;
  const black = onBlack.data;
  const pixels = width * height;

  const composite = new Uint8ClampedArray(white.length);
  const hiddenMask = new Uint8Array(pixels);
  let hiddenPixels = 0;
  let inkPixels = 0;

  for (let px = 0; px < pixels; px++) {
    const i = px * 4;
    const onWhiteLuma = luma(white[i], white[i + 1], white[i + 2]);
    // Inverting the black-backed render turns bright ink into dark ink and the
    // backdrop into paper, putting both renders in one frame of reference.
    const onBlackInverted = 255 - luma(black[i], black[i + 1], black[i + 2]);
    const value = Math.round(Math.min(onWhiteLuma, onBlackInverted));

    composite[i] = value;
    composite[i + 1] = value;
    composite[i + 2] = value;
    composite[i + 3] = 255;

    if (value <= inkCeiling) {
      inkPixels++;
      // Reads as paper in the plain render, but as ink here: drawn in
      // something the eye cannot separate from the page.
      if (onWhiteLuma >= whiteFloor) {
        hiddenMask[px] = 1;
        hiddenPixels++;
      }
    }
  }

  // A page that paints its own opaque background leaves nothing for the black
  // backdrop to show through, so the composite comes out almost entirely ink.
  // That is a broken measurement, not a page full of secrets.
  const unreliable = inkPixels / pixels > 0.6;

  return {
    allInk: new ImageData(composite, width, height),
    hiddenMask,
    scan: {
      hiddenRatio: unreliable ? 0 : hiddenPixels / pixels,
      hiddenPixels: unreliable ? 0 : hiddenPixels,
      unreliable,
    },
  };
}

/**
 * Build the reveal view: the page as it really is, with anything that was
 * hiding painted in vermilion so it cannot be missed.
 */
export function composeReveal(
  analysis: PageAnalysis,
  highlight: [number, number, number] = [191, 53, 23]
): ImageData {
  const { allInk, hiddenMask, scan } = analysis;
  const src = allInk.data;
  const out = new Uint8ClampedArray(src.length);

  for (let px = 0; px < hiddenMask.length; px++) {
    const i = px * 4;
    const value = src[i];
    // When the scan is unreliable the mask is meaningless, so show the plain
    // composite rather than a page painted end-to-end in false positives.
    if (hiddenMask[px] && !scan.unreliable) {
      // Darker ink → more saturated highlight, so glyph shapes stay readable.
      const weight = 1 - value / 255;
      out[i] = Math.round(255 - (255 - highlight[0]) * weight);
      out[i + 1] = Math.round(255 - (255 - highlight[1]) * weight);
      out[i + 2] = Math.round(255 - (255 - highlight[2]) * weight);
    } else {
      out[i] = value;
      out[i + 1] = value;
      out[i + 2] = value;
    }
    out[i + 3] = 255;
  }

  return new ImageData(out, allInk.width, allInk.height);
}

/** Plain grayscale render, used for the untouched "as delivered" view. */
export function toGrayscale(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.round(luma(data[i], data[i + 1], data[i + 2]));
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

/** ImageData → PNG blob, via an offscreen canvas. */
export async function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("Could not encode page as PNG");
  return blob;
}

/**
 * Rebuild a PDF from rendered page images.
 *
 * This is the step that actually removes hidden content. The output has no
 * text layer, no annotations and no incremental-save history, because it is a
 * new document containing nothing but pictures of the pages — so there is
 * nowhere left for invisible text to survive.
 */
export async function buildFlattenedPdf(
  pages: { imageData: ImageData }[]
): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();

  for (const page of pages) {
    const png = await imageDataToPngBlob(page.imageData);
    const embedded = await pdf.embedPng(await png.arrayBuffer());
    const sheet = pdf.addPage([embedded.width, embedded.height]);
    sheet.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BufferSource], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ OCR --- */

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

// tesseract.js Worker; kept loose to avoid a hard type import on a lazy module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OcrWorker = any;

/**
 * Spin up a Tesseract worker against assets we serve ourselves.
 *
 * Every path here is same-origin on purpose. tesseract.js defaults to pulling
 * its core, worker and language data from a CDN, which would put a third party
 * in the loop the first time anyone runs OCR — so the copy script stages them
 * into public/ and we point at those. `gzip: false` because the traineddata we
 * ship is uncompressed; `cacheMethod: "none"` so nothing is written back to
 * IndexedDB and the page leaves no trace of what was scanned.
 */
export async function createOcrWorker(
  onProgress?: (status: string, progress: number) => void
): Promise<OcrWorker> {
  const { createWorker, OEM } = await import("tesseract.js");
  return createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract",
    langPath: "/tessdata",
    gzip: false,
    cacheMethod: "none",
    // Spread rather than pass `logger: undefined` — tesseract.js calls the
    // value whenever the key is present, so an explicit undefined throws.
    ...(onProgress
      ? {
          logger: (m: { status: string; progress: number }) =>
            onProgress(m.status, m.progress),
        }
      : {}),
  });
}

/** Run OCR over one already-revealed page image. */
export async function ocrPage(
  worker: OcrWorker,
  imageData: ImageData
): Promise<OcrPageResult> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.putImageData(imageData, 0, 0);

  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });

  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word?.text) continue;
          words.push({
            text: word.text,
            confidence: word.confidence ?? 0,
            bbox: { ...word.bbox },
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

/** Trigger a local download of a blob. Never round-trips through a server. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can race the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
