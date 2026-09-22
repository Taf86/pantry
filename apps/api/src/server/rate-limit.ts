import { createHmac } from "node:crypto";
import { PUBLIC_RATE_LIMITS } from "@pantry/shared";

export interface LimitDecision {
  ok: boolean;
  retryAfter: number;
}

export interface Limiter {
  take: (key: string) => LimitDecision;
  peek: (key: string) => LimitDecision;
  reset: (key: string) => void;
  stop: () => void;
}

export interface LimitWindow {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const ALLOWED: LimitDecision = { ok: true, retryAfter: 0 };

const MAX_KEYS = 100_000;

export const createLimiter = (options: {
  windowMs: number;
  max: number;
  maxKeys?: number;
  now?: () => number;
}): Limiter => {
  const { windowMs, max } = options;
  const maxKeys = options.maxKeys ?? MAX_KEYS;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  const sweep = (): void => {
    const at = now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= at) buckets.delete(key);
    }
  };

  const evictOldest = (): void => {
    const oldest = buckets.keys().next();
    if (!oldest.done) buckets.delete(oldest.value);
  };

  const current = (key: string): Bucket | undefined => {
    const bucket = buckets.get(key);
    if (!bucket) return undefined;
    if (bucket.resetAt <= now()) {
      buckets.delete(key);
      return undefined;
    }
    return bucket;
  };

  const decide = (bucket: Bucket): LimitDecision =>
    bucket.count <= max
      ? ALLOWED
      : { ok: false, retryAfter: Math.ceil((bucket.resetAt - now()) / 1000) };

  const timer = setInterval(sweep, windowMs);
  timer.unref();

  return {
    take: (key) => {
      const existing = current(key);
      if (existing) {
        existing.count += 1;
        return decide(existing);
      }
      if (buckets.size >= maxKeys) evictOldest();
      const fresh: Bucket = { count: 1, resetAt: now() + windowMs };
      buckets.set(key, fresh);
      return decide(fresh);
    },

    peek: (key) => {
      const bucket = current(key);
      return bucket ? decide(bucket) : ALLOWED;
    },

    reset: (key) => {
      buckets.delete(key);
    },

    stop: () => {
      clearInterval(timer);
      buckets.clear();
    },
  };
};

export const createLimiterSet = (
  windows: readonly LimitWindow[],
  options: { maxKeys?: number; now?: () => number } = {},
): Limiter => {
  const limiters = windows.map((window) =>
    createLimiter({ ...window, ...options }),
  );

  return {
    take: (key) => {
      for (const limiter of limiters) {
        const decision = limiter.take(key);
        if (!decision.ok) return decision;
      }
      return ALLOWED;
    },

    peek: (key) => {
      for (const limiter of limiters) {
        const decision = limiter.peek(key);
        if (!decision.ok) return decision;
      }
      return ALLOWED;
    },

    reset: (key) => {
      for (const limiter of limiters) limiter.reset(key);
    },

    stop: () => {
      for (const limiter of limiters) limiter.stop();
    },
  };
};

export interface AppLimits {
  http: Limiter;
  procedure: Limiter;
  createRequest: Limiter;
  createRequestGlobal: Limiter;
  stop: () => void;
}

export const createAppLimits = (
  options: { now?: () => number } = {},
): AppLimits => {
  const limiters = {
    http: createLimiter({ ...PUBLIC_RATE_LIMITS.http, ...options }),
    procedure: createLimiter({ ...PUBLIC_RATE_LIMITS.procedure, ...options }),
    createRequest: createLimiterSet(PUBLIC_RATE_LIMITS.createRequest, options),
    createRequestGlobal: createLimiter({
      ...PUBLIC_RATE_LIMITS.createRequestGlobal,
      ...options,
    }),
  };

  return {
    ...limiters,
    stop: () => {
      for (const limiter of Object.values(limiters)) limiter.stop();
    },
  };
};

export const hashClientIp = (ip: string, secret: string): string =>
  createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 32);
