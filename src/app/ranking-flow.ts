// Owner: C
// Post-win ranking (phase2b §5.5): at WON compute the points (saved with the win), submit through
// platform.ranking (board by mode) when the limits allow (else rank.pending[board] = score, retried on
// the next win or boot), start mine + top at once so the panel is ready at 4.5 s (deadline
// rank.fetchTimeoutMs), and turn the result into the panel's RankingListState — rows ONLY from provider
// data, else the personal records. Emits 'rank:result'. Also feeds the rankings hub and the event
// screen's top list. C-internal module; the RankingProvider (D) and RankingPanelProps (B) are fixed.
// platform.ranking is read at call time: the FB adapter adds it when its lazy chunk lands after start().
import { canSubmit, decodeScore, boardFormat } from '../game/scoring';
import type { BoardKey, SaveData } from '../game/types';
import type { PlatformAdapter, RankingCaps, RankingProvider, RankListView } from '../platform/types';
import type { PersonalRecordsView, RankingListState, RankMineView, RankScoreView } from '../ui/overlays/ranking-panel';
import { formatClock, formatNumber, t } from '../i18n';
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

/** What the list needs besides the provider's answer: my own records and my own score (never fabricated). */
export interface ListContext {
  readonly records: PersonalRecordsView;
  /** My score as I know it locally (points total, this daily's time, my event progress), for "Your score". */
  readonly myScore: RankScoreView | null;
  /** Event boards: the puzzle count (decoded rows say "13 of 21"). */
  readonly eventTotal?: number;
}

export interface RankingFlow {
  /** Submit (or queue) a board score; never rejects. */
  submit(board: BoardKey, score: number, solveMs: number): Promise<void>;
  /** Retry rank.pending (boot, next win). Never rejects. */
  flushPending(): Promise<void>;
  /** mine + top for a board within rank.fetchTimeoutMs; 'local' without a provider. Never rejects. */
  fetch(board: BoardKey): Promise<RankResult>;
  /** The list state for a fetched result (never padded). */
  listState(result: RankResult, ctx: ListContext): RankingListState;
  /** Milliseconds the last fetch of `board` took (rank_panel analytics), or null. */
  fetchMs(board: BoardKey): number | null;
  /** Opens the FB overlay list (in `rect` when the provider can place it). Resolves false when it cannot. */
  showList(board: BoardKey, title: string, rect?: DOMRect, eventTotal?: number): Promise<boolean>;
  /** Closes an open overlay list (the panel or hub closed). */
  closeList(): void;
  /** The provider's caps, or null without a provider (web). */
  caps(): RankingCaps | null;
}

const TIMEOUT = Symbol('timeout');

/** A decoded board score in the panel's terms. */
export function scoreView(board: BoardKey, score: number, eventTotal: number | undefined, c: GameConfig = cfg): RankScoreView {
  const d = decodeScore(board, score, c);
  if (d.kind === 'points') return { kind: 'points', points: d.points };
  if (d.kind === 'time') return { kind: 'time', ms: d.secs * 1000 };
  return { kind: 'event', solved: d.solved, total: eventTotal ?? d.solved, ms: d.totalSecs * 1000 };
}

/** The overlay rows' score text ("1 240 points", "3:08", "13 / 21 solved"), formatted by us (§5.4). */
export function formatBoardScore(board: BoardKey, score: number, eventTotal: number | undefined, c: GameConfig = cfg): string {
  const v = scoreView(board, score, eventTotal, c);
  if (v.kind === 'points') return t('rank.points', { points: formatNumber(v.points) });
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
    async submit(board, score, solveMs) {
      const p = provider();
      if (!p || unsupported.has(board)) return;
      try {
        const caps = capsOf(p);
        if (caps && caps.api === 'none') return;
        const limit = canSubmit(solveMs, clock.now(), deps.save().rank.lastSubmitAt, c);
        if (limit === 'too_fast' || limit === 'too_slow') return; // §5.3 sanity limits: never submitted
        if (limit === 'wait') {
          setPending(board, score);
          return;
        }
        await send(p, board, score);
      } catch (error) {
        bus.emit('error', { where: 'rank_submit', error });
      }
    },
    async flushPending() {
      const p = provider();
      if (!p) return;
      try {
        const caps = capsOf(p);
        if (caps && caps.api === 'none') return;
        const pending = deps.save().rank.pending;
        for (const board of Object.keys(pending) as BoardKey[]) {
          const score = pending[board];
          if (score === undefined || unsupported.has(board)) continue;
          await send(p, board, score);
        }
      } catch (error) {
        bus.emit('error', { where: 'rank_flush', error });
      }
    },
    async fetch(board) {
      const p = provider();
      const started = clock.perf();
      let result: RankResult;
      const caps = p ? capsOf(p) : null;
      if (!p || !caps) result = { board, api: 'local', mine: null, top: [], ok: true };
      else if (caps.api === 'none' || unsupported.has(board)) result = { board, api: 'none', mine: null, top: [], ok: true }; // no API, or no id for this board
      else {
        const both = Promise.all([
          caps.myRank ? Promise.resolve().then(() => p.mine(board)) : Promise.resolve(null),
          Promise.resolve().then(() => p.top(board, c.rank.fetchCount)),
        ]);
        const r = await within(both, null);
        result =
          r === TIMEOUT || r === null
            ? { board, api: caps.api, mine: null, top: [], ok: false }
            : { board, api: caps.api, mine: r[0] ?? null, top: Array.isArray(r[1]) ? r[1] : [], ok: true };
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
      const me = result.mine;
      const mine: RankMineView = {
        rank: caps.myRank && me ? me.rank : null,
        // The provider's own entry for me, else my own score as I know it locally ("Your score"), never a guess.
        score: me ? scoreView(result.board, me.score, ctx.eventTotal, c) : ctx.myScore,
        count: null,
      };
      if (caps.overlayInRect) return { kind: 'overlay' };
      if (caps.overlay) return { kind: 'see_top', mine };
      return { kind: 'mine', mine };
    },
    fetchMs: (board) => lastMs.get(board) ?? null,
    async showList(board, title, rect, eventTotal) {
      flow.closeList();
      const mine = ++listGen;
      const p = provider();
      const caps = p ? capsOf(p) : null;
      if (!p || !caps || !caps.overlay) return false;
      const view: RankListView = {
        title,
        scoreFormat: boardFormat(board, c),
        highlightMe: caps.myRank,
        count: c.rank.topCount,
        formatScore: (score) => formatBoardScore(board, score, eventTotal, c),
      };
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
