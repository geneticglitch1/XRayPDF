import { NextResponse } from "next/server";

/**
 * Trivial liveness endpoint for container/compose healthchecks. Intentionally
 * unauthenticated (excluded from the auth middleware matcher) and does not touch
 * the database so it stays fast and dependency-free.
 */
export function GET() {
  return NextResponse.json({ status: "ok", uptime: process.uptime() });
}
