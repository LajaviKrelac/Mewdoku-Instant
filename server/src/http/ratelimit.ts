// Owner: G4 (Phase 2e). Per-isolate token buckets (spec §1.9.5): best effort, no D1 cost. An isolate serves
// many requests but not all of them, so these only blunt bursts; the exact limits that matter are D1-backed
// (the bracket cap, the nickname cooldown, heart uniqueness, the anonymous registrations per IP per day),
// and a Cloudflare WAF rule guards the domain (G-SRV-4). Keys are player keys or in-memory IP hashes only.
import type { RateBucket, ServerConfig } from '../core/config';

interface Bucket {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limits: ServerConfig['rateLimits'],
    private readonly maxEntries = 20_000,
  ) {}

  /** Takes one token; `retryAfterMs` when the bucket is empty. */
  take(bucket: RateBucket, id: string, now: number): { ok: true } | { ok: false; retryAfterMs: number } {
    const lim = this.limits[bucket];
    if (!lim || lim.n <= 0) return { ok: true };
    const k = `${bucket}:${id}`;
    const rate = lim.n / lim.perMs; // tokens per ms
    const b = this.buckets.get(k) ?? { tokens: lim.n, at: now };
    this.buckets.delete(k); // re-insert: Map order is the LRU order
    b.tokens = Math.min(lim.n, b.tokens + Math.max(0, now - b.at) * rate);
    b.at = now;
    let out: { ok: true } | { ok: false; retryAfterMs: number };
    if (b.tokens >= 1) {
      b.tokens -= 1;
      out = { ok: true };
    } else {
      out = { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / rate) };
    }
    this.buckets.set(k, b);
    while (this.buckets.size > this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    return out;
  }

  clear(): void {
    this.buckets.clear();
  }
}

/** FNV-1a of the client IP: an in-memory bucket key only (never stored, never logged). */
export function ipBucketKey(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
