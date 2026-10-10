# Phase 2e contracts (cross-workstream interfaces)

Spec: [spec.md](spec.md) §9 (this file repeats it, copy-paste ready). Date 2026-10-11. Built on top of the 2d.1 build ([CONTRACTS-2d1](../phase2d/CONTRACTS-2d1.md) and [CONTRACTS-2d](../phase2d/CONTRACTS.md) stay in force; this file only adds or changes).

**Status: S0 contract, critic pass applied 2026-10-11** (§13 lists the critic's changes; to be marked final at I-5 with a §14 listing what changed at integration).
Owners: **G1** logic, app, platform client · **G2** art, board, tokens · **G3** HUD, screens, overlays, fx, i18n, the nickname words · **G4** server and the wire contract · **lead** config, env, layering, Playwright, size-check, the probe, docs.

Rules (as in 2b–2d.1): S0 lands every interface **additively**, in the order G4 → G2 → G3 → G1, each keeping `npx tsc --noEmit` and `npx vitest run` green; a member another workstream uses is never deleted before I-3; members marked *optional until I-3* become required there. `config.ts` is lead-only. `tsc` covers `dev/**`, so props the harnesses use only gain optional members until I-1 / I-3. Honesty (spec §0.4) is part of every contract: no interface below may carry an invented row, count or statistic. Clean room: no fixture, harness or capture uses the original's material.

---

## 1. Config (lead, L0 done; read-only for G1–G4)

```ts
// src/app/config.ts — Phase 2e additions (spec §7.2.1). Types:
export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done' | 'event_next' | 'fail_home';
export type RewardedPlacementId = 'hint' | 'kitty' | 'revive' | 'group_double' | 'mouse' | 'rank_double';
export type LadderWebMode = 'off' | 'anon';
export type LadderResultCardMode = 'always' | 'rewardOnly';

cfg.ads.interstitial.triggers          // + 'fail_home'
cfg.ads.interstitial.retryEveryN       // 2
cfg.ads.rewarded.placements            // + 'rank_double'
cfg.ads.rewarded.promptFirst           // true
cfg.ads.banner.reshowAfterAnyHide      // true
cfg.ads.banner.untilDate               // '2027-03-31' (local date; '' = none)
cfg.ads.banner.rateLimitedRetrySec     // 15
cfg.ads.minLoadGapMs                   // 30_000
cfg.ads.maxPreloadedRewarded           // 2
cfg.daily.keepEarlierUnlock            // true
cfg.daily.reward                       // { hints: 0, kitties: 0 }
cfg.daily.calendar                     // false
cfg.daily.dayStartHour                 // 0
cfg.rank.fbPeriodBoard                 // false
cfg.iap.iosEnabled                     // false
cfg.iap.inPlay                         // true
cfg.iap.o2Products                     // { hint: ['hints_15', 'remove_ads'], kitty: ['kitties_8', 'remove_ads'], mouse: [] } (critic pass, U-d)
cfg.iap.useOneAfterBuy                 // true
cfg.iap.pendingKept                    // 10
cfg.iap.prefetchCatalog                // true
cfg.ladder   // { enabled: true, web: 'off', timeoutMs: 4000, panelWaitMs: 8000, homeRefreshMs: 60_000,
             //   pendingMax: 20, pendingMaxAgeMs: 86_400_000, batchMax: 10, backoffMs: [5000, 30_000, 120_000],
             //   resultCard: 'always', maxResultCards: 3, resultsSeenKept: 10, claimedKept: 30, doubleWatchedKept: 5,
             //   optOutAllowed: true, defaultListed: true, noticeFirst: false, heartsNotify: true,
             //   countdownTickMs: 60_000, panelRows: 0 }
cfg.dayStreak // { enabled: true, modes: ['level','daily','event'], cycleDays: 7, reward: { hints: 2, kitties: 2 },
              //   dayRewards: [], doubleByVideo: false, missResets: true, repairByVideo: false, historyDays: 14,
              //   paidKept: 8, showOnHome: true, victoryRow: true, serverSkewCheck: false, maxSkewMs: 129_600_000 }
cfg.remote    // { enabled: true, ttlSec: 3600, timeoutMs: 4000 }
// @deprecated phase2e: rank.showPanelWithoutProvider (unread since 2b).
```

**L1 value changes** (the lead at I-2, with the tests that pin today's values; spec §7.2.2): `daily.unlockAfterLevel` 20 → 21; `ads.banner.fromCompletedLevels` 10 → 9; `ads.banner.minReloadSec` 60 → 46; `ads.interstitial.cooldownSec` → `[{ fromDay: 0, sec: 30 }]`; `ads.reloadDelaysMs` → `[30_000, 60_000, 120_000]`; `iap.grantBeforeConsume` true → false. Until then every workstream tests the new behaviour with `mergeConfig({ … })` and the target values.

**Env** (`src/env.d.ts`, lead L0): `VITE_LADDER_URL?: string`, `VITE_LADDER_WEB?: 'off' | 'anon'`, `VITE_FB_PLACEMENT_REWARDED_HINT?`, `_KITTY?`, `_MOUSE?`, `_REVIVE?`, `_RANK_DOUBLE?` (each falls back to `VITE_FB_PLACEMENT_REWARDED`).

**Layering** (`tests/unit/layering.spec.ts`, lead L0): new layer `shared` = `src/shared/**`. `shared/` imports nothing. `game/`, `platform/`, `app/`, `main` may import it; `ui/` type-only; `workers/`, `engine/`, `i18n/`, config may not.

---

## 2. The wire contract (G4): `src/shared/rank-api.ts`

PURE, imports nothing, no DOM / Worker / Node globals; compiled into the client's lazy chunk and into the Worker (no runtime coupling). The server re-exports it from `server/src/contract/index.ts` and never redefines a wire type.

### 2.1 Types and constants

```ts
// Owner: G4 (Phase 2e). The ranking server's wire contract, API v1 (spec §1.4).
export const API_VERSION = 'v1';
export const MAX_WINS_PER_REQUEST = 10;
export const MAX_BODY_BYTES = 16_384;
/** Our avatars (G2 draws avatar-0 … avatar-{AVATAR_COUNT − 1}); append-only. [PROVISIONAL P-L13] */
export const AVATAR_COUNT = 12;
export const NICK_NUM_MIN = 1;
export const NICK_NUM_MAX = 99;
export const REMOTE_SWITCHES = ['iapIos', 'iapInPlay', 'banner', 'bannerInPlay', 'ladder'] as const;
export type RemoteSwitch = (typeof REMOTE_SWITCHES)[number];

export const WIN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PUZZLE_ID_RE = /^(L[1-9]\d{0,5}|D\d{4}-\d{2}-\d{2}|E[a-z0-9-]{3,40}\/\d{1,3})$/;
export const CATS_RE = /^[0-9a-b]{4,12}$/;
export const PLAYER_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;   // Crockford base 32
/** Critic pass: every id that reaches SQL or a path has a pattern (spec §1.4). `<base-36 ms><8 random base-36>`. */
export const BRACKET_ID_RE = /^[0-9a-z]{8,24}$/;
export const REWARD_ID_RE = /^[0-9a-z]{8,24}:\d{1,3}$/;   // "<bracketId>:<slot>"
export const DEV_POOL_RE = /^[a-z0-9-]{1,32}$/;

export type Ms = number;                     // epoch ms, server clock unless named otherwise
export type Pool = 'fb' | 'web';
export type Trust = 'signed' | 'anon';
export type PeriodMode = 'rolling' | 'utc_day';
export type ScoredModeWire = 'level' | 'daily' | 'event';
export type PuzzleSourceWire = 'pack' | 'generated' | 'substitute';
export interface Grant { readonly hints: number; readonly kitties: number }

export interface PlayerView {
  readonly code: string;                     // PLAYER_CODE_RE; shown as "7KQ2-M9XD" (formatPlayerCode)
  readonly nickname: string;                 // the rendered name, the same text for every viewer
  readonly nick: { readonly adj: number; readonly noun: number; readonly num: number } | null; // null: free text
  readonly avatarId: number;                 // 0 … AVATAR_COUNT − 1
  readonly status: 'ok' | 'suspended';
  readonly pool: Pool;
  readonly trust: Trust;
  readonly listed: boolean;                  // "Show me in rankings"
  readonly nicknameChangeAt: Ms | null;      // the next allowed change; null = any time
}

/** The rules the server applies (spec §1.16); the client shows these, never its own copy. */
export interface RulesView {
  readonly periodMode: PeriodMode;
  readonly durationMs: number;
  readonly maxMembers: number;
  readonly scoringModes: readonly ScoredModeWire[];
  readonly places: readonly { readonly place: 1 | 2 | 3; readonly hints: number; readonly kitties: number }[];
  readonly minMembers: number;
  readonly doubleByVideo: boolean;
  readonly claimTtlMs: number;
  readonly hearts: { readonly enabled: boolean; readonly allowSelf: boolean; readonly maxGivenPerBracket: number };
  readonly nickname: { readonly freeText: boolean; readonly changeCooldownMs: number };
}

// ── session
export interface NonceResponse { readonly nonce: string; readonly expiresAt: Ms; readonly serverTime: Ms }
export interface SessionRequestFb {
  readonly platform: 'fb';
  readonly playerId: string;                 // getPlayerID() (a sanity check; the signed payload decides)
  readonly signature: string;                // getSignature(): "<b64url sig>.<b64url payload>"
  readonly nonce: string;
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly devPool?: string;                 // DEV_POOL_RE; accepted only by a server with DEV_ROUTES=true
}
export interface SessionRequestWeb {
  readonly platform: 'web';
  readonly device: { readonly id: string; readonly secret: string };   // 22 / 43 base64url characters
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly devPool?: string;
}
export type SessionRequest = SessionRequestFb | SessionRequestWeb;
export interface SessionResponse {
  readonly token: string;
  readonly expiresAt: Ms;
  readonly player: PlayerView;
  readonly rules: RulesView;
  /** Finished brackets I was in, ended within rules.claimTtlMs, newest first, ≤ 10 (cards, claims, repair). */
  readonly results: readonly ResultView[];
  readonly bracket: BracketSummary | null;
  readonly limits: { readonly maxWinsPerRequest: number; readonly queueMax: number };
  readonly serverTime: Ms;
}

// ── wins
export interface WinSubmission {
  readonly winId: string;                    // WIN_ID_RE (UUID v4 made by the client; idempotency)
  readonly puzzleId: string;                 // PUZZLE_ID_RE; never the tutorial
  readonly source: PuzzleSourceWire;         // level/daily/event packs → 'pack'
  readonly contentVersion: string;           // the content manifest's `version`
  readonly cats: string;                     // CATS_RE, length n: the column of the cat in each row (base 36)
  readonly fish: number;                     // kept, 1 … fishMax (3, or the event's lives)
  readonly mistakes: number;                 // ≥ 0
  readonly revives: number;                  // 0 … 1
  readonly hints: number;
  readonly kitties: number;
  readonly mice: number;
  readonly solveMs: number;                  // GameState.elapsedMs at WON
  readonly playedAt: Ms;                     // DEVICE clock, informational only
  readonly clientVersion: string;
}
export interface WinsRequest { readonly wins: readonly WinSubmission[] }   // 1 … MAX_WINS_PER_REQUEST, oldest first
export type WinVerdict = 'accepted' | 'accepted_flagged' | 'duplicate' | 'already_counted' | 'rejected';
export type WinReason =
  | 'not_scored' | 'unlisted' | 'bad_puzzle_id' | 'bad_solution' | 'bad_fish' | 'inconsistent' | 'too_fast'
  | 'stale_date' | 'event_closed' | 'level_jump' | 'budget' | 'window_cap' | 'suspended'
  | 'unverified' | 'soft_fast';              // 'unverified', 'soft_fast' and (critic pass) 'level_jump' come with accepted_flagged; the rest with rejected
export interface WinResult { readonly winId: string; readonly verdict: WinVerdict; readonly reason?: WinReason; readonly points: number }
export interface WinsResponse {
  readonly results: readonly WinResult[];    // one per submitted win, same order
  readonly windowPoints: number;             // my points in my current bracket after these wins
  readonly bracket: BracketView | null;
  readonly serverTime: Ms;
}

// ── brackets
export interface BracketRow {
  readonly rank: number;                     // 1 … members, positions (no shared ranks)
  readonly slot: number;                     // stable handle inside this bracket (hearts); never a player id
  readonly nickname: string;
  readonly avatarId: number;
  readonly points: number;                   // fish kept, summed in this bracket
  readonly hearts: number;
  readonly me: boolean;
  readonly likedByMe: boolean;
}
export interface BracketView {
  readonly state: 'open' | 'ended' | 'none';
  readonly bracketId: string | null;
  readonly pool: Pool;
  readonly mode: PeriodMode;
  readonly openedAt: Ms | null;
  readonly endsAt: Ms | null;
  readonly members: number;                  // REAL visible members; === rows.length on a valid server answer
  readonly maxMembers: number;
  readonly rows: readonly BracketRow[];      // every visible member, best first (≤ maxMembers)
  readonly me: BracketRow | null;            // also inside rows; null when not a member
  readonly final: boolean;                   // ended and finalised
  readonly heartsNew: number;                // hearts received from OTHER players since my last bracket read
  readonly result: ResultView | null;        // state 'ended' and I was a member
  readonly serverTime: Ms;
}
export interface BracketSummary {
  readonly state: BracketView['state'];
  readonly bracketId: string | null;
  readonly rank: number | null;
  readonly members: number;
  readonly points: number;
  readonly endsAt: Ms | null;
}

// ── results and rewards
export interface ClaimView { readonly rewardId: string; readonly grant: Grant; readonly doubled: boolean; readonly claimedAt: Ms }
export interface RewardView {
  readonly rewardId: string;                 // "<bracketId>:<slot>"
  readonly place: 1 | 2 | 3;
  readonly grant: Grant;                     // the base grant (× 2 when claimed doubled)
  readonly canDouble: boolean;
  readonly expiresAt: Ms;
  readonly claim: ClaimView | null;
}
export interface ResultView {
  readonly bracketId: string;
  readonly endedAt: Ms;
  readonly place: number;                    // my final rank
  readonly members: number;                  // visible members at finalisation (brackets.final_members; a later deletion never changes it)
  readonly points: number;
  readonly reward: RewardView | null;        // null: not a paid place (or too few members, see members vs rules.minMembers)
}
export interface ClaimRequest { readonly rewardId: string; readonly double: boolean }
export interface ClaimResponse extends ClaimView { readonly place: number; readonly alreadyClaimed: boolean; readonly serverTime: Ms }

// ── hearts, profile, me, config, health
export interface HeartRequest { readonly bracketId: string; readonly slot: number }
export interface HeartResponse {
  readonly bracketId: string; readonly slot: number; readonly hearts: number; readonly likedByMe: true;
  readonly givenInBracket: number; readonly serverTime: Ms;
}
export interface ProfileRequest {
  readonly nickname?: { readonly adj: number; readonly noun: number; readonly num?: number } | { readonly text: string };
  readonly avatarId?: number;
  readonly listed?: boolean;
}
export interface ProfileResponse { readonly player: PlayerView; readonly serverTime: Ms }
export interface MeResponse {
  readonly player: PlayerView;
  readonly data: { readonly brackets: number; readonly wins30d: number; readonly rewards: number; readonly createdAt: Ms };
  readonly serverTime: Ms;
}
export interface ConfigResponse { readonly switches: Partial<Record<RemoteSwitch, boolean>>; readonly ttlSec: number; readonly serverTime: Ms }
export interface HealthResponse {
  readonly ok: boolean; readonly version: string; readonly contentVersions: readonly string[];
  readonly db: 'ok' | 'down'; readonly serverTime: Ms;
}

// ── errors
export type ErrorCode =
  | 'bad_request' | 'token_invalid' | 'token_expired' | 'bad_signature' | 'nonce_invalid' | 'nonce_replay'
  | 'signature_stale' | 'suspended' | 'origin_not_allowed' | 'web_disabled' | 'not_member' | 'not_found'
  | 'nickname_cooldown' | 'heart_exists' | 'heart_limit' | 'too_large' | 'nickname_invalid' | 'nickname_blocked'
  | 'avatar_invalid' | 'upgrade_required' | 'rate_limited' | 'disabled' | 'unavailable';
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>>;   // spec §1.4 table (400 … 503)
export interface ApiError {
  readonly error: { readonly code: ErrorCode; readonly message: string; readonly retryAfterMs?: number };
  readonly serverTime: Ms;
}
```

### 2.2 Validators and helpers (hand-written; never throw)

```ts
/** Responses (client side): null = invalid. Unknown fields are ignored. A bracket view with an invalid
 *  row keeps its valid rows only (a bad row is DROPPED, never repaired into an invented one); `members`
 *  stays the server's number. Critic pass: a view whose `rows.length` differs from `members` after the
 *  drop is still shown (the server's rows, the server's count), and the client logs `invalid_response`;
 *  a view with MORE rows than `maxMembers`, duplicate slots or ranks out of 1…members is rejected whole
 *  (null), never trimmed or re-ranked by the client. */
export function parseNonceResponse(x: unknown): NonceResponse | null;
export function parseSessionResponse(x: unknown): SessionResponse | null;
export function parseWinsResponse(x: unknown): WinsResponse | null;
export function parseBracketView(x: unknown): BracketView | null;
export function parseClaimResponse(x: unknown): ClaimResponse | null;
export function parseHeartResponse(x: unknown): HeartResponse | null;
export function parseProfileResponse(x: unknown): ProfileResponse | null;
export function parseMeResponse(x: unknown): MeResponse | null;
export function parseConfigResponse(x: unknown): ConfigResponse | null;     // booleans of REMOTE_SWITCHES only
export function parseHealthResponse(x: unknown): HealthResponse | null;
export function parseApiError(x: unknown): ApiError | null;

/** Requests (server side; the client uses isWinSubmission for its saved queue). */
export type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly path: string };
export function isWinSubmission(x: unknown): x is WinSubmission;
export function validateSessionRequest(x: unknown, opts: { readonly devPools: boolean }): Checked<SessionRequest>;
export function validateWinsRequest(x: unknown): Checked<WinsRequest>;
export function validateClaimRequest(x: unknown): Checked<ClaimRequest>;
export function validateHeartRequest(x: unknown): Checked<HeartRequest>;
export function validateProfileRequest(x: unknown): Checked<ProfileRequest>;

export function formatPlayerCode(code: string): string;                   // "7KQ2M9XD" → "7KQ2-M9XD"
export function isRemoteSwitch(name: string): name is RemoteSwitch;
```

### 2.3 Word lists (G3): `src/shared/nick-words.ts`

```ts
// Owner: G3 (Phase 2e). Our own words (plain everyday English), APPEND-ONLY: never reorder or remove an
// entry (a retired word is replaced in place by its fallback and listed in RETIRED_V1). Imports nothing.
export interface NickWords { readonly adj: readonly string[]; readonly noun: readonly string[] }
export const NICK_WORDS_V1: NickWords;          // ≈ 64 adjectives, ≈ 64 cat nouns; each 3–10 letters
export const RETIRED_V1: { readonly adj: readonly number[]; readonly noun: readonly number[] };
```

The name is `${adj[i]} ${noun[j]} ${num}` with `NICK_NUM_MIN ≤ num ≤ NICK_NUM_MAX`. G4's test checks every pair against the blocklist; G3 runs `npm --prefix server test -- nick` before landing a list change. Starter words (G3 completes and the lead reviews): adjectives Sleepy, Fluffy, Velvet, Misty, Brave, Cozy, Curious, Gentle, Lucky, Sunny, Quiet, Nimble, Dreamy, Cheerful, Clever, Merry, Snowy, Golden, Silver, Breezy, Mellow, Plucky, Toasty, Dapper, Jolly, Bouncy, Starry, Maple; nouns Whisker, Paws, Mittens, Tabby, Biscuit, Pounce, Purr, Muffin, Pebble, Socks, Noodle, Button, Marble, Pudding, Clover, Ginger, Shadow, Pepper, Bean, Toffee, Waffle, Comet, Nugget, Tuft.

---

## 3. HTTP examples (golden fixtures: `server/test/contract/fixtures/<endpoint>.<case>.json`)

Every response also carries the headers `Content-Type: application/json`, `Cache-Control: no-store` and, for an allowed origin, `Access-Control-Allow-Origin: <origin>` with `Vary: Origin` (never `Access-Control-Allow-Credentials`). Requests carry no custom header (the client version is in the session body, the token and every win; spec §1.4); unauthenticated POSTs are sent as `text/plain` with a JSON body so they need no preflight.

```http
POST /v1/session/nonce
→ 200 {"nonce":"n1.mgk2x8.Zk3…Q.9fA…","expiresAt":1791800100000,"serverTime":1791799800000}

POST /v1/session
{"platform":"fb","playerId":"7392816450","signature":"Xk2…_A.eyJhbGdvcml0aG0iOiJITUFDLVNIQTI1NiIs…",
 "nonce":"n1.mgk2x8.Zk3…Q.9fA…","clientVersion":"0.2.0","contentVersion":"content-bb8a756dfaf9"}
→ 200 {"token":"v1.eyJr…","expiresAt":1791886200000,
   "player":{"code":"7KQ2M9XD","nickname":"Velvet Pounce 27","nick":{"adj":2,"noun":5,"num":27},"avatarId":4,
             "status":"ok","pool":"fb","trust":"signed","listed":true,"nicknameChangeAt":null},
   "rules":{"periodMode":"rolling","durationMs":86400000,"maxMembers":50,"scoringModes":["level","daily","event"],
            "places":[{"place":1,"hints":2,"kitties":2},{"place":2,"hints":1,"kitties":1},{"place":3,"hints":1,"kitties":0}],
            "minMembers":5,"doubleByVideo":true,"claimTtlMs":604800000,
            "hearts":{"enabled":true,"allowSelf":true,"maxGivenPerBracket":20},
            "nickname":{"freeText":false,"changeCooldownMs":86400000}},
   "results":[{"bracketId":"mgj1a0k3x9f2","endedAt":1791790000000,"place":2,"members":37,"points":22,
               "reward":{"rewardId":"mgj1a0k3x9f2:11","place":2,"grant":{"hints":1,"kitties":1},"canDouble":true,
                         "expiresAt":1792394800000,"claim":null}}],
   "bracket":{"state":"open","bracketId":"mgk0b7q1z4a8","rank":5,"members":37,"points":14,"endsAt":1791830000000},
   "limits":{"maxWinsPerRequest":10,"queueMax":20},"serverTime":1791799800000}

POST /v1/wins   (Authorization: Bearer v1.eyJr…)
{"wins":[{"winId":"3f6c2a0e-8d1b-4c7a-9e55-0b9a1d2c4e6f","puzzleId":"L57","source":"pack",
          "contentVersion":"content-bb8a756dfaf9","cats":"681524073","fish":2,"mistakes":1,"revives":0,
          "hints":0,"kitties":1,"mice":0,"solveMs":94210,"playedAt":1791799790000,"clientVersion":"0.2.0"}]}
→ 200 {"results":[{"winId":"3f6c2a0e-8d1b-4c7a-9e55-0b9a1d2c4e6f","verdict":"accepted","points":2}],
   "windowPoints":16,
   "bracket":{"state":"open","bracketId":"mgk0b7q1z4a8","pool":"fb","mode":"rolling","openedAt":1791743600000,
              "endsAt":1791830000000,"members":3,"maxMembers":50,
              "rows":[{"rank":1,"slot":0,"nickname":"Sleepy Whisker 27","avatarId":1,"points":31,"hearts":4,"me":false,"likedByMe":false},
                      {"rank":2,"slot":2,"nickname":"Velvet Pounce 27","avatarId":4,"points":16,"hearts":2,"me":true,"likedByMe":false},
                      {"rank":3,"slot":1,"nickname":"Cozy Biscuit 41","avatarId":7,"points":9,"hearts":0,"me":false,"likedByMe":true}],
              "me":{"rank":2,"slot":2,"nickname":"Velvet Pounce 27","avatarId":4,"points":16,"hearts":2,"me":true,"likedByMe":false},
              "final":false,"heartsNew":1,"result":null,"serverTime":1791799801000},
   "serverTime":1791799801000}

GET /v1/bracket            → 200 BracketView (state "none": bracketId null, rows [], members 0, me null)
POST /v1/rewards/claim {"rewardId":"mgj1a0k3x9f2:11","double":true}
→ 200 {"rewardId":"mgj1a0k3x9f2:11","grant":{"hints":2,"kitties":2},"doubled":true,"claimedAt":1791799900000,
       "place":2,"alreadyClaimed":false,"serverTime":1791799900000}
POST /v1/hearts {"bracketId":"mgk0b7q1z4a8","slot":0}
→ 200 {"bracketId":"mgk0b7q1z4a8","slot":0,"hearts":5,"likedByMe":true,"givenInBracket":1,"serverTime":…}
PUT /v1/me/profile {"nickname":{"adj":7,"noun":12,"num":3},"avatarId":9}   → 200 {"player":{…},"serverTime":…}
PUT /v1/me/profile {"listed":false}                                        → 200 {"player":{…,"listed":false},…}
GET /v1/me                 → 200 {"player":{…},"data":{"brackets":4,"wins30d":63,"rewards":2,"createdAt":…},"serverTime":…}
DELETE /v1/me              → 204 (no body)
GET /v1/config             → 200 {"switches":{"iapIos":false},"ttlSec":3600,"serverTime":…}
GET /v1/health             → 200 {"ok":true,"version":"0.1.0+abc1234","contentVersions":["content-bb8a756dfaf9"],"db":"ok","serverTime":…}

Errors (one fixture each): 400 bad_request · 401 token_expired · 401 bad_signature · 403 suspended ·
403 web_disabled · 404 not_found · 409 nickname_cooldown · 409 heart_exists · 413 too_large · 422 nickname_blocked ·
426 upgrade_required · 429 rate_limited (retryAfterMs) · 503 disabled (retryAfterMs)
→ {"error":{"code":"rate_limited","message":"wins: 30 per minute","retryAfterMs":12000},"serverTime":…}
```

The FB signed payload the server expects (and the stub signs): `encPayload = b64url(JSON {"algorithm":"HMAC-SHA256","issued_at":<unix s>,"player_id":"<id>","request_payload":"<nonce>"})`, `signature = b64url(HMAC-SHA256(FB_APP_SECRET, encPayload)) + "." + encPayload`. G-SRV-2 confirms it against one real signature before launch.

---

## 4. Server internals (G4; informative for reviewers, binding only inside `server/`)

```ts
// server/src/core/clock.ts
export interface Clock { now(): number }                      // FakeClock in tests; dev pools add an offset

// server/src/store/sql-db.ts — D1's own minimal shape (the node:sqlite shim implements it)
export interface SqlStatement {
  bind(...values: (string | number | null)[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface SqlDb { prepare(sql: string): SqlStatement; batch(stmts: SqlStatement[]): Promise<unknown[]> } // batch = one transaction

// server/src/store/store.ts — domain-level; SqlStore implements it over SqlDb
export interface Store {
  getPlayer(key: string): Promise<PlayerRow | null>;
  upsertPlayer(p: NewPlayer, now: number): Promise<PlayerRow>;
  findOpenBracket(pool: string, now: number): Promise<{ id: string; members: number } | null>;
  joinBracket(pool: string, player: PlayerRow, now: number, cfg: ServerConfig): Promise<{ bracketId: string; slot: number; endsAt: number }>;
  applyWins(player: PlayerRow, accepted: AcceptedWin[], now: number): Promise<void>;
  bracketView(bracketId: string | null, playerKey: string, now: number): Promise<BracketView>;
  finalize(bracketId: string, now: number, cfg: ServerConfig): Promise<void>;
  dueBrackets(now: number, limit: number): Promise<string[]>;
  results(playerKey: string, since: number): Promise<ResultView[]>;
  claimReward(playerKey: string, rewardId: string, double: boolean, now: number): Promise<ClaimResponse | 'not_found' | 'suspended'>;
  giveHeart(bracketId: string, fromKey: string, toSlot: number, now: number, cfg: ServerConfig): Promise<HeartResponse | ErrorCode>;
  setProfile(playerKey: string, p: ProfileRequest, now: number, cfg: ServerConfig): Promise<PlayerView | ErrorCode>;
  deletePlayer(playerKey: string, now: number): Promise<void>;
  useNonce(hash: string, expiresAt: number): Promise<boolean>;  // false = replay
  addFlag(playerKey: string, kind: string, detail: unknown, now: number): Promise<void>;
  sweep(now: number, cfg: ServerConfig): Promise<{ deleted: number }>;
  // admin: listFlags, adminPlayer, suspend, reinstate, resetNickname, refinalize, stats
}

// server/src/env.ts
export interface Env {
  DB: D1Database; METRICS?: AnalyticsEngineDataset;
  FB_APP_SECRET: string; SESSION_SECRET: string; ID_PEPPER: string; ADMIN_KEY: string;
  FB_APP_SECRET_ALT?: string;   // staging / dev only: synthetic players into pool 'fb:synthetic'; the Worker refuses to run sessions when it is set on a production hostname (spec §1.2)
  RANKING_ENABLED: string; PERIOD_MODE: string; WEB_MODE: string; DEV_ROUTES: string;
  ALLOWED_ORIGINS: string; MIN_CLIENT_VERSION: string; RC_SWITCHES: string;
}
export default { fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>, scheduled(ev, env, ctx): Promise<void> };
```

`ServerConfig` mirrors spec §1.16 (defaults in `core/config.ts`, overridden by `Env` variables where named). `core/*` never touches `Env`, `fetch`, `Date.now()` or D1.

---

## 5. Platform (G1)

```ts
// src/platform/types.ts — additive
export interface Capabilities {
  /* … 2b–2d members … */
  /**
   * Phase 2e (spec §4.4): the FB platform is iOS (getPlatform() === 'IOS'). From 2e `payments` no longer
   * excludes iOS (getSupportedAPIs + the functions decide); the app then also needs iap.iosEnabled or the
   * remote switch iapIos. Optional until I-3 (absent = false).
   */
  paymentsIos?: boolean;
}
export type InterstitialPlacement = 'next_level' | 'retry' | 'daily_done' | 'event_next' | 'fail_home';
export type RewardedPlacement = 'hint' | 'kitty' | 'revive' | 'group_double' | 'mouse' | 'rank_double';

/** Phase 2e (spec §1.3): the FB signed player info for the ranking server. */
export interface SignedPlayer { readonly playerId: string; readonly signature: string }
export interface IdentityProvider {
  /** player.getSignedPlayerInfoAsync(requestPayload). null when unsupported (not listed by getSupportedAPIs or not a function) or on any error. Never rejects. */
  signedPlayerInfo(requestPayload: string): Promise<SignedPlayer | null>;
}
export interface PlatformAdapter {
  /* … */
  /** Phase 2e: FB only (the web uses a device credential in anon mode). */
  identity?: IdentityProvider;
}

// src/platform/fb/fbinstant.d.ts — additive
interface FBSignedPlayerInfo { getPlayerID(): string; getSignature(): string }
// player:
getSignedPlayerInfoAsync(requestMetadata?: string): Promise<FBSignedPlayerInfo>;
```

**FB ads (G1-internal, spec §3.4):** `FbAdsOptions` gains `rewardedIds?: Partial<Record<RewardedPlacement, string>>` (the per-helper `VITE_FB_PLACEMENT_REWARDED_*` values; a missing one falls back to the shared id), a per-placement-id load floor of `ads.minLoadGapMs`, the backoff `ads.reloadDelaysMs`, and the preload cap `ads.maxPreloadedRewarded` with the priority of spec §3.4.

**The stub** (`tests/fixtures/fbinstant-stub.js`, G1): new config `signing: { secret: string, playerId?: string, issuedAtSkewSec?: number }` (default secret `'e2e-fb-app-secret'`, the same value the dev server reads from its test env); `player.getSignedPlayerInfoAsync(payload)` signs as §3 with SubtleCrypto (in Node unit tests with `node:crypto`); preset `'no-signed-info'` removes the API; `platform: 'IOS'` now lists the payments APIs (the app decides). The e2e `?fbstub=player:<id>` picks a player id so two browser contexts are two players. The stub (and with it the e2e signing secret) is served only in e2e builds; the release check greps every release `dist/*` for the secret's value (spec §10.5 #1).

---

## 6. Game (G1)

```ts
// src/game/types.ts — additive
import type { WinSubmission } from '../shared/rank-api';
export interface LadderPendingWin extends WinSubmission { readonly queuedAt: number }      // device clock
export interface LadderCurrent {
  readonly bracketId: string; readonly endsAt: number;         // server clock
  readonly serverOffsetMs: number; readonly fetchedAt: number;  // device clock
  readonly points: number; readonly rank: number | null; readonly members: number; readonly maxMembers: number;
}
export interface LadderRecord {
  listed: boolean;
  pending: LadderPendingWin[];
  current: LadderCurrent | null;         // no rows (other players' names stay out of the cloud save)
  claimed: string[];                     // "<rewardId>|<hints>|<kitties>"
  doubleWatched: string[];               // reward ids
  resultsSeen: string[];                 // bracket ids
  nickLineSeen: boolean;
  me: { name: string; avatarId: number; code: string } | null;
}
export interface DayStreakRecord { dates: string[]; run: number; best: number; paid: string[] }
/** Save schema v4 (spec §7.1). SaveData becomes SaveDataV4 when G1's migration lands. */
export interface SaveDataV4 extends Omit<SaveDataV3, 'v' | 'purchases'> {
  v: 4;
  purchases: { noAds: boolean; tokens: string[]; pending: string[] };
  ladder: LadderRecord;
  dayStreak: DayStreakRecord;
}

// src/game/day-streak.ts (new, pure)
export interface StreakCount {
  readonly ds: DayStreakRecord; readonly counted: boolean; readonly day: number;   // 1 … cycleDays (0 when not counted)
  readonly reset: boolean; readonly reward: { readonly hints: number; readonly kitties: number } | null;
}
export function countWin(ds: DayStreakRecord, dateKey: string, c?: GameConfig): StreakCount;
export interface StreakView {
  readonly day: number; readonly total: number; readonly todayDone: boolean;
  readonly alive: boolean; readonly broken: boolean; readonly best: number;
}
export function streakView(ds: DayStreakRecord, today: string, c?: GameConfig): StreakView;
export function mergeDayStreak(a: DayStreakRecord, b: DayStreakRecord, c?: GameConfig): DayStreakRecord;
export function readDayStreak(x: unknown, c: GameConfig, rep: string[]): DayStreakRecord;

// src/game/ladder.ts (new, pure)
export function toWinSubmission(i: {
  winId: string; puzzleId: PuzzleId; source: PuzzleSource; contentVersion: string; solution: Uint8Array;
  kept: number; mistakes: number; revives: number; hints: number; kitties: number; mice: number;
  solveMs: number; playedAt: number; clientVersion: string;
}): WinSubmission | null;                                  // null for the tutorial
export function enqueueWin(rec: LadderRecord, w: LadderPendingWin, c?: GameConfig): LadderRecord;
export function sendable(rec: LadderRecord, deviceNow: number, c?: GameConfig): LadderPendingWin[]; // aged ones dropped
export function applyVerdicts(rec: LadderRecord, results: readonly WinResult[]): LadderRecord;
export function currentFrom(view: BracketView, deviceNow: number): LadderCurrent | null;
export function counterBefore(rec: LadderRecord, deviceNow: number): number;
export function recordClaim(rec: LadderRecord, claim: ClaimView, c?: GameConfig): LadderRecord;
export function claimsToRepair(rec: LadderRecord, results: readonly ResultView[]): ClaimView[];
export function resultsToShow(rec: LadderRecord, results: readonly ResultView[], c?: GameConfig): ResultView[];
export function markResultSeen(rec: LadderRecord, bracketId: string, c?: GameConfig): LadderRecord;
export function readLadder(x: unknown, c: GameConfig, rep: string[]): LadderRecord;
export function mergeLadder(local: LadderRecord, cloud: LadderRecord, newer: LadderRecord, c?: GameConfig): LadderRecord;

// src/game/nickname.ts (new, pure)
export function nickText(nick: { adj: number; noun: number; num: number }, words: NickWords): string; // unknown id → "Cat {num}"

// src/game/progression.ts — changed
export function isDailyUnlocked(save: Pick<SaveData, 'progress' | 'daily' | 'inProgress'>, c?: GameConfig): boolean;
/** The daily's (and the streak's) date key: localDateKey(now − daily.dayStartHour h). */
export function dailyDateKey(nowMs: number, c?: GameConfig): string;
/**
 * Critic pass: epoch ms at which the day after `dateKey` begins (local midnight + dayStartHour h, DST-safe).
 * Replaces localMidnightAfter / msUntilLocalMidnight for "Next puzzle in …"; every "today" in shell.ts,
 * session.ts, boot.ts and views.ts moves from localDateKey(now) to dailyDateKey(now) (spec §6.1).
 */
export function nextDayStartAfter(dateKey: string, c?: GameConfig): number;

// src/game/ad-pacing.ts — additive
export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done' | 'event_next' | 'fail_home';
export interface PacingInput { /* … */ readonly retryIndex?: number }   // Retries since the last level win (1-based); optional until I-3
export type GateDecision = 'ok' | 'disabled' | 'no_ads' | 'unsupported' | 'trigger' | 'min_levels' | 'grace' | 'cooldown' | 'retry_cadence';
export interface BannerGateInput { /* … */ readonly today?: string }    // dailyDateKey(now); optional until I-3
export type BannerGateDecision = 'ok' | 'disabled' | 'unsupported' | 'screen' | 'min_levels' | 'no_ads' | 'tutorial' | 'ended';

// src/app/session-effects.ts WinSummary — additive (critic pass: the path; WinSummary lives in app/, G1)
//   readonly streak: { readonly day: number; readonly total: number; readonly reward: Reward | null } | null;
//   readonly dailyReward: Reward | null;
```

---

## 7. App (G1)

```ts
// src/app/events.ts — additive
export type PauseReason = 'hidden' | 'fb_pause' | 'modal' | 'ad' | 'purchase';
export type LadderUpdateReason = 'session' | 'wins' | 'bracket' | 'claim' | 'heart' | 'profile' | 'listed' | 'deleted' | 'offline';
// AppEventMap: 'ladder:update': { readonly reason: LadderUpdateReason };
// AnalyticsParamsMap (spec §7.5; ANALYTICS_PARAM_KEYS gets each):
//   ladder_auth   { platform: PlatformId; result: 'ok' | 'no_api' | 'rejected' | 'error' | 'timeout' | 'disabled' }
//   ladder_submit { mode: ModeId; result: 'accepted' | 'flagged' | 'duplicate' | 'counted_before' | 'rejected' | 'queued' | 'dropped' | 'error'; reason: string; ms: number }
//   ladder_panel  { state: 'bracket' | 'stale' | 'records' | 'loading'; rows: number; rank: number; ms: number }
//   ladder_open   { from: 'home' | 'settings' }
//   ladder_result { rank: number; size: number; rewarded: 0 | 1 }
//   ladder_claim  { result: 'ok' | 'error' | 'video_failed'; doubled: 0 | 1 }
//   heart_give    { result: 'ok' | 'exists' | 'limit' | 'error'; self: 0 | 1 }
//   nick_set      { result: 'ok' | 'rejected' | 'cooldown' | 'error'; avatar: 0 | 1 }
//   ladder_listed { on: 0 | 1 }
//   ladder_delete { result: 'ok' | 'error' }
//   streak_day    { day: number; run: number }
//   streak_reward { run: number }
//   streak_reset  { prev: number }
//   o2_shown      { placement: 'hint' | 'kitty' | 'mouse'; video: 0 | 1; buy: number }   // Buy rows shown, 0–2
//   o2_choice     { placement: 'hint' | 'kitty' | 'mouse'; choice: 'video' | 'buy' | 'no_ads' | 'free' | 'decline' }
//   iap           { product; result; platform; source: 'shop' | 'o2' }      (changed: + source)
//   ad_interstitial { trigger; result; gate?: GateDecision }                  (changed: + gate)
//   ad_banner     { screen: BannerScreen; result: AdResultCode }
//   remote_config { result: 'ok' | 'cached' | 'default' }

// src/app/store.ts — OverlayId + 'ladder' | 'ladder_result' | 'nickname'   ('rank_hub' removed at I-3)
// src/app/router.ts — OverlayPropsMap: ladder: LadderSheetProps; ladder_result: LadderResultProps; nickname: NicknameSheetProps
// src/app/flags.ts — FlagId + 'ladder' | 'dayStreak' (both default on)

// src/app/ladder-client.ts (new)
export type LadderFailureCode = ErrorCode | 'network' | 'timeout' | 'invalid_response' | 'not_signed_in';
export type LadderResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: LadderFailureCode; readonly retryAfterMs?: number };
export interface LadderClient {
  signIn(): Promise<LadderResult<SessionResponse>>;                      // nonce + identity + session; never rejects
  submitWins(wins: readonly WinSubmission[], timeoutMs?: number): Promise<LadderResult<WinsResponse>>;
  bracket(): Promise<LadderResult<BracketView>>;
  claim(rewardId: string, double: boolean): Promise<LadderResult<ClaimResponse>>;
  heart(bracketId: string, slot: number): Promise<LadderResult<HeartResponse>>;
  setProfile(p: ProfileRequest): Promise<LadderResult<ProfileResponse>>;
  me(): Promise<LadderResult<MeResponse>>;
  deleteMe(): Promise<LadderResult<true>>;
  config(): Promise<LadderResult<ConfigResponse>>;                       // no sign-in needed
  serverNow(): number;                                                   // Date.now() + the last measured offset
  signedIn(): boolean;
}

// src/app/ladder-flow.ts (new; G1-internal shape, listed for the reviewers)
export interface LadderFlow {
  active(): boolean;
  start(): Promise<void>;                                  // boot step 8 (after the tutorial on a first run)
  onWin(input: LadderWinInput): void;                      // t = 0 of WON (counted, non-tutorial wins)
  listState(): RankingListState | null;                    // null: not active → the records path
  counterBefore(): number;
  chip(): LadderChipView;
  homeMounted(): void;                                     // throttled refresh + the next result card
  openSheet(from: 'home' | 'settings'): void;
  settingsRows(): SettingsLadderRows | undefined;
  dispose(): void;
}

// src/app/remote-config.ts (new)
export interface RemoteConfig {
  start(): Promise<void>;                                  // idle after the first screen
  switches(): Readonly<Partial<Record<RemoteSwitch, boolean>>>;
  iapIosOn(): boolean; iapInPlayOn(): boolean; bannerOn(): boolean; bannerInPlayOn(): boolean; ladderOn(): boolean;
}

// src/app/shop-flow.ts — additive
export type BuyInPlayResult = 'ok' | 'cancelled' | 'error' | 'not_ready' | 'unsupported';
export interface ShopFlow {
  /* … */
  buyInPlay(id: ProductId): Promise<BuyInPlayResult>;       // consume-first ledger; pauses 'purchase'
  prefetchCatalog(): void;                                 // boot step 8 after onReady
  paymentsAllowed(): boolean;                              // caps.payments && (!caps.paymentsIos || iapIosOn)
  /** The Buy rows for O2, in iap.o2Products order; [] = none (critic pass: a list, as the config is; No Ads left out once owned). */
  o2Buy(placement: 'hint' | 'kitty' | 'mouse'): readonly O2BuyView[];
}

// src/app/helper-flows.ts — internal: askO2 resolves O2Choice
export type O2Choice = 'accept' | 'buy' | 'decline';

// src/app/banner-flow.ts — additive
export type BannerHideReason = 'interstitial' | 'rewarded' | 'modal' | 'hint' | 'purchase' | 'rate_limited';
export interface BannerFlow {
  /* … */
  /** Spec §3.1: re-show on the game screen that carries the band (at once or one timer). */
  reshowGame(reason: BannerHideReason): Promise<void>;
  afterAd(kind: 'interstitial' | 'rewarded'): void;
  afterPurchase(): void;
}
```

---

## 8. UI (G3)

```ts
// src/ui/overlays/ranking-panel.ts — additive
export interface BracketRowView {
  readonly rank: number; readonly slot: number; readonly name: string; readonly avatarId: number;
  readonly points: number; readonly hearts: number; readonly me: boolean; readonly likedByMe: boolean;
  /** The heart button is enabled (hearts on, not yet given, under the cap, not offline). */
  readonly heartEnabled: boolean;
}
export interface BracketListView {
  readonly bracketId: string;
  readonly rows: readonly BracketRowView[];   // EXACTLY the server's rows, in its order (H-3)
  readonly members: number;                   // the server's count ("37 players")
  readonly endsAt: number | null;             // DEVICE-clock ms (the app applied the server offset)
  readonly final: boolean;
  readonly rewardsLine: 'places' | 'min' | 'none';   // critic pass: 'places' (was 'top3'); the count is paidPlaces
  readonly paidPlaces: number;                 // rules.places.length ("The top 3 …" / "First place …")
  readonly minMembers: number;
  readonly heartsNew: number;                 // 0 = no line
  readonly waiting: number;                   // queued fish shown on my row ("+2 waiting"); 0 = none
  readonly stale: { readonly at: number } | null;   // "Last updated hh:mm"
  readonly firstLineName: string | null;      // nick.first.line once, else null
  readonly panelRows: number;                 // ladder.panelRows
  readonly hearts: boolean;                   // rules.hearts.enabled
  now(): number;                              // device clock for the countdown
}
export type RankingListState =
  | /* … the 2b–2c kinds … */
  | { readonly kind: 'bracket'; readonly view: BracketListView };
// The records kind widens its reason: 'local' | 'unavailable' | 'opted_out' | 'paused'.
export type RankingResultView =
  | /* … */
  | { readonly kind: 'ladder'; readonly gained: number; readonly total: number };   // "+2 fish · Your total: 14"
export interface RankingPanelProps {
  /* … */
  onHeart?(slot: number): void;               // optional until I-3
  onInfo?(): void;                            // optional until I-3
}

// src/ui/overlays/bracket-list.ts (new): the list the panel and the sheet share
export function createBracketList(view: BracketListView, cb: { onHeart(slot: number): void }): View<BracketListView>;

// src/ui/overlays/ladder-sheet.ts (new; overlay 'ladder')
export interface LadderRulesView {
  readonly periodMode: 'rolling' | 'utc_day'; readonly maxMembers: number; readonly minMembers: number;
  readonly doubleByVideo: boolean; readonly heartsEnabled: boolean;
  readonly paidPlaces: number;                // critic pass: the info text's place count comes from the server's rules
}
export interface LadderSheetProps {
  readonly view: 'list' | 'info' | 'records';
  readonly list: BracketListView | null;
  readonly records: PersonalRecordsView | null;
  readonly rules: LadderRulesView | null;
  /** ladder.noticeFirst: the info view as a one-time dialog with OK only. */
  readonly infoOnly: boolean;
  readonly reducedMotion: boolean;
  onHeart(slot: number): void;
  onEditName(): void;
  onClose(): void;
}

// src/ui/overlays/ladder-result.ts (new; overlay 'ladder_result')
export interface LadderResultProps {
  readonly case: 'paid' | 'too_few' | 'none';
  readonly place: number;
  readonly members: number;
  readonly reward: { readonly hints: number; readonly kitties: number } | null;
  readonly canDouble: boolean;                // rules.doubleByVideo && rewarded supported
  readonly paidPlaces: number;                // critic pass: "The top {count} …" in the 'none' case
  readonly busy: boolean;                     // a claim or the video in flight
  onCollect(): void;
  onDouble(): void;
  onClose(): void;                            // OK / Esc ("later")
}

// src/ui/overlays/nickname-sheet.ts (new; overlay 'nickname')
export interface NicknamePick { readonly adj: number; readonly noun: number; readonly num: number; readonly avatarId: number }
export interface NicknameSheetProps {
  readonly words: { readonly adj: readonly string[]; readonly noun: readonly string[] };
  readonly current: NicknamePick;
  readonly avatarCount: number;               // AVATAR_COUNT
  readonly numMin: number; readonly numMax: number;
  readonly state: 'idle' | 'saving' | 'offline' | 'rejected' | 'cooldown';
  readonly cooldownUntil: number | null;      // device clock
  now(): number;
  shuffle(): NicknamePick;                    // the app picks (the UI has no randomness)
  onSave(pick: NicknamePick): void;
  onClose(): void;
}

// src/ui/hud/ladder-chip.ts (new)
export type LadderChipView =
  | { readonly state: 'bracket'; readonly rank: number | null; readonly members: number; readonly points: number; readonly endsAt: number | null; now(): number }
  | { readonly state: 'join' }
  | { readonly state: 'off' }
  | { readonly state: 'records'; readonly period: { readonly kind: PeriodKind; readonly total: number } };

// src/ui/hud/streak-strip.ts (new)
export interface StreakStripView {
  readonly state: 'none' | 'new' | 'alive' | 'done';   // none: never; new: broken run; alive: today not yet; done: today counted
  readonly day: number; readonly total: number; readonly rewardDay: boolean;
}

// src/ui/screens/home-screen.ts — additive
export interface HomeView { /* … */ readonly ladder?: LadderChipView; readonly streak?: StreakStripView | null }  // optional until I-3
export interface HomeCallbacks { /* … */ onLadder?(): void }                                                  // optional until I-3
// Removed at I-3: HomeView.showTrophy, HomeCallbacks.onTrophy.

// src/ui/overlays/victory-screen.ts — additive
export interface VictoryProps {
  /* … */
  readonly streak?: { readonly day: number; readonly total: number; readonly reward: Reward | null } | null;
  readonly dailyReward?: Reward | null;       // shown only when not null and not zero
}

// src/ui/overlays/rewarded-prompt.ts — additive
export interface O2BuyView {
  readonly productId: ProductId;              // the UI names it with shop.product.<id>.name / desc
  /** 'pack': a helper pack ("Buy 15 hints · $1.99"); 'no_ads': No Ads ("Buy No Ads · $3.99" + its note line). */
  readonly kind: 'pack' | 'no_ads';
  readonly items: number;                     // 15 / 8; 0 for 'no_ads'
  readonly price: string | null;              // the catalogue's string, as is; null while loading
  /** 'disabled': another row's purchase is in flight (every button of O2 is disabled then). */
  readonly state: 'loading' | 'ready' | 'busy' | 'disabled';
}
export interface RewardedPromptProps { /* … */ readonly buy?: readonly O2BuyView[]; onBuy?(productId: ProductId): void }   // optional until I-3
// The rows change while O2 is open (catalogue in, purchase busy, No Ads bought): the app calls router.update('rewarded', props);
// RewardedPrompt.update re-renders the rows in place and keeps focus (spec §4.1).

// src/ui/overlays/settings-modal.ts — additive
export interface SettingsLadderRows {
  readonly name: string; readonly code: string | null;      // ALREADY formatted by the app ("7KQ2-M9XD"): ui/ imports shared/ for types only
  readonly listed: boolean; readonly showListed: boolean;   // ladder.optOutAllowed
  readonly online: boolean;                                  // false disables the switch and Delete
  onName(): void; onListed(on: boolean): void; onDelete(): void;
}
export interface SettingsProps { /* … */ readonly ladder?: SettingsLadderRows }
```

The 2c kinds of `RankingListState`, the hub's `RankHubProps` (until I-3) and `PersonalRecordsView` are unchanged.

---

## 9. Art (G2)

New symbol ids (placeholders at S0, final art in the build; spec Appendix C): `medal-1`, `medal-2`, `medal-3`, `avatar-0` … `avatar-11`, `icon-heart-line`, `icon-heart-fill`, `icon-streak-flame`, `streak-step-empty`, `streak-step-done`, `streak-step-today`, `streak-step-chest`, `reward-chest`, `reward-chest-open`, `nick-tag`, `icon-pencil`, `icon-shuffle`, `icon-info`. `IconSymbol` (`src/ui/art/sprite.ts`) widens with them; avatars, medals, the chest and the name tag go to the lazy art (or the `ladder` chunk); `icon-heart-*`, `icon-streak-flame` and the steps are needed by first-load views (the chip has none; the strip and the panel do) — G2 decides with the lead at I-4.

## 10. DOM contract and test hooks

The selectors of spec §9.4 are binding for G3's markup and G1's e2e. e2e builds only: `window.__mewdoku.ladder()` → `{ active: boolean; signedIn: boolean; pending: number; current: LadderCurrent | null }`, `window.__mewdoku.remote()` → the switches in force, `window.__mewdoku.streak()` → `streakView(save.dayStreak, today)`; the query `?ladderPool=<name>` passes `devPool` to the session and `/v1/config` (dev server only).

## 11. Schedule of required members (I-3)

| Optional at S0 | Required at I-3 |
|---|---|
| `Capabilities.paymentsIos`, `PacingInput.retryIndex`, `BannerGateInput.today` | yes |
| `HomeView.ladder`, `HomeView.streak`, `HomeCallbacks.onLadder` | yes |
| `RankingPanelProps.onHeart`, `onInfo` | yes |
| `VictoryProps.streak`, `VictoryProps.dailyReward` | yes |
| `RewardedPromptProps.buy`, `onBuy` | yes |
| `SettingsProps.ladder` | stays optional (absent = rows hidden: web-prod, no server) |
| `PlatformAdapter.identity` | stays optional (FB only) |

**Deleted at I-3:** `src/ui/overlays/rank-hub.ts`, `src/app/rank-hub-flow.ts`, `OverlayId 'rank_hub'` and `OverlayPropsMap.rank_hub`, `HomeView.showTrophy`, `HomeCallbacks.onTrophy`, the Home top bar's trophy, the period entry of `session.ts` `winBoards`, and the fakes' members for them (`tests/unit/app/harness.ts`, `boot.spec.ts`).

## 12. Requests

Changes in another workstream's files go through `docs/phase2e/requests-<owner>.md` (G1, G2, G3, G4), one row each (id, what, why, by whom), closed by the lead at I-2. A wire change (anything in `src/shared/rank-api.ts` or the fixtures) is a G4 request with the client impact stated; fields are additive inside v1.

## 13. Critic changes (2026-10-11, before S0; the full list with reasons is spec §13)

| Spec § 13 | Contract change |
|---|---|
| C-1, C-2 | `cfg.iap.o2Products` adds `'remove_ads'` to the hint and kitty cards. `ShopFlow.o2Buy()` returns `readonly O2BuyView[]`; `O2BuyView` gains `kind: 'pack' \| 'no_ads'` and the state `'disabled'`; `RewardedPromptProps.buy?: readonly O2BuyView[]`, `onBuy?(productId)`; the rows update through `router.update('rewarded', …)` |
| C-7, C-13, C-21 | `BRACKET_ID_RE`, `REWARD_ID_RE` (§2.1); `WinReason` `'level_jump'` now comes with `accepted_flagged` |
| C-15 | `Env.FB_APP_SECRET_ALT?` (staging / dev only) |
| C-16 | No custom request header; unauthenticated POSTs as `text/plain`; never `Access-Control-Allow-Credentials` (§3) |
| C-19 | `ResultView.members` is the stored `final_members` |
| C-26 | `nextDayStartAfter(dateKey, c?)` in `progression.ts` (§6) |
| C-32 | `SettingsLadderRows.code` arrives formatted |
| C-33 | `WinSummary` path: `src/app/session-effects.ts` |
| C-34 | The client's rule for bracket views whose rows and `members` disagree (§2.2) |
| C-5 | `BracketListView.rewardsLine` `'places'` (was `'top3'`) + `paidPlaces`; `LadderRulesView.paidPlaces`; `LadderResultProps.paidPlaces` |
| — | The stub's signing secret lives only in e2e builds (§5) |

No S0 order, owner or required-member schedule changed.
