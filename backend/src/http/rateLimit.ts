import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";

export interface RateLimitOptions {
  windowMs: number;
  maxPerIp: number;
  maxTotal: number;
  now?: () => number;
}

/**
 * Fixed-window limiter for the unauthenticated token-broker routes.
 *
 * State is per-instance and per-process, so the effective ceiling scales with
 * Cloud Run's max-instances. That is intentional for a lab-sized deployment:
 * the goal is to bound brute-force and runaway billing, not to defeat a
 * determined distributed attacker. The global counter is what keeps a caller
 * who spoofs X-Forwarded-For from fanning out without limit.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const now = options.now ?? Date.now;
  let windowStartedAt = now();
  let perIp = new Map<string, number>();
  let total = 0;

  return (request, response, next) => {
    const currentTime = now();
    if (currentTime - windowStartedAt >= options.windowMs) {
      // Replace wholesale so memory stays bounded without an eviction policy.
      windowStartedAt = currentTime;
      perIp = new Map();
      total = 0;
    }

    const key = request.ip ?? "unknown";
    const used = (perIp.get(key) ?? 0) + 1;
    perIp.set(key, used);
    total += 1;

    if (used > options.maxPerIp || total > options.maxTotal) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStartedAt + options.windowMs - currentTime) / 1000)
      );
      response.setHeader("Retry-After", String(retryAfterSeconds));
      next(
        new ApiError({
          status: 429,
          code: "TOO_MANY_TOKEN_REQUESTS",
          message: "Too many sign-in requests reached the service.",
          action: `Wait ${retryAfterSeconds} seconds and try again.`,
          retryable: true
        })
      );
      return;
    }

    next();
  };
}
