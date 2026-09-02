"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";

type DocData = {
  id: string;
  originalName: string;
  filePath: string;
  pixelResultDir: string | null;
  pixelPageCount: number;
  ocrResultDir: string | null;
  ocrPageCount: number;
  ocrRan: boolean;
  fileSize: number;
  pageCount: number;
  createdAt: string;
};

type OriginalPage = { page: number; path: string };
type PixelPage = { page: number; path: string };
type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
type OcrPage = {
  page: number;
  text?: string;
  confidence?: number;
  wordCount?: number;
  error?: string;
};

function assetUrl(id: string, type: "original" | "pixel", page: number) {
  return `/api/documents/${id}/asset?type=${type}&page=${page}`;
}

function confidenceStyle(c: number): { bg: string; border: string } {
  if (c >= 90) return { bg: "rgba(34,197,94,0.35)", border: "#22c55e" };
  if (c >= 70) return { bg: "rgba(245,158,11,0.35)", border: "#f59e0b" };
  return { bg: "rgba(239,68,68,0.35)", border: "#ef4444" };
}

function confidenceTextColor(c: number): string {
  if (c >= 90) return "text-emerald-400";
  if (c >= 70) return "text-amber-400";
  return "text-red-400";
}

export default function ViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);

  // Original server-rendered state
  const [originalLoading, setOriginalLoading] = useState(false);
  const [originalPages, setOriginalPages] = useState<OriginalPage[]>([]);
  const [originalCurrentPage, setOriginalCurrentPage] = useState(1);

  // Pixel state
  const [pixelLoading, setPixelLoading] = useState(false);
  const [pixelPages, setPixelPages] = useState<PixelPage[]>([]);
  const [pixelCurrentPage, setPixelCurrentPage] = useState(1);

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPages, setOcrPages] = useState<OcrPage[]>([]);
  const [ocrCurrentPage, setOcrCurrentPage] = useState(1);
  const [ocrProgress, setOcrProgress] = useState({ page: 0, total: 0 });
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrView, setOcrView] = useState<"text" | "overlay">("text");
  const [ocrWords, setOcrWords] = useState<Record<number, OcrWord[]>>({});
  const [overlayDims, setOverlayDims] = useState<{ w: number; h: number } | null>(
    null
  );

  const [activeTab, setActiveTab] = useState<"original" | "pixel" | "ocr">(
    "original"
  );

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      const found = data.documents.find((d: DocData) => d.id === id);
      if (found) {
        setDoc(found);
        renderOriginalPages(found.id);
        if (found.pixelPageCount === 0) {
          runPixelAnalysis(found.id);
        } else {
          setPixelPages(
            Array.from({ length: found.pixelPageCount }, (_, i) => ({
              page: i + 1,
              path: assetUrl(found.id, "pixel", i + 1),
            }))
          );
        }
        if (found.ocrRan && found.ocrPageCount > 0) {
          // Set page placeholders; per-page text/words hydrate lazily on view.
          setOcrPages(
            Array.from({ length: found.ocrPageCount }, (_, i) => ({
              page: i + 1,
            }))
          );
        }
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const renderOriginalPages = async (docId: string) => {
    setOriginalLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/render`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setOriginalPages(data.pages);
      }
    } catch (e) {
      console.error("Render error:", e);
    }
    setOriginalLoading(false);
  };

  const runPixelAnalysis = async (docId: string) => {
    setPixelLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/pixel`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setPixelPages(data.pages);
        setDoc((prev) =>
          prev
            ? { ...prev, pixelPageCount: data.pageCount, pageCount: data.pageCount }
            : prev
        );
      }
    } catch (e) {
      console.error("Pixel analysis error:", e);
    }
    setPixelLoading(false);
  };

  // Lazily hydrate persisted OCR words + reconstructed text for a page.
  const ensureOcrPageLoaded = useCallback(
    async (page: number) => {
      if (ocrWords[page]) return;
      try {
        const res = await fetch(`/api/documents/${id}/ocr/words?page=${page}`);
        if (!res.ok) return;
        const data = await res.json();
        setOcrWords((prev) => ({ ...prev, [page]: data.words ?? [] }));
        setOcrPages((prev) =>
          prev.map((p) =>
            p.page === page
              ? {
                  ...p,
                  text: data.text,
                  confidence: data.confidence,
                  wordCount: (data.words ?? []).length,
                }
              : p
          )
        );
      } catch {
        /* ignore */
      }
    },
    [id, ocrWords]
  );

  // Hydrate the currently-viewed OCR page after a reload / re-run completes.
  useEffect(() => {
    if (!doc?.ocrRan || ocrLoading) return;
    const entry = ocrPages.find((p) => p.page === ocrCurrentPage);
    if (entry && entry.text === undefined && !entry.error) {
      ensureOcrPageLoaded(ocrCurrentPage);
    }
  }, [doc?.ocrRan, ocrLoading, ocrCurrentPage, ocrPages, ensureOcrPageLoaded]);

  // Reset the measured overlay image size whenever the page/view changes.
  useEffect(() => {
    setOverlayDims(null);
  }, [ocrCurrentPage, ocrView]);

  const runOcr = async () => {
    if (!doc) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrProgress({ page: 0, total: 0 });
    setOcrPages([]);
    setOcrWords({});

    try {
      const res = await fetch(`/api/documents/${doc.id}/ocr`, {
        method: "POST",
      });

      if (!res.ok) {
        let message = "OCR request failed";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          /* ignore */
        }
        setOcrError(message);
        setOcrLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setOcrLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "progress") {
              setOcrProgress({ page: event.page, total: event.totalPages });
            } else if (event.type === "page_done") {
              setOcrProgress({ page: event.page, total: event.totalPages });
              setOcrPages((prev) => [
                ...prev.filter((p) => p.page !== event.page),
                {
                  page: event.page,
                  text: event.text,
                  confidence: event.confidence,
                  wordCount: event.wordCount,
                },
              ]);
            } else if (event.type === "page_error") {
              setOcrProgress({ page: event.page, total: event.totalPages });
              setOcrPages((prev) => [
                ...prev.filter((p) => p.page !== event.page),
                { page: event.page, error: event.error },
              ]);
            } else if (event.type === "complete") {
              setDoc((prev) =>
                prev
                  ? { ...prev, ocrRan: true, ocrPageCount: event.succeeded }
                  : prev
              );
            } else if (event.type === "error") {
              setOcrError(event.error || "OCR processing failed");
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      // Re-sort by page number after streaming; drop cached words so the
      // overlay re-fetches fresh boxes from persistence.
      setOcrPages((prev) => [...prev].sort((a, b) => a.page - b.page));
      setOcrWords({});
    } catch (e) {
      console.error("OCR error:", e);
      setOcrError("OCR processing failed");
    }
    setOcrLoading(false);
  };

  const downloadOcrText = () => {
    [...ocrPages]
      .sort((a, b) => a.page - b.page)
      .forEach((p) => {
        const content = p.error
          ? `(page ${p.page} failed: ${p.error})`
          : p.text ?? "";
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `page_${p.page}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  };

  const downloadAsPdf = async (type: "original" | "pixel") => {
    if (!doc) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}/export?type=${type}`);
      if (!res.ok) {
        console.error("PDF export failed", await res.text());
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.originalName.replace(/\.pdf$/i, "")}_${type}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed", err);
    }
  };

  const downloadImages = (pages: { page: number; path: string }[]) => {
    pages.forEach((p) => {
      const a = document.createElement("a");
      a.href = p.path;
      a.download = `page_${p.page}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">Document not found.</p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold transition hover:bg-violet-500"
        >
          Back to Dashboard
        </Link>
      </main>
    );
  }

  const currentOcr = ocrPages.find((p) => p.page === ocrCurrentPage);
  const currentWords = ocrWords[ocrCurrentPage] ?? [];
  const overlayBg = originalPages[ocrCurrentPage - 1]?.path;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/10 p-2 transition hover:border-white/20 hover:bg-white/5"
          >
            <svg
              className="h-4 w-4 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold">{doc.originalName}</h1>
            <p className="text-xs text-zinc-500">
              {doc.pageCount > 0 ? `${doc.pageCount} pages · ` : ""}
              Uploaded {new Date(doc.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Mobile tab switcher */}
        <div className="flex gap-1 rounded-xl bg-white/5 p-1 sm:hidden">
          {(["original", "pixel", "ocr"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                activeTab === tab
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab === "ocr" ? "OCR" : tab}
            </button>
          ))}
        </div>
      </div>

      {/* 3-Panel Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Panel 1: Original */}
        <Panel
          title="Original PDF"
          badge={
            originalLoading
              ? "Rendering..."
              : originalPages.length > 0
                ? `${originalPages.length} pages`
                : "Source"
          }
          badgeColor="bg-blue-500/10 text-blue-400"
          visible={activeTab === "original"}
          onDownload={
            originalPages.length > 0
              ? () => downloadImages(originalPages)
              : undefined
          }
          onDownloadPdf={
            originalPages.length > 0 ? () => downloadAsPdf("original") : undefined
          }
        >
          {originalLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="text-sm text-zinc-500">Rendering pages...</p>
              </div>
            </div>
          ) : originalPages.length > 0 ? (
            <div className="flex h-full flex-col">
              <PageNav
                current={originalCurrentPage}
                total={originalPages.length}
                onPrev={() => setOriginalCurrentPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setOriginalCurrentPage((p) =>
                    Math.min(originalPages.length, p + 1)
                  )
                }
              />
              <div className="flex-1 overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={originalPages[originalCurrentPage - 1]?.path}
                  alt={`Original page ${originalCurrentPage}`}
                  className="w-full rounded-lg object-contain"
                />
              </div>
              <Thumbs
                count={originalPages.length}
                current={originalCurrentPage}
                onSelect={setOriginalCurrentPage}
                activeClass="border-blue-500 bg-blue-500/20 text-blue-300"
              />
            </div>
          ) : (
            <iframe
              src={`/api/documents/${doc.id}/asset?type=source`}
              className="h-full w-full rounded-lg"
              title="Original PDF"
            />
          )}
        </Panel>

        {/* Panel 2: Pixel Analysis */}
        <Panel
          title="Pixel Analysis"
          badge={
            pixelLoading
              ? "Processing..."
              : pixelPages.length > 0
                ? `${pixelPages.length} pages`
                : "Pending"
          }
          badgeColor="bg-violet-500/10 text-violet-400"
          visible={activeTab === "pixel"}
          onDownload={
            pixelPages.length > 0 ? () => downloadImages(pixelPages) : undefined
          }
          onDownloadPdf={
            pixelPages.length > 0 ? () => downloadAsPdf("pixel") : undefined
          }
        >
          {pixelLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-sm text-zinc-500">Analyzing all pages...</p>
              </div>
            </div>
          ) : pixelPages.length > 0 ? (
            <div className="flex h-full flex-col">
              <PageNav
                current={pixelCurrentPage}
                total={pixelPages.length}
                onPrev={() => setPixelCurrentPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setPixelCurrentPage((p) =>
                    Math.min(pixelPages.length, p + 1)
                  )
                }
              />
              <div className="flex-1 overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pixelPages[pixelCurrentPage - 1]?.path}
                  alt={`Pixel analysis page ${pixelCurrentPage}`}
                  className="w-full rounded-lg object-contain"
                />
              </div>
              <Thumbs
                count={pixelPages.length}
                current={pixelCurrentPage}
                onSelect={setPixelCurrentPage}
                activeClass="border-violet-500 bg-violet-500/20 text-violet-300"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Pixel analysis will run automatically...
            </div>
          )}
        </Panel>

        {/* Panel 3: Tesseract OCR */}
        <Panel
          title="Tesseract OCR"
          badge={
            ocrLoading
              ? `Processing ${ocrProgress.page}/${ocrProgress.total}`
              : doc.ocrRan
                ? `${ocrPages.length} pages`
                : "Manual"
          }
          badgeColor={
            doc.ocrRan
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }
          visible={activeTab === "ocr"}
          onDownload={
            ocrPages.length > 0 && !ocrLoading ? downloadOcrText : undefined
          }
        >
          {ocrLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-zinc-400">Running Tesseract OCR...</p>
              {ocrProgress.total > 0 && (
                <div className="w-full max-w-xs">
                  <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                    <span>
                      Page {ocrProgress.page} of {ocrProgress.total}
                    </span>
                    <span>
                      {Math.round((ocrProgress.page / ocrProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{
                        width: `${(ocrProgress.page / ocrProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {ocrPages.length > 0 && (
                <div className="mt-2 w-full max-w-xs rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">
                    Pages completed:
                  </p>
                  {[...ocrPages]
                    .sort((a, b) => a.page - b.page)
                    .map((p) => (
                      <div
                        key={p.page}
                        className="flex items-center justify-between text-[10px] text-zinc-400"
                      >
                        <span>Page {p.page}</span>
                        {p.error ? (
                          <span className="text-red-400">failed</span>
                        ) : p.confidence !== undefined ? (
                          <span className={confidenceTextColor(p.confidence)}>
                            {p.confidence.toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : ocrPages.length > 0 ? (
            <div className="flex h-full flex-col">
              {/* Navigator + view toggle + re-run */}
              <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setOcrCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={ocrCurrentPage <= 1}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() =>
                      setOcrCurrentPage((p) => Math.min(ocrPages.length, p + 1))
                    }
                    disabled={ocrCurrentPage >= ocrPages.length}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                  >
                    Next
                  </button>
                  <span className="ml-1 text-xs text-zinc-400">
                    {ocrCurrentPage}/{ocrPages.length}
                  </span>
                  {currentOcr?.confidence !== undefined && (
                    <span
                      className={`ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold ${confidenceTextColor(
                        currentOcr.confidence
                      )}`}
                      title="Page-level OCR confidence"
                    >
                      {currentOcr.confidence.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex rounded-lg bg-white/5 p-0.5">
                    {(["text", "overlay"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setOcrView(v)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition ${
                          ocrView === v
                            ? "bg-emerald-600 text-white"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={runOcr}
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white"
                    title="Re-run OCR"
                  >
                    Re-run
                  </button>
                </div>
              </div>

              {ocrError && (
                <div className="border-b border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300">
                  {ocrError}
                </div>
              )}

              {ocrView === "text" ? (
                <div className="flex-1 overflow-auto p-4">
                  {currentOcr?.error ? (
                    <p className="text-sm text-red-300">
                      Page {ocrCurrentPage} failed: {currentOcr.error}
                    </p>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-300">
                      {currentOcr?.text ?? "(loading…)"}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-2">
                  {currentOcr?.error ? (
                    <p className="p-4 text-sm text-red-300">
                      Page {ocrCurrentPage} failed: {currentOcr.error}
                    </p>
                  ) : overlayBg ? (
                    <div className="relative inline-block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={overlayBg}
                        alt={`OCR overlay page ${ocrCurrentPage}`}
                        className="w-full rounded-lg object-contain"
                        onLoad={(e) => {
                          const el = e.currentTarget;
                          setOverlayDims({
                            w: el.naturalWidth,
                            h: el.naturalHeight,
                          });
                        }}
                      />
                      {overlayDims &&
                        currentWords.map((w, i) => {
                          const style = confidenceStyle(w.confidence);
                          return (
                            <div
                              key={i}
                              title={`${w.text} — ${w.confidence.toFixed(0)}%`}
                              className="absolute cursor-help"
                              style={{
                                left: `${(w.bbox.x0 / overlayDims.w) * 100}%`,
                                top: `${(w.bbox.y0 / overlayDims.h) * 100}%`,
                                width: `${
                                  ((w.bbox.x1 - w.bbox.x0) / overlayDims.w) * 100
                                }%`,
                                height: `${
                                  ((w.bbox.y1 - w.bbox.y0) / overlayDims.h) * 100
                                }%`,
                                backgroundColor: style.bg,
                                border: `1px solid ${style.border}`,
                              }}
                            />
                          );
                        })}
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-zinc-500">
                      Render the original page to see the overlay.
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-zinc-500">
                    <LegendDot color="#22c55e" label="≥90" />
                    <LegendDot color="#f59e0b" label="70–89" />
                    <LegendDot color="#ef4444" label="<70" />
                  </div>
                </div>
              )}

              <Thumbs
                count={ocrPages.length}
                current={ocrCurrentPage}
                onSelect={setOcrCurrentPage}
                activeClass="border-emerald-500 bg-emerald-500/20 text-emerald-300"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="rounded-full bg-amber-500/10 p-4">
                <svg
                  className="h-8 w-8 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="mb-1 text-sm font-medium text-zinc-300">
                  OCR Not Yet Run
                </p>
                <p className="mb-4 text-xs text-zinc-500">
                  Runs Tesseract on the sanitized image of every page. Re-runnable.
                </p>
                {ocrError && (
                  <p className="mb-3 text-xs text-red-300">{ocrError}</p>
                )}
                <button
                  onClick={runOcr}
                  className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold transition hover:bg-emerald-500"
                >
                  Run Tesseract OCR
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

function PageNav({
  current,
  total,
  onPrev,
  onNext,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
      <button
        onClick={onPrev}
        disabled={current <= 1}
        className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
      >
        Prev
      </button>
      <span className="text-xs text-zinc-400">
        Page {current} / {total}
      </span>
      <button
        onClick={onNext}
        disabled={current >= total}
        className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
      >
        Next
      </button>
    </div>
  );
}

function Thumbs({
  count,
  current,
  onSelect,
  activeClass,
}: {
  count: number;
  current: number;
  onSelect: (page: number) => void;
  activeClass: string;
}) {
  if (count <= 1) return null;
  return (
    <div className="flex gap-1 overflow-x-auto border-t border-white/5 p-2">
      {Array.from({ length: count }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onSelect(page)}
          className={`flex-shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
            current === page
              ? activeClass
              : "border-white/10 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {page}
        </button>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Panel({
  title,
  badge,
  badgeColor,
  children,
  visible,
  onDownload,
  onDownloadPdf,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
  visible: boolean;
  onDownload?: () => void;
  onDownloadPdf?: () => void;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] ${
        visible ? "" : "hidden sm:flex"
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {onDownload && (
            <button
              onClick={onDownload}
              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white"
              title="Download all pages"
            >
              <svg
                className="mr-1 inline-block h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              All
            </button>
          )}
          {onDownloadPdf && (
            <button
              onClick={onDownloadPdf}
              className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-white/20 hover:text-white"
              title="Convert to PDF and download"
            >
              PDF
            </button>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${badgeColor}`}
          >
            {badge}
          </span>
        </div>
      </div>
      <div className="flex-1" style={{ minHeight: "65vh" }}>
        {children}
      </div>
    </div>
  );
}
