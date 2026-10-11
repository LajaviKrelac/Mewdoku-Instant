// Owner: G4 (Phase 2e). Identifiers (spec §1.3, §1.5, §1.10): the player key (an HMAC of the pool and the
// platform id under ID_PEPPER: the raw FB id is never stored), the player code, bracket, reward and flag
// ids, pools, and the daily salted IP hash of the anonymous web mode.
import type { Pool } from '../contract';
import { b64urlEncode, hmac, randomBase36, randomCrockford, type HmacKey, type Rng } from './crypto';

/**
 * `b64url(HMAC-SHA256(ID_PEPPER, "<pool>:<id>"))[0..22]` (132 bits). For the production pools this is the
 * spec's `"fb:" + player_id` / `"web:" + deviceId`; test pools (`fb:<devPool>`, `fb:synthetic`) get their own
 * keys, so one test id in two pools is two players and never touches the real pools.
 */
export async function playerKey(pepper: HmacKey, pool: string, id: string): Promise<string> {
  return b64urlEncode(await hmac(pepper, `${pool}:${id}`)).slice(0, 22);
}

/** 8 Crockford base-32 characters (PLAYER_CODE_RE); unique by the players.code index (retried on a clash). */
export function newPlayerCode(rng: Rng): string {
  return randomCrockford(rng, 8);
}

/** Time-sortable: `<ms base 36><8 random base 36>` (BRACKET_ID_RE). */
export function newBracketId(now: number, rng: Rng): string {
  return `${now.toString(36)}${randomBase36(rng, 8)}`;
}

/** Flags and admin log rows: `<ms base 36><6 random base 36>`. */
export function newRowId(now: number, rng: Rng): string {
  return `${now.toString(36)}${randomBase36(rng, 6)}`;
}

/** "<bracketId>:<slot>" (REWARD_ID_RE): deterministic, so finalisation creates it idempotently. */
export function rewardId(bracketId: string, slot: number): string {
  return `${bracketId}:${slot}`;
}

/** The stored pool of a new player. */
export function poolFor(platform: Pool, devPool: string | null, synthetic: boolean): string {
  if (devPool !== null) return `${platform}:${devPool}`;
  if (synthetic) return `${platform}:synthetic`;
  return platform;
}

/** The wire pool of a stored one. */
export function wirePool(pool: string): Pool {
  return pool === 'web' || pool.startsWith('web:') ? 'web' : 'fb';
}

/** The dev test pool name of a stored pool (`fb:e2e-7` → `e2e-7`), null for the real pools. */
export function devPoolOf(pool: string): string | null {
  const i = pool.indexOf(':');
  return i < 0 ? null : pool.slice(i + 1);
}

/** The anonymous mode's per-IP registration quota key: a daily salted hash (never the IP itself). */
export async function ipDayHash(pepper: HmacKey, day: string, ip: string): Promise<string> {
  return b64urlEncode(await hmac(pepper, `ip:${day}:${ip}`)).slice(0, 22);
}
