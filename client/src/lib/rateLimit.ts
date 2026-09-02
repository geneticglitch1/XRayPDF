/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Suitable for a single-instance deployment (the intended target here). It is
 * process-local, so it resets on restart and does not coordinate across
 * replicas — a shared store (Redis) would be needed for horizontal scaling.
 */

const buckets = new Map<string, number[]>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Record an attempt for `key` and report whether it is within the limit of
 * `max` attempts per `windowMs`. Non-allowed attempts are NOT counted, so a
 * blocked user can retry as soon as the window frees up.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= max) {
    const oldest = timestamps[0];
    buckets.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return {
    allowed: true,
    remaining: max - timestamps.length,
    retryAfterSeconds: 0,
  };
}
