// Owner: G1 (Phase 2e)
// Whether this build and platform use the ranking server at all (docs/phase2e/spec.md §2.2, §2.11, §7.3,
// D-2e-5, D-2e-20), the win id, and the queueing of a won board at t = 0 of WON (§2.3). Main bundle
// (small): the session queues a win in the SAME critical save as the win even before the lazily loaded
// ladder flow is there, so a crash after WON loses nothing (critic C-25).
// The ranking origin is in use only when VITE_LADDER_URL is set AND (the FB build has an identity provider,
// or the web build runs ladder.web === 'anon' — VITE_LADDER_WEB in dev / e2e builds). Web-prod therefore
// never sends a request to it (§2.11, §10.5 #12), the remote switches included (§7.4).
import { encodeSolution, enqueueWin, toWinSubmission } from '../game/ladder';
import type { PuzzleSource } from '../game/levels-repo';
import type { LadderPendingWin, PuzzleId, SaveData } from '../game/types';
import type { PlatformAdapter } from '../platform/types';
import { cfg, type GameConfig, type LadderWebMode } from './config';
import { isFlagOn } from './flags';

export { encodeSolution };

/** The build's ranking values (vite.config.ts passes them through scripts/ladder-env.ts). */
export interface LadderEnv {
  /** The API base without a trailing slash, or undefined (no ladder). */
  readonly url: string | undefined;
  /** VITE_LADDER_WEB (dev / e2e / staging), or undefined (cfg.ladder.web decides). */
  readonly web: LadderWebMode | undefined;
}

/** The build's ranking values from import.meta.env (absent in unit tests unless stubbed). */
export function ladderEnv(): LadderEnv {
  let url: string | undefined;
  let web: LadderWebMode | undefined;
  try {
    const env = import.meta.env;
    const u = env.VITE_LADDER_URL;
    url = typeof u === 'string' && /^https?:\/\/\S+$/.test(u.trim()) ? u.trim().replace(/\/+$/, '') : undefined;
    const w = env.VITE_LADDER_WEB;
    web = w === 'off' || w === 'anon' ? w : undefined;
  } catch {
    url = undefined;
    web = undefined;
  }
  return { url, web };
}

/** The web build's mode: VITE_LADDER_WEB when given, else cfg.ladder.web. */
export function webMode(env: LadderEnv, c: GameConfig = cfg): LadderWebMode {
  return env.web ?? c.ladder.web;
}

/**
 * The ranking origin is in use (spec §2.2): a URL, the flags `rankings` and `ladder`, and a way to say who
 * the player is — FB: the identity provider; the web: ladder.web 'anon'. False on web-prod (no request at all).
 */
export function ladderOriginInUse(env: LadderEnv, platform: Pick<PlatformAdapter, 'id' | 'identity'>, c: GameConfig = cfg): boolean {
  if (!env.url || !isFlagOn('rankings') || !isFlagOn('ladder')) return false;
  if (platform.id === 'fbig') return !!platform.identity;
  return webMode(env, c) === 'anon';
}

/** 32 lowercase hex digits from crypto.getRandomValues (or Math.random as a last resort, never in a real browser). */
function randomHex(bytes: number, cryptoImpl?: Pick<Crypto, 'getRandomValues'> | null): string {
  const buf = new Uint8Array(bytes);
  const c = cryptoImpl ?? (typeof crypto !== 'undefined' ? crypto : null);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of buf) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * A UUID v4 for WinSubmission.winId (spec §2.3, critic C-25): crypto.randomUUID, or one built from
 * crypto.getRandomValues where randomUUID is missing (iOS Safari before 15.4). Made in app/ (game/ has no
 * randomness).
 */
export function newWinId(cryptoImpl?: Partial<Pick<Crypto, 'getRandomValues' | 'randomUUID'>> | null): string {
  const c = cryptoImpl === undefined ? (typeof crypto !== 'undefined' ? crypto : null) : cryptoImpl;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const h = randomHex(16, c && typeof c.getRandomValues === 'function' ? (c as Pick<Crypto, 'getRandomValues'>) : null);
  const variant = ((parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** What the session knows about a won board at WON. */
export interface QueueInput {
  readonly puzzleId: PuzzleId;
  readonly source: PuzzleSource;
  readonly contentVersion: string;
  readonly solution: ArrayLike<number>;
  readonly kept: number;
  readonly mistakes: number;
  readonly revives: number;
  readonly hints: number;
  readonly kitties: number;
  readonly mice: number;
  readonly solveMs: number;
  readonly deviceNow: number;
  readonly clientVersion: string;
}

/**
 * t = 0 of WON (spec §2.3): the win queued in save.ladder.pending when it will ever be sent — a counted,
 * scored win of a mode the server counts (rules.scoringModes mirror period.modes), the player listed and
 * the ranking origin in use. Returns the save unchanged (and null) otherwise.
 */
export function queueWin(save: SaveData, i: QueueInput, winId: string, c: GameConfig = cfg): { save: SaveData; win: LadderPendingWin | null; dropped: number } {
  if (!save.ladder.listed) return { save, win: null, dropped: 0 };
  const sub = toWinSubmission({
    winId,
    puzzleId: i.puzzleId,
    source: i.source,
    contentVersion: i.contentVersion,
    solution: i.solution,
    kept: i.kept,
    mistakes: i.mistakes,
    revives: i.revives,
    hints: i.hints,
    kitties: i.kitties,
    mice: i.mice,
    solveMs: i.solveMs,
    playedAt: i.deviceNow,
    clientVersion: i.clientVersion,
  });
  if (!sub) return { save, win: null, dropped: 0 };
  const win: LadderPendingWin = { ...sub, queuedAt: i.deviceNow };
  const before = save.ladder.pending.length;
  const ladder = enqueueWin(save.ladder, win, c);
  if (ladder === save.ladder) return { save, win: null, dropped: 0 };
  const dropped = Math.max(0, before + 1 - ladder.pending.length);
  return { save: { ...save, ladder }, win, dropped };
}
