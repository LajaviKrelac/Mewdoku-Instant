// Owner: G1 (Phase 2e)
// The worldwide daily ranking's client flow (docs/phase2e/spec.md §2.2–§2.9; CONTRACTS §7): sign-in at idle
// after the first screen (boot step 8; after the tutorial on a first run), the win submit at t = 0 of WON
// (the win is already in save.ladder.pending: queued in the same critical save as the win), queue flushes
// (after sign-in, after the next win, at Home mount, on `online`; calls of ≤ ladder.batchMax; backoff
// ladder.backoffMs inside a page load), the panel's list states (loading · bracket · bracket + stale ·
// records), the Home chip, the ranking sheet (`ladder`), the result cards (`ladder_result`) with the claim,
// ×2 by video and the ledger's repair, hearts, the name sheet (`nickname`), "Show me in rankings" and
// Delete. Every change emits `ladder:update` {reason} (views re-render; the panel and the chip refresh).
// Honesty (spec §0.4, H-1…H-5): the list shows exactly the rows the server returned, in its order, with its
// ranks and its count; a failure never becomes rows — it becomes the cached bracket of a real answer
// ("Last updated hh:mm"), or the player's own records. Queued fish are shown as waiting, never promised.
// A rejected win is dropped quietly. The token lives in the client's memory only; the cached ROWS (other
// players' names) live in memory and localStorage['mewdoku.ladder.rows.v1'] only, dropped once endsAt
// passed; the save keeps my numbers only (save.ladder.current).
// Lazy: boot loads this module (with the client and the remote switches) only where the ranking origin is
// in use; web-prod never does (no request at all).
import {
  formatPlayerCode,
  type BracketView,
  type ClaimResponse,
  type PresenceState,
  type ResultView,
  type RulesView,
  type SessionResponse,
  AVATAR_COUNT,
  NICK_NUM_MAX,
  NICK_NUM_MIN,
} from '../shared/rank-api';
import { parseBracketView } from '../shared/rank-api-parse';
import { wireWin } from '../game/ladder';
import {
  afterDelete,
  applyVerdicts,
  claimsToRepair,
  counterBefore as counterOf,
  currentFrom,
  isRunning,
  markDoubleWatched,
  markResultSeen,
  pruneAged,
  recordClaim,
  resultsToShow,
  sendable,
  waitingFish,
} from '../game/ladder-sync';
import { shufflePick } from '../game/nickname';
import type { LadderRecord, ModeId, SaveData } from '../game/types';
import { t } from '../i18n';
import type { LadderChipView } from '../ui/hud/ladder-chip';
import type { LadderResultProps } from '../ui/overlays/ladder-result';
import type { LadderSessionProps } from '../ui/overlays/ladder-session';
import type { LadderRulesView, LadderSheetProps } from '../ui/overlays/ladder-sheet';
import type { NicknamePick, NicknameSheetProps } from '../ui/overlays/nickname-sheet';
import type { BracketListFactory, BracketListView, BracketRowView, PersonalRecordsView, RankingListState, RecordsReason } from '../ui/overlays/ranking-panel';
import type { SettingsLadderRows } from '../ui/overlays/settings-modal';
import type { Clock, TimerId } from './clock';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent, AppBus, LadderUpdateReason } from './events';
import type { LadderClient, LadderFailureCode, LadderResult } from './ladder-client';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import type { AppState, Store } from './store';

export const ROWS_KEY = 'mewdoku.ladder.rows.v1';
/** Leaderboard update: the bracket whose "New ranking" card was shown last (this device only; never in the save). */
export const SESSION_CARD_KEY = 'mewdoku.ladder.sessionCard.v1';

/** What the lazy `ladder` chunk gives the flow (app/ladder-chunk.ts). */
export interface LadderChunk {
  readonly createBracketList: BracketListFactory;
  readonly NICK_WORDS_V1: { readonly adj: readonly string[]; readonly noun: readonly string[] };
  readonly RETIRED_V1: { readonly adj: readonly number[]; readonly noun: readonly number[] };
}

export interface LadderFlowDeps {
  readonly client: LadderClient;
  readonly store: Store<AppState>;
  readonly saves: Pick<SaveScheduler, 'critical' | 'touch' | 'now'>;
  readonly router: Pick<Router, 'open' | 'update' | 'close' | 'isOpen' | 'stack' | 'toast' | 'screen'>;
  readonly bus: AppBus;
  readonly clock: Clock;
  readonly platformId: string;
  readonly config?: GameConfig;
  /** The remote switch `ladder` (off only); absent = on. */
  remoteOn?(): boolean;
  /** Rewarded videos can play (rank_double; the ×2 button is absent otherwise). */
  rewardedAvailable(): boolean;
  /** Plays the rank_double video; true only when watched to the end. */
  watchDouble(): Promise<boolean>;
  /** Loads the lazy `ladder` chunk (null when it cannot be loaded). */
  loadChunk(): Promise<LadderChunk | null>;
  /** localStorage, or null (the rows cache then lives in memory only). */
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** navigator.onLine (true when unknown). */
  online?(): boolean;
  /** The personal records card for the sheet's records view. */
  records(): PersonalRecordsView;
  /** A result card may open now (Home showing, no modal, not in the tutorial). */
  canOpenCard(): boolean;
  /** A random number in [0, 1) (the name sheet's shuffle). */
  random?(): number;
}

export interface LadderWinRef {
  /** The queued win's id; null when this win was not queued (not listed, not counted, the tutorial). */
  readonly winId: string | null;
  readonly mode: ModeId;
  /** Fish kept (the panel subtitle's "+2 fish"). */
  readonly kept: number;
}

export interface LadderFlow {
  /** The ranking is in use for this player now (spec §2.2 "Active"). */
  active(): boolean;
  /** Boot step 8 (after the tutorial on a first run): sign-in, the claim repair, the first flush. */
  start(): Promise<void>;
  /** t = 0 of WON, after the critical save (the win is already queued): the submit. */
  onWin(win: LadderWinRef): void;
  /** The post-win panel's list for the current win; null = not the ladder's (the records path). */
  listState(): RankingListState | null;
  /**
   * The panel subtitle's and the victory's total ("+2 fish · Your total: 14"): the server's, from this win's answer,
   * else its last known one (audit B9 / A-H1, H-4: queued fish are never added in; see panelWaiting).
   */
  panelTotal(): number;
  /** Fish waiting to be sent (the queue; the "+3 waiting" my row shows), shown after the total; 0 = none. */
  panelWaiting(): number;
  /** The panel's extra props: the bracket list factory, hearts and the info button. */
  panelExtras(): {
    bracketList?: BracketListFactory;
    onHeart(slot: number): void;
    onInfo(): void;
    /** Leaderboard update: the rank-up's start (my place and fish before this win). */
    climbFrom: { readonly bracketId: string | null; readonly rank: number | null; readonly points: number } | null;
  };
  /** My bracket's points before this win (the period counter's before value), else 0. */
  counterBefore(): number;
  /**
   * Leaderboard update (the rank-up animation): my place and fish in my running bracket when this win was made, as
   * the server last said; null when there was no running bracket (the row then rises from below the list).
   */
  panelBefore(): { readonly bracketId: string; readonly rank: number | null; readonly points: number } | null;
  chip(): LadderChipView;
  /** Home mounted: a throttled refresh, a queue flush and the next result card. */
  homeMounted(): void;
  openSheet(from: 'home' | 'settings', view?: 'list' | 'info'): void;
  /** Home's profile picture: opens the name sheet; false when there is no ranking name to edit. */
  openProfile(): boolean;
  settingsRows(): SettingsLadderRows | undefined;
  /** dayStreak.serverSkewCheck: false while the device clock is off by more than dayStreak.maxSkewMs. */
  streakClockOk(): boolean;
  /** Prefetches the lazy `ladder` chunk (Home idle, a scored board's mount). */
  prefetchChunk(): void;
  /** e2e hook (window.__mewdoku.ladder()). */
  debug(): { active: boolean; signedIn: boolean; pending: number; current: LadderRecord['current'] };
  dispose(): void;
}

interface WinState {
  readonly ref: LadderWinRef;
  readonly at: number;
  /** My running bracket's place and fish at the win (the rank-up animation's start). */
  readonly before: { readonly bracketId: string; readonly rank: number | null; readonly points: number } | null;
  state: 'sending' | 'answered' | 'failed';
  view: BracketView | null;
  gained: number | null;
}

type AuthState = 'idle' | 'signing' | 'ok' | 'no_api' | 'rejected' | 'disabled' | 'suspended' | 'error' | 'old';

interface CachedRows {
  readonly view: BracketView;
  /** Device clock of the answer. */
  readonly at: number;
  readonly offset: number;
  readonly rules: RulesView | null;
}

const modeOf = (puzzleId: string): ModeId => (puzzleId.startsWith('D') ? 'daily' : puzzleId.startsWith('E') ? 'event' : 'level');

export function createLadderFlow(deps: LadderFlowDeps): LadderFlow {
  const c = deps.config ?? cfg;
  const { client, store, bus, clock } = deps;
  let auth: AuthState = 'idle';
  let session: SessionResponse | null = null;
  let rules: RulesView | null = null;
  let cached: CachedRows | null = null;
  let chunk: LadderChunk | null = null;
  let chunkP: Promise<LadderChunk | null> | null = null;
  let disposed = false;
  let flushing: Promise<void> | null = null;
  let backoffStep = 0;
  let retryTimer: TimerId | null = null;
  let lastHomeRefresh = -Infinity;
  /** Results known this page load (session results + an ended bracket's result), newest first. */
  let results: ResultView[] = [];
  /** The current win's submit, for the panel. */
  let win: WinState | null = null;
  /** The win whose ladder_panel row was logged (once per win). */
  let panelLogged: WinState | null = null;
  let heartLimit = false;
  let cardBusy = false;
  /**
   * The cached bracket came from a server answer of THIS page load and no call has failed since (requests-G3
   * R16; spec §2.4 States, §2.9): the sheet and the panel show it as current (no "Last updated", hearts on).
   * A cache read from storage at boot, a failed call (sign-in, submit, refresh), a win whose answer did not come
   * in time, the browser's offline event or a dropped cache make it stale again.
   */
  let cacheFresh = false;

  const save = (): SaveData => store.get().save;
  const updateSave = (fn: (s: SaveData) => SaveData): void =>
    store.update((s) => {
      const next = fn(s.save);
      return next === s.save ? s : { ...s, save: next };
    });
  const updateLadder = (fn: (l: LadderRecord) => LadderRecord): void => updateSave((s) => {
    const l = fn(s.ladder);
    return l === s.ladder ? s : { ...s, ladder: l };
  });
  const log = (e: AnalyticsEvent): void => bus.emit('analytics', e);
  const emit = (reason: LadderUpdateReason): void => bus.emit('ladder:update', { reason });
  const online = (): boolean => {
    try {
      return deps.online?.() ?? true;
    } catch {
      return true;
    }
  };
  const remoteOn = (): boolean => {
    try {
      return deps.remoteOn?.() ?? true;
    } catch {
      return true;
    }
  };
  const listed = (): boolean => save().ladder.listed;
  /** The server answers for this page load (not refused, disabled, suspended or too old). */
  const usable = (): boolean => remoteOn() && auth !== 'rejected' && auth !== 'disabled' && auth !== 'suspended' && auth !== 'no_api' && auth !== 'old';

  // ── the rows cache (memory + localStorage; dropped once endsAt passed) ──

  function loadCache(): void {
    try {
      const raw = deps.storage?.getItem(ROWS_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { view?: unknown; at?: unknown; offset?: unknown; rules?: unknown };
      if (typeof v.at !== 'number' || typeof v.offset !== 'number') return;
      // The rows are re-checked with the shared validator (a bad row is dropped, never repaired).
      const view = parseBracketView(v.view);
      if (!view || view.state !== 'open' || view.bracketId === null) return;
      const r = v.rules && typeof v.rules === 'object' ? (v.rules as RulesView) : null;
      cached = { view, at: v.at, offset: v.offset, rules: r && Array.isArray(r.places) && r.hearts && typeof r.hearts === 'object' ? r : null };
    } catch {
      cached = null;
    }
  }
  function storeCache(view: BracketView): void {
    if (view.state === 'none' || view.bracketId === null) return;
    cached = { view, at: clock.now(), offset: client.offsetMs(), rules };
    try {
      deps.storage?.setItem(ROWS_KEY, JSON.stringify(cached));
    } catch {
      // memory only
    }
  }
  function dropCache(): void {
    cached = null;
    cacheFresh = false;
    try {
      deps.storage?.removeItem(ROWS_KEY);
    } catch {
      // nothing stored
    }
  }
  /** The cached bracket while it is still running (server clock), else null (and dropped). */
  function liveCache(): CachedRows | null {
    if (!cached) return null;
    const endsAt = cached.view.endsAt;
    if (endsAt === null || endsAt <= clock.now() + cached.offset) {
      dropCache();
      return null;
    }
    const cur = save().ladder.current;
    if (cur && cur.bracketId !== cached.view.bracketId) return null; // a newer bracket answered elsewhere
    return cached;
  }

  // ── answers ──

  function applyView(view: BracketView | null): void {
    const now = clock.now();
    if (view) {
      const cur = currentFrom(view, now);
      updateLadder((l) => ({ ...l, current: cur }));
      if (view.state === 'open') {
        storeCache(view);
        cacheFresh = true;
      }
      if (view.result && !results.some((r) => r.bracketId === view.result?.bracketId)) results = [view.result, ...results];
    }
  }

  function failureToAuth(code: LadderFailureCode): AuthState | null {
    switch (code) {
      case 'disabled':
        return 'disabled';
      case 'suspended':
        return 'suspended';
      case 'upgrade_required':
        return 'old';
      case 'bad_signature':
      case 'nonce_invalid':
      case 'nonce_replay':
      case 'signature_stale':
      case 'web_disabled':
      case 'origin_not_allowed':
        return 'rejected';
      case 'no_api':
        return 'no_api';
      default:
        return null;
    }
  }

  function noteFailure(code: LadderFailureCode): void {
    cacheFresh = false;
    const a = failureToAuth(code);
    if (a) {
      auth = a;
      if (a === 'suspended') emit('offline');
    }
  }

  function scheduleRetry(retryAfterMs?: number): void {
    if (disposed || retryTimer !== null || !usable()) return;
    const steps = c.ladder.backoffMs;
    if (backoffStep >= steps.length && retryAfterMs === undefined) return; // wait for the next win or Home
    const wait = retryAfterMs ?? steps[Math.min(backoffStep, steps.length - 1)] ?? 30_000;
    backoffStep++;
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      void flush('retry');
    }, wait);
  }

  /** Sends the queue (oldest first) in calls of ≤ batchMax; never rejects. */
  function flush(_why: string): Promise<void> {
    if (flushing) return flushing;
    // The run may finish without awaiting anything (an empty queue): `flushing` is cleared in a .finally
    // callback, which always runs after this assignment (a try/finally inside would run before it and
    // leave a settled promise in `flushing` for good).
    const run = (async () => {
      {
        if (!usable() || !listed() || noticePending()) return;
        if (auth !== 'ok') {
          await start();
          if ((auth as AuthState) !== 'ok') return;
        }
        // Aged wins are dropped (spec §2.9).
        const before = save().ladder.pending;
        updateLadder((l) => pruneAged(l, clock.now(), c));
        for (const w of before) {
          if (!save().ladder.pending.some((p) => p.winId === w.winId)) log({ name: 'ladder_submit', params: { mode: modeOf(w.puzzleId), result: 'dropped', reason: 'age', ms: 0 } });
        }
        let guard = 0;
        while (guard++ < 10 && !disposed) {
          const batch = sendable(save().ladder, clock.now(), c).slice(0, Math.max(1, Math.min(c.ladder.batchMax, session?.limits.maxWinsPerRequest ?? c.ladder.batchMax)));
          if (batch.length === 0) break;
          const started = clock.now();
          const timeout = win && win.state === 'sending' ? Math.max(c.ladder.timeoutMs, c.ladder.panelWaitMs) : c.ladder.timeoutMs;
          const r = await client.submitWins(batch.map(wireWin), timeout);
          const ms = Math.max(0, clock.now() - started);
          if (!r.ok) {
            if (r.code === 'bad_request' || (r.code === 'too_large' && batch.length === 1)) {
              // A client bug: drop the batch so it never loops (logged, never shown).
              const ids = new Set(batch.map((w) => w.winId));
              updateLadder((l) => ({ ...l, pending: l.pending.filter((w) => !ids.has(w.winId)) }));
              for (const w of batch) log({ name: 'ladder_submit', params: { mode: modeOf(w.puzzleId), result: 'error', reason: r.code, ms } });
              deps.saves.touch();
              continue;
            }
            noteFailure(r.code);
            for (const w of batch) log({ name: 'ladder_submit', params: { mode: modeOf(w.puzzleId), result: 'error', reason: r.code, ms } });
            if (win && win.state === 'sending') {
              win.state = 'failed';
              emit('offline');
            }
            if (r.code === 'rate_limited' || r.code === 'unavailable' || r.code === 'network' || r.code === 'timeout') scheduleRetry(r.retryAfterMs);
            return;
          }
          backoffStep = 0;
          // A counted win marks my row "online" on the server (presence).
          presenceSent = 'online';
          presenceSentAt = clock.now();
          const answered = r.value;
          updateLadder((l) => applyVerdicts(l, answered.results));
          for (const res of answered.results) {
            const w = batch.find((x) => x.winId === res.winId);
            const result =
              res.verdict === 'accepted'
                ? 'accepted'
                : res.verdict === 'accepted_flagged'
                  ? 'flagged'
                  : res.verdict === 'duplicate'
                    ? 'duplicate'
                    : res.verdict === 'already_counted'
                      ? 'counted_before'
                      : 'rejected';
            log({ name: 'ladder_submit', params: { mode: w ? modeOf(w.puzzleId) : 'level', result, reason: res.reason ?? '', ms } });
            if (win && win.ref.winId === res.winId) win.gained = res.points;
          }
          applyView(answered.bracket);
          if (win && win.state === 'sending' && (win.ref.winId === null || answered.results.some((x) => x.winId === win?.ref.winId) || !save().ladder.pending.some((p) => p.winId === win?.ref.winId))) {
            win.state = 'answered';
            win.view = answered.bracket;
          }
          deps.saves.touch();
          emit('wins');
          // Wins the server did not answer stay (they are sent again later, never in a loop).
          if (answered.results.length < batch.length) break;
        }
        if (win && win.state === 'sending') {
          win.state = 'answered';
          emit('wins');
        }
      }
    })();
    const p: Promise<void> = run.catch(() => undefined).finally(() => {
      if (flushing === p) flushing = null;
    });
    flushing = p;
    return p;
  }

  // ── the notice before the first submit (ladder.noticeFirst; spec §2.5, §7.8, G-SRV-3) ──

  /** ladder.noticeFirst and the notice not acknowledged yet: nothing leaves the device (no sign-in, no submit). */
  const noticePending = (): boolean => c.ladder.noticeFirst && !save().ladder.noticeSeen;
  let noticeOpen = false;
  /**
   * Opens the info view as a one-time dialog (OK only) where a result card could open (Home, no modal, not
   * in the tutorial). OK (or Esc) acknowledges it: saved, then the sign-in and the first flush follow.
   */
  function openNotice(): boolean {
    if (disposed || !noticePending() || noticeOpen || !deps.canOpenCard()) return false;
    noticeOpen = true;
    void loadChunk();
    deps.router.open('ladder', {
      ...sheetProps('info', true),
      onClose: () => {
        deps.router.close('ladder');
        acknowledgeNotice();
      },
    });
    return true;
  }
  function acknowledgeNotice(): void {
    noticeOpen = false;
    if (!noticePending()) return;
    updateLadder((l) => ({ ...l, noticeSeen: true }));
    deps.saves.touch();
    emit('session');
    void start()
      .then(() => flush('notice'))
      .then(() => nextCard());
  }

  // ── sign-in (boot step 8) ──

  let starting: Promise<void> | null = null;
  function start(): Promise<void> {
    if (disposed || !remoteOn()) return Promise.resolve();
    if (noticePending()) {
      // ladder.noticeFirst: the notice comes first (opened here when Home shows, else at the next Home).
      openNotice();
      return Promise.resolve();
    }
    // Not listed ("Show me in rankings" off, or after Delete my ranking data): nothing leaves the device,
    // not even a sign-in — a sign-in would re-create a deleted player on the server. Switching it on
    // again signs in (setListed).
    if (!listed()) return Promise.resolve();
    if (auth === 'ok' && client.signedIn()) return Promise.resolve();
    if (auth === 'rejected' || auth === 'disabled' || auth === 'suspended' || auth === 'no_api' || auth === 'old') return Promise.resolve();
    starting ??= (async () => {
      auth = 'signing';
      const r = await client.signIn();
      if (!r.ok) {
        cacheFresh = false;
        const a = failureToAuth(r.code);
        auth = a ?? 'error';
        const result = r.code === 'no_api' ? 'no_api' : r.code === 'timeout' ? 'timeout' : r.code === 'disabled' ? 'disabled' : a === 'rejected' || a === 'old' || a === 'suspended' ? 'rejected' : 'error';
        log({ name: 'ladder_auth', params: { platform: deps.platformId, result } });
        emit('offline');
        return;
      }
      // adopt() ran already (the client's onSignIn); it set auth.
      log({ name: 'ladder_auth', params: { platform: deps.platformId, result: 'ok' } });
    })().finally(() => {
      starting = null;
    });
    return starting;
  }

  /**
   * Every successful session (the flow's sign-in, and the client's implicit one after a 401 — e.g. after an
   * email deletion request the next call signs in as a fresh player): the server is the source of truth for
   * the name, the picture, the code and "Show me in rankings"; my bracket's numbers (no rows); the results
   * (cards, the claim repair).
   */
  function adopt(sr: SessionResponse): void {
    if (disposed) return;
    const fresh = session !== null && session.player.code !== sr.player.code;
    session = sr;
    rules = sr.rules;
    results = [...sr.results].sort((a, b) => b.endedAt - a.endedAt);
    auth = sr.player.status === 'suspended' ? 'suspended' : 'ok';
    if (fresh) {
      // Another player now (my data was deleted on the server): nothing of the old one is shown again.
      win = null;
      dropCache();
    }
    const p = sr.player;
    updateLadder((l) => ({ ...l, listed: p.listed, me: { name: p.nickname, avatarId: p.avatarId, code: p.code } }));
    const b = sr.bracket;
    if (b && b.state !== 'none' && b.bracketId !== null && b.endsAt !== null) {
      updateLadder((l) => ({
        ...l,
        current: {
          bracketId: b.bracketId as string,
          endsAt: b.endsAt as number,
          serverOffsetMs: client.offsetMs(),
          fetchedAt: clock.now(),
          points: b.points,
          rank: b.rank,
          members: b.members,
          maxMembers: l.current?.maxMembers ?? sr.rules.maxMembers,
        },
      }));
    } else if (b && b.state === 'none') updateLadder((l) => ({ ...l, current: null }));
    repairClaims();
    deps.saves.touch();
    emit('session');
    // The sign-in marked my row "online" on the server; the next ping is due one interval from now.
    presenceSent = 'online';
    presenceSentAt = clock.now();
    schedulePresence();
  }
  const offSignIn = client.onSignIn((sr) => adopt(sr));

  /** §1.6 / §2.6 step 5: a claim the server has but this device's ledger lacks is applied once. */
  function repairClaims(): void {
    const missing = claimsToRepair(save().ladder, results);
    if (missing.length === 0) return;
    for (const claim of missing) {
      updateSave((s) => ({
        ...s,
        stock: { hints: s.stock.hints + claim.grant.hints, kitties: s.stock.kitties + claim.grant.kitties },
        ladder: recordClaim(s.ladder, claim, c),
      }));
    }
    deps.saves.critical();
    const s = save();
    bus.emit('stock', { hints: s.stock.hints, kitties: s.stock.kitties });
  }

  // ── the chunk ──

  function loadChunk(): Promise<LadderChunk | null> {
    if (chunk) return Promise.resolve(chunk);
    chunkP ??= deps
      .loadChunk()
      .then((m) => {
        chunk = m;
        if (!m) chunkP = null;
        else emit('bracket'); // the panel can now render its rows
        return m;
      })
      .catch(() => {
        chunkP = null;
        return null;
      });
    return chunkP;
  }

  // ── views ──

  function rulesView(): LadderRulesView | null {
    const r = rules ?? cached?.rules ?? null;
    if (!r) return null;
    return {
      periodMode: r.periodMode,
      maxMembers: r.maxMembers,
      minMembers: r.minMembers,
      doubleByVideo: r.doubleByVideo,
      heartsEnabled: r.hearts.enabled,
      paidPlaces: r.places.length,
      // The info view's "lasts N hours" line comes from the server's rule (requests-G3 R10).
      durationMs: r.durationMs,
    };
  }

  function listView(view: BracketView, stale: { at: number } | null, offsetMs: number): BracketListView {
    const r = rules ?? cached?.rules ?? null;
    const heartsOn = r?.hearts.enabled ?? false;
    const allowSelf = r?.hearts.allowSelf ?? true;
    const on = online() && !stale;
    const rows: BracketRowView[] = view.rows.map((row) => ({
      rank: row.rank,
      slot: row.slot,
      name: row.nickname,
      avatarId: row.avatarId,
      points: row.points,
      hearts: row.hearts,
      me: row.me,
      likedByMe: row.likedByMe,
      heartEnabled: heartsOn && on && !heartLimit && !row.likedByMe && (allowSelf || !row.me),
      // Leaderboard update: the server's activity on the device clock (null: no status shown).
      seenAt: c.ladder.presence.enabled && row.seenAt !== null ? row.seenAt - offsetMs : null,
      playing: c.ladder.presence.enabled && row.playing,
    }));
    const paidPlaces = r?.places.length ?? 0;
    const minMembers = r?.minMembers ?? 0;
    const me = save().ladder.me;
    // "+3 hearts from other players" (ladder.heartsNotify): the server counts the hearts since my last
    // bracket read and resets the count with each read, so every answer that carries some is new; a cached
    // (stale) view never repeats it.
    const heartsNew = c.ladder.heartsNotify && view.heartsNew > 0 && !stale ? view.heartsNew : 0;
    const firstLine = !save().ladder.nickLineSeen && me && view.me ? me.name : null;
    return {
      bracketId: view.bracketId as string,
      rows,
      members: view.members,
      endsAt: view.endsAt === null ? null : view.endsAt - offsetMs,
      final: view.final,
      rewardsLine: paidPlaces === 0 ? 'none' : view.members < minMembers ? 'min' : 'places',
      paidPlaces,
      minMembers,
      heartsNew,
      waiting: waitingFish(save().ladder),
      stale,
      firstLineName: firstLine,
      panelRows: c.ladder.panelRows,
      hearts: heartsOn,
      now: () => clock.now(),
    };
  }

  /** The records note of the current state (spec §2.9). */
  function recordsReason(): RecordsReason {
    if (!listed()) return 'opted_out';
    if (auth === 'suspended') return 'paused';
    return 'unavailable';
  }

  function markNickLineSeen(): void {
    if (save().ladder.nickLineSeen || !save().ladder.me) return;
    updateLadder((l) => ({ ...l, nickLineSeen: true }));
    deps.saves.touch();
  }

  function currentList(): { list: BracketListView; stale: boolean } | null {
    // requests-G3 R16: the cache holds the NEWEST answer (every answer with an open bracket is stored, the win's
    // own included); it is current while it came from this page load and no call failed since, else it is the
    // stale view ("Last updated …", hearts off). The win's answer is used only when it was not cached (a bracket
    // that is no longer open).
    const live = liveCache();
    if (live) {
      if (cacheFresh && online()) return { list: listView(live.view, null, live.offset), stale: false };
      return { list: listView(live.view, { at: live.at }, live.offset), stale: true };
    }
    const fresh = win?.view ?? null;
    if (fresh && fresh.state !== 'none' && fresh.bracketId !== null && win?.state === 'answered') {
      return { list: listView(fresh, null, client.offsetMs()), stale: false };
    }
    return null;
  }

  // ── hearts (spec §2.8) ──

  async function heart(slot: number): Promise<void> {
    const src = win?.view && win.view.bracketId ? win.view : liveCache()?.view ?? null;
    if (!src || src.bracketId === null) return;
    const row = src.rows.find((r) => r.slot === slot);
    if (!row || row.likedByMe) return;
    const bracketId = src.bracketId;
    const patch = (hearts: number, liked: boolean): void => {
      const fix = (v: BracketView): BracketView => ({
        ...v,
        rows: v.rows.map((r) => (r.slot === slot ? { ...r, hearts, likedByMe: liked } : r)),
        me: v.me && v.me.slot === slot ? { ...v.me, hearts, likedByMe: liked } : v.me,
      });
      if (win?.view && win.view.bracketId === bracketId) win.view = fix(win.view);
      if (cached && cached.view.bracketId === bracketId) cached = { ...cached, view: fix(cached.view) };
      emit('heart');
      refreshOpenSheet();
    };
    patch(row.hearts + 1, true); // optimistic
    const r = await client.heart(bracketId, slot);
    const self: 0 | 1 = row.me ? 1 : 0;
    if (r.ok) {
      patch(r.value.hearts, true);
      log({ name: 'heart_give', params: { result: 'ok', self } });
      if (rules && r.value.givenInBracket >= rules.hearts.maxGivenPerBracket) heartLimit = true;
      return;
    }
    if (r.code === 'heart_exists') {
      log({ name: 'heart_give', params: { result: 'exists', self } });
      return; // stays pressed, silently
    }
    if (r.code === 'heart_limit') {
      heartLimit = true;
      patch(row.hearts, false);
      log({ name: 'heart_give', params: { result: 'limit', self } });
      return;
    }
    patch(row.hearts, false);
    log({ name: 'heart_give', params: { result: 'error', self } });
    if (r.code !== 'not_member') deps.router.toast(t('ladder.heart.error'));
  }

  // ── the result cards (spec §2.6) ──

  function serverNow(): number {
    return client.serverNow();
  }

  function cardFor(r: ResultView): LadderResultProps['case'] {
    if (r.reward) return 'paid';
    const paid = rules?.places.length ?? 0;
    return r.place <= paid ? 'too_few' : 'none';
  }

  function applyClaim(res: ClaimResponse): void {
    updateSave((s) => {
      if (recordClaim(s.ladder, res, c) === s.ladder) return s; // already applied (the ledger)
      return {
        ...s,
        stock: { hints: s.stock.hints + res.grant.hints, kitties: s.stock.kitties + res.grant.kitties },
        ladder: recordClaim(s.ladder, res, c),
      };
    });
    deps.saves.critical();
    const s = save();
    bus.emit('stock', { hints: s.stock.hints, kitties: s.stock.kitties });
    // The result now carries its claim (no card again this page load).
    results = results.map((x) =>
      x.reward && x.reward.rewardId === res.rewardId
        ? { ...x, reward: { ...x.reward, claim: { rewardId: res.rewardId, grant: res.grant, doubled: res.doubled, claimedAt: res.claimedAt } } }
        : x,
    );
    emit('claim');
  }

  async function claim(r: ResultView, double: boolean): Promise<'ok' | 'error'> {
    const reward = r.reward;
    if (!reward) return 'error';
    const res = await client.claim(reward.rewardId, double);
    if (res.ok) {
      applyClaim(res.value);
      log({ name: 'ladder_claim', params: { result: 'ok', doubled: res.value.doubled ? 1 : 0 } });
      return 'ok';
    }
    log({ name: 'ladder_claim', params: { result: 'error', doubled: double ? 1 : 0 } });
    return 'error';
  }

  function openCard(r: ResultView): void {
    const reward = r.reward;
    const caseOf = cardFor(r);
    const canDouble = !!reward && reward.canDouble && (rules?.doubleByVideo ?? false) && deps.rewardedAvailable();
    updateLadder((l) => markResultSeen(l, r.bracketId, c));
    deps.saves.touch();
    log({ name: 'ladder_result', params: { rank: r.place, size: r.members, rewarded: reward ? 1 : 0 } });
    let busy = false;
    const props = (): LadderResultProps => ({
      case: caseOf,
      place: r.place,
      members: r.members,
      reward: reward ? { hints: reward.grant.hints, kitties: reward.grant.kitties } : null,
      canDouble,
      paidPlaces: rules?.places.length ?? 0,
      busy,
      onCollect: () => void collect(false),
      onDouble: () => void collect(true),
      onClose: () => deps.router.close('ladder_result'),
    });
    const setBusy = (on: boolean): void => {
      busy = on;
      cardBusy = on;
      if (deps.router.isOpen('ladder_result')) deps.router.update('ladder_result', props());
    };
    async function collect(double: boolean): Promise<void> {
      if (busy || !reward) return;
      setBusy(true);
      try {
        if (double && !save().ladder.doubleWatched.includes(reward.rewardId)) {
          const watched = await deps.watchDouble();
          if (!watched) {
            log({ name: 'ladder_claim', params: { result: 'video_failed', doubled: 1 } });
            deps.router.toast(t('rewarded.noVideo'));
            return; // the card stays
          }
          updateLadder((l) => markDoubleWatched(l, reward.rewardId, c));
          deps.saves.critical();
        }
        const out = await claim(r, double);
        if (out === 'ok') {
          deps.router.toast(t('ladder.claimed'));
          deps.router.close('ladder_result');
        } else {
          deps.router.toast(t('ladder.claim.error'));
          deps.router.close('ladder_result');
        }
      } finally {
        setBusy(false);
      }
    }
    deps.router.open('ladder_result', props());
  }

  /** One card per Home visit, newest first; past ladder.maxResultCards the older rewards are collected without ×2. */
  async function nextCard(): Promise<void> {
    if (cardBusy || !deps.canOpenCard()) return;
    const waiting = resultsToShow(save().ladder, results, c, serverNow());
    if (waiting.length === 0) return;
    const max = Math.max(1, c.ladder.maxResultCards);
    if (waiting.length > max) {
      let any = false;
      for (const r of waiting.slice(max)) {
        if (!r.reward) {
          updateLadder((l) => markResultSeen(l, r.bracketId, c));
          continue;
        }
        if ((await claim(r, false)) === 'ok') any = true;
      }
      deps.saves.touch();
      if (any) deps.router.toast(t('ladder.claimed'));
    }
    if (!deps.canOpenCard()) return;
    const first = resultsToShow(save().ladder, results, c, serverNow())[0];
    if (first) {
      await loadChunk();
      if (deps.canOpenCard()) openCard(first);
    }
  }

  // ── the sheet, the name sheet, Settings ──

  let sheetView: LadderSheetProps['view'] = 'list';
  function sheetProps(view: LadderSheetProps['view'], infoOnly = false): LadderSheetProps {
    const cl = view === 'records' ? null : currentList();
    if (cl) markNickLineSeen();
    const live = active();
    return {
      view: live || view === 'info' ? view : 'records',
      list: cl ? cl.list : null,
      records: deps.records(),
      rules: rulesView(),
      infoOnly,
      reducedMotion: store.get().ui.reducedMotion,
      recordsReason: live ? recordsReason() : listed() ? (auth === 'suspended' ? 'paused' : 'unavailable') : 'opted_out',
      streakBest: save().dayStreak.best,
      onHeart: (slot) => void heart(slot),
      onEditName: () => openNameSheet(),
      onClose: () => deps.router.close('ladder'),
    };
  }
  function refreshOpenSheet(): void {
    if (deps.router.isOpen('ladder')) deps.router.update('ladder', sheetProps(sheetView));
  }

  function openNameSheet(): void {
    const p = session?.player;
    const me = save().ladder.me;
    if (!p && !me) return;
    void loadChunk().then((m) => {
      if (!m) {
        deps.router.toast(t('toast.error'));
        return;
      }
      const words = m.NICK_WORDS_V1;
      const nick = p?.nick ?? { adj: 0, noun: 0, num: NICK_NUM_MIN };
      let current: NicknamePick = { adj: nick.adj, noun: nick.noun, num: nick.num, avatarId: p?.avatarId ?? me?.avatarId ?? 0 };
      let state: NicknameSheetProps['state'] = online() ? 'idle' : 'offline';
      let cooldownUntil: number | null = null;
      const rand = deps.random ?? Math.random;
      const props = (): NicknameSheetProps => ({
        words,
        current,
        avatarCount: AVATAR_COUNT,
        numMin: NICK_NUM_MIN,
        numMax: NICK_NUM_MAX,
        state,
        cooldownUntil,
        now: () => clock.now(),
        shuffle: () => {
          const s = shufflePick(words, rand, m.RETIRED_V1, current);
          return { ...s, avatarId: current.avatarId };
        },
        onSave: (pick) => void saveName(pick),
        onClose: () => deps.router.close('nickname'),
      });
      const update = (): void => {
        if (deps.router.isOpen('nickname')) deps.router.update('nickname', props());
      };
      async function saveName(pick: NicknamePick): Promise<void> {
        if (state === 'saving') return;
        const nameChanged = pick.adj !== nick.adj || pick.noun !== nick.noun || pick.num !== nick.num;
        const avatarChanged = pick.avatarId !== (p?.avatarId ?? me?.avatarId);
        state = 'saving';
        update();
        const r = await client.setProfile({
          ...(nameChanged ? { nickname: { adj: pick.adj, noun: pick.noun, num: pick.num } } : {}),
          ...(avatarChanged || !nameChanged ? { avatarId: pick.avatarId } : {}),
        });
        if (r.ok) {
          const pl = r.value.player;
          if (session) session = { ...session, player: pl };
          updateLadder((l) => ({ ...l, me: { name: pl.nickname, avatarId: pl.avatarId, code: pl.code } }));
          deps.saves.touch();
          log({ name: 'nick_set', params: { result: 'ok', avatar: avatarChanged ? 1 : 0 } });
          deps.router.toast(t('nick.saved'));
          deps.router.close('nickname');
          // The name and picture in open brackets changed on the server: re-read the bracket.
          lastHomeRefresh = -Infinity;
          void refreshBracket();
          emit('profile');
          return;
        }
        current = pick;
        if (r.code === 'nickname_cooldown') {
          state = 'cooldown';
          const at = session?.player.nicknameChangeAt ?? null;
          cooldownUntil = at === null ? null : at - client.offsetMs();
          log({ name: 'nick_set', params: { result: 'cooldown', avatar: avatarChanged ? 1 : 0 } });
        } else if (r.code === 'nickname_invalid' || r.code === 'nickname_blocked' || r.code === 'avatar_invalid') {
          state = 'rejected';
          log({ name: 'nick_set', params: { result: 'rejected', avatar: avatarChanged ? 1 : 0 } });
        } else {
          state = r.code === 'network' || r.code === 'timeout' ? 'offline' : 'idle';
          log({ name: 'nick_set', params: { result: 'error', avatar: avatarChanged ? 1 : 0 } });
          if (state === 'idle') deps.router.toast(t('toast.error'));
        }
        update();
      }
      deps.router.open('nickname', props());
    });
  }

  async function setListed(on: boolean): Promise<void> {
    if (!online()) return;
    const r = await client.setProfile({ listed: on });
    if (!r.ok) {
      deps.router.toast(t('settings.ladder.offline'));
      emit('listed');
      return;
    }
    updateLadder((l) => ({ ...l, listed: r.value.player.listed }));
    if (session) session = { ...session, player: r.value.player };
    deps.saves.touch();
    log({ name: 'ladder_listed', params: { on: on ? 1 : 0 } });
    if (on) void flush('listed');
    emit('listed');
  }

  async function deleteData(): Promise<void> {
    if (!online()) return;
    const r = await client.deleteMe();
    if (!r.ok) {
      log({ name: 'ladder_delete', params: { result: 'error' } });
      deps.router.toast(t('settings.ladder.offline'));
      return;
    }
    log({ name: 'ladder_delete', params: { result: 'ok' } });
    client.signOut();
    session = null;
    results = [];
    win = null;
    auth = 'idle';
    dropCache();
    updateLadder((l) => afterDelete(l, c));
    deps.saves.critical();
    deps.router.toast(t('settings.ladder.deleted'));
    emit('deleted');
  }

  async function refreshBracket(): Promise<void> {
    if (auth !== 'ok' || !listed() || !usable()) return;
    const now = clock.now();
    if (now - lastHomeRefresh < c.ladder.homeRefreshMs) return;
    lastHomeRefresh = now;
    const r = await client.bracket();
    if (!r.ok) {
      noteFailure(r.code);
      return; // Home keeps its cached values, never an error text
    }
    applyView(r.value);
    if (r.value.state === 'none') updateLadder((l) => ({ ...l, current: null }));
    deps.saves.touch();
    emit('bracket');
    // A sheet opened while this request was in flight drew the cached view; show the answer now.
    refreshOpenSheet();
  }

  function active(): boolean {
    return (
      remoteOn() &&
      listed() &&
      !noticePending() &&
      auth !== 'suspended' &&
      auth !== 'rejected' &&
      auth !== 'disabled' &&
      auth !== 'no_api' &&
      auth !== 'old'
    );
  }

  // ── presence (leaderboard update: "Online now" / "Playing now" on my row for the other members) ──

  /** What I am doing: 'playing' while a scored board is up, else 'online'. */
  let presenceState: PresenceState = 'online';
  /** The state the server last got from me (a ping, a sign-in or a wins answer) and when. */
  let presenceSent: PresenceState | null = null;
  let presenceSentAt = -Infinity;
  let presenceTimer: TimerId | null = null;
  let presenceBusy = false;
  /** The page is hidden or FB paused it: no pings (the row then ages into "2m ago"). */
  let presencePaused = false;

  /** Pings make sense: presence on, the ranking usable and signed in, and a running bracket of mine to mark. */
  function presenceOn(): boolean {
    return c.ladder.presence.enabled && !disposed && !presencePaused && active() && usable() && auth === 'ok' && isRunning(save().ladder.current, clock.now());
  }

  function schedulePresence(): void {
    clock.clearTimeout(presenceTimer);
    presenceTimer = null;
    if (!presenceOn()) return;
    const wait = Math.max(1000, presenceSentAt + c.ladder.presence.pingMs - clock.now());
    presenceTimer = clock.setTimeout(() => {
      presenceTimer = null;
      pingPresence();
    }, wait);
  }

  /** Sends my state when it changed or the last one is ping-old; never retries in a loop (the next tick does). */
  function pingPresence(): void {
    if (!presenceOn()) return;
    const now = clock.now();
    const due = presenceSent !== presenceState || now - presenceSentAt >= c.ladder.presence.pingMs;
    if (due && !presenceBusy) {
      const st = presenceState;
      presenceBusy = true;
      presenceSent = st;
      presenceSentAt = now;
      void client
        .presence(st)
        .then((r) => {
          // A failure is silent (the row just ages); the session-level codes still reach the flow's state.
          if (!r.ok && failureToAuth(r.code)) noteFailure(r.code);
        })
        .finally(() => {
          presenceBusy = false;
        });
    }
    schedulePresence();
  }

  function setPresence(st: PresenceState): void {
    presenceState = st;
    pingPresence();
  }

  const SCORED_MODES: readonly ModeId[] = ['level', 'daily', 'event'];
  const offGameStart = bus.on('game:start', ({ state }) => {
    if (SCORED_MODES.includes(state.mode) && (state.status === 'ready' || state.status === 'playing')) setPresence('playing');
  });
  const offGameEnd = bus.on('game:end', () => setPresence('online'));
  const offPause = bus.on('pause', ({ reason }) => {
    if (reason !== 'hidden' && reason !== 'fb_pause') return;
    presencePaused = true;
    clock.clearTimeout(presenceTimer);
    presenceTimer = null;
  });
  const offResume = bus.on('resume', ({ reason }) => {
    if (reason !== 'hidden' && reason !== 'fb_pause') return;
    presencePaused = false;
    pingPresence();
  });

  // ── the "New ranking" card (leaderboard update: the sign-in joined me to a new bracket) ──

  function readSessionCard(): string | null {
    try {
      return deps.storage?.getItem(SESSION_CARD_KEY) ?? null;
    } catch {
      return null;
    }
  }
  let sessionCardShown: string | null = readSessionCard();

  /**
   * Once per bracket, on Home with nothing else open (result cards first): a running bracket with no fish of mine
   * yet, i.e. the sign-in joined it. Never for a bracket I joined with a win (I know it already).
   */
  function maybeSessionCard(): boolean {
    if (disposed || !c.ladder.newSessionCard || !c.ladder.autoJoin || !active() || cardBusy || !deps.canOpenCard()) return false;
    const cur = save().ladder.current;
    if (!isRunning(cur, clock.now()) || cur.points > 0 || cur.bracketId === sessionCardShown) return false;
    sessionCardShown = cur.bracketId;
    try {
      deps.storage?.setItem(SESSION_CARD_KEY, cur.bracketId);
    } catch {
      // memory only: at most once per page load
    }
    void loadChunk().then((m) => {
      if (!m || !deps.canOpenCard()) return;
      const props: LadderSessionProps = {
        endsAt: cur.endsAt - cur.serverOffsetMs,
        now: () => clock.now(),
        avatarId: save().ladder.me?.avatarId ?? null,
        reducedMotion: store.get().ui.reducedMotion,
        onClose: () => deps.router.close('ladder_session'),
      };
      deps.router.open('ladder_session', props);
    });
    return true;
  }

  // ── the bus: flush when the device is online again ──
  const onOnline = (): void => void flush('online');
  const onOffline = (): void => {
    cacheFresh = false;
  };
  try {
    globalThis.addEventListener?.('online', onOnline);
    globalThis.addEventListener?.('offline', onOffline);
  } catch {
    // no window
  }

  loadCache();

  const flow: LadderFlow = {
    active,
    // The first flush follows a successful sign-in only (a failed one is tried again by the next trigger:
    // Home, a win, `online`), so a boot never signs in twice in a row.
    start: () => start().then(() => (auth === 'ok' ? flush('start') : undefined)),
    onWin(ref) {
      if (!active()) {
        // Not listed, paused, refused or switched off: the panel shows my records with the matching note
        // (spec §2.9) at once; nothing is sent (a queued win waits for the next usable session).
        win = { ref, at: clock.now(), state: 'failed', view: null, gained: null, before: null };
        panelLogged = null;
        return;
      }
      const cur = save().ladder.current;
      const before = isRunning(cur, clock.now()) ? { bracketId: cur.bracketId, rank: cur.rank, points: cur.points } : null;
      win = { ref, at: clock.now(), state: 'sending', view: null, gained: null, before };
      // The wins answer marks my row "online" on the server (the puzzle is over).
      presenceState = 'online';
      void loadChunk();
      void flush('win').then(() => {
        if (win && win.ref === ref && win.state === 'sending') {
          win.state = 'failed';
          cacheFresh = false;
          emit('offline');
        }
      });
      // The panel never waits longer than ladder.panelWaitMs after WON.
      const mine = win;
      clock.setTimeout(() => {
        if (win === mine && mine.state === 'sending') {
          mine.state = 'failed';
          cacheFresh = false;
          emit('offline');
        }
      }, c.ladder.panelWaitMs);
    },
    listState() {
      if (!win) return null;
      if (!listed()) return { kind: 'records', records: deps.records(), reason: 'opted_out' };
      if (auth === 'suspended') return { kind: 'records', records: deps.records(), reason: 'paused' };
      if (!active()) return { kind: 'records', records: deps.records(), reason: 'unavailable' };
      const shown = (state: 'bracket' | 'stale' | 'records' | 'loading', rows: number, rank: number): void => {
        if (panelLogged === win) return;
        panelLogged = win;
        log({ name: 'ladder_panel', params: { state, rows, rank, ms: Math.max(0, clock.now() - (win?.at ?? clock.now())) } });
      };
      if (win.state === 'sending' && clock.now() - win.at < c.ladder.panelWaitMs) return { kind: 'loading' };
      const cl = currentList();
      if (cl) {
        markNickLineSeen();
        const me = cl.list.rows.find((r) => r.me);
        shown(cl.stale ? 'stale' : 'bracket', cl.list.rows.length, me?.rank ?? 0);
        return { kind: 'bracket', view: cl.list };
      }
      shown('records', 0, 0);
      return { kind: 'records', records: deps.records(), reason: recordsReason() };
    },
    panelTotal() {
      const view = win?.view;
      if (win?.state === 'answered' && view?.me) return view.me.points;
      return counterOf(save().ladder, clock.now());
    },
    panelWaiting() {
      return waitingFish(save().ladder);
    },
    panelExtras() {
      return {
        ...(chunk ? { bracketList: chunk.createBracketList } : {}),
        onHeart: (slot: number) => void heart(slot),
        onInfo: () => flow.openSheet('home', 'info'),
        // A win with no running bracket before it comes in from below the list.
        climbFrom: win ? (win.before ?? { bracketId: null, rank: null, points: 0 }) : null,
      };
    },
    counterBefore: () => (active() ? counterOf(save().ladder, clock.now()) : 0),
    panelBefore: () => win?.before ?? null,
    chip() {
      if (!listed() || auth === 'suspended') return { state: 'off' };
      // No server (refused, or the sign-in failed) and no cached bracket still running: today's period pill (§2.5).
      if ((!usable() || auth === 'error') && !liveCache()) return { state: 'records', period: { kind: c.period.kind, total: 0 } };
      const cur = save().ladder.current;
      if (cur && isRunning(cur, clock.now())) {
        return { state: 'bracket', rank: cur.rank, members: cur.members, points: cur.points, endsAt: cur.endsAt - cur.serverOffsetMs, now: () => clock.now() };
      }
      return { state: 'join' };
    },
    homeMounted() {
      if (disposed) return;
      void loadChunk();
      if (noticePending()) {
        openNotice();
        return;
      }
      void (async () => {
        if (auth === 'idle' || auth === 'error') await start();
        await refreshBracket();
        await flush('home');
        await nextCard();
        maybeSessionCard();
        setPresence('online');
      })();
    },
    openSheet(from, view = 'list') {
      // ladder.noticeFirst: the notice first (its OK starts the ranking).
      if (noticePending() && openNotice()) return;
      log({ name: 'ladder_open', params: { from } });
      sheetView = view;
      void loadChunk();
      deps.router.open('ladder', sheetProps(view));
      void refreshBracket().then(() => refreshOpenSheet());
    },
    openProfile() {
      if (!session?.player && !save().ladder.me) return false;
      openNameSheet();
      return true;
    },
    settingsRows() {
      const me = save().ladder.me;
      if (auth === 'no_api' || auth === 'rejected' || auth === 'old') return undefined;
      // A listed player shows the rows once signed in (my name and code); a player who is not listed
      // (switched off, or after Delete) always gets them, so "Show me in rankings" can be turned on again —
      // without a player on the server the name is '' and the code null (requests-G1: G3 hides the name row).
      if (!me && listed()) return undefined;
      return {
        name: me?.name ?? '',
        code: me?.code ? formatPlayerCode(me.code) : null,
        listed: listed(),
        showListed: c.ladder.optOutAllowed,
        online: online() && usable(),
        onName: () => openNameSheet(),
        onListed: (on) => void setListed(on),
        onDelete: () => void deleteData(),
      };
    },
    streakClockOk() {
      if (!c.dayStreak.serverSkewCheck) return true;
      const at = client.lastServerAt();
      if (at === null || clock.now() - at > 86_400_000) return true;
      return Math.abs(client.offsetMs()) <= c.dayStreak.maxSkewMs;
    },
    prefetchChunk: () => void loadChunk(),
    debug: () => ({ active: active(), signedIn: client.signedIn(), pending: save().ladder.pending.length, current: save().ladder.current }),
    dispose() {
      disposed = true;
      offSignIn();
      clock.clearTimeout(retryTimer);
      clock.clearTimeout(presenceTimer);
      offGameStart();
      offGameEnd();
      offPause();
      offResume();
      try {
        globalThis.removeEventListener?.('online', onOnline);
        globalThis.removeEventListener?.('offline', onOffline);
      } catch {
        // no window
      }
    },
  };
  return flow;
}

/** For tests: the shape of a successful result. */
export type LadderOk<T> = Extract<LadderResult<T>, { ok: true }>;
