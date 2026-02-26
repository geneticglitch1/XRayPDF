"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0a0a0a] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[160px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 md:px-16">
        <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-black">
            X
          </span>
          XRayPDF
        </div>
        <button
          onClick={() => signIn("google")}
          disabled={status === "loading"}
          className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
        >
          {status === "loading" ? "Loading..." : "Sign in with Google"}
        </button>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Open Source &middot; Free to Use
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.1] tracking-tight md:text-7xl">
          Reveal{" "}
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            Hidden Text
          </span>{" "}
          in Any PDF
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400 md:text-xl">
          Upload your homework PDF and instantly uncover invisible text hidden
          with white fonts, tiny sizes, or steganographic tricks — powered by
          pixel analysis &amp; Tesseract&nbsp;OCR.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <button
            onClick={() => signIn("google")}
            className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-sm font-semibold transition hover:bg-violet-500"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Get Started — It&apos;s Free
          </button>
          <a
            href="https://github.com/yourusername/XRayPDF"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-8 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </main>

      {/* Feature cards */}
      <section className="relative z-10 mx-auto grid max-w-5xl gap-4 px-6 pb-24 md:grid-cols-3">
        {[
          {
            icon: "🔍",
            title: "Pixel Analysis",
            desc: "Inverts and contrast-boosts every page to expose hidden white-on-white text instantly.",
          },
          {
            icon: "🔡",
            title: "Tesseract OCR",
            desc: "Server-side OCR detects tiny or cleverly-colored text that pixel analysis alone can't catch.",
          },
          {
            icon: "📄",
            title: "Side-by-Side View",
            desc: "Compare original, pixel-revealed, and OCR results in a beautiful three-panel layout.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur transition hover:border-white/10 hover:bg-white/[0.04]"
          >
            <div className="mb-3 text-3xl">{f.icon}</div>
            <h3 className="mb-1 text-lg font-semibold">{f.title}</h3>
            <p className="text-sm leading-relaxed text-zinc-500">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} XRayPDF &mdash; Built for students,
        by students.
      </footer>
    </div>
  );
}

