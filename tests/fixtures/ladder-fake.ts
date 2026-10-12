// Owner: G1 (Phase 2e)
// An in-memory ranking server for client unit tests (docs/phase2e/spec.md §1.4, §10.1; CONTRACTS §2): a
// `fetch` that answers the /v1 API in the shapes of G4's contract fixtures (server/test/contract/fixtures,
// the player and the rules are read from session.fb.json), so the client's shared validators see what a
// real server sends. One bracket of real rows (the players a test adds, plus me), wins scored as the fish
// kept (verdict overrides per winId), finished brackets as results with rewards, claims, hearts, the
// profile, /me, DELETE /me and the remote switches. Failure injection: `failNext(path, code)` (an API error
// with its status), `offline` (fetch rejects like a dropped network), `hold` (answers wait for
// `release()`), `expireTokens()` (the next authed call answers 401 token_expired). Every call is recorded.
// No timers: answers resolve on the next microtask, so a FakeClock drives everything else.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ERROR_STATUS,
  type BracketRow,
  type BracketView,
  type ClaimView,
  type ErrorCode,
  type PlayerView,
  type RemoteSwitch,
  type ResultView,
  type RulesView,
  type WinResult,
  type WinVerdict,
} from '../../src/shared/rank-api';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../server/test/contract/fixtures');

/** A contract fixture's response body (G4's files; read once). */
export function fixtureBody<T = Record<string, unknown>>(name: string): T {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as { response: { body: T } };
  return raw.response.body;
}

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly auth: string | null;
  readonly contentType: string | null;
}

export interface FakeOther {
  readonly nickname: string;
  readonly avatarId: number;
  points: number;
  hearts: number;
  /** Leaderboard update: the row's last activity (server clock; default: the fake's start) and "in a puzzle". */
  seenAt?: number;
  playing?: boolean;
}

export interface LadderFakeOptions {
  /** The server clock (ms); defaults to Date.now. */
  now?(): number;
  /** Server clock − the test clock (a device clock that is off). */
  readonly skewMs?: number;
  readonly rules?: Partial<RulesView>;
  readonly player?: Partial<PlayerView>;
  /** Leaderboard update: a session with `join: true` makes me a member with 0 fish (the real server's default). Off by default (an older server). */
  readonly joinOnSession?: boolean;
}

export interface LadderFake {
  readonly fetch: typeof fetch;
  readonly calls: FakeCall[];
  /** Paths called, in order ("POST /v1/wins"). */
  paths(): string[];
  /** The next call to `path` (e.g. '/v1/wins') answers this error (status from ERROR_STATUS), once per call. */
  failNext(path: string, code: ErrorCode, retryAfterMs?: number): void;
  /** fetch rejects (TypeError: Failed to fetch). */
  offline: boolean;
  /** Answers wait until release(). */
  hold: boolean;
  release(): void;
  /** Every token turns invalid: the next authed call answers 401 token_expired. */
  expireTokens(): void;
  /** A verdict for a winId (default: accepted, points = fish). */
  verdict(winId: string, verdict: WinVerdict, reason?: WinResult['reason']): void;
  /** Another real player in my bracket. */
  addOther(o: Omit<FakeOther, 'hearts'> & { hearts?: number }): void;
  /** Ends my bracket: a result (with a reward for a paid place when enough members) and a fresh period. */
  endBracket(): ResultView;
  readonly state: {
    player: PlayerView;
    rules: RulesView;
    switches: Partial<Record<RemoteSwitch, boolean>>;
    ttlSec: number;
    bracketId: string;
    openedAt: number;
    endsAt: number;
    /** My points in the open bracket; null = not a member yet (no win this period). */
    points: number | null;
    myHearts: number;
    others: FakeOther[];
    liked: Set<number>;
    givenInBracket: number;
    heartsNew: number;
    results: ResultView[];
    claims: Map<string, ClaimView>;
    seenWins: Set<string>;
    sessions: number;
    /** Leaderboard update: my row's activity (presence pings, sign-ins, wins). */
    mySeenAt: number;
    myPlaying: boolean;
  };
}

const NICK_ADJ = ['Velvet', 'Misty', 'Sleepy', 'Cozy', 'Brave', 'Golden', 'Snowy', 'Quiet'];
const NICK_NOUN = ['Pounce', 'Pebble', 'Whisker', 'Biscuit', 'Noodle', 'Comet', 'Clover', 'Ginger'];

export function createLadderFake(opts: LadderFakeOptions = {}): LadderFake {
  const base = fixtureBody<{ player: PlayerView; rules: RulesView }>('session.fb');
  const now = (): number => (opts.now ? opts.now() : Date.now()) + (opts.skewMs ?? 0);
  const rules: RulesView = { ...base.rules, ...opts.rules };
  const calls: FakeCall[] = [];
  const failures = new Map<string, { code: ErrorCode; retryAfterMs?: number }[]>();
  const verdicts = new Map<string, { verdict: WinVerdict; reason?: WinResult['reason'] }>();
  const tokens = new Set<string>();
  let held: (() => void)[] = [];
  let tokenN = 0;
  let nonceN = 0;
  let bracketN = 1;
  const newBracketId = (): string => `fakebracket${(bracketN++).toString(36).padStart(4, '0')}`;
  const start = now();
  const state: LadderFake['state'] = {
    player: { ...base.player, ...opts.player },
    rules,
    switches: {},
    ttlSec: 3600,
    bracketId: newBracketId(),
    openedAt: start,
    endsAt: start + rules.durationMs,
    points: null,
    myHearts: 0,
    others: [],
    liked: new Set(),
    givenInBracket: 0,
    heartsNew: 0,
    results: [],
    claims: new Map(),
    seenWins: new Set(),
    sessions: 0,
    mySeenAt: start,
    myPlaying: false,
  };

  function rows(): BracketRow[] {
    const all: { row: Omit<BracketRow, 'rank'>; tie: number }[] = state.others.map((o, slot) => ({
      row: { slot, nickname: o.nickname, avatarId: o.avatarId, points: o.points, hearts: o.hearts, me: false, likedByMe: state.liked.has(slot), seenAt: o.seenAt ?? start, playing: o.playing === true },
      tie: slot,
    }));
    if (state.points !== null) {
      const slot = state.others.length;
      all.push({
        row: { slot, nickname: state.player.nickname, avatarId: state.player.avatarId, points: state.points, hearts: state.myHearts, me: true, likedByMe: state.liked.has(slot), seenAt: state.mySeenAt, playing: state.myPlaying },
        tie: -1,
      });
    }
    all.sort((a, b) => b.row.points - a.row.points || a.tie - b.tie);
    return all.map((x, i) => ({ ...x.row, rank: i + 1 }));
  }

  function view(): BracketView {
    if (state.points === null) {
      return { state: 'none', bracketId: null, pool: state.player.pool, mode: rules.periodMode, openedAt: null, endsAt: null, members: 0, maxMembers: rules.maxMembers, rows: [], me: null, final: false, heartsNew: 0, result: null, serverTime: now() };
    }
    const r = rows();
    const v: BracketView = {
      state: 'open',
      bracketId: state.bracketId,
      pool: state.player.pool,
      mode: rules.periodMode,
      openedAt: state.openedAt,
      endsAt: state.endsAt,
      members: r.length,
      maxMembers: rules.maxMembers,
      rows: r,
      me: r.find((x) => x.me) ?? null,
      final: false,
      heartsNew: state.heartsNew,
      result: null,
      serverTime: now(),
    };
    state.heartsNew = 0;
    return v;
  }

  function summary() {
    if (state.points === null) return { state: 'none' as const, bracketId: null, rank: null, members: 0, points: 0, endsAt: null };
    const r = rows();
    return { state: 'open' as const, bracketId: state.bracketId, rank: r.find((x) => x.me)?.rank ?? null, members: r.length, points: state.points, endsAt: state.endsAt };
  }

  function resultsWithClaims(): ResultView[] {
    return state.results.map((r) => (r.reward ? { ...r, reward: { ...r.reward, claim: state.claims.get(r.reward.rewardId) ?? null } } : r));
  }

  const json = (status: number, body: unknown): Response =>
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const error = (code: ErrorCode, retryAfterMs?: number): Response =>
    json(ERROR_STATUS[code], { error: { code, message: code, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }, serverTime: now() });

  function handle(method: string, path: string, body: Record<string, unknown> | null, auth: string | null): Response {
    const bare = path.split('?')[0] as string;
    const injected = failures.get(bare)?.shift();
    if (injected) return error(injected.code, injected.retryAfterMs);
    const authed = (): boolean => auth !== null && tokens.has(auth.replace(/^Bearer /, ''));
    if (bare === '/v1/config' && method === 'GET') return json(200, { switches: state.switches, ttlSec: state.ttlSec, serverTime: now() });
    if (bare === '/v1/session/nonce' && method === 'POST') {
      nonceN++;
      return json(200, { nonce: `n1.${nonceN.toString(36)}.fakenonce${nonceN}xx.fakemac${nonceN}xxxx`, expiresAt: now() + 300_000, serverTime: now() });
    }
    if (bare === '/v1/session' && method === 'POST') {
      if (!body) return error('bad_request');
      if (body.platform === 'fb' && (typeof body.signature !== 'string' || typeof body.nonce !== 'string' || typeof body.playerId !== 'string')) return error('bad_request');
      if (body.platform === 'web' && (!body.device || typeof body.device !== 'object')) return error('bad_request');
      state.sessions++;
      if (opts.joinOnSession && body.join === true && state.player.listed && state.points === null) state.points = 0;
      state.mySeenAt = now();
      state.myPlaying = false;
      const token = `v1.faketoken${++tokenN}`;
      tokens.add(token);
      return json(200, {
        token,
        expiresAt: now() + 86_400_000,
        player: state.player,
        rules,
        results: resultsWithClaims(),
        bracket: summary(),
        limits: { maxWinsPerRequest: 10, queueMax: 20 },
        serverTime: now(),
      });
    }
    if (!authed()) return error('token_expired');
    if (bare === '/v1/wins' && method === 'POST') {
      const wins = (body?.wins ?? []) as { winId: string; fish: number }[];
      if (!Array.isArray(wins) || wins.length === 0 || wins.length > 10) return error('bad_request');
      const results: WinResult[] = [];
      for (const w of wins) {
        const forced = verdicts.get(w.winId);
        if (state.seenWins.has(w.winId)) {
          results.push({ winId: w.winId, verdict: 'duplicate', points: 0 });
          continue;
        }
        state.seenWins.add(w.winId);
        const verdict = forced?.verdict ?? 'accepted';
        const points = verdict === 'accepted' || verdict === 'accepted_flagged' ? w.fish : 0;
        if (points > 0 || verdict === 'accepted' || verdict === 'accepted_flagged') {
          state.points = (state.points ?? 0) + points;
          state.mySeenAt = now();
          state.myPlaying = false;
        }
        results.push({ winId: w.winId, verdict, points, ...(forced?.reason ? { reason: forced.reason } : {}) });
      }
      return json(200, { results, windowPoints: state.points ?? 0, bracket: state.points === null ? null : view(), serverTime: now() });
    }
    if (bare === '/v1/bracket' && method === 'GET') return json(200, view());
    if (bare === '/v1/presence' && method === 'POST') {
      if (body?.state !== 'online' && body?.state !== 'playing') return error('bad_request');
      const updated = state.points !== null && state.player.listed;
      if (updated) {
        state.mySeenAt = now();
        state.myPlaying = body.state === 'playing';
      }
      return json(200, { updated, serverTime: now() });
    }
    if (bare === '/v1/rewards/claim' && method === 'POST') {
      const rewardId = String(body?.rewardId ?? '');
      const res = state.results.find((r) => r.reward?.rewardId === rewardId);
      if (!res || !res.reward) return error('not_found');
      const had = state.claims.get(rewardId);
      if (had) return json(200, { ...had, place: res.reward.place, alreadyClaimed: true, serverTime: now() });
      const doubled = body?.double === true && res.reward.canDouble && rules.doubleByVideo;
      const k = doubled ? 2 : 1;
      const claim: ClaimView = { rewardId, grant: { hints: res.reward.grant.hints * k, kitties: res.reward.grant.kitties * k }, doubled, claimedAt: now() };
      state.claims.set(rewardId, claim);
      return json(200, { ...claim, place: res.reward.place, alreadyClaimed: false, serverTime: now() });
    }
    if (bare === '/v1/hearts' && method === 'POST') {
      const slot = Number(body?.slot);
      if (body?.bracketId !== state.bracketId || state.points === null) return error('not_member');
      if (state.liked.has(slot)) return error('heart_exists');
      if (state.givenInBracket >= rules.hearts.maxGivenPerBracket) return error('heart_limit');
      const isMe = slot === state.others.length;
      const other = state.others[slot];
      if (!isMe && !other) return error('not_found');
      state.liked.add(slot);
      state.givenInBracket++;
      const hearts = isMe ? ++state.myHearts : ++(other as FakeOther).hearts;
      return json(200, { bracketId: state.bracketId, slot, hearts, likedByMe: true, givenInBracket: state.givenInBracket, serverTime: now() });
    }
    if (bare === '/v1/me/profile' && method === 'PUT') {
      const p = body ?? {};
      let player = state.player;
      if (typeof p.listed === 'boolean') player = { ...player, listed: p.listed };
      if (typeof p.avatarId === 'number') {
        if (!Number.isInteger(p.avatarId) || p.avatarId < 0 || p.avatarId >= 12) return error('avatar_invalid');
        player = { ...player, avatarId: p.avatarId };
      }
      const nick = p.nickname as { adj: number; noun: number; num?: number } | undefined;
      if (nick) {
        if (player.nicknameChangeAt !== null && player.nicknameChangeAt > now()) return error('nickname_cooldown');
        const num = nick.num ?? 1;
        player = {
          ...player,
          nick: { adj: nick.adj, noun: nick.noun, num },
          nickname: `${NICK_ADJ[nick.adj % NICK_ADJ.length]} ${NICK_NOUN[nick.noun % NICK_NOUN.length]} ${num}`,
          nicknameChangeAt: now() + rules.nickname.changeCooldownMs,
        };
      }
      state.player = player;
      return json(200, { player, serverTime: now() });
    }
    if (bare === '/v1/me' && method === 'GET') {
      return json(200, { player: state.player, data: { brackets: state.results.length, wins30d: state.seenWins.size, rewards: state.claims.size, createdAt: start }, serverTime: now() });
    }
    if (bare === '/v1/me' && method === 'DELETE') {
      tokens.clear();
      state.points = null;
      state.results = [];
      state.claims.clear();
      state.player = { ...state.player, code: 'Z9Z9Z9Z9', nicknameChangeAt: null };
      return json(204, null);
    }
    return error('not_found');
  }

  const fake: LadderFake = {
    calls,
    offline: false,
    hold: false,
    paths: () => calls.map((c) => `${c.method} ${c.path.split('?')[0]}`),
    failNext(path, code, retryAfterMs) {
      const list = failures.get(path) ?? [];
      list.push(retryAfterMs === undefined ? { code } : { code, retryAfterMs });
      failures.set(path, list);
    },
    release() {
      const h = held;
      held = [];
      for (const f of h) f();
    },
    expireTokens: () => tokens.clear(),
    verdict(winId, verdict, reason) {
      verdicts.set(winId, reason === undefined ? { verdict } : { verdict, reason });
    },
    addOther(o) {
      state.others.push({ nickname: o.nickname, avatarId: o.avatarId, points: o.points, hearts: o.hearts ?? 0 });
    },
    endBracket() {
      const r = rows();
      const me = r.find((x) => x.me);
      const endedAt = now();
      const place = me?.rank ?? 0;
      const paid = rules.places.find((p) => p.place === place);
      const result: ResultView = {
        bracketId: state.bracketId,
        endedAt,
        place,
        members: r.length,
        points: state.points ?? 0,
        reward:
          paid && r.length >= rules.minMembers && me
            ? { rewardId: `${state.bracketId}:${me.slot}`, place: paid.place, grant: { hints: paid.hints, kitties: paid.kitties }, canDouble: rules.doubleByVideo, expiresAt: endedAt + rules.claimTtlMs, claim: null }
            : null,
      };
      state.results = [result, ...state.results];
      state.bracketId = newBracketId();
      state.openedAt = endedAt;
      state.endsAt = endedAt + rules.durationMs;
      state.points = null;
      state.myHearts = 0;
      state.others = [];
      state.liked = new Set();
      state.givenInBracket = 0;
      return result;
    },
    state,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      let body: Record<string, unknown> | null = null;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
      calls.push({ method, path: url.pathname + url.search, body, auth: headers.Authorization ?? null, contentType: headers['Content-Type'] ?? null });
      if (fake.offline) throw new TypeError('Failed to fetch');
      if (fake.hold) await new Promise<void>((r) => held.push(r));
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return handle(method, url.pathname + url.search, body, headers.Authorization ?? null);
    }) as typeof fetch,
  };
  return fake;
}
