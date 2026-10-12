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
// 2026-10-12, D-2e-24 (H-9): the server's computer players are rows like any other (rendered as returned, never
// labelled one by one); rules.computerPlayers adds the disclosure line to the info view and How to play.
// A rejected win is dropped quietly. The token lives in the client's memory only; the cached ROWS (other
// players' names) live in memory and localStorage['mewdoku.ladder.rows.v1'] only, dropped once endsAt
// passed (an ended bracket's view, its final standings, in memory only: 2026-10-12); the save keeps my
// numbers only (save.ladder.current).
// Lazy: boot loads this module (with the client and the remote switches) only where the ranking origin is
// in use; web-prod never does (no request at all).
import { formatPlayerCode, type BracketView, type ClaimResponse, type ResultView, type RulesView, type SessionResponse, AVATAR_COUNT, NICK_NUM_MAX, NICK_NUM_MIN } from '../shared/rank-api';
import { parseBracketView } from '../shared/rank-api-parse';
import { wireWin } from '../game/ladder';
import {
  afterDelete,
  applyVerdicts,
  claimsToRepair,
  counterBefore as counterOf,
  counterBeforeWin,
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
  /**
   * 2026-10-12 (compare §D2): whether the server's answer counted this win's fish: true when it added points
   * (accepted, flagged, a duplicate of a counted win), false when it added none (rejected, already counted),
   * null while it has not answered for this win (sending, failed, queued, not sent).
   */
  winCounted(): boolean | null;
  /** The panel's extra props: the bracket list factory, hearts and the info button. */
  panelExtras(): { bracketList?: BracketListFactory; onHeart(slot: number): void; onInfo(): void };
  /** My bracket's points before this win (the period counter's before value), else 0. */
  counterBefore(): number;
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
  /** 2026-10-12, D-2e-24: the server's rules (or the cached ones) disclose computer players (How to play's line). */
  computerPlayers(): boolean;
  /** e2e hook (window.__mewdoku.ladder()). */
  debug(): { active: boolean; signedIn: boolean; pending: number; current: LadderRecord['current'] };
  dispose(): void;
}

interface WinState {
  readonly ref: LadderWinRef;
  readonly at: number;
  state: 'sending' | 'answered' | 'failed';
  view: BracketView | null;
  /** The points the server's answer gave this win (winCounted), even when it came after the panel gave up; null = none yet. */
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

/**
 * 2026-10-12 (review): the server finalises an ended bracket bracket.finalizeGraceMs (30 s, server/src/core/config.ts)
 * after its end, lazily on a read; inside that grace it answers 'ended' without `final` and without the result. A read
 * this long after the end (the grace plus a margin for the clocks) gets the final standings and the result card.
 */
const FINAL_AFTER_MS = 32_000;

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
  /** 2026-10-12 (verify D4): the bracket whose heart cap was reached; the cap is per bracket, so the next one has hearts again. */
  let heartLimitIn: string | null = null;
  /**
   * 2026-10-12 (compare §D3, verify C8): the server's view of my bracket after it ENDED (GET /v1/bracket answers it
   * for a day, `final` once finalised), with the offset of its answer. Memory only: the stored rows cache keeps
   * open brackets alone. Shown while it is still my bracket (save.ladder.current), so "Final results" stands over
   * the server's standings, never over the win-time ones.
   */
  let endedView: { readonly view: BracketView; readonly offset: number } | null = null;
  /** 2026-10-12 (review): the one re-read after the finalising grace (scheduleFinalRead), and the bracket it is for. */
  let finalTimer: TimerId | null = null;
  let finalTimerFor: string | null = null;
  /**
   * 2026-10-12 (verify C9): the last call failed for want of a network (fetch rejected) or the browser went
   * offline; any answer clears it. Only then (or with navigator.onLine false) does a stale list add "You're
   * offline" — a 503, a timeout or a boot from the stored cache show "Last updated hh:mm" alone.
   */
  let netDown = false;
  /**
   * 2026-10-12 (verify C9): "+N hearts from other players" once per arrival. The server resets its count with each
   * read, so unseen counts add up; the display that shows the line first (a win's panel, an opened sheet) keeps it
   * while it re-renders, and no later display repeats it.
   */
  let heartsNote: { readonly bracketId: string; readonly n: number; shownBy: object | null } | null = null;
  /** 2026-10-12 (verify C9): the display that showed the first-time name line (it keeps it while open). */
  let nickLineBy: object | null = null;
  /** The ranking sheet opened last (a display for the once-only lines while it shows its list). */
  let sheetDisplay: object = {};
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
      } else if (view.bracketId !== null) {
        // 2026-10-12 (compare §D3): 'ended' (a bracket id and not open): the server's standings of the ended
        // bracket replace its open copy.
        endedView = { view, offset: client.offsetMs() };
        if (cached && cached.view.bracketId === view.bracketId) dropCache();
        // 2026-10-12 (review): read inside the server's finalising grace (the chip's 00:00:00): not final yet.
        if (!view.final && view.endsAt !== null) scheduleFinalRead(view.bracketId, view.endsAt - client.offsetMs());
      }
      if (view.heartsNew > 0 && view.bracketId !== null) {
        // 2026-10-12: added to the hearts not shown yet; once shown, a later arrival starts a new line.
        const h = heartsNote;
        heartsNote = { bracketId: view.bracketId, n: view.heartsNew + (h && h.bracketId === view.bracketId && !h.shownBy ? h.n : 0), shownBy: null };
      }
      if (view.result && !results.some((r) => r.bracketId === view.result?.bracketId)) results = [view.result, ...results];
    }
  }

  /**
   * 2026-10-12 (review): once per bracket, a re-read after its finalising grace (FINAL_AFTER_MS from `endAt`, device
   * clock) when its ended view came without the final standings, so a player waiting on Home after the chip's
   * 00:00:00 gets them and the result card. Off Home it reads nothing: the next Home mount does (endedReadDue).
   */
  function scheduleFinalRead(bracketId: string, endAt: number): void {
    if (disposed || finalTimerFor === bracketId) return;
    finalTimerFor = bracketId;
    clock.clearTimeout(finalTimer);
    finalTimer = clock.setTimeout(() => {
      finalTimer = null;
      if (disposed || deps.router.screen() !== 'home') return;
      void refreshBracket().then(() => nextCard());
    }, Math.max(0, endAt + FINAL_AFTER_MS - clock.now()));
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
    netDown = code === 'network';
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
          netDown = false;
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
        netDown = r.code === 'network';
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
    netDown = false;
    if (fresh) {
      // Another player now (my data was deleted on the server): nothing of the old one is shown again.
      win = null;
      endedView = null;
      heartsNote = null;
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
      // 2026-10-12, D-2e-24: the disclosure line, only for a literal true (the cached rules are not re-parsed).
      ...(r.computerPlayers === true ? { computerPlayers: true } : {}),
    };
  }

  /** `display`: the panel or sheet that renders this list (the once-only lines are its own); null = not rendered. */
  function listView(view: BracketView, stale: { at: number } | null, offsetMs: number, display: object | null): BracketListView {
    const r = rules ?? cached?.rules ?? null;
    const heartsOn = r?.hearts.enabled ?? false;
    const allowSelf = r?.hearts.allowSelf ?? true;
    const on = online() && !stale;
    const capped = heartLimitIn === view.bracketId; // a shown view always has a bracket id
    const rows: BracketRowView[] = view.rows.map((row) => ({
      rank: row.rank,
      slot: row.slot,
      name: row.nickname,
      avatarId: row.avatarId,
      points: row.points,
      hearts: row.hearts,
      me: row.me,
      likedByMe: row.likedByMe,
      heartEnabled: heartsOn && on && !capped && !row.likedByMe && (allowSelf || !row.me),
    }));
    const paidPlaces = r?.places.length ?? 0;
    const minMembers = r?.minMembers ?? 0;
    const me = save().ladder.me;
    // "+3 hearts from other players" (ladder.heartsNotify): the server counts the hearts since my last
    // bracket read and resets the count with each read. 2026-10-12: shown by the display that claimed it
    // (claimLines), never again by a later one; a cached (stale) view never shows it.
    const hn = heartsNote;
    const heartsNew = c.ladder.heartsNotify && !stale && display && hn?.shownBy === display && hn.bracketId === view.bracketId ? hn.n : 0;
    const firstLine = display && nickLineBy === display && me && view.me ? me.name : null;
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
      // 2026-10-12 (review): never on an ended bracket: a queued win sent after the end counts in the next one (§1.3).
      waiting: view.state === 'open' ? waitingFish(save().ladder) : 0,
      stale: stale ? { at: stale.at, offline: netDown || !online() } : null,
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

  /**
   * The bracket the panel and the sheet show now, with its stale mark and its answer's offset; null = none.
   * `forWin`: the post-win panel's win (its list); null = the sheet's (and a heart's) bracket.
   */
  function shownBracket(forWin: WinState | null = null): { view: BracketView; stale: { at: number } | null; offset: number } | null {
    // requests-G3 R16: the cache holds the NEWEST answer (every answer with an open bracket is stored, the win's
    // own included); it is current while it came from this page load and no call failed since, else it is the
    // stale view ("Last updated …", hearts off).
    const live = liveCache();
    if (live) return { view: live.view, stale: cacheFresh && online() ? null : { at: live.at }, offset: live.offset };
    // 2026-10-12 (compare §D3, verify C8): once my bracket ended, the server's view of it ("Final results" when it
    // is final). The win's own answer is no fallback any more: an open one is always cached, so it only ever
    // stood in after the end — the win-time standings under "Final results". Without the server's view nothing
    // is shown (the sheet's join line, as the chip's "Join"; the panel's records) until the read after the end
    // brings it (refreshBracket).
    const cur = save().ladder.current;
    const ev = endedView;
    if (!ev || cur?.bracketId !== ev.view.bracketId) return null;
    // 2026-10-12 (review): a win's panel shows the ended bracket only when the server's answer to THIS win named it
    // (it counted there before the end, or it was answered with my ended bracket). A win after the end lands in the
    // next bracket (spec §1.3), so one without that answer (late, failed, offline) shows my records, as before.
    if (forWin && forWin.view?.bracketId !== ev.view.bracketId) return null;
    return { view: ev.view, stale: null, offset: ev.offset };
  }

  /**
   * `display`: the panel or sheet rendering the list now (it claims the once-only lines); null = not rendered.
   * `forWin`: the post-win panel's win (shownBracket); null = the sheet.
   */
  function currentList(display: object | null, forWin: WinState | null = null): { list: BracketListView; stale: boolean } | null {
    const s = shownBracket(forWin);
    if (!s) return null;
    // 2026-10-12 (verify C9): the once-only lines go to the display that renders the list: the first-time name
    // line is marked seen only then (never while the panel draws its skeleton), and both lines stay on that
    // display's later re-renders (a heart, the chunk landing, an answer) instead of vanishing.
    const hn = heartsNote;
    if (display) {
      if (!save().ladder.nickLineSeen && s.view.me) {
        nickLineBy = display;
        markNickLineSeen(); // (not without my name: the line then waits for the next display)
      }
      if (hn && !hn.shownBy && !s.stale && hn.bracketId === s.view.bracketId) hn.shownBy = display;
    }
    return { list: listView(s.view, s.stale, s.offset, display), stale: s.stale !== null };
  }

  // ── hearts (spec §2.8) ──

  async function heart(slot: number): Promise<void> {
    // 2026-10-12 (verify B2): the bracket on screen (the panel and the sheet both show shownBracket()), never the
    // win-time one after a newer answer moved me on.
    const src = shownBracket()?.view ?? null;
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
      if (endedView && endedView.view.bracketId === bracketId) endedView = { ...endedView, view: fix(endedView.view) };
      emit('heart');
      refreshOpenSheet();
    };
    patch(row.hearts + 1, true); // optimistic
    const r = await client.heart(bracketId, slot);
    const self: 0 | 1 = row.me ? 1 : 0;
    if (r.ok) {
      patch(r.value.hearts, true);
      log({ name: 'heart_give', params: { result: 'ok', self } });
      if (rules && r.value.givenInBracket >= rules.hearts.maxGivenPerBracket) heartLimitIn = bracketId;
      return;
    }
    if (r.code === 'heart_exists') {
      log({ name: 'heart_give', params: { result: 'exists', self } });
      return; // stays pressed, silently
    }
    if (r.code === 'heart_limit') {
      heartLimitIn = bracketId;
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
    const live = active();
    const shown = live || view === 'info' ? view : 'records';
    // 2026-10-12: only a sheet opened on its list renders it (an info view opened on its own never shows it).
    const cl = view === 'records' ? null : currentList(shown === 'list' ? sheetDisplay : null);
    return {
      view: shown,
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
    endedView = null;
    heartsNote = null;
    dropCache();
    updateLadder((l) => afterDelete(l, c));
    deps.saves.critical();
    deps.router.toast(t('settings.ladder.deleted'));
    emit('deleted');
  }

  /**
   * 2026-10-12 (compare §D3; review): reads after my bracket ended that skip the throttle: the first one after the end,
   * and, while its final view has not come, the first one after the server's finalising grace (FINAL_AFTER_MS) — the
   * read at the chip's 00:00:00 lands inside that grace and gets neither the final standings nor the result card. A
   * failed one waits for the throttle like any other.
   */
  function endedReadDue(now: number): boolean {
    const cur = save().ladder.current;
    if (!cur) return false;
    const endAt = cur.endsAt - cur.serverOffsetMs; // device clock
    const due = (at: number): boolean => lastHomeRefresh < at && at <= now;
    const final = endedView !== null && endedView.view.bracketId === cur.bracketId && endedView.view.final;
    return due(endAt) || (!final && due(endAt + FINAL_AFTER_MS));
  }

  async function refreshBracket(): Promise<void> {
    if (auth !== 'ok' || !listed() || !usable()) return;
    const now = clock.now();
    if (!endedReadDue(now) && now - lastHomeRefresh < c.ladder.homeRefreshMs) return;
    lastHomeRefresh = now;
    const r = await client.bracket();
    if (!r.ok) {
      noteFailure(r.code);
      return; // Home keeps its cached values, never an error text
    }
    netDown = false;
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

  // ── the bus: flush when the device is online again ──
  const onOnline = (): void => {
    netDown = false; // 2026-10-12: back online (a stale list keeps "Last updated" until an answer)
    void flush('online');
  };
  const onOffline = (): void => {
    cacheFresh = false;
    netDown = true;
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
        win = { ref, at: clock.now(), state: 'failed', view: null, gained: null };
        panelLogged = null;
        return;
      }
      win = { ref, at: clock.now(), state: 'sending', view: null, gained: null };
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
      // 2026-10-12 (verify C9): the panel renders the list only with the chunk's factory (panelExtras); before
      // it lands it draws the skeleton, so this win's panel claims the once-only lines only then.
      const cl = currentList(chunk ? win : null, win);
      if (cl) {
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
    winCounted: () => (win && win.gained !== null ? win.gained > 0 : null),
    panelExtras() {
      return {
        ...(chunk ? { bracketList: chunk.createBracketList } : {}),
        onHeart: (slot: number) => void heart(slot),
        onInfo: () => flow.openSheet('home', 'info'),
      };
    },
    // 2026-10-12 (verify C7): with my earlier queued fish (this win's own left out), as the panel's "+N waiting".
    counterBefore: () => (active() ? counterBeforeWin(save().ladder, clock.now(), win?.ref.winId ?? null, c) : 0),
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
      })();
    },
    openSheet(from, view = 'list') {
      // ladder.noticeFirst: the notice first (its OK starts the ranking).
      if (noticePending() && openNotice()) return;
      log({ name: 'ladder_open', params: { from } });
      sheetView = view;
      sheetDisplay = {}; // a new display: the once-only lines are not repeated
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
    computerPlayers: () => rulesView()?.computerPlayers === true,
    debug: () => ({ active: active(), signedIn: client.signedIn(), pending: save().ladder.pending.length, current: save().ladder.current }),
    dispose() {
      disposed = true;
      offSignIn();
      clock.clearTimeout(retryTimer);
      clock.clearTimeout(finalTimer);
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
