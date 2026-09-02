/**
 * Convert an unknown thrown value into a human-readable message that is safe to
 * surface to the client: real enough to be useful, but with absolute filesystem
 * paths (which can leak the server layout / usernames) scrubbed out.
 */
export function safeErrorMessage(err: unknown): string {
  let message = err instanceof Error ? err.message : String(err);
  if (!message) message = "Unknown error";

  // Strip anything that looks like an absolute path so we don't leak the
  // server's directory structure or the OS user's home directory.
  message = message
    .replace(new RegExp(escapeRegExp(process.cwd()), "g"), "")
    .replace(/(?:\/[^\s:'"]+)+/g, "<path>")
    .replace(/[A-Za-z]:\\[^\s:'"]+/g, "<path>")
    .trim();

  return message.length > 0 ? message : "Processing failed";
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
