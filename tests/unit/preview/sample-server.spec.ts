// Owner: lead (preview link, 2026-10-11). preview/sample-server.ts: the in-page ranking server of the preview build
// answers the real /v1 contract (the client's own parsers accept every answer), and G4's server code decides what it
// can: only the player's real wins and kept fish count (the win pipeline over the solution table), rows sorted by the
// server's one ordering, hearts once per row and capped, the paid places at finalisation, Collect ×2 once, names from
// our word lists with the cooldown. The returning player's seed and "end the day" (2nd place, a paid reward).
import { describe, expect, it } from 'vitest';
import { SOLUTIONS } from '../../../server/src/content/generated/solutions';
import { DEFAULT_CONFIG } from '../../../server/src/core/config';
import { rulesView } from '../../../server/src/handlers/views';
import {
  parseBracketView,
  parseClaimResponse,
  parseConfigResponse,
  parseHeartResponse,
  parseMeResponse,
  parseProfileResponse,
  parseSessionResponse,
  parseWinsResponse,
} from '../../../src/shared/rank-api-parse';
import type { BracketView, SessionResponse, WinSubmission } from '../../../src/shared/rank-api';
import { NICK_WORDS_V1 } from '../../../src/shared/nick-words';
import { createSampleServer, RETURNING_DAY, SAMPLE_KEY_PREFIX, type SampleServer } from '../../../preview/sample-server';
import { loadState, queueOperation, SAMPLE_STATE_KEY } from '../../../preview/sample-state';
import { MemoryStorage } from '../platform/helpers';

const T0 = Date.UTC(2026, 9, 11, 12, 0, 0);
const MIN = 60_000;
const HOUR = 3_600_000;
const DEVICE = { id: 'AbCdEfGhIjKlMnOpQrStUv', secret: 'A'.repeat(43) };
const CONTENT = SOLUTIONS.contentVersions[0] as string;

/** The first board the solution table holds for a level (what the client's pack shows). */
function boardOf(level: number): string {
  return (SOLUTIONS.levels.boards.split(',')[level - SOLUTIONS.levels.first] ?? '').split('|')[0] as string;
}

let n = 0;
function win(level: number, over: Partial<WinSubmission> = {}): WinSubmission {
  n += 1;
  return {
    winId: `0000000${n % 10}-0000-4000-8000-${String(n).padStart(12, '0')}`,
    puzzleId: `L${level}`,
    source: 'pack',
    contentVersion: CONTENT,
    cats: boardOf(level),
    fish: 3,
    mistakes: 0,
    revives: 0,
    hints: 0,
    kitties: 0,
    mice: 0,
    solveMs: 90_000,
    playedAt: T0,
    clientVersion: '0.1.0',
    ...over,
  };
}

function setup(opts: { returning?: boolean; endDay?: boolean; storage?: MemoryStorage } = {}) {
  let now = T0;
  const storage = opts.storage ?? new MemoryStorage();
  if (opts.returning) queueOperation(storage, 'returning');
  if (opts.endDay) queueOperation(storage, 'endDay');
  const server: SampleServer = createSampleServer({ now: () => now, storage });
  let token = '';
  const call = async (method: string, path: string, body?: unknown) => server.handle(method, path, body, token ? `Bearer ${token}` : null);
  const signIn = async (): Promise<SessionResponse> => {
    const a = await call('POST', '/v1/session', { platform: 'web', device: DEVICE, clientVersion: '0.1.0', contentVersion: CONTENT });
    expect(a.status).toBe(200);
    const s = parseSessionResponse(a.body);
    expect(s).not.toBeNull();
    token = (s as SessionResponse).token;
    return s as SessionResponse;
  };
  const bracket = async (): Promise<BracketView> => {
    const a = await call('GET', '/v1/bracket');
    expect(a.status).toBe(200);
    const v = parseBracketView(a.body);
    expect(v).not.toBeNull();
    return v as BracketView;
  };
  return { server, storage, call, signIn, bracket, advance: (ms: number) => void (now += ms), now: () => now };
}

const sorted = (v: BracketView): boolean =>
  v.rows.every((r, i) => r.rank === i + 1 && (i === 0 || (v.rows[i - 1] as { points: number }).points >= r.points));

describe('the sample server answers the real contract', () => {
  it('config, session (the deployed rules), me: every answer passes the client parsers', async () => {
    const s = setup();
    const cfgA = await s.call('GET', '/v1/config');
    expect(parseConfigResponse(cfgA.body)).not.toBeNull();
    const session = await s.signIn();
    expect(session.rules).toEqual(rulesView(DEFAULT_CONFIG));
    expect(session.player.pool).toBe('web');
    expect(session.player.nickname).toMatch(/^\S+ \S+ \d{1,2}$/);
    expect(session.bracket).toBeNull(); // no win yet: no bracket
    expect(parseMeResponse((await s.call('GET', '/v1/me')).body)).not.toBeNull();
  });

  it('errors carry the contract status and shape: no token, a bad body, an unknown route', async () => {
    const s = setup();
    const noToken = await s.call('GET', '/v1/bracket');
    expect(noToken.status).toBe(401);
    expect(noToken.body).toMatchObject({ error: { code: 'token_invalid' } });
    const bad = await s.call('POST', '/v1/session', { platform: 'web' });
    expect(bad).toMatchObject({ status: 400, body: { error: { code: 'bad_request' } } });
    await s.signIn();
    expect((await s.call('GET', '/v1/nope')).status).toBe(404);
    const other = await s.server.handle('POST', '/v1/session', { platform: 'web', device: { ...DEVICE, secret: 'B'.repeat(43) }, clientVersion: '0.1.0', contentVersion: CONTENT }, null);
    expect(other).toMatchObject({ status: 401, body: { error: { code: 'bad_signature' } } });
  });

  it('fetch(): a Response like the network would give (status, JSON, 204 without a body)', async () => {
    const s = setup();
    const res = await s.server.fetch('https://sample-ranking.preview.invalid/v1/config', { method: 'GET', headers: {} });
    expect(res.status).toBe(200);
    expect(parseConfigResponse(await res.json())).not.toBeNull();
    const session = await s.server.fetch('https://sample-ranking.preview.invalid/v1/session', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ platform: 'web', device: DEVICE, clientVersion: '0.1.0', contentVersion: CONTENT }),
    });
    const token = (parseSessionResponse(await session.json()) as SessionResponse).token;
    const del = await s.server.fetch('https://sample-ranking.preview.invalid/v1/me', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe('');
  });
});

describe('wins: only the player’s own real wins and kept fish count (G4’s pipeline)', () => {
  it('a new player’s first win opens a bracket with sample players; the kept fish are the points; rows in the server’s order', async () => {
    const s = setup();
    await s.signIn();
    const a = await s.call('POST', '/v1/wins', { wins: [win(2, { fish: 2, mistakes: 1 })] });
    const r = parseWinsResponse(a.body);
    expect(r?.results).toEqual([expect.objectContaining({ verdict: 'accepted', points: 2 })]);
    expect(r?.windowPoints).toBe(2);
    const v = await s.bracket();
    expect(v.state).toBe('open');
    expect(v.members).toBe(v.rows.length);
    expect(v.rows.length).toBe(12); // 11 sample players + me
    expect(v.me?.points).toBe(2);
    expect(sorted(v)).toBe(true);
  });

  it('a wrong board, a replayed id and a level already counted add nothing; the same winId answers duplicate', async () => {
    const s = setup();
    await s.signIn();
    const first = win(2);
    await s.call('POST', '/v1/wins', { wins: [first] });
    const wrong = win(3, { cats: boardOf(3).split('').reverse().join('') });
    const r = parseWinsResponse((await s.call('POST', '/v1/wins', { wins: [first, wrong, win(2)] })).body);
    expect(r?.results.map((x) => x.verdict)).toEqual(['duplicate', 'rejected', 'already_counted']);
    expect(r?.results[1]?.reason).toBe('bad_solution');
    expect((await s.bracket()).me?.points).toBe(3);
  });

  it('a win faster than the size’s floor is rejected (too_fast)', async () => {
    const s = setup();
    await s.signIn();
    const r = parseWinsResponse((await s.call('POST', '/v1/wins', { wins: [win(2, { solveMs: 200 })] })).body);
    expect(r?.results[0]).toMatchObject({ verdict: 'rejected', reason: 'too_fast', points: 0 });
  });
});

describe('the returning player (the preview’s first visit)', () => {
  it('22 fish in a bracket opened 5 h ago with 23 sample players: 5th of 24, rows sorted, sample names from our word lists', async () => {
    const s = setup({ returning: true });
    const session = await s.signIn();
    expect(session.bracket).toMatchObject({ state: 'open', rank: 5, members: 24, points: RETURNING_DAY.fish });
    const v = await s.bracket();
    expect(v.rows).toHaveLength(24);
    expect(sorted(v)).toBe(true);
    expect(v.me).toMatchObject({ rank: 5, points: 22, hearts: 2 });
    for (const r of v.rows) {
      const [adj, noun, num] = r.nickname.split(' ');
      expect(NICK_WORDS_V1.adj).toContain(adj);
      expect(NICK_WORDS_V1.noun).toContain(noun);
      expect(Number(num)).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(v.rows.map((r) => r.nickname)).size).toBe(24);
    expect((v.endsAt ?? 0) - s.now()).toBe(24 * HOUR - RETURNING_DAY.openedAgoMs);
    // Level 37 counts (36 done), so the next win adds its fish to my row.
    const r = parseWinsResponse((await s.call('POST', '/v1/wins', { wins: [win(37)] })).body);
    expect(r?.results[0]?.verdict).toBe('accepted');
    expect(r?.bracket?.me?.points).toBe(25);
  });

  it('the seed applies to the next new player only once (a reload signs the same device in again)', async () => {
    const storage = new MemoryStorage();
    const s = setup({ returning: true, storage });
    await s.signIn();
    expect(loadState(storage).pending.returning).toBe(false);
    const again = createSampleServer({ now: () => T0 + MIN, storage });
    const a = await again.handle('POST', '/v1/session', { platform: 'web', device: DEVICE, clientVersion: '0.1.0', contentVersion: CONTENT }, null);
    expect(parseSessionResponse(a.body)?.bracket?.points).toBe(22);
    expect(Object.keys(loadState(storage).players)).toHaveLength(1);
  });
});

describe('without storage (a blocked localStorage)', () => {
  it('the page hands the server its queued state: the returning seed, then the end of the day, in memory', async () => {
    const server = createSampleServer({ now: () => T0, storage: null, initial: { ...queueOperation(null, 'returning'), pending: { returning: true, endDay: true } } });
    const a = await server.handle('POST', '/v1/session', { platform: 'web', device: DEVICE, clientVersion: '0.1.0', contentVersion: CONTENT }, null);
    const session = parseSessionResponse(a.body) as SessionResponse;
    expect(session.results[0]).toMatchObject({ place: 2, members: 24, points: 22 });
    expect(server.state().pending).toEqual({ returning: false, endDay: false });
  });
});

describe('hearts (spec §1.7): one per row, my own once, at most 20 given', () => {
  it('+1 and likedByMe; a second heart on the row is heart_exists; the 21st is heart_limit', async () => {
    const s = setup({ returning: true });
    await s.signIn();
    const v = await s.bracket();
    const other = v.rows.find((r) => !r.me) as { slot: number; hearts: number };
    const h = parseHeartResponse((await s.call('POST', '/v1/hearts', { bracketId: v.bracketId, slot: other.slot })).body);
    expect(h).toMatchObject({ hearts: other.hearts + 1, likedByMe: true, givenInBracket: 1 });
    expect((await s.call('POST', '/v1/hearts', { bracketId: v.bracketId, slot: other.slot })).body).toMatchObject({ error: { code: 'heart_exists' } });
    expect((await s.bracket()).rows.find((r) => r.slot === other.slot)?.likedByMe).toBe(true);
    const rest = v.rows.filter((r) => r.slot !== other.slot);
    for (const r of rest.slice(0, 19)) expect((await s.call('POST', '/v1/hearts', { bracketId: v.bracketId, slot: r.slot })).status).toBe(200);
    const last = rest[19] as { slot: number };
    expect((await s.call('POST', '/v1/hearts', { bracketId: v.bracketId, slot: last.slot })).body).toMatchObject({ error: { code: 'heart_limit' } });
  });
});

describe('end of the ranking day: the real finalisation and rewards', () => {
  it('the next session ends the day with me 2nd of 24: a paid result (1 hint + 1 kitty), Collect ×2 once', async () => {
    const storage = new MemoryStorage();
    const s = setup({ returning: true, storage });
    await s.signIn();
    queueOperation(storage, 'endDay');
    s.advance(MIN);
    const again = createSampleServer({ now: () => T0 + MIN, storage });
    const a = await again.handle('POST', '/v1/session', { platform: 'web', device: DEVICE, clientVersion: '0.1.0', contentVersion: CONTENT }, null);
    const session = parseSessionResponse(a.body) as SessionResponse;
    expect(session.results).toHaveLength(1);
    const result = session.results[0];
    expect(result).toMatchObject({ place: 2, members: 24, points: 22 });
    expect(result?.reward).toMatchObject({ place: 2, grant: { hints: 1, kitties: 1 }, canDouble: true, claim: null });
    // The ended bracket: final ranks, me 2nd, exactly one sample player ahead.
    const auth = `Bearer ${session.token}`;
    const v = parseBracketView((await again.handle('GET', '/v1/bracket', undefined, auth)).body) as BracketView;
    expect(v).toMatchObject({ state: 'ended', final: true });
    expect(v.me?.rank).toBe(2);
    expect(sorted(v)).toBe(true);
    // Collect ×2: doubled once; a retry answers alreadyClaimed with the stored doubling.
    const rewardId = result?.reward?.rewardId as string;
    const c1 = parseClaimResponse((await again.handle('POST', '/v1/rewards/claim', { rewardId, double: true }, auth)).body);
    expect(c1).toMatchObject({ grant: { hints: 2, kitties: 2 }, doubled: true, alreadyClaimed: false, place: 2 });
    const c2 = parseClaimResponse((await again.handle('POST', '/v1/rewards/claim', { rewardId, double: false }, auth)).body);
    expect(c2).toMatchObject({ grant: { hints: 2, kitties: 2 }, doubled: true, alreadyClaimed: true });
    // Sample members are never real players (their rewards are never shown to anyone).
    expect(Object.values(loadState(storage).players).every((p) => !p.key.startsWith(SAMPLE_KEY_PREFIX))).toBe(true);
    // The next win opens a new bracket.
    const w = parseWinsResponse((await again.handle('POST', '/v1/wins', { wins: [win(37)] }, auth)).body);
    expect(w?.bracket?.bracketId).not.toBe(v.bracketId);
    expect(w?.bracket?.state).toBe('open');
  });

  it('a player with no fish today is entered with 12 fish first, then finishes 2nd', async () => {
    const s = setup({ endDay: true });
    const session = await s.signIn();
    expect(session.results[0]).toMatchObject({ place: 2, points: 12, reward: { grant: { hints: 1, kitties: 1 } } });
  });
});

describe('the name sheet and Settings (spec §1.8, §2.7)', () => {
  it('a word pick is saved and copied to my open row; a second change inside 24 h is nickname_cooldown; the avatar any time', async () => {
    const s = setup({ returning: true });
    await s.signIn();
    const p = parseProfileResponse((await s.call('PUT', '/v1/me/profile', { nickname: { adj: 3, noun: 5, num: 42 } })).body);
    const name = `${NICK_WORDS_V1.adj[3]} ${NICK_WORDS_V1.noun[5]} 42`;
    expect(p?.player.nickname).toBe(name);
    expect(p?.player.nicknameChangeAt).toBe(T0 + DEFAULT_CONFIG.nickname.changeCooldownMs);
    expect((await s.bracket()).me?.nickname).toBe(name);
    const again = await s.call('PUT', '/v1/me/profile', { nickname: { adj: 4, noun: 5, num: 42 } });
    expect(again.body).toMatchObject({ error: { code: 'nickname_cooldown' } });
    const pic = parseProfileResponse((await s.call('PUT', '/v1/me/profile', { avatarId: 7 })).body);
    expect(pic?.player.avatarId).toBe(7);
    expect((await s.call('PUT', '/v1/me/profile', { avatarId: 12 })).body).toMatchObject({ error: { code: 'avatar_invalid' } });
  });

  it('"Show me in rankings" off hides my row in the open bracket; Delete removes my data (204) and the token', async () => {
    const s = setup({ returning: true });
    await s.signIn();
    await s.call('PUT', '/v1/me/profile', { listed: false });
    const v = await s.bracket();
    expect(v.rows.some((r) => r.me)).toBe(false);
    expect(v.members).toBe(23);
    expect((await s.call('DELETE', '/v1/me')).status).toBe(204);
    expect((await s.call('GET', '/v1/me')).body).toMatchObject({ error: { code: 'token_invalid' } });
  });
});

describe('the stored state', () => {
  it('lives under mewdoku.preview.rank.v1; reset empties it; a broken copy starts afresh', () => {
    const storage = new MemoryStorage();
    queueOperation(storage, 'returning');
    expect(JSON.parse(storage.getItem(SAMPLE_STATE_KEY) as string)).toMatchObject({ v: 1, pending: { returning: true, endDay: false } });
    queueOperation(storage, 'reset');
    expect(loadState(storage).pending).toEqual({ returning: false, endDay: false });
    storage.setItem(SAMPLE_STATE_KEY, '{nope');
    expect(loadState(storage).players).toEqual({});
  });
});
