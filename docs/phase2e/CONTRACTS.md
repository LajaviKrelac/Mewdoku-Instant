# Phase 2e contracts (cross-workstream interfaces)

Spec: [spec.md](spec.md) §9 (this file repeats it, copy-paste ready). Date 2026-10-11. Built on top of the 2d.1 build ([CONTRACTS-2d1](../phase2d/CONTRACTS-2d1.md) and [CONTRACTS-2d](../phase2d/CONTRACTS.md) stay in force; this file only adds or changes).

**Status: FINAL (I-5, 2026-10-11), amended 2026-10-12.** The S0 contract with the critic pass (§13) and what changed at integration (§14), then the post-win fixes of `afc67c8` (§14.7) and computer rivals (§15, D-2e-24, the user's decision U-e). Where §1–§11 and §14–§15 differ, §14–§15 are right; the members §15 adds are also written into §2.1, §3, §4 and §8 below.
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
  /** 2026-10-12 (D-2e-24, H-9): present and true when this pool's rankings include computer players and the
   *  disclosure is on ("Rankings include computer players."); never false on the wire (absent instead). The
   *  parser keeps it only as `true` and drops any other value without rejecting the rules. */
  readonly computerPlayers?: boolean;
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
  readonly slot: number;                     // stable handle inside this bracket (hearts); never a player id; ≥ 9000: a computer player (never paid; D-2e-24)
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
  readonly members: number;                  // rows of this table: visible real members plus computer players (D-2e-24); === rows.length on an
                                             // open answer; final: every row ranked at finalisation (brackets.final_members), so a later deletion leaves a gap
                                             // (2026-10-11 wording: "REAL visible members; === rows.length on a valid server answer")
  readonly maxMembers: number;
  readonly rows: readonly BracketRow[];      // every visible row (real members and computer players), best first (≤ maxMembers)
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
  readonly members: number;                  // every row ranked at finalisation, computer players included (brackets.final_members; a later deletion never changes it)
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

**Computer rivals** (2026-10-12, D-2e-24): three more fixtures come from a rivals-on scenario (`server/test/contract/contract.spec.ts`; `shapeDiff`, the parse round trip and `rows.length === members` run on them): `session.rivals.json` (the rules end with `"computerPlayers":true`), `bracket.rivals.json` (a full open bracket of 50 rows: 2 real members at slots 0 and 1, 48 computer players at slots 9000 and up, `members` 50) and `hearts.rival.json`. With rivals off nothing changes on the wire, so every other fixture is byte-identical.

```http
GET /v1/bracket   (a bracket created with computer players)
→ 200 {"state":"open","bracketId":"mwhs8lc0tijs942z",…,"members":50,"maxMembers":50,
   "rows":[{"rank":1,"slot":9027,"nickname":"Bright Willow 60","avatarId":6,"points":8,"hearts":1,"me":false,"likedByMe":true},
           {"rank":2,"slot":9024,"nickname":"Quiet Nutmeg 31","avatarId":0,"points":6,"hearts":2,"me":false,"likedByMe":false},
           {"rank":3,"slot":0,"nickname":"Spry Pretzel 62","avatarId":5,"points":6,"hearts":0,"me":true,"likedByMe":false}, …],
   …}
POST /v1/hearts {"bracketId":"mwhs8lc0tijs942z","slot":9027}
→ 200 {"bracketId":"mwhs8lc0tijs942z","slot":9027,"hearts":1,"likedByMe":true,"givenInBracket":1,"serverTime":…}
```

A heart on a computer player answers `hearts` = its built-in hearts at that time plus the real hearts given to that slot (the same for every viewer); `404 not_found` for a rival that has not arrived, one retired by joins, a slot ≥ 9000 in a bracket without rivals, or any rival under `rivals.hide`.

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

`ServerConfig` mirrors spec §1.16 (defaults in `core/config.ts`, overridden by `Env` variables where named). `core/*` never touches `Env`, `fetch`, `Date.now()` or D1. 2026-10-12: `Env` also carries `RIVALS?: string` (`on` | `off`) and `ServerConfig.rivals` (§15); the store, migration and route additions for computer rivals are listed in §15.2.

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
  readonly stale: { readonly at: number; readonly offline: boolean } | null;   // "Last updated hh:mm"; `offline` adds ladder.offline (2026-10-12, §14.7)
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
  | { readonly kind: 'ladder'; readonly gained: number; readonly total: number; readonly waiting?: number };   // "+2 fish · Your total: 14" (audit B9: "· +2 waiting" while queued)
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
  readonly durationMs?: number;               // §14.3
  readonly computerPlayers?: boolean;         // 2026-10-12 (§15): RulesView.computerPlayers; true adds the disclosure line after the window line
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
// 2026-10-12 (§14.7): HomeCallbacks.onLadderEnded?(): the chip's visible countdown reached 00:00:00 (once per end time).
// Removed at I-3: HomeView.showTrophy, HomeCallbacks.onTrophy.

// src/ui/overlays/how-to-play.ts — additive (§14.3: ladder?, streakDays?)
export interface HowToPlayProps {
  /* … */
  readonly ladderComputerPlayers?: boolean;   // 2026-10-12 (§15): with `ladder`, "Rankings include computer players." after the points note
}

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

## 14. Final (I-5): what changed at integration

All additive unless marked; every row is in the code and covered by `npx tsc --noEmit` and `npx vitest run`.

### 14.1 Wire and shared (G4; lead at I-2)

| Change | Where | Why |
|---|---|---|
| The **response parsers** moved to `src/shared/rank-api-parse.ts` (`parseNonceResponse` … `parseApiError`, `parseBracketView`, `parseSessionResponse`, `parseConfigResponse` and their helpers); `rank-api.ts` keeps the types, constants, patterns, the request validators, `checkWin` / `isWinSubmission`, `formatPlayerCode` and exports the small checks (`isObj`, `isInt`, `isMs`, `isMsOrNull`, `isStr`, `matches`, `isBool`) the parse module imports. `server/src/contract/index.ts` re-exports both; the server's `tsconfig.json` / `tsconfig.node.json` include both. `tests/unit/layering.spec.ts` allows the one shared → shared edge (`rank-api-parse.ts` → `rank-api.ts`) | requests-G1 R9, G3 R18 | The first load validates the queued wins only; the parsers (≈ 6.8 KB) belong to the lazy `ladder-boot` chunk (spec §7.9) |
| A re-created player gets a **new generated name**: `server/src/handlers/session.ts` seeds `generateNick` with `nick:<key>:<now>` | requests-G1 R3 | spec §1.11 "a new code and a new name" |
| **One open bracket per pool** (I-6): the bracket create in `sql-store.ts` `writeWins` carries a pool guard ("no joinable bracket in this pool"); a create that loses inserts nothing and the handler's retry joins the winner | e2e `layout.spec.ts` (49 players split 48 + 1) | spec §1.5 "normally at most one"; no wire change |

### 14.2 Game, app and platform (G1; as filed in requests-G1 R6, plus the lead's I-2 … I-4 changes)

| Member | Note |
|---|---|
| `LadderRecord.noticeSeen: boolean` (save v4) | Merged by OR; a copy without it reads `false`, not corrupt (the `ladder.noticeFirst` dialog's OK) |
| `LadderClient.onSignIn(fn)`; `LadderFailureCode` + `'no_api'` | |
| `LadderFlow` as built | `active()`, `start()`, `onWin(LadderWinRef)`, `listState()`, `panelTotal()`, `panelExtras()` (`{ bracketList?, onHeart(slot), onInfo() }`), `counterBefore()`, `chip()`, `homeMounted()`, `openSheet(from, view?)`, `settingsRows()`, `streakClockOk()`, `prefetchChunk()`, `debug()`, `dispose()` |
| `startLadder(deps: StartLadderDeps): Promise<LadderFlow>` (`src/app/ladder-boot.ts`, lead I-4) | Boot's ladder wiring (remote config, client, flow, the first sign-in) moved into the lazy `ladder-boot` chunk; boot passes `setRemote(r)` and `setFlow(f)` to receive the remote switches and the flow as soon as they exist |
| `game/ladder-sync.ts` (new, lazy) | `applyVerdicts`, `pruneAged`, `sendable`, `currentFrom`, `isRunning`, `markDoubleWatched`, `markResultSeen`, `afterDelete`, `waitingFish`, `droppedBy`, `claimEntry`, `isClaimed`, `counterBefore`, `recordClaim`, `claimsToRepair`, `resultsToShow` (same signatures as §6); `game/ladder.ts` keeps `emptyLadder`, `toWinSubmission`, `encodeSolution`, `enqueueWin`, `wireWin`, `parseClaimEntry`, `readLadder`, `mergeLadder` |
| `BannerFlow.modalClosed(closing?)`; `BannerHideReason` + `'helper'` | The banner's re-show after a modal over the board |
| `WinScreen.showPeriodCounter(total, kind?)`; `WinFlowInput.periodKind: FishTotalKind` | The `'ladder'` counter (requests-G3 R4) |
| `selectVictoryView(…, { praise, ladderTotal? })` | |
| `PacingInput.retryIndex: number \| null`, `BannerGateInput.today: string \| null` | Required at I-3 as **nullable**: `null` = "no retry cadence" / "no date" (the 2d callers that have none pass `null`) |
| `HomeView.ladder: LadderChipView \| null`, `HomeView.streak: StreakStripView \| null`, `HomeCallbacks.onLadder` | Required at I-3; `ladder: null` keeps the period pill (web-prod, ranking off), `streak: null` hides the strip |
| `RankingPanelProps.onHeart`, `onInfo` | Required at I-3; the app's `RankingData` (session) omits them and the shell fills them from `panelExtras()` |
| `createEventTopFlow({ store, router, rankings, viewCtx, config? }) → { open(def) }` (`src/app/event-top-flow.ts`, exported by `social-flows.ts`; lead I-3) | What the deleted rankings hub did for the event screen's Top list. The hub's group-challenge entry went with the hub (its flag is off) |
| Rank hub **deleted** (I-3): `rank-hub.ts`, `rank-hub-flow.ts`, `'rank_hub'`, `HomeView.showTrophy`, `HomeCallbacks.onTrophy`, the Home trophy | As §11. **Kept**, not deleted: the period-board path of `session.ts` `winBoards`, behind `rank.fbPeriodBoard` (`false`): D-2e-4 / spec §2.10 keep the code until gate G1 decides, so the flag decides instead of a deletion |
| The FB stub: `payments.purchaseDelayMs` / `consumeDelayMs` | e2e of the consume-first order and the paused timer |
| `config.ts` L1 flips (lead I-2; spec §7.2.2) | `daily.unlockAfterLevel` 21, `ads.banner.fromCompletedLevels` 9, `ads.banner.minReloadSec` 46, `ads.interstitial.cooldownSec` `[{ fromDay: 0, sec: 30 }]`, `ads.reloadDelaysMs` `[30 000, 60 000, 120 000]`, `iap.grantBeforeConsume` `false` |
| `fb-banner.ts` stuck-load window | `stuckLoadMs = min(window, max(45 500, window − ads.readyTimeoutMs))` (strictly inside the 46 s re-show window) |
| `ladder-flow.ts` freshness (lead I-2, requests-G3 R16) | A bracket answered by the server in this page load is `stale: null` until a refresh or a submit fails or the `offline` event fires |

### 14.3 UI (G3; as filed in requests-G3 R10, plus the lead's I-4 changes)

| Member | Note |
|---|---|
| `BracketListFactory`, `BracketListCallbacks` (`onHeart`, optional `onEditName`), `BracketListHandle` (`View` + `centerMe()`), `RankingPanelProps.bracketList?` | The panel (overlay chunk) gets the list factory of the `ladder` chunk |
| `RecordsReason` (`'local' \| 'unavailable' \| 'opted_out' \| 'paused'`), `LadderSheetProps.recordsReason?`, `streakBest?` | |
| `LadderRulesView.durationMs?` | The info view's "lasts {hours} hours" from the server's rule (fallback 24) |
| `O2BuyView` as specified; `FishTotalKind` (`PeriodPillProps.kind`, `VictoryProps.kept.kind`); `PillsView.showPeriodCounter(total, kind?)`; `HowToPlayProps.ladder?`, `streakDays?` | |
| English keys beyond Appendix A | `common.cancel`, `nick.edit.a11y`, `ladder.chip.rank`, `ladder.total`, `ladder.pill.*`, `ladder.records.title`, `streak.best`, `streak.days.*`; `nick.cooldown` = "You can change your name again in {time}."; Appendix A's `victory.streak` ships as `victory.streakDay` |
| `src/ui/screens/home-extras.ts` (lead I-4): `HomeExtras { createLadderChip, createStreakStrip }`, `homeExtras()`, `provideHomeExtras(x)`, `whenHomeExtras(fn)` | Home's chip and strip are created by factories the **overlay chunk** provides at load (`app/overlay-chunk.ts`); until then Home shows the period pill and an invisible reserved strip row (`.streak-strip--pending`) and re-renders when they land (spec §7.9's rule) |
| `src/ui/art/streak-art.ts` (lead I-4; was G2's `art2e()` in `sprite.ts`): `streakArtSymbols`, `mountStreakArt(doc?)` | The flame and the four streak steps, mounted by the overlay chunk with the strip (requests-G2 R4); `sprite.ts` exports `icon24` |
| The chip's and the strip's CSS moved from `screens.css` to `overlay-chunk.css` (lead I-4) | `screens.css` keeps `.home__lead`, the strip's margin and `.streak-strip--pending` |

### 14.4 i18n (lead I-4): the English catalogue in two runtime tables

| Member | Note |
|---|---|
| `src/i18n/en-first.ts`: `enFirst`, `FirstKey`, the key lists (`COLOR_KEYS`, `GLYPH_KEYS`, `PRAISE_KEYS`, `TUTORIAL_STEP_KEYS`, `WEEKDAY_KEYS`, `MONTH_KEYS`, now `satisfies readonly FirstKey[]`) | The first-load strings; `src/i18n/index.ts` bundles only this table and imports **types only** from `en.ts` |
| `src/i18n/en/core.ts` (`enCore`, moved from `en.ts`); `src/i18n/en/lazy.ts` (`enLazyCore`, `enLazyUi2b`, `enLazyUi2c`, `enLazyUi2d`, `enLazyUi2d1`, `enLazyUi2e`, `enLazyEvents`, `enLazyPlatform`, `enLazyI18n`, `enLazyTable`) | The keys only lazy chunks show, moved verbatim (same keys, values, owners' comments); computed by `scripts/i18n-split.ts` |
| `src/i18n/en-lazy.ts` (side effect: `registerEnglish(enLazyTable)`; exports `enLazy`) | Imported by every lazy entry that shows such a key (overlay, ladder, events and social chunks, `ladder-boot`, the fx chunk, `fb-social`) and by the dev harnesses; Rolldown names its chunk `assets/en-lazy-*.js` |
| `registerEnglish(part)` (`src/i18n/index.ts`) | Adds English strings to the runtime table; a key in no loaded table shows as the key and logs `i18n: no English string for '<key>'` in dev and e2e builds |
| `en.ts` | Still the whole catalogue (`en = { ...enFirst, ...enLazyTable }`) for types, tests, tools and translators; `EN_PARTS` lists both halves (every key in exactly one part) |
| Guards | `tests/unit/i18n/first-load-strings.spec.ts` (no first-load file names a lazy-only key; every lazy entry that shows one imports `en-lazy.ts`); `tests/e2e/helpers/strings.ts` `watchStrings(test)` in six e2e specs (no missing-string log on any page); `tests/en-lazy-setup.ts` (vitest `setupFiles`) registers the lazy table for unit and dom tests |

### 14.5 Tooling (lead)

| Member | Note |
|---|---|
| `scripts/release-check.ts`: `TEST_DATA_MARKERS`, `fixtureNames()`, `testDataProblems(files)`, `releaseProblems(files)`, `forbiddenReleaseHost(host)`, `bundleFiles(dir)`, `isReleaseDir(dir)`, `checkBundle(dir, { release? })` | Spec §10.5 #1, §10.6 #3, #6: run by `size-check.ts` on every dist and by `zip-fbig.ts` before zipping |
| `scripts/i18n-check.ts`: `PLAYER_COUNT_KEYS`, `honestyProblems(source?)` | Spec §10.6 #4, run by `npm run i18n:check` |
| `scripts/i18n-split.ts`: `FIRST_LOAD_ROOTS`, `staticImports`, `dynamicImports`, `staticGraph`, `firstLoadFiles`, `keysNamedBy`, `lazyEntries`, `splitReport` | The first-load / lazy English split (§14.4) |
| `scripts/size-check.ts` rows | New: `Lazy JS (ladder boot)`, `Lazy JS (overlay chunk)`, `Lazy JS (English)`, `Lazy CSS (overlay chunk)`; ceilings in 04 §9 and STATUS-2e §4 |
| `scripts/rank-probe.ts` (`npm run probe -- --url <staging>`): `buildProbe`, `zipProbe`, `probeUrl`, `PROBE_VERSION`; `dev/rank-probe/` (`run-probe.ts`: `runProbe(deps)`, `reportText`, `signatureFacts`, `b64urlText`) | Gates G-SRV-1 / G-SRV-2 (spec §11.6) |
| `playwright.config.ts`: `E2E_FB_APP_SECRET` (exported), the ranking dev server as a `webServer` on 8787, `E2E_LADDER_URL` | L0b |

### 14.6 Audit fix round (fix lead, 2026-10-11; STATUS-2e §10)

All in the code and covered by `npx tsc --noEmit`, `npx vitest run` and `npm --prefix server run verify`.

| Member | Note |
|---|---|
| `migrations/0002_wins_token.sql`: `players.wtok TEXT NOT NULL DEFAULT ''`; `PlayerRow.wtok` | Expand-only. The wins write token (A-S3) |
| `WriteWinsInput.cas: { expect, next }`; `WriteWinsResult.applied: boolean` | Every statement of a wins batch is guarded by `players.wtok = expect`; the player row (last) sets `next`. `applied` false: nothing of the batch was written (a concurrent request of the player, a lost join or create, my bracket stopped) |
| `POST /v1/wins`: `503 unavailable` + `retryAfterMs` (2 000) | When the wins could not be placed in ≤ 8 tries, or 4 evaluations kept losing to the same player's other request: **never** a final verdict for an unplaced win (A-S1); the client keeps its queue (`ladder-flow.ts` already retried `unavailable`); wins this request did store answer `duplicate` with their points on the retry. No wire type changed |
| `ContentLookup.tailSizes(mode)`; `TAIL_LEVELS` 200, `TAIL_DAILIES` 56 | A win past the table must have a size from the table's tail and (levels) a baseline within `antiCheat.maxLevelJump`; else `rejected` `bad_solution` / `bad_puzzle_id` with an `unverified` flag (A-S2) |
| `SqlStore.writeStats(day, add, set, mark): Promise<boolean>`; `setMeta` removed | The rollup's watermark moves in the same batch as the sums, guarded by the value read (A-S6); `stats_at` is `"<ms>:<nonce>"` |
| `DEFAULT_CONFIG.web.mode` `'records'` | Production runs the anonymous web pool only with `WEB_MODE=anon` itself (A-S5) |
| `LadderFlow.panelWaiting()`; `panelTotal()` = the server's total only | B9 / A-H1 (H-4): queued fish are shown apart, never added in |
| `RankingResultView` `'ladder'` + `waiting?`; `VictoryProps.kept.waiting?`; `selectVictoryView(…, { ladderWaiting? })`; `periodTotalText(kind, total, waiting?)`, `periodResultText(kind, gained, total, waiting?)`, `fishKeptText(kind, kept, total, waiting?)` | The panel subtitle "+3 fish · Your total: 3 · +3 waiting"; the victory's pill a second line `.victory__waiting` |
| `bracket-list.ts`: `rowLabel(r, hearts, waiting?)`, `displayName(name)`; `.ranking__sep-sr.sr-only` | B11 (my row's name ends ", +2 waiting"), B7 (a no-break space before the name's number), B10 (the header's dot read as the list separator) |
| `FIT_LEVELS` 4; `.victory[data-fit='4']`; `.victory[data-measuring]` | B1 (step 4: no hero art, a tighter streak row); the fit measures with transitions off (reduced motion's 150 ms transitions made every step look ineffective) |
| `.victory__streak[data-reward]` | B6: the open chest on the victory's day 7 |
| `session.ts` `playBoardEntry`: START at `GameScreen.playEntry()`'s returned `entryEndMs(n)` (≤ `fx.boardEntryMs`) | A-L1: as `board-types.ts` always specified; a 4 × 4 board takes input at 408 ms, not 700 |
| English keys: removed `settings.ladder.title`, `ladder.collectDouble.a11y`, `rewarded.buy.a11y`, `rewarded.buy.noAds.a11y`; `ladder.waiting` moved to the first-load table; `ladder.alone` = "You're the only player in this ranking." | B14, B12, B9 |
| `buyA11y(b)` starts with `buyLabel(b)`; the result card's ×2 has no `aria-label` and is described by `.ladder-result__double-note` (`ladder.info.double`) | B12, B13 (WCAG 2.5.3 label in name; the video said in words) |
| `scripts/i18n-check.ts`: `URGENCY_WORDS`, `localeHonestyProblems(locale, catalog)`; urgency and promises checked in every English key | A-H2 |
| `scripts/size-check.ts`: `Lazy CSS (overlay chunk)` 32 → 33.5 KB | 32.5 measured; 04 §9 |


### 14.7 Post-win and Home-chip fixes (lead, 2026-10-12, `afc67c8`; client only, no wire change)

| Member | Note |
|---|---|
| `LadderFlow.winCounted(): boolean \| null` | Whether the server's answer counted this win's fish (true: points added; false: rejected or already counted; null: no answer yet). The panel shows "+N fish" and the victory its ranking row only when it is not false (spec §2.4) |
| `counterBeforeWin(rec, deviceNow, winId, c?)` (`src/game/ladder-sync.ts`) | The in-game counter before a win: the bracket's points plus my earlier queued fish, this win's own left out (spec §2.3) |
| `BracketListView.stale: { at, offline } \| null` (was `{ at }`) | `offline` adds `ladder.offline` only when the device is offline or the last call failed for want of a network; a 503, a timeout or a boot from the stored cache show "Last updated hh:mm" alone (spec §2.4, §2.9) |
| `countdownText(endsAt, now, final)` (`bracket-list.ts`) | Same signature; "Final results" only when `final`; null (no line) once the end passed without it (spec §2.4) |
| `LadderChipCallbacks.onEnded?()`, `HomeCallbacks.onLadderEnded?()` | The chip's countdown reached 00:00:00 (once per end time); the app refreshes the chip |
| `.ladder-chip__time` (`ladder-chip.ts`) | The countdown "07:48:12" in a bracket with an end time; `.ladder-chip__rank` and `.ladder-chip__points` are hidden then, and rank, members, fish and time are in the accessible name (spec §2.5, §9.4) |
| `src/ui/time-text.ts` `formatCountdown(ms)` | Moved from `home-screen.ts` (which re-exports it), shared with the chip |

## 15. Computer rivals (2026-10-12, D-2e-24; the user's decision U-e)

The approved design, built in three stages and documented in spec §1.5 "Computer rivals", §0.4 (H-1, H-2, H-4, H-8 rewritten, H-9 new) and `server/README.md` "Computer rivals". Off in code; on only with the Worker variable `RIVALS=on` (spec §1.16). All additive; with rivals off the wire is byte-identical to §2–§3.

### 15.1 Wire and shared (`src/shared/rank-api.ts`, `rank-api-parse.ts`)

| Member | Meaning |
|---|---|
| `RulesView.computerPlayers?: boolean` | Present and `true` when the player's pool has rivals on (or its test pool's `/dev/rivals` switch), not hidden, and `rivals.disclose` on; never `false` on the wire. `parseRules` keeps it only as `true` and drops any other value silently (the rules are never rejected over it) |
| `BracketRow.slot` | ≥ 9000 (`RIVAL_SLOT_BASE` + index; at most 9048 under preset r1, ≤ 9999 accepted in a snapshot): a computer player. Real slots stay below 1000 in practice; no reward id can name a slot ≥ 1000 (`REWARD_ID_RE` `:\d{1,3}`), so a rival is never payable even by a forged claim |
| `BracketView.members` | The rows of this table: visible real members plus computer players; `=== rows.length` on an open answer; a final view's `members` is `brackets.final_members`, every row ranked at finalisation (a later deletion leaves a gap) |
| `BracketView.rows` | Every visible row, real or computer, best first, ≤ `maxMembers` (the K rule guarantees it, so the parser's checks are unchanged) |
| `ResultView.members` | Every row ranked at finalisation, computer players included (`final_members`); `place ≤ members` always holds |
| `BracketSummary.members` | The summarised view's `members` (the Home chip's "of 37") |
| `HeartResponse.hearts` on a rival slot | Its built-in hearts at that time (or the snapshot's) plus the real hearts given to that slot |

No new endpoint for players, no new error code, no new request field.

### 15.2 Server (informative; binding inside `server/`)

| Member | Note |
|---|---|
| `migrations/0003_rivals.sql` | `brackets.rivals TEXT` (the tag `r1:<seed12>:<strength>:<adjN>:<nounN>`; NULL = none), `brackets.final_rivals TEXT` (JSON `[[slot, rank, points, scoredAtOffsetMs, hearts, avatar, "name"], …]`, ≤ `max_members` entries, ≤ 8 KB), `brackets.final_real INTEGER`. Expand-only, no index, no backfill |
| **`brackets.final_members`** | **Meaning changed:** every row ranked at finalisation, computer players included (before 0003: the real visible members). **`final_real`**: the real visible members ranked (null before 0003). Readers that want real sizes (stats, dashboards) use `final_real ?? final_members` |
| `store/rows.ts` `BracketRow.rivals`, `final_rivals`, `final_real` | The secret tag is never on the wire and never in admin answers |
| `ServerConfig.rivals: { enabled, pools, strength, disclose, hide, testPools }`; `ConfigVars.RIVALS`; `RivalPool`, `RIVAL_POOLS` (`core/config.ts`) | Defaults `{ false, ['fb','web'], 100, true, false, false }`; `loadConfig` parses `RIVALS=on\|off`, the production guard (only `RIVALS=on` itself), pools, strength 50…200, and the scoring guard (r1 needs `pointsPerFish` 1, `fishMax` 3) |
| `DevState.rivals: Map<string, boolean>`; `rivalsForPool(s, pool)`, `rivalsNoteFor(s, pool)` (`services.ts`) | Who gets a tag at creation; who gets `computerPlayers` |
| `core/rivals.ts` (new, pure, integer-only) | `RIVAL_SLOT_BASE`, `isRivalSlot`, `RIVAL_TAG_RE`, `parseRivalsTag`, `newRivalsTag(strength, rng, words)`, `rivalRoster(tag, b)`, `rivalAt(script, joinUntil, t)`, `liveRivalCount(roster, b)`, `rivalNames(roster, takenLower, words, retired)`, `encodeFinalRivals`, `decodeFinalRivals`, `FINAL_RIVALS_MAX_CHARS`; types `RivalsTag`, `RivalScript`, `Roster`, `FinalRival`. Preset r1 is frozen by a golden test (also run inside workerd) |
| `core/table.ts` (new, pure) | The one place real rows and rivals meet: `TableRow` (`kind: 'player' \| 'rival'`, `playerKey` null for a rival), `RankedRow`, `liveTable`, `freezeTable` (at `ends_at`), `finalTable`, `finalPlan(b, members, cfg, now, claimable) → { ranks, rewards, totals, rivalPlaces }`, `rivalHeartTarget`, `withRealHearts`, `pointsForRank` (the preview and tests) |
| `core/brackets.ts` `paidPlaces` | Unchanged code; its input is every visible row, computer players included; callers drop places held by rival slots |
| `SqlStore` | `NewBracket.rivals` (the create binds one more value); `finalize(id, ranks, rewards, now, totals?)` and `refinalize(…, totals?)` with `FinalTotals { finalMembers, finalReal, finalRivals }` (defaults = the old behaviour); new `bracketHearts(id)`, `giveRivalHeart(…) → RivalHeartResult { added, realHearts, given, exists }` (4 statements), `adminBracket(id)`; `statsWindow().endedToday` gains `final_real`, `has_rivals`; `playerDetail` brackets gain `final_real`, `rivals` (0/1). Still exactly one `INSERT INTO members`; no change to the join, member insert or win statements |
| `handlers/views.ts` `rulesView(cfg, computerPlayers?)` | `computerPlayers` defaults to `enabled && disclose && !hide`; `session.ts` passes `rivalsNoteFor(s, player.pool)`. `bracketView` and `finalizeIfDue` go through `core/table.ts` |
| Routes | `GET /admin/v1/brackets/{id}[?at=][&live=1]` (spec §1.4); refinalize answers `{bracket: {id, finalMembers, finalReal, rivalRows, rewards}}`; `POST /dev/rivals {devPool, on}` (dev routes only; `/dev/reset` clears it) |
| Metrics, stats | `heart/rival`, `reward/rival_place`, `bracket_final/rivals`, `rivals/tag_invalid`, `rivals/decode_error`; stats `brackets_rivals`; `members_p*` from `final_real` |

### 15.3 Client

| Member | Note |
|---|---|
| `LadderRulesView.computerPlayers?: boolean` (`ladder-sheet.ts`) | `infoLines` adds "Rankings include computer players." (`icon-users`) right after the window line; the notice dialog (`ladder.noticeFirst`) renders the same lines |
| `LadderFlow.computerPlayers(): boolean` (`ladder-flow.ts`) | From the session's rules or the cached ones (`rules ?? cached?.rules`); `rulesView()` copies the flag only for a literal `true` |
| `HowToPlayProps.ladderComputerPlayers?: boolean` (`how-to-play.ts`) | `p.howto__computer` after the points note, with `ladder`; `shell.ts` `openHowToPlay` passes it while the ladder is active and `computerPlayers()` |
| `ladder.info.computerPlayers` | English in `src/i18n/en/lazy.ts`, the note in `meta.ts`, drafts in all 16 locales (unreviewed AI drafts), `docs/i18n/drafted-from.json` |
| `bracket-list.ts`, `ranking-panel.ts`, `ladder-chip.ts` | No logic change: they render the server's rows and count (H-3); rival rows are never labelled |

### 15.4 Preview (`preview/sample-server.ts`, `preview/sample-state.ts`)

`previewConfig()` turns rivals on, so the preview's other players are the production computer players and its rules carry `computerPlayers`; the sample member rows are gone. `MemStore` implements `bracketHearts` and `finalize(…, totals)`; `ViewStore` adds `'bracketHearts'`. The returning player is placed 5th and "end the day" 2nd among the rivals with `pointsForRank`; old saved states (with `sample:` members) still load and show no rivals.
