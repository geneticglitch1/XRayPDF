"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Document = {
  id: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  ocrRan: boolean;
};

export default function DashboardPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const fetchDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Only PDF files are accepted.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File must be smaller than 10 MB.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("pdf", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/${data.document.id}`);
    } else {
      const err = await res.json();
      alert(err.error || "Upload failed");
    }
    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}/delete`, { method: "DELETE" });
    fetchDocs();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver
            ? "border-violet-500 bg-violet-500/5"
            : "border-white/10 bg-white/[0.02] hover:border-white/20"
        }`}
      >
        <div className="mb-4 rounded-full bg-violet-600/10 p-4">
          <svg
            className="h-8 w-8 text-violet-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>
        <p className="mb-1 text-lg font-semibold">
          {uploading ? "Uploading..." : "Drop your PDF here"}
        </p>
        <p className="mb-4 text-sm text-zinc-500">
          or click to browse &middot; Max 10 MB &middot; {docs.length}/5 slots
          used
        </p>
        <label className="cursor-pointer rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold transition hover:bg-violet-500">
          Choose File
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {/* Document list */}
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold">Your Documents</h2>
        {docs.length === 0 ? (
          <p className="text-zinc-500">
            No documents yet. Upload a PDF to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10 hover:bg-white/[0.04]"
              >
                <button
                  onClick={() => router.push(`/dashboard/${doc.id}`)}
                  className="flex flex-1 items-center gap-4 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
                    <svg
                      className="h-5 w-5 text-violet-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">{doc.originalName}</p>
                    <p className="text-xs text-zinc-500">
                      {formatSize(doc.fileSize)} &middot;{" "}
                      {new Date(doc.createdAt).toLocaleDateString()} &middot;{" "}
                      {doc.ocrRan ? "OCR complete" : "OCR pending"}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="ml-4 rounded-lg p-2 text-zinc-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
