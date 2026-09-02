/**
 * Copies the WASM/worker assets the browser pipeline needs out of node_modules
 * and into public/, so the app serves them itself.
 *
 * This is not a bundling convenience — it is what makes the privacy claim true.
 * Left to its own devices, tesseract.js fetches its core and language data from
 * a CDN at runtime, which would mean the page reaches out to a third party the
 * moment someone runs OCR. Serving them from our own origin keeps the whole
 * pipeline on the user's machine and our own domain.
 *
 * Runs from `predev` and `prebuild`, so the files are in place before Next
 * looks at public/. The copied files are gitignored: they are build outputs
 * derived from the lockfile, not sources.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

/** Resolve a file inside an installed package without hardcoding node_modules. */
function pkgFile(pkg, ...segments) {
  return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), ...segments);
}

const COPIES = [
  // pdf.js renders pages off the main thread.
  {
    from: pkgFile("pdfjs-dist", "build", "pdf.worker.min.mjs"),
    to: path.join(publicDir, "pdfjs", "pdf.worker.min.mjs"),
  },
  // tesseract.js worker shim.
  {
    from: pkgFile("tesseract.js", "dist", "worker.min.js"),
    to: path.join(publicDir, "tesseract", "worker.min.js"),
  },
];

// All three LSTM core builds ship. tesseract.js probes the browser at runtime
// and picks relaxed-SIMD, SIMD or plain, so serving a subset breaks OCR on
// whichever browsers wanted the missing one. Each variant needs the .wasm
// alongside its .wasm.js glue — the glue is what actually gets importScripts'd,
// and shipping the binary without it fails at load.
//
// This is ~20MB on disk, but a given browser downloads only the one variant it
// selected (~6.5MB), and only if someone turns OCR on.
for (const variant of [
  "tesseract-core-lstm",
  "tesseract-core-simd-lstm",
  "tesseract-core-relaxedsimd-lstm",
]) {
  for (const ext of ["js", "wasm", "wasm.js"]) {
    COPIES.push({
      from: pkgFile("tesseract.js-core", `${variant}.${ext}`),
      to: path.join(publicDir, "tesseract", `${variant}.${ext}`),
    });
  }
}

let copied = 0;
for (const { from, to } of COPIES) {
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  const { size } = await stat(to);
  copied += size;
  console.log(
    `  ${path.relative(root, to)}  ${(size / 1024 / 1024).toFixed(1)}MB`
  );
}
console.log(
  `browser assets staged in public/ (${(copied / 1024 / 1024).toFixed(1)}MB total)`
);
