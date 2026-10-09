// Owner: C
// Post-win ranking (phase2b §5.5): at WON compute the points (saved with the win), submit through
// platform.ranking (board by mode) when the limits allow (else rank.pending[board] = score, retried on
// the next win or boot), start mine + top at once so the panel is ready at 4.5 s (deadline
// rank.fetchTimeoutMs), and turn the result into the panel's RankingListState — rows ONLY from provider
// data, else the personal records. Emits 'rank:result'. Also feeds the rankings hub and the event
// screen's top list. C-internal module; the RankingProvider (D) and RankingPanelProps (B) are fixed.
// platform.ranking is read at call time: the FB adapter adds it when its lazy chunk lands after start().
// Review fixes: daily_fastest reads the shown day's band past the later time zones' next-day entries,
// and "Your rank" there is my position inside that band, never the board's global rank (FB2B-4); a
// board the provider reports missing (supports() false, LEADERBOARD_NOT_FOUND) gets personal records
// (FB2B-6); "Your score" for the solve just made shows the same time as the panel's headline (FB2B-7).
// Phase 2c (G1, docs/phase2c/fish-lives-spec.md §4): the period board (period_points) is read by its
// band like daily_fastest (bandFilter), "Your rank" inside a band uses the band's own board rank
// (RankEntry.boardRank) when the provider gives it, a win's boards are submitted as one batch under
// one limiter check (submitAll), paw_points is retired and daily_fastest is off unless rank.dailyBoard.
import { canSubmit, dayIndex, decodeScore, boardFormat, encodeDailyScore, encodeEventScore, PERIOD_SPAN, periodIndex, periodKeyAt } from '../game/scoring';
import { localDateKey } from '../game/progression';
import type { BoardKey, SaveData } from '../game/types';
import type { PlatformAdapter, RankEntry, RankingCaps, RankingProvider, RankListView } from '../platform/types';
import type { PersonalRecordsView, RankingListState, RankMineView, RankScoreView } from '../ui/overlays/ranking-panel';
import { formatClock, formatNumber, t, tn } from '../i18n';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';
import type { AppBus, RankResult } from './events';
import { isFlagOn } from './flags';

export interface RankingFlowDeps {
  readonly platform: Pick<PlatformAdapter, 'ranking'>;
  readonly clock: Clock;
  readonly bus: AppBus;
  /** The live save and a way to change it (rank.pending, rank.lastSubmitAt), saved with 'touch'. */
  save(): SaveData;
  updateSave(fn: (s: SaveData) => SaveData): void;
  touch(): void;
  readonly config?: GameConfig;
}

/**
 * The band a board is read in (phase2c §4.5): daily_fastest keeps one day's entries, period_points one
 * period's. Other boards have no band.
 */
export interface RankBand {
  /** daily_fastest: the day shown (YYYY-MM-DD, local). */
  readonly day?: string;
  /** period_points: the period shown (its key, the first day, UTC). */
  readonly periodKey?: string;
}

/** What the list needs besides the provider's answer: my own records and my own score (never fabricated). */
export interface ListContext {
  readonly records: PersonalRecordsView;
  /** My score as I know it locally (this period's fish, this daily's time, my event progress), for "Your score". */
  readonly myScore: RankScoreView | null;
  /** Event boards: the puzzle count (decoded rows say "13 of 21"). */
  readonly eventTotal?: number;
  /** daily_fastest: the day shown (date key); my entry counts only when it is that day's (§5.3). */
  readonly day?: string;
  /** period_points: the period shown (its key); my entry counts only when it is that period's (phase2c §4.5). */
  readonly periodKey?: string;
}

/** One board score of a win (phase2c §4.4: a win's boards are one batch). */
export interface BoardScore {
  readonly board: BoardKey;
  readonly score: number;
}

export interface RankingFlow {
  /** Submit (or queue) a board score; never rejects. The same as submitAll with one entry. */
  submit(board: BoardKey, score: number, solveMs: number): Promise<void>;
  /**
   * Phase 2c §4.4: a win's board scores as ONE batch: the sanity limits (rank.minSolveMs / maxSolveMs)
   * and the client limiter (rank.submitMinIntervalMs) are checked once for the batch, so an event win's
   * second board is never pushed into rank.pending by the first. Retired or switched-off boards are
   * skipped. Never rejects.
   */
  submitAll(entries: readonly BoardScore[], solveMs: number): Promise<void>;
  /**
   * Retry rank.pending (boot, next win). `except`: the boards whose scores were just submitted (a score
   * one queued under the rate limit waits for the next win or boot). A pending score of a retired
   * board (paw_points) or a switched-off one (daily_fastest without rank.dailyBoard) is dropped, never
   * sent. Never rejects.
   */
  flushPending(opts?: { readonly except?: BoardKey | readonly BoardKey[] }): Promise<void>;
  /**
   * mine + top for a board within rank.fetchTimeoutMs; 'local' without a provider. Never rejects.
   * daily_fastest: `top` is the band of `band.day` (default today), numbered inside it (FB2B-4);
   * period_points: the band of `band.periodKey` (default the current UTC period, phase2c §4.5).
   */
  fetch(board: BoardKey, band?: RankBand): Promise<RankResult>;
  /** The list state for a fetched result (never padded). */
  listState(result: RankResult, ctx: ListContext): RankingListState;
  /** Milliseconds the last fetch of `board` took (rank_panel analytics), or null. */
  fetchMs(board: BoardKey): number | null;
  /**
   * Opens the FB overlay list (in `rect` when the provider can place it). Resolves false when it cannot.
   * `band` (daily_fastest: default today; period_points: default the current period): the list keeps
   * that band's entries alone (§5.3, phase2c §4.5).
   * `mine` (FB2B-7, optional): my score as I know it; my row of the solve just made shows it exactly.
   */
  showList(board: BoardKey, title: string, rect?: DOMRect, eventTotal?: number, band?: RankBand, mine?: RankScoreView): Promise<boolean>;
  /** Closes an open overlay list (the panel or hub closed). */
  closeList(): void;
  /** The provider's caps, or null without a provider (web). */
  caps(): RankingCaps | null;
}

const TIMEOUT = Symbol('timeout');

/**
 * The band readers of a one-board-for-every-band board (phase2c §4.5, generalising phase2b §5.3):
 * daily_fastest keeps the entries of `band.day`; period_points keeps those whose score's high digits
 * are the period index of `band.periodKey` (floor(score / PERIOD_SPAN) === periodIndex). Undefined for
 * every other board, or when the band is not given or cannot be read (nothing to filter).
 */
export function bandFilter(board: BoardKey, band: RankBand, c: GameConfig = cfg): ((score: number) => boolean) | undefined {
  try {
    if (board === c.rank.boards.daily && band.day !== undefined) {
      const shown = dayIndex(band.day, c);
      return (score) => {
        const d = decodeScore(board, score, c);
        return d.kind === 'time' && d.dayIndex === shown;
      };
    }
    if (board === c.rank.boards.period && band.periodKey !== undefined) {
      const shown = periodIndex(band.periodKey, c);
      return (score) => Number.isFinite(score) && Math.floor(score / PERIOD_SPAN) === shown;
    }
  } catch {
    // a bad day or period key: no band (every entry)
  }
  return undefined;
}

/** daily_fastest's band (§5.3): bandFilter with a day. Undefined for every other board. */
export function dayFilter(board: BoardKey, day: string, c: GameConfig = cfg): ((score: number) => boolean) | undefined {
  return board === c.rank.boards.daily ? bandFilter(board, { day }, c) : undefined;
}

/** A decoded board score in the panel's terms. */
export function scoreView(board: BoardKey, score: number, eventTotal: number | undefined, c: GameConfig = cfg): RankScoreView {
  const d = decodeScore(board, score, c);
  if (d.kind === 'period') return { kind: 'fish', fish: d.total };
  if (d.kind === 'time') return { kind: 'time', ms: d.secs * 1000 };
  return { kind: 'event', solved: d.solved, total: eventTotal ?? d.solved, ms: d.totalSecs * 1000 };
}

/** The overlay rows' score text ("42 fish", "3:08", "13 / 21 solved"), formatted by us (§5.4). */
export function formatBoardScore(board: BoardKey, score: number, eventTotal: number | undefined, c: GameConfig = cfg): string {
  return formatScoreView(scoreView(board, score, eventTotal, c));
}

/** A score view's text, as formatBoardScore writes it. */
export function formatScoreView(v: RankScoreView): string {
  if (v.kind === 'fish') return tn('fish.count', v.fish); // "42 fish" (phase2c §2.6)
  if (v.kind === 'time') return formatClock(v.ms);
  return t('event.card.progress', { solved: formatNumber(v.solved), total: formatNumber(v.total) });
}

export function createRankingFlow(deps: RankingFlowDeps): RankingFlow {
  const c = deps.config ?? cfg;
  const { clock, bus } = deps;
  /** Boards the provider said it cannot serve (no platform id): personal records from then on. */
  const unsupported = new Set<BoardKey>();
  const lastMs = new Map<BoardKey, number>();
  let list: { close(): void } | null = null;
  let listGen = 0;

  const provider = (): RankingProvider | null => {
    if (!isFlagOn('rankings')) return null;
    try {
      return deps.platform.ranking ?? null;
    } catch {
      return null;
    }
  };
  const capsOf = (p: RankingProvider): RankingCaps | null => {
    try {
      return p.caps();
    } catch {
      return null;
    }
  };

  /** `p`, or TIMEOUT after rank.fetchTimeoutMs (never rejects: a rejection counts as `fallback`). */
  function within<T, F>(p: Promise<T>, fallback: F): Promise<T | F | typeof TIMEOUT> {
    return new Promise((resolve) => {
      let done = false;
      const id = clock.setTimeout(() => {
        if (done) return;
        done = true;
        resolve(TIMEOUT);
      }, c.rank.fetchTimeoutMs);
      p.then(
        (v) => {
          if (done) return;
          done = true;
          clock.clearTimeout(id);
          resolve(v);
        },
        () => {
          if (done) return;
          done = true;
          clock.clearTimeout(id);
          resolve(fallback);
        },
      );
    });
  }

  /**
   * Whether a board is submitted at all (phase2c §4.1): paw_points is retired; daily_fastest only with
   * rank.dailyBoard; period_points and the event boards always.
   */
  const active = (board: BoardKey): boolean =>
    board !== c.rank.boards.points && (board !== c.rank.boards.daily || c.rank.dailyBoard);

  /** A band with its defaults filled in: today (local) for the day band, the current UTC period for the period band. */
  const shownBand = (band: RankBand | undefined): RankBand => ({
    day: band?.day ?? localDateKey(clock.now()),
    periodKey: band?.periodKey ?? periodKeyAt(clock.now(), c),
  });

  const listFormat = (board: BoardKey): RankListView['scoreFormat'] => {
    const f = boardFormat(board, c);
    return f === 'period' ? 'points' : f;
  };

  /** The provider's supports(board) (FB2B-6); absent or throwing = supported. */
  const supports = (p: RankingProvider, board: BoardKey): boolean => {
    try {
      return p.supports?.(board) !== false;
    } catch {
      return true;
    }
  };

  /**
   * My rank inside the shown band (phase2c §4.5; FB2B-4 for the day band). Exact at any depth when the
   * band's first entry carries its board rank (RankEntry.boardRank, set by band reads): my board rank
   * minus the entries above the band (`me.rank − (first.boardRank − 1)`). Otherwise my position among
   * the band's entries in `top` (read best-first from the top of the board, so every better entry of
   * the band comes before mine). null when neither tells: the board's own rank counts other bands and
   * is never shown.
   */
  function bandRank(result: RankResult, me: RankEntry, keep: (score: number) => boolean): number | null {
    // RankEntry.boardRank (phase2c §4.5, G3): the board's own rank, set on band reads (top(…, keep)).
    const band = result.top.filter((e) => keep(e.score));
    const top = band[0]?.boardRank;
    if (top !== undefined && Number.isInteger(top) && top >= 1 && Number.isInteger(me.rank) && me.rank >= top) return me.rank - (top - 1);
    const pos = band.findIndex((e) => e.isMe);
    return pos >= 0 ? pos + 1 : null;
  }

  /** Whether a board entry is the encoding of my own score as I know it (the solve just made, FB2B-7). */
  function isMySolve(board: BoardKey, score: number, ctx: Pick<ListContext, 'myScore' | 'day'>): boolean {
    // (A period total is exact on the board: its own decoded value is the one to show.)
    const m = ctx.myScore;
    if (!m) return false;
    try {
      if (m.kind === 'time') return board === c.rank.boards.daily && ctx.day !== undefined && encodeDailyScore(ctx.day, m.ms, c) === score;
      if (m.kind === 'event') return boardFormat(board, c) === 'event' && encodeEventScore(m.solved, m.ms) === score;
    } catch {
      // a bad day key: the board's own value
    }
    return false;
  }

  const setPending = (board: BoardKey, score: number | null): void => {
    deps.updateSave((s) => {
      const has = Object.prototype.hasOwnProperty.call(s.rank.pending, board);
      if (score === null && !has) return s;
      if (score !== null && s.rank.pending[board] === score) return s;
      const pending = { ...s.rank.pending };
      if (score === null) delete pending[board];
      else pending[board] = score;
      return { ...s, rank: { ...s.rank, pending } };
    });
    deps.touch();
  };

  /** One provider submit; the pending entry follows the outcome. */
  async function send(p: RankingProvider, board: BoardKey, score: number): Promise<void> {
    deps.updateSave((s) => ({ ...s, rank: { ...s.rank, lastSubmitAt: clock.now() } }));
    const r = await within(Promise.resolve().then(() => p.submit(board, score)), 'error' as const);
    if (r === 'ok' || r === 'not_improved') setPending(board, null);
    else if (r === 'unsupported') {
      unsupported.add(board);
      setPending(board, null); // never retried: this build has no id for the board
    } else setPending(board, score); // error or timeout: retried on the next win or boot
  }

  const flow: RankingFlow = {
    submit: (board, score, solveMs) => flow.submitAll([{ board, score }], solveMs),
    async submitAll(entries, solveMs) {
      const p = provider();
      const batch = entries.filter((e) => active(e.board) && !unsupported.has(e.board));
      if (!p || batch.length === 0) return;
      try {
        const caps = capsOf(p);
        if (caps && caps.api === 'none') return;
        // One limiter check for the whole batch (phase2c §4.4).
        const limit = canSubmit(solveMs, clock.now(), deps.save().rank.lastSubmitAt, c);
        if (limit === 'too_fast' || limit === 'too_slow') return; // §5.3 sanity limits: never submitted
        if (limit === 'wait') {
          for (const e of batch) setPending(e.board, e.score);
          return;
        }
        for (const e of batch) await send(p, e.board, e.score);
      } catch (error) {
        bus.emit('error', { where: 'rank_submit', error });
      }
    },
    async flushPending(opts) {
      const p = provider();
      if (!p) return;
      try {
        const caps = capsOf(p);
        if (caps && caps.api === 'none') return;
        const except = opts?.except === undefined ? [] : typeof opts.except === 'string' ? [opts.except] : opts.except;
        const pending = deps.save().rank.pending;
        for (const board of Object.keys(pending) as BoardKey[]) {
          const score = pending[board];
          if (score === undefined) continue;
          if (!active(board)) {
            setPending(board, null); // retired (paw_points) or switched off (daily_fastest): never sent
            continue;
          }
          if (unsupported.has(board) || except.includes(board)) continue;
          await send(p, board, score);
        }
      } catch (error) {
        bus.emit('error', { where: 'rank_flush', error });
      }
    },
    async fetch(board, band) {
      const p = provider();
      const started = clock.perf();
      let result: RankResult;
      const caps = p ? capsOf(p) : null;
      const none = (): RankResult => ({ board, api: 'none', mine: null, top: [], ok: true });
      if (!p || !caps) result = { board, api: 'local', mine: null, top: [], ok: true };
      else if (caps.api === 'none' || unsupported.has(board) || !supports(p, board)) result = none(); // no API, or no id for this board
      else {
        const keep = bandFilter(board, shownBand(band), c);
        const both = Promise.all([
          caps.myRank ? Promise.resolve().then(() => p.mine(board)) : Promise.resolve(null),
          Promise.resolve().then(() => (keep ? p.top(board, c.rank.fetchCount, keep) : p.top(board, c.rank.fetchCount))),
        ]);
        const r = await within(both, null);
        result =
          r === TIMEOUT || r === null
            ? { board, api: caps.api, mine: null, top: [], ok: false }
            : { board, api: caps.api, mine: r[0] ?? null, top: Array.isArray(r[1]) ? r[1] : [], ok: true };
        // The reads found out that the board does not exist (FB LEADERBOARD_NOT_FOUND): personal
        // records, as for a board without an id (FB2B-6), never an empty "See top players".
        if (!supports(p, board)) {
          unsupported.add(board);
          result = none();
        }
      }
      lastMs.set(board, Math.max(0, Math.round(clock.perf() - started)));
      bus.emit('rank:result', result);
      return result;
    },
    listState(result, ctx) {
      if (result.api === 'local' || result.api === 'none') return { kind: 'records', records: ctx.records, reason: 'local' };
      if (!result.ok) return { kind: 'records', records: ctx.records, reason: 'unavailable' };
      const p = provider();
      const caps = p ? capsOf(p) : null;
      if (!caps) return { kind: 'records', records: ctx.records, reason: 'local' };
      // daily_fastest / period_points: an entry of another day or period says nothing about the band
      // shown (§5.3, phase2c §4.5).
      const keep = bandFilter(result.board, { ...(ctx.day !== undefined ? { day: ctx.day } : {}), ...(ctx.periodKey !== undefined ? { periodKey: ctx.periodKey } : {}) }, c);
      const me = result.mine && (!keep || keep(result.mine.score)) ? result.mine : null;
      const mine: RankMineView = {
        rank: caps.myRank && me ? (keep ? bandRank(result, me, keep) : me.rank) : null,
        // The provider's own entry for me, else my own score as I know it locally ("Your score"), never
        // a guess. The entry of the solve just made shows my own time (one value per solve, FB2B-7).
        score: me ? (isMySolve(result.board, me.score, ctx) ? ctx.myScore : scoreView(result.board, me.score, ctx.eventTotal, c)) : ctx.myScore,
        count: null,
      };
      if (caps.overlayInRect) return { kind: 'overlay' };
      if (caps.overlay) return { kind: 'see_top', mine };
      return { kind: 'mine', mine };
    },
    fetchMs: (board) => lastMs.get(board) ?? null,
    async showList(board, title, rect, eventTotal, band, myScore) {
      flow.closeList();
      const mine = ++listGen;
      const p = provider();
      const caps = p ? capsOf(p) : null;
      if (!p || !caps || !caps.overlay || unsupported.has(board) || !supports(p, board)) return false;
      const view: { -readonly [K in keyof RankListView]: RankListView[K] } = {
        title,
        // The platform knows three formats; a period total is a plain number (phase2c §4.3).
        scoreFormat: listFormat(board),
        highlightMe: caps.myRank,
        count: c.rank.topCount,
        formatScore: (score) => formatBoardScore(board, score, eventTotal, c),
      };
      const shown = shownBand(band);
      const shownDay = shown.day ?? localDateKey(clock.now());
      const keep = bandFilter(board, shown, c);
      if (keep) view.keep = keep;
      // FB2B-7: my row of the solve just made shows my exact time (the board keeps whole seconds).
      if (myScore) {
        const me = { myScore, day: shownDay };
        view.formatMine = (score) => (isMySolve(board, score, me) ? formatScoreView(myScore) : formatBoardScore(board, score, eventTotal, c));
      }
      try {
        const h = await p.showList(board, view, rect && caps.overlayInRect ? rect : undefined);
        if (!h) return false;
        if (mine !== listGen) {
          h.close(); // the panel closed while the list was opening
          return true;
        }
        list = h;
        return true;
      } catch (error) {
        bus.emit('error', { where: 'rank_list', error });
        return false;
      }
    },
    closeList() {
      listGen++;
      const h = list;
      list = null;
      try {
        h?.close();
      } catch {
        // already gone
      }
    },
    caps() {
      const p = provider();
      return p ? capsOf(p) : null;
    },
  };
  return flow;
}
