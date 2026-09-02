"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import HiddenTextDemo from "@/components/HiddenTextDemo";

const REPO_URL = "https://github.com/geneticglitch1/XRayPDF";

/** Tricks that survive a normal read-through, and how this pipeline sees them. */
const HIDING_SPOTS = [
  {
    title: "White text on white paper",
    desc: "The classic. Rendered in #FFFFFF, invisible on screen and in print, still returned verbatim by every text extractor.",
    caught: "Contrast normalization drags it into visible gray.",
  },
  {
    title: "Near-zero font sizes",
    desc: "Text set at 0.5pt reads as a smudge or as nothing at all, but copies and pastes back at full length.",
    caught: "Renders at 2× scale, so the smudge becomes glyphs.",
  },
  {
    title: "Text hidden behind images",
    desc: "A full-page graphic drawn on top of a text run. Looks like a scan; it is not a scan.",
    caught: "Flattening rebuilds the page from what's actually visible.",
  },
  {
    title: "Invisible render modes",
    desc: "PDF text render mode 3 draws nothing at all. The characters are in the file and in the clipboard, and on no pixel of the page.",
    caught: "The export drops the text layer entirely.",
  },
  {
    title: "Content parked off-page",
    desc: "Positioned outside the crop box. Never displayed, never printed, always extracted.",
    caught: "Cropped away by the render, gone from the export.",
  },
  {
    title: "Leftover revision data",
    desc: "Incremental-save history and orphaned objects that keep earlier drafts alive inside the same file.",
    caught: "Not carried over — the export is a fresh document.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Rasterize every page",
    desc: "pdfjs renders each page to a PNG at 2× scale on a forced white background. This is the honest picture of the document — whatever is actually drawn, and nothing else.",
  },
  {
    n: "02",
    title: "Push the contrast",
    desc: "sharp flattens alpha onto white, converts to grayscale, stretches the histogram across the full 0–255 range, and sharpens. Ink that was one shade off white lands in plain view.",
  },
  {
    n: "03",
    title: "Read it back with OCR",
    desc: "Tesseract runs over the sanitized image and returns word boxes with per-word confidence. Overlay them on the page to see exactly where the surprises are.",
  },
  {
    n: "04",
    title: "Export a flat PDF",
    desc: "pdf-lib rebuilds the document from the page images. No text layer, no annotations, no object history — nothing left for anything to hide inside.",
  },
];

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0a0a0a] text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[160px]" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-16">
        <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-black">
            X
          </span>
          XRayPDF
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#self-host"
            className="hidden rounded-full px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white sm:block"
          >
            Self-host
          </a>
          <button
            onClick={() => signIn("google")}
            disabled={status === "loading"}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {status === "loading" ? "Loading..." : "Sign in with Google"}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-6 pt-10 text-center md:pt-16">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Open source &middot; Self-hostable &middot; Files never leave your box
        </div>

        <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          Get the{" "}
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            invisible text
          </span>{" "}
          out of your PDFs
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 md:text-xl">
          A PDF can carry text that no human ever sees and every machine reads
          in full — white ink on white paper, 0.5pt type, whole paragraphs
          parked off the edge of the page. XRayPDF surfaces it, shows you what
          it found, and hands back a file with none of it left.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => signIn("google")}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-sm font-semibold transition hover:bg-violet-500"
          >
            Scan a PDF — free
            <svg
              className="h-4 w-4 transition group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <a
            href="#self-host"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-8 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
              <path d="M8 9h8M8 13h5" />
            </svg>
            Run it yourself
          </a>
        </div>
      </main>

      {/* Live demo */}
      <section className="relative z-10 mx-auto mt-20 w-full max-w-6xl px-6 md:mt-28">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-bold tracking-[0.2em] text-violet-400 uppercase">
            See it happen
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            One page, four passes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
            The essay below has a line of white text sitting on white paper.
            Step through what the pipeline does to it.
          </p>
        </div>
        <HiddenTextDemo />
      </section>

      {/* Where things hide */}
      <section className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-6 md:mt-32">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-xs font-bold tracking-[0.2em] text-violet-400 uppercase">
            The unknown stuff
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Six places a PDF keeps text you never agreed to send
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Resumes, papers, invoices, contracts — anything that gets passed
            through an automated reader is worth checking before it leaves your
            hands, and worth flattening before you trust one you received.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HIDING_SPOTS.map((spot) => (
            <div
              key={spot.title}
              className="group flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-white/15 hover:bg-white/[0.04]"
            >
              <h3 className="mb-2 text-base font-semibold text-white">
                {spot.title}
              </h3>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-500">
                {spot.desc}
              </p>
              <div className="flex items-start gap-2 border-t border-white/5 pt-3 text-xs leading-relaxed text-emerald-400/90">
                <svg
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {spot.caught}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-6 md:mt-32">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-xs font-bold tracking-[0.2em] text-violet-400 uppercase">
            Under the hood
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            No model, no guessing
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            There is no classifier deciding what looks suspicious. The pipeline
            is four deterministic steps, and the last one removes the hiding
            places rather than trying to spot every trick.
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-2">
          {STEPS.map((step) => (
            <div key={step.n} className="bg-[#0a0a0a] p-7">
              <span className="mb-3 block font-mono text-xs font-bold text-violet-400">
                {step.n}
              </span>
              <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-500">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-zinc-600">
          A flattened export is not searchable or selectable any more — that is
          the trade. Keep the original if you need the text layer; send the
          clean copy when you don&apos;t know what is in the file.
        </p>
      </section>

      {/* Self-host */}
      <section
        id="self-host"
        className="relative z-10 mx-auto mt-24 w-full max-w-5xl scroll-mt-8 px-6 md:mt-32"
      >
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
          <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.2em] text-violet-400 uppercase">
                Self-host
              </p>
              <h2 className="mb-3 text-3xl font-bold tracking-tight">
                One image, published to GHCR
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-zinc-400">
                Multi-arch builds for amd64 and arm64 ship on every push to
                main. Bring a Postgres and a Google OAuth client, and the
                compose file does the rest — migrations run on boot, uploads
                land in a named volume, and no document ever leaves your host.
              </p>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Setup guide on GitHub
              </a>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
              <div className="border-b border-white/5 px-4 py-2 font-mono text-[11px] text-zinc-500">
                terminal
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-300 sm:text-xs">
                <code>
                  <span className="text-zinc-600">
                    # pull the published image
                  </span>
                  {"\n"}
                  <span className="text-violet-400">docker</span> pull
                  ghcr.io/geneticglitch1/xraypdf:latest{"\n\n"}
                  <span className="text-zinc-600">
                    # or bring the whole stack up
                  </span>
                  {"\n"}
                  <span className="text-violet-400">cp</span> .env.example .env
                  {"\n"}
                  <span className="text-violet-400">docker</span> compose up -d
                  {"\n\n"}
                  <span className="text-zinc-600">
                    # app on :3000, migrations applied
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative z-10 mx-auto mt-24 w-full max-w-3xl px-6 pb-24 text-center md:mt-32">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Check the next PDF before you forward it
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
          Ten megabytes, twelve pages, about a minute. You will find out
          whether there was anything in there.
        </p>
        <button
          onClick={() => signIn("google")}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-sm font-semibold transition hover:bg-violet-500"
        >
          Sign in with Google
        </button>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-zinc-600 sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} XRayPDF &mdash; Apache-2.0
          </span>
          <div className="flex items-center gap-5">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-zinc-300"
            >
              GitHub
            </a>
            <a
              href={`${REPO_URL}/pkgs/container/xraypdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-zinc-300"
            >
              Container image
            </a>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-zinc-300"
            >
              Issues
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
