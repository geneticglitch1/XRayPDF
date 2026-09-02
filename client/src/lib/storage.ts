import path from "path";
import { rm } from "fs/promises";

/**
 * Storage layout helpers.
 *
 * All user files (uploaded PDFs + per-page render/pixel results) live under a
 * single STORAGE_DIR root that is OUTSIDE of Next's public/ directory. This
 * keeps user content off the static file server (so it can only be reached
 * through authenticated API routes) and makes the data trivially mountable as
 * a volume in a container.
 *
 * STORAGE_DIR defaults to "<cwd>/storage" in development.
 */

export function storageRoot(): string {
  const configured = process.env.STORAGE_DIR;
  if (configured && configured.trim().length > 0) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "storage");
}

/** Directory that holds a user's uploaded source PDFs. */
export function uploadsDir(userId: string): string {
  return path.join(storageRoot(), "uploads", userId);
}

/** Absolute path to a stored source PDF, given the DB-relative key. */
export function sourcePdfPath(storageKey: string): string {
  // storageKey is stored relative to the storage root, e.g.
  // "uploads/<userId>/<fileId>.pdf". Guard against path traversal.
  const clean = storageKey.replace(/^[/\\]+/, "");
  return path.join(storageRoot(), clean);
}

export type ResultKind = "original" | "pixel";

/** Directory that holds a document's per-page result images of a given kind. */
export function resultsDir(
  userId: string,
  docId: string,
  kind: ResultKind
): string {
  return path.join(storageRoot(), "results", userId, docId, kind);
}

/** Absolute path to a single per-page result PNG. */
export function resultPagePath(
  userId: string,
  docId: string,
  kind: ResultKind,
  pageNumber: number
): string {
  return path.join(resultsDir(userId, docId, kind), `page_${pageNumber}.png`);
}

/**
 * Best-effort removal of a document's on-disk footprint (source PDF + all
 * result images). Never throws — file cleanup should not block a DB delete.
 */
export async function removeDocumentFiles(
  userId: string,
  docId: string,
  storageKey: string
): Promise<void> {
  const targets = [
    sourcePdfPath(storageKey),
    path.join(storageRoot(), "results", userId, docId),
  ];
  await Promise.all(
    targets.map((t) => rm(t, { recursive: true, force: true }).catch(() => {}))
  );
}
