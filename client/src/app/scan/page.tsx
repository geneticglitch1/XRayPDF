"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzePage,
  buildFlattenedPdf,
  composeReveal,
  createOcrWorker,
  downloadBlob,
  loadPdf,
  ocrPage,
  renderPage,
  toGrayscale,
  type HiddenScan,
  type OcrPageResult,
} from "@/lib/clientPipeline";

/**
 * One page after both renders and the diff. `delivered` is the page as a
 * reader sees it; `revealed` is every mark on it with the invisible ones
 * flagged; `allInk` is what OCR reads.
 */
type ProcessedPage = {
  pageNumber: number;
  delivered: ImageData;
  revealed: ImageData;
  allInk: ImageData;
  scan: HiddenScan;
  ocr?: OcrPageResult;
};

type View = "delivered" | "revealed";
type Phase = "idle" | "rendering" | "ready" | "ocr" | "error";

/**
 * Worth flagging when a real area of the page is invisible ink. The floor
 * exists because glyph antialiasing puts a few stray pixels in the same band,
 * and a handful of those is noise rather than a finding.
 */
function isSuspicious(scan: HiddenScan): boolean {
  return !scan.unreliable && scan.hiddenRatio > 0.0002;
}

export default function ScanPage() {
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState<View>("revealed");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const page = pages[current];

  /* ---------------------------------------------------------- processing --- */

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("That is not a PDF.");
      setPhase("error");
      return;
    }

    setError(null);
    setOcrNote(null);
    setPages([]);
    setCurrent(0);
    setFileName(file.name);
    setPhase("rendering");

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await loadPdf(bytes);
      setProgress({ done: 0, total: pdf.numPages });

      const processed: ProcessedPage[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        // White shows what a reader sees; black exposes ink that is invisible
        // against white. The diff between them is the whole detection.
        const rendered = await renderPage(pdf, n);
        const analysis = analyzePage(rendered.onWhite, rendered.onBlack);
        processed.push({
          pageNumber: n,
          delivered: rendered.onWhite,
          revealed: composeReveal(analysis),
          allInk: analysis.allInk,
          scan: analysis.scan,
        });
        setProgress({ done: n, total: pdf.numPages });
        // Yield so the progress counter actually paints between pages.
        await new Promise((r) => setTimeout(r, 0));
      }

      setPages(processed);
      setPhase("ready");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read that PDF."
      );
      setPhase("error");
    }
  }, []);

  // Paint the selected page/view.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    const source = view === "revealed" ? page.revealed : toGrayscale(page.delivered);
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d")?.putImageData(source, 0, 0);
  }, [page, view]);

  /* ----------------------------------------------------------------- OCR --- */

  const runOcr = useCallback(async () => {
    if (pages.length === 0) return;
    setPhase("ocr");
    setOcrNote("Loading the recognition model…");
    setProgress({ done: 0, total: pages.length });

    let worker: Awaited<ReturnType<typeof createOcrWorker>> | null = null;
    try {
      worker = await createOcrWorker();
      const results: OcrPageResult[] = [];
      for (let i = 0; i < pages.length; i++) {
        setOcrNote(`Reading page ${i + 1} of ${pages.length}…`);
        // OCR reads the all-ink composite, so invisible text is transcribed
        // along with the visible copy.
        results.push(await ocrPage(worker, pages[i].allInk));
        setProgress({ done: i + 1, total: pages.length });
      }
      setPages((prev) => prev.map((p, i) => ({ ...p, ocr: results[i] })));
      setOcrNote(null);
      setPhase("ready");
    } catch (e) {
      setOcrNote(null);
      setError(e instanceof Error ? e.message : "OCR failed.");
      setPhase("ready");
    } finally {
      await worker?.terminate?.();
    }
  }, [pages]);

  useEffect(() => {
    if (ocrEnabled && phase === "ready" && pages.length > 0 && !pages[0].ocr) {
      runOcr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrEnabled]);

  /* ------------------------------------------------------------- exports --- */

  const baseName = (fileName ?? "document").replace(/\.pdf$/i, "");

  const exportPdf = useCallback(async () => {
    // The export uses the page as delivered — flattening is what removes the
    // hidden layer, so the output should look like the original, not like the
    // annotated reveal view.
    const blob = await buildFlattenedPdf(
      pages.map((p) => ({ imageData: p.delivered }))
    );
    downloadBlob(blob, `${baseName}_cleaned.pdf`);
  }, [pages, baseName]);

  const exportText = useCallback(() => {
    const body = pages
      .map((p) => `--- page ${p.pageNumber} ---\n${p.ocr?.text ?? ""}`)
      .join("\n\n");
    downloadBlob(
      new Blob([body], { type: "text/plain" }),
      `${baseName}_ocr.txt`
    );
  }, [pages, baseName]);

  const reset = () => {
    setPages([]);
    setFileName(null);
    setPhase("idle");
    setError(null);
    setOcrEnabled(false);
  };

  const flagged = pages.filter((p) => isSuspicious(p.scan));
  const busy = phase === "rendering" || phase === "ocr";

  return (
    <div className="min-h-screen bg-stock text-ink">
      <nav className="border-b border-rule">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-xl tracking-tight">
            XRay<span className="text-signal">PDF</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="label hidden text-verified sm:inline">
              ● Running in your browser
            </span>
            {pages.length > 0 && (
              <button
                onClick={reset}
                className="label text-ink-soft transition-colors hover:text-signal"
              >
                New file
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[76rem] px-6 py-10">
        {/* ------------------------------------------------------ dropzone --- */}
        {pages.length === 0 && (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <h1 className="font-display text-5xl leading-tight">
              Drop a PDF in.
            </h1>
            <p className="mt-4 leading-relaxed text-ink-soft">
              It is opened and processed by this tab. Nothing is uploaded, and
              there is no account and no server to store it on — watch your
              network tab if you like.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              onClick={() => inputRef.current?.click()}
              className={`mt-10 cursor-pointer border-2 border-dashed px-8 py-16 transition-colors ${
                dragging
                  ? "border-signal bg-signal-wash"
                  : "border-rule bg-sheet hover:border-ink-faint"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              {busy ? (
                <div>
                  <p className="font-display text-2xl">Rendering…</p>
                  <p className="label mt-3 text-ink-soft">
                    page {progress.done} of {progress.total}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-display text-2xl">
                    Drag a file here, or click to choose
                  </p>
                  <p className="label mt-3 text-ink-faint">
                    Stays on this device
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-6 border-l-2 border-signal pl-4 text-left text-sm text-signal">
                {error}
              </p>
            )}
          </div>
        )}

        {/* -------------------------------------------------------- results --- */}
        {pages.length > 0 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
            <div>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <span className="label text-ink-faint">
                  {fileName} · page {page.pageNumber} of {pages.length}
                </span>
                <div className="flex gap-4">
                  {(["delivered", "revealed"] as View[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`label border-b-2 pb-1 transition-colors ${
                        view === v
                          ? "border-ink text-ink"
                          : "border-transparent text-ink-faint hover:text-ink-soft"
                      }`}
                    >
                      {v === "delivered" ? "As delivered" : "Revealed"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-rule bg-white p-2">
                <canvas ref={canvasRef} className="block h-auto w-full" />
              </div>

              {pages.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {pages.map((p, i) => (
                    <button
                      key={p.pageNumber}
                      onClick={() => setCurrent(i)}
                      title={
                        isSuspicious(p.scan)
                          ? "Near-invisible ink found on this page"
                          : undefined
                      }
                      className={`label h-8 w-8 border transition-colors ${
                        i === current
                          ? "border-ink bg-ink text-stock"
                          : isSuspicious(p.scan)
                            ? "border-signal text-signal hover:bg-signal-wash"
                            : "border-rule text-ink-faint hover:border-ink-faint"
                      }`}
                    >
                      {p.pageNumber}
                    </button>
                  ))}
                </div>
              )}

              {page.ocr && (
                <div className="mt-8">
                  <p className="label mb-3 text-ink-faint">
                    OCR transcript · page {page.pageNumber} ·{" "}
                    {Math.round(page.ocr.confidence)}% confidence
                  </p>
                  <pre className="max-h-80 overflow-auto border border-rule bg-ink px-5 py-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-stock/70">
                    {page.ocr.text.trim() || "(no text recognized)"}
                  </pre>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------ panel --- */}
            <aside className="space-y-8">
              <div
                className={`border-l-2 pl-5 ${
                  flagged.length > 0 ? "border-signal" : "border-verified"
                }`}
              >
                <p
                  className={`label mb-2 ${
                    flagged.length > 0 ? "text-signal" : "text-verified"
                  }`}
                >
                  {flagged.length > 0
                    ? `Near-invisible ink on ${flagged.length} of ${pages.length} pages`
                    : "No near-invisible ink found"}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {flagged.length > 0
                    ? "Switch to Revealed to see it. A flattened export removes it either way."
                    : "Nothing on these pages sits in the near-white band. The export still strips the text layer."}
                </p>
              </div>

              <div className="border-t border-rule pt-6">
                <p className="label mb-2 text-ink-faint">How this works</p>
                <p className="text-xs leading-relaxed text-ink-faint">
                  Each page is rendered twice — once on white, once on black.
                  Ink that is white or near-white vanishes into the first and
                  shows up in the second, so comparing them exposes marks that
                  are physically on the page but invisible against it.
                </p>
              </div>

              <div className="border-t border-rule pt-6">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={ocrEnabled}
                    disabled={busy}
                    onChange={(e) => setOcrEnabled(e.target.checked)}
                    className="mt-1 accent-[#bf3517]"
                  />
                  <span>
                    <span className="block font-medium">
                      Read the text back (OCR)
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-ink-faint">
                      Advanced. Downloads an ~8 MB recognition model from this
                      site on first use, then runs locally. Slow — expect a few
                      seconds per page.
                    </span>
                  </span>
                </label>
                {ocrNote && (
                  <p className="label mt-4 text-signal">{ocrNote}</p>
                )}
              </div>

              <div className="space-y-3 border-t border-rule pt-6">
                <button
                  onClick={exportPdf}
                  disabled={busy}
                  className="w-full bg-ink px-5 py-3 font-medium text-stock transition-colors hover:bg-signal disabled:opacity-40"
                >
                  Download cleaned PDF
                </button>
                {pages.some((p) => p.ocr) && (
                  <button
                    onClick={exportText}
                    className="w-full border border-ink px-5 py-3 font-medium transition-colors hover:border-signal hover:text-signal"
                  >
                    Download OCR text
                  </button>
                )}
                <p className="text-xs leading-relaxed text-ink-faint">
                  The cleaned PDF is rebuilt from page images, so it has no text
                  layer left to hide in — and it is no longer searchable or
                  selectable. Keep the original if you need that.
                </p>
              </div>

              {error && (
                <p className="border-l-2 border-signal pl-4 text-sm text-signal">
                  {error}
                </p>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
