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

type PixelPage = { page: number; path: string };
type OcrPage = {
  page: number;
  path: string;
  text?: string;
  confidence?: number;
};

export default function ViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);

  // Pixel state
  const [pixelLoading, setPixelLoading] = useState(false);
  const [pixelPages, setPixelPages] = useState<PixelPage[]>([]);
  const [pixelCurrentPage, setPixelCurrentPage] = useState(1);

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPages, setOcrPages] = useState<OcrPage[]>([]);
  const [ocrCurrentPage, setOcrCurrentPage] = useState(1);
  const [ocrProgress, setOcrProgress] = useState({ page: 0, total: 0 });

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
        // Auto-trigger pixel if not done yet
        if (!found.pixelResultDir || found.pixelPageCount === 0) {
          runPixelAnalysis(found.id);
        } else {
          // Load cached pixel pages
          const pages = Array.from(
            { length: found.pixelPageCount },
            (_, i) => ({
              page: i + 1,
              path: `${found.pixelResultDir}/page_${i + 1}.png`,
            })
          );
          setPixelPages(pages);
        }
        // If OCR was already run, load the pages
        if (found.ocrRan && found.ocrResultDir && found.ocrPageCount > 0) {
          loadOcrPages(found.ocrResultDir, found.ocrPageCount);
        }
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

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
            ? {
                ...prev,
                pixelResultDir:
                  data.pages[0]?.path?.replace(/\/page_\d+\.png$/, "") ?? null,
                pixelPageCount: data.pageCount,
                pageCount: data.pageCount,
              }
            : prev
        );
      }
    } catch (e) {
      console.error("Pixel analysis error:", e);
    }
    setPixelLoading(false);
  };

  const loadOcrPages = async (dir: string, count: number) => {
    const pages: OcrPage[] = [];
    for (let i = 1; i <= count; i++) {
      const pagePath = `${dir}/page_${i}.txt`;
      try {
        const res = await fetch(pagePath);
        const text = res.ok ? await res.text() : "(failed to load)";
        pages.push({ page: i, path: pagePath, text });
      } catch {
        pages.push({ page: i, path: pagePath, text: "(failed to load)" });
      }
    }
    setOcrPages(pages);
  };

  const runOcr = async () => {
    if (!doc || doc.ocrRan) return;
    setOcrLoading(true);
    setOcrProgress({ page: 0, total: 0 });
    setOcrPages([]);

    try {
      const res = await fetch(`/api/documents/${doc.id}/ocr`, {
        method: "POST",
      });

      if (!res.ok) {
        if (res.status === 409) {
          const data = await res.json();
          if (data.pages) {
            await loadOcrPages(
              data.pages[0]?.path?.replace(/\/page_\d+\.txt$/, ""),
              data.pageCount
            );
            setDoc((prev) => (prev ? { ...prev, ocrRan: true } : prev));
          }
        }
        setOcrLoading(false);
        return;
      }

      // Stream reading (NDJSON)
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
                ...prev,
                {
                  page: event.page,
                  path: event.path,
                  text: event.text,
                  confidence: event.confidence,
                },
              ]);
            } else if (event.type === "complete") {
              setDoc((prev) =>
                prev
                  ? {
                      ...prev,
                      ocrRan: true,
                      ocrResultDir:
                        event.pages[0]?.path?.replace(
                          /\/page_\d+\.txt$/,
                          ""
                        ) ?? null,
                      ocrPageCount: event.pageCount,
                    }
                  : prev
              );
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e) {
      console.error("OCR error:", e);
    }
    setOcrLoading(false);
  };

  const downloadAll = (type: "pixel" | "ocr") => {
    const pages = type === "pixel" ? pixelPages : ocrPages;
    pages.forEach((p) => {
      const a = document.createElement("a");
      a.href = p.path;
      a.download = p.path.split("/").pop() || `page_${p.page}`;
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
              {doc.pageCount > 0 ? `${doc.pageCount} pages \u00b7 ` : ""}
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
          badge={doc.pageCount > 0 ? `${doc.pageCount} pages` : "Source"}
          badgeColor="bg-blue-500/10 text-blue-400"
          visible={activeTab === "original"}
        >
          <iframe
            src={doc.filePath}
            className="h-full w-full rounded-lg"
            title="Original PDF"
          />
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
            pixelPages.length > 0 ? () => downloadAll("pixel") : undefined
          }
        >
          {pixelLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-sm text-zinc-500">
                  Analyzing all pages...
                </p>
              </div>
            </div>
          ) : pixelPages.length > 0 ? (
            <div className="flex h-full flex-col">
              {/* Page navigator */}
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                <button
                  onClick={() =>
                    setPixelCurrentPage((p) => Math.max(1, p - 1))
                  }
                  disabled={pixelCurrentPage <= 1}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-xs text-zinc-400">
                  Page {pixelCurrentPage} / {pixelPages.length}
                </span>
                <button
                  onClick={() =>
                    setPixelCurrentPage((p) =>
                      Math.min(pixelPages.length, p + 1)
                    )
                  }
                  disabled={pixelCurrentPage >= pixelPages.length}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
              {/* Image display */}
              <div className="flex-1 overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pixelPages[pixelCurrentPage - 1]?.path}
                  alt={`Pixel analysis page ${pixelCurrentPage}`}
                  className="w-full rounded-lg object-contain"
                />
              </div>
              {/* Page thumbnails */}
              {pixelPages.length > 1 && (
                <div className="flex gap-1 overflow-x-auto border-t border-white/5 p-2">
                  {pixelPages.map((p) => (
                    <button
                      key={p.page}
                      onClick={() => setPixelCurrentPage(p.page)}
                      className={`flex-shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                        pixelCurrentPage === p.page
                          ? "border-violet-500 bg-violet-500/20 text-violet-300"
                          : "border-white/10 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {p.page}
                    </button>
                  ))}
                </div>
              )}
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
            doc.ocrRan
              ? `${ocrPages.length} pages`
              : ocrLoading
                ? `Processing ${ocrProgress.page}/${ocrProgress.total}`
                : "Manual"
          }
          badgeColor={
            doc.ocrRan
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }
          visible={activeTab === "ocr"}
          onDownload={
            ocrPages.length > 0 ? () => downloadAll("ocr") : undefined
          }
        >
          {ocrLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-zinc-400">
                Running Tesseract OCR...
              </p>
              {/* Progress bar */}
              {ocrProgress.total > 0 && (
                <div className="w-full max-w-xs">
                  <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                    <span>
                      Page {ocrProgress.page} of {ocrProgress.total}
                    </span>
                    <span>
                      {Math.round(
                        (ocrProgress.page / ocrProgress.total) * 100
                      )}
                      %
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
              {/* Live results feed */}
              {ocrPages.length > 0 && (
                <div className="mt-2 w-full max-w-xs rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">
                    Pages completed:
                  </p>
                  {ocrPages.map((p) => (
                    <div
                      key={p.page}
                      className="flex items-center justify-between text-[10px] text-zinc-400"
                    >
                      <span>Page {p.page}</span>
                      {p.confidence !== undefined && (
                        <span className="text-emerald-400">
                          {p.confidence.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : ocrPages.length > 0 ? (
            <div className="flex h-full flex-col">
              {/* Page navigator */}
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
                <button
                  onClick={() =>
                    setOcrCurrentPage((p) => Math.max(1, p - 1))
                  }
                  disabled={ocrCurrentPage <= 1}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-xs text-zinc-400">
                  Page {ocrCurrentPage} / {ocrPages.length}
                  {ocrPages[ocrCurrentPage - 1]?.confidence !== undefined && (
                    <span className="ml-2 text-emerald-400">
                      ({ocrPages[ocrCurrentPage - 1].confidence!.toFixed(0)}%
                      conf)
                    </span>
                  )}
                </span>
                <button
                  onClick={() =>
                    setOcrCurrentPage((p) =>
                      Math.min(ocrPages.length, p + 1)
                    )
                  }
                  disabled={ocrCurrentPage >= ocrPages.length}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
              {/* OCR text display */}
              <div className="flex-1 overflow-auto p-4">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-300">
                  {ocrPages[ocrCurrentPage - 1]?.text ||
                    "(no text extracted)"}
                </pre>
              </div>
              {/* Page thumbnails */}
              {ocrPages.length > 1 && (
                <div className="flex gap-1 overflow-x-auto border-t border-white/5 p-2">
                  {ocrPages.map((p) => (
                    <button
                      key={p.page}
                      onClick={() => setOcrCurrentPage(p.page)}
                      className={`flex-shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                        ocrCurrentPage === p.page
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-white/10 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {p.page}
                    </button>
                  ))}
                </div>
              )}
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
                  Runs Tesseract on every page. Only one run allowed per doc.
                </p>
                <button
                  onClick={runOcr}
                  disabled={doc.ocrRan}
                  className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold transition hover:bg-emerald-500 disabled:opacity-50"
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

function Panel({
  title,
  badge,
  badgeColor,
  children,
  visible,
  onDownload,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
  visible: boolean;
  onDownload?: () => void;
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
