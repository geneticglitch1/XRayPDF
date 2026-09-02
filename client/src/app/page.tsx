"use client";

import Link from "next/link";
import { useState } from "react";
import HiddenTextDemo from "@/components/HiddenTextDemo";

const REPO_URL = "https://github.com/geneticglitch1/XRayPDF";

/** Tricks that survive a normal read-through, and how this pipeline sees them. */
const HIDING_SPOTS = [
  {
    title: "White text on white paper",
    desc: "Rendered in #FFFFFF. Invisible on screen and in print, still returned verbatim by every text extractor.",
    caught: "Invisible on white, unmistakable on black",
  },
  {
    title: "Near-zero font sizes",
    desc: "Text set at half a point reads as a smudge, or as nothing at all, but copies and pastes back at full length.",
    caught: "Rendered at 2× scale, so the smudge becomes glyphs",
  },
  {
    title: "Text behind images",
    desc: "A full-page graphic drawn on top of a live text run. Looks like a scan. It is not a scan.",
    caught: "Flattening rebuilds the page from what is drawn",
  },
  {
    title: "Invisible render modes",
    desc: "PDF text render mode 3 draws nothing at all. The characters are in the file and in your clipboard, and on no pixel of the page.",
    caught: "The export drops the text layer entirely",
  },
  {
    title: "Content parked off-page",
    desc: "Positioned outside the crop box. Never displayed, never printed, always extracted.",
    caught: "Cropped away by the render, gone from the export",
  },
  {
    title: "Leftover revision data",
    desc: "Incremental-save history and orphaned objects that keep earlier drafts alive inside the same file.",
    caught: "Not carried over — the export is a fresh document",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Render it twice",
    tool: "pdf.js, in your tab",
    desc: "Each page is rasterized at 2× scale — once on a white backdrop, once on black. Both renders come from the same page, drawn by the same engine, differing only in what sits behind the ink.",
  },
  {
    n: "02",
    title: "Compare the two",
    tool: "a per-pixel diff",
    desc: "White ink disappears into the white render and blazes in the black one; ordinary dark ink does the reverse. Invert the black-backed render, take the darker pixel of the pair, and every mark on the page turns dark on white — whatever colour it was drawn in.",
  },
  {
    n: "03",
    title: "Read it back",
    tool: "tesseract.js · optional",
    desc: "OCR over that combined image transcribes the hidden text alongside the visible copy. It costs an ~8 MB model download, so it is off until you ask for it.",
  },
  {
    n: "04",
    title: "Flatten the export",
    tool: "pdf-lib",
    desc: "Rebuild the document from page images. No text layer, no annotations, no object history — nothing left for anything to hide inside.",
  },
];

export default function Home() {
  const [xray, setXray] = useState(false);

  return (
    <div className="min-h-screen bg-stock text-ink">
      {/* ---------------------------------------------------------------- Nav */}
      <nav className="border-b border-rule">
        <div className="mx-auto flex max-w-[70rem] items-center justify-between px-6 py-5">
          <span className="font-display text-xl tracking-tight">
            XRay<span className="text-signal">PDF</span>
          </span>

          <div className="flex items-center gap-3 sm:gap-6">
            {/* The page practices what it preaches: there is white-on-white
                text planted in the hero, and this switch reveals it. */}
            <button
              onClick={() => setXray((v) => !v)}
              aria-pressed={xray}
              className="label group flex items-center gap-2 text-ink-soft transition-colors hover:text-ink"
            >
              <span
                className={`relative h-3.5 w-6 border transition-colors ${
                  xray ? "border-signal bg-signal" : "border-ink-faint"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-2 w-2 bg-stock transition-all ${
                    xray ? "left-3.5" : "left-0.5"
                  }`}
                />
              </span>
              X-ray
            </button>

            <Link
              href="/scan"
              className="bg-ink px-5 py-2.5 text-sm font-medium text-stock transition-colors hover:bg-signal"
            >
              Open the scanner
            </Link>
          </div>
        </div>
      </nav>

      {/* --------------------------------------------------------------- Hero */}
      <header className="mx-auto max-w-[70rem] px-6">
        <div className="grid gap-10 border-b border-rule py-16 md:py-24 lg:grid-cols-[1.6fr_1fr] lg:gap-20">
          <div>
            <p className="label mb-8 text-ink-faint">
              Runs in your browser · No upload · Apache-2.0
            </p>

            <h1 className="font-display text-[3.25rem] leading-[0.95] tracking-tight sm:text-7xl lg:text-[5.5rem]">
              Every PDF you send
              <br />
              is hiding{" "}
              <em className="text-signal italic">something</em>.
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft">
              White ink on white paper. Half-point type. Paragraphs parked
              outside the crop box. It renders as nothing and extracts at full
              length — and the machines reading your file get all of it.
            </p>

            {/* Planted white-on-white text, revealed by the X-ray switch. */}
            <p
              className={`mt-4 max-w-xl text-lg leading-relaxed transition-colors duration-300 ${
                xray
                  ? "text-signal"
                  : "text-stock selection:bg-signal selection:text-white"
              }`}
            >
              This sentence is white on white. You just switched on the x-ray —
              which is exactly the trick the essay below is playing.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-8">
              <Link
                href="/scan"
                className="bg-ink px-7 py-3.5 font-medium text-stock transition-colors hover:bg-signal"
              >
                Scan a PDF
              </Link>
              <a
                href="#self-host"
                className="border-b border-ink-faint pb-0.5 font-medium text-ink transition-colors hover:border-signal hover:text-signal"
              >
                Run it on your own box
              </a>
            </div>
          </div>

          {/* Colophon — the metadata block a printed document would carry. */}
          <dl className="self-end space-y-0 border-t border-rule lg:border-t-0 lg:border-l lg:pl-10">
            {[
              ["Processing", "Your browser, not a server"],
              ["Account", "None required"],
              ["Your files", "Never leave the tab"],
              ["Image", "ghcr.io · amd64 + arm64"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 border-b border-rule-soft py-3"
              >
                <dt className="label text-ink-faint">{k}</dt>
                <dd className="text-right text-sm text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* --------------------------------------------------------------- Demo */}
      <section className="mx-auto max-w-[70rem] px-6 py-16 md:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label mb-3 text-signal">One page, four passes</p>
            <h2 className="font-display max-w-lg text-4xl leading-tight sm:text-5xl">
              Watch a payload stop hiding
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
            The essay below carries a line of white text on white paper. Step
            through what the pipeline does to it.
          </p>
        </div>

        <HiddenTextDemo />
      </section>

      {/* ------------------------------------------------------ Hiding places */}
      <section className="border-t border-rule bg-sheet">
        <div className="mx-auto max-w-[70rem] px-6 py-16 md:py-24">
          <div className="mb-12 max-w-2xl">
            <p className="label mb-3 text-signal">The unknown stuff</p>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              Six places a PDF keeps text you never agreed to send
            </h2>
            <p className="mt-5 leading-relaxed text-ink-soft">
              Résumés, papers, invoices, contracts — anything that passes
              through an automated reader is worth checking before it leaves
              your hands, and worth flattening before you trust one you
              received.
            </p>
          </div>

          <ol className="grid border-t border-rule md:grid-cols-2">
            {HIDING_SPOTS.map((spot, i) => (
              <li
                key={spot.title}
                className={`border-b border-rule py-7 md:py-8 ${
                  i % 2 === 0 ? "md:pr-10" : "md:border-l md:border-rule md:pl-10"
                }`}
              >
                <div className="flex gap-5">
                  <span className="label mt-1 shrink-0 text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl leading-snug">
                      {spot.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                      {spot.desc}
                    </p>
                    <p className="mt-4 flex gap-2 text-sm text-verified">
                      <span aria-hidden="true">→</span>
                      <span>{spot.caught}</span>
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- How it works */}
      <section className="mx-auto max-w-[70rem] px-6 py-16 md:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="label mb-3 text-signal">Under the hood</p>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            No model. No guessing.
          </h2>
          <p className="mt-5 leading-relaxed text-ink-soft">
            Nothing here classifies what looks suspicious. Turning up the
            contrast cannot work either: text painted in pure white rasterizes
            to bytes identical to blank paper, so there is no difference in the
            image to amplify. You have to ask the renderer a second question.
          </p>
        </div>

        <div className="border-t border-rule">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="grid gap-3 border-b border-rule py-7 md:grid-cols-[4rem_1fr_1.4fr] md:items-baseline md:gap-8"
            >
              <span className="font-display text-3xl text-signal">
                {step.n}
              </span>
              <div>
                <h3 className="font-display text-2xl leading-snug">
                  {step.title}
                </h3>
                <p className="label mt-1.5 text-ink-faint">{step.tool}</p>
              </div>
              <p className="leading-relaxed text-ink-soft">{step.desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-faint">
          <span className="font-medium text-ink-soft">The trade:</span> a
          flattened export is no longer searchable or selectable. Keep the
          original when you need the text layer; send the clean copy when you
          don&apos;t know what is in the file.
        </p>
      </section>

      {/* ----------------------------------------------------------- Privacy */}
      <section className="border-y border-rule bg-sheet">
        <div className="mx-auto max-w-[70rem] px-6 py-16 md:py-24">
          <div className="mb-12 max-w-2xl">
            <p className="label mb-3 text-signal">Where this runs</p>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              Your file never leaves the tab
            </h2>
            <p className="mt-5 leading-relaxed text-ink-soft">
              Every stage above happens in your browser. The PDF goes from the
              file picker into memory, through pdf.js, onto a canvas, and back
              out as a download. It is never sent anywhere, because there is
              nowhere to send it — and you do not have to take that on trust.
            </p>
          </div>

          <dl className="grid border-t border-rule md:grid-cols-2">
            {[
              [
                "No upload endpoint",
                "The server has one route, a health check. There is no code path that receives a document, so there is nothing to misconfigure.",
              ],
              [
                "No database, no disk",
                "Nothing is persisted anywhere. Close the tab and the file, the renders and the OCR output are gone with it.",
              ],
              [
                "No account",
                "No sign-in, no email, no session. Nothing identifies you, so nothing can be associated with what you scanned.",
              ],
              [
                "No third-party requests",
                "The OCR model and WASM are served from this site, not a CDN. Open the network tab while you scan: every request goes to this origin, and none of them carry your file.",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="flex gap-5 border-b border-rule py-7 md:odd:pr-10 md:even:border-l md:even:border-rule md:even:pl-10"
              >
                <span aria-hidden="true" className="mt-1 text-verified">
                  ✓
                </span>
                <div>
                  <dt className="font-display text-2xl leading-snug">{title}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {body}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-faint">
            <span className="font-medium text-ink-soft">The honest caveat:</span>{" "}
            this page is still served to you over the network, so you are
            trusting that the code you received is the code described here. If
            that is not good enough for your threat model, the image below runs
            the identical build on hardware you control.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- Self-host */}
      <section id="self-host" className="scroll-mt-4 bg-ink text-stock">
        <div className="mx-auto grid max-w-[70rem] gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div>
            <p className="label mb-3 text-signal">Self-host</p>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              One image, published to GHCR
            </h2>
            <p className="mt-5 leading-relaxed text-stock/60">
              Multi-arch builds for amd64 and arm64 ship on every push to main,
              with an SBOM and a signed provenance attestation. Bring a Postgres
              and a Google OAuth client; compose does the rest. Migrations run
              on boot, uploads land in a named volume, and no document ever
              leaves your host.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-block border-b border-stock/30 pb-0.5 font-medium transition-colors hover:border-signal hover:text-signal"
            >
              Setup guide on GitHub ↗
            </a>
          </div>

          <div className="border border-white/15">
            <div className="label border-b border-white/15 px-5 py-2.5 text-stock/40">
              terminal
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-xs leading-loose">
              <code>
                <span className="text-stock/35"># pull the published image</span>
                {"\n"}
                <span className="text-signal">docker</span> pull
                ghcr.io/geneticglitch1/xraypdf:latest
                {"\n\n"}
                <span className="text-stock/35"># or bring up the whole stack</span>
                {"\n"}
                <span className="text-signal">cp</span> .env.example .env{"\n"}
                <span className="text-signal">docker</span> compose up -d{"\n\n"}
                <span className="text-stock/35">
                  # :3000, migrations applied
                </span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Close */}
      <section className="mx-auto max-w-[70rem] px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Check the next one before you forward it.
          </h2>
          <p className="mt-5 leading-relaxed text-ink-soft">
            Ten megabytes, twelve pages, about a minute. You will find out
            whether there was anything in there.
          </p>
          <Link
            href="/scan"
            className="mt-8 inline-block bg-ink px-7 py-3.5 font-medium text-stock transition-colors hover:bg-signal"
          >
            Open the scanner
          </Link>
        </div>
      </section>

      {/* -------------------------------------------------------------- Footer */}
      <footer className="border-t border-rule">
        <div className="label mx-auto flex max-w-[70rem] flex-col gap-3 px-6 py-8 text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>XRayPDF · Apache-2.0 · {new Date().getFullYear()}</span>
          <div className="flex gap-6">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-signal"
            >
              GitHub
            </a>
            <a
              href={`${REPO_URL}/pkgs/container/xraypdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-signal"
            >
              Image
            </a>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-signal"
            >
              Issues
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
