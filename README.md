# XRayPDF

**Find the invisible text in a PDF, and strip it out — entirely in your browser.**

A PDF can carry text that no human ever sees and every machine reads in full:
white ink on white paper, half-point type, paragraphs parked outside the crop
box, a text run hidden behind a full-page image. It renders as nothing. It
copies, pastes and extracts at full length.

XRayPDF surfaces that content, shows you what it found, and hands back a file
with none of it left. No upload, no account, no server-side processing.

## Your file never leaves the tab

| | |
| --- | --- |
| **No upload endpoint** | The server has exactly one route, a health check. There is no code path that receives a document. |
| **No database, no disk** | Nothing is persisted. Close the tab and the file, the renders and the OCR output go with it. |
| **No account** | No sign-in, no email, no session. Nothing identifies you. |
| **No third-party requests** | The OCR model and WASM are served from the app's own origin, not a CDN. Open the network tab while you scan: every request goes to that origin, and none carry your file. |

The honest caveat: the page is still served to you over the network, so you are
trusting that the code you received is the code described here. If that isn't
good enough for your threat model, run the image yourself.

## How it works

**Turning up the contrast does not work.** Text painted in pure `#FFFFFF`
rasterizes to bytes identical to blank paper — there is no difference in the
image to amplify, and a page with ordinary black text already spans the full
0–255 range, so normalizing it is a no-op. Any tool claiming to reveal hidden
text by boosting contrast cannot find the most common case.

So XRayPDF asks the renderer a second question instead:

1. **Render each page twice** — at 2× scale on a white backdrop, then on black.
   Same page, same engine, different thing behind the ink.
2. **Compare them.** White ink vanishes into the first render and blazes in the
   second; ordinary dark ink does the reverse. Invert the black-backed render
   and take the darker pixel of each pair, and every mark on the page comes out
   dark on white, whatever colour it was drawn in. Anything dark there but
   paper-white in the plain render was never meant to be seen.
3. **Read it back with OCR** *(optional)* — Tesseract over that combined image
   transcribes hidden text alongside the visible copy. Off by default: it costs
   an ~8 MB model download on first use and runs at a few seconds per page.
4. **Flatten the export** — rebuild the PDF from page images. No text layer, no
   annotations, no object history.

One limitation worth stating: a page that paints its own opaque background
leaves nothing for the black backdrop to show through. XRayPDF detects that
case and reports the scan as unreliable rather than showing you a page-sized
false positive.

**The trade on export:** a flattened PDF is no longer searchable or selectable.
Keep the original when you need the text layer; send the clean copy when you
don't know what is in the file.

## Run it

### From the published image

Multi-arch images (`linux/amd64`, `linux/arm64`) are published to GHCR on every
push to `main`:

```bash
docker run --rm -p 3000:3000 ghcr.io/geneticglitch1/xraypdf:latest
```

No environment variables, no database, no volumes — the app is stateless.
Tags: `latest`, `sha-<commit>`, and `v1.2.3` / `v1.2` on release tags.

### With compose

```bash
docker compose up -d
```

Set `HOST_PORT` to publish somewhere other than 3000, and `XRAY_IMAGE` to pin a
tag or digest. To build from source instead of pulling:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

### Local development

```bash
cd client
npm install
npm run dev
```

`predev` and `prebuild` stage the pdf.js worker and the Tesseract core/WASM out
of `node_modules` into `public/`, so the app serves them itself rather than
pulling them from a CDN at runtime. Those staged files are gitignored — they are
build output derived from the lockfile.

`GET /api/health` is an unauthenticated liveness endpoint used as the container
healthcheck. It is the only server route in the app.

## Limits

- Pages render at 2× scale, capped at 4 megapixels each so large-format
  documents don't exhaust a mobile tab.
- OCR is English-only; `eng.traineddata` ships with the app.
- Rendering is `requestAnimationFrame`-driven, so browsers throttle it in
  background tabs. Leave the tab in front while a scan runs.
- The image is ~455 MB, most of which is the three Tesseract WASM builds
  (~20 MB) plus the language model — a browser downloads only the one variant
  it needs, and only if OCR is switched on.

## Stack

Next.js (App Router, standalone output) · `pdfjs-dist` · `tesseract.js` ·
`pdf-lib`. Six runtime dependencies, all of which run in the browser.

## License

Apache-2.0 — see [LICENSE](LICENSE).
