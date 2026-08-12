/**
 * Simple in-memory rate limiter (per process).
 * For multi-instance prod, swap to Redis later.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let callsSinceCleanup = 0;

function cleanupExpired(now: number) {
  callsSinceCleanup += 1;
  if (callsSinceCleanup < 250 && buckets.size < 5_000) return;
  callsSinceCleanup = 0;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  cleanupExpired(now);
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: limit - current.count,
    retryAfterSec: 0,
  };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
