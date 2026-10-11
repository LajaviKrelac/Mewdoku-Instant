// Owner: G4 (Phase 2e). A synthetic test client for scripts/load.ts and scripts/smoke.ts: signs sessions with
// FB_APP_SECRET_ALT (never the live app secret; the staging Worker puts such players in the `fb:synthetic`
// pool, never the real one, H-1; production refuses it) and plays real solutions from the solution table.
import { createHmac, randomUUID } from 'node:crypto';
import { SOLUTIONS } from '../src/content/generated/solutions';

export interface Timing {
  readonly route: string;
  readonly status: number;
  readonly ms: number;
}

export class Recorder {
  readonly timings: Timing[] = [];
  add(route: string, status: number, ms: number): void {
    this.timings.push({ route, status, ms });
  }
  summary(): { route: string; n: number; errors: number; p50: number; p95: number }[] {
    const by = new Map<string, Timing[]>();
    for (const t of this.timings) by.set(t.route, [...(by.get(t.route) ?? []), t]);
    return [...by.entries()].map(([route, ts]) => {
      const ms = ts.map((t) => t.ms).sort((a, b) => a - b);
      const q = (p: number): number => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))] ?? 0;
      return { route, n: ts.length, errors: ts.filter((t) => t.status >= 500 || t.status === 0).length, p50: q(50), p95: q(95) };
    });
  }
}

const CONTENT = SOLUTIONS.contentVersions[0] ?? 'content-unknown';

/** The first table board of level L (what a client with the pack shows). */
export function levelBoard(level: number): string {
  return (SOLUTIONS.levels.boards.split(',')[level - SOLUTIONS.levels.first] ?? '').split('|')[0] as string;
}

export class SyntheticPlayer {
  token = '';
  level = 1;
  bracketId: string | null = null;
  slots: number[] = [];
  rewards: string[] = [];

  constructor(
    readonly base: string,
    readonly secret: string,
    readonly id: string,
    readonly rec: Recorder,
    readonly origin?: string,
  ) {}

  private async call(route: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const t0 = performance.now();
    const headers: Record<string, string> = { 'content-type': 'text/plain', ...(init.headers as Record<string, string> | undefined) };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.origin) headers.origin = this.origin;
    try {
      const r = await fetch(`${this.base}${path}`, { ...init, headers });
      const text = await r.text();
      this.rec.add(route, r.status, performance.now() - t0);
      return { status: r.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
    } catch {
      this.rec.add(route, 0, performance.now() - t0);
      return { status: 0, body: null };
    }
  }

  async signIn(): Promise<boolean> {
    const n = await this.call('nonce', '/v1/session/nonce', { method: 'POST', body: '{}' });
    const nonce = n.body?.nonce;
    if (typeof nonce !== 'string') return false;
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000), player_id: this.id, request_payload: nonce })).toString('base64url');
    const signature = `${createHmac('sha256', this.secret).update(payload).digest('base64url')}.${payload}`;
    const s = await this.call('session', '/v1/session', {
      method: 'POST',
      body: JSON.stringify({ platform: 'fb', playerId: this.id, signature, nonce, clientVersion: '0.0.0-load', contentVersion: CONTENT }),
    });
    if (s.status !== 200 || typeof s.body?.token !== 'string') return false;
    this.token = s.body.token;
    for (const r of (s.body.results as { reward?: { rewardId: string; claim: unknown } | null }[] | undefined) ?? []) {
      if (r.reward && r.reward.claim === null) this.rewards.push(r.reward.rewardId);
    }
    return true;
  }

  /** `count` real wins, oldest first, in one call (the client batches queued wins the same way). */
  async wins(count: number): Promise<number> {
    const wins = Array.from({ length: count }, () => {
      this.level++;
      return {
        winId: randomUUID(),
        puzzleId: `L${this.level}`,
        source: 'pack',
        contentVersion: CONTENT,
        cats: levelBoard(this.level),
        fish: 3,
        mistakes: 0,
        revives: 0,
        hints: 0,
        kitties: 0,
        mice: 0,
        solveMs: 45_000 + Math.floor(Math.random() * 60_000),
        playedAt: Date.now(),
        clientVersion: '0.0.0-load',
      };
    });
    const r = await this.call('wins', '/v1/wins', { method: 'POST', body: JSON.stringify({ wins }) });
    const b = r.body?.bracket as { bracketId?: string; rows?: { slot: number }[] } | null | undefined;
    if (b?.bracketId) {
      this.bracketId = b.bracketId;
      this.slots = (b.rows ?? []).map((x) => x.slot);
    }
    return r.status;
  }

  async bracket(): Promise<number> {
    return (await this.call('bracket', '/v1/bracket')).status;
  }

  async heart(): Promise<number> {
    if (!this.bracketId || this.slots.length === 0) return 0;
    const slot = this.slots[Math.floor(Math.random() * this.slots.length)] as number;
    return (await this.call('hearts', '/v1/hearts', { method: 'POST', body: JSON.stringify({ bracketId: this.bracketId, slot }) })).status;
  }

  async claim(): Promise<number> {
    const id = this.rewards.shift();
    if (!id) return 0;
    return (await this.call('claim', '/v1/rewards/claim', { method: 'POST', body: JSON.stringify({ rewardId: id, double: Math.random() < 0.5 }) })).status;
  }

  async health(): Promise<number> {
    return (await this.call('health', '/v1/health')).status;
  }

  async config(): Promise<number> {
    return (await this.call('config', '/v1/config')).status;
  }
}

export function argOf(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
