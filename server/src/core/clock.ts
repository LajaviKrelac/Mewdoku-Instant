// Owner: G4 (Phase 2e). The server's only clock (spec §1.1: core/ is pure and takes a Clock; nothing in
// core/ calls Date.now). Dev test pools add their own offset (dev routes, spec §1.3).
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock the tests move by hand. */
export class FakeClock implements Clock {
  constructor(private t: number) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** "YYYY-MM-DD" of the UTC calendar date at `ms`. */
export function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Epoch ms of 00:00 UTC of the day holding `ms`. */
export function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** Epoch ms of 00:00 UTC of a "YYYY-MM-DD" key, or NaN when it is not a real calendar date. */
export function dateKeyStart(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return Number.NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return utcDateKey(t) === key ? t : Number.NaN;
}
