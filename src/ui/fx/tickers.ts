// Owner: G3 (Phase 2d.1)
// The two level-start tickers (helpers-spec §5, D-2d1-12; replaces start-toast.ts at I-3): cream pills
// with our paw cap (G2's art-paw-cap) at the inline start and an end icon (line 1 art-bolt, line 2
// art-star), stacked over the top of the HUD, each crossing the game column (audit B14: not the whole
// viewport; .tickers is the column, clipped) from its inline-end edge to past its inline-start edge,
// linearly, in the same time T = fx.tickers.crossMs (so a longer line moves faster). Line 2 starts fx.tickers.delayMs after the board entry starts, line 1 lead × T later. The
// lines are honest (G1's pickTickerLines: the player's own numbers, the board, a true fact or a tip).
// Reduced motion: both fade in at the column's inline start (12 s), hold reducedHoldMs, fade out.
// Decorative: aria-hidden, no pointer events, no sound; in the game screen's fx layer (.game-fx).
// Part of the lazy fx chunk (fx/celebrate.ts re-exports createTickers; the first run's tutorial plays
// none): a pair asked for before the chunk loaded joins its crossing where it would be by then
// (play's `sinceMs`, a negative WAAPI delay). The line types are type-only for G1's pickTickerLines.
// Classes: .tickers > .ticker[data-line=1|2][data-key] > svg.ticker__paw + span.ticker__text + svg.ticker__icon
// UI batch (2026-10-13), messages: a line is never cut ("…"): each pill is as wide as its text (celebrate.css) and the
// column clips it only while it crosses; a pair whose longer line would cross faster than fx.tickers.maxPxPerSec takes
// longer than crossMs (both lines). Reduced motion marks .tickers[data-reduced]: the lines stack and wrap in place. The
// richer lines (ticker.odds.* with {pct} or a {count} of tries in halves, the Retry's {placed}/{n}, the milestone's
// {level}, the player's records) are G1's pickTickerLines'.
import { cfg, type PeriodKind } from '../../app/config';
import { formatClock, formatNumber, t, tn, translate, type I18nKey } from '../../i18n';
import { icon } from '../art/sprite';

export type TickerKey =
  | 'toast.start.level'
  | 'toast.start.hard'
  | 'toast.start.retry'
  | 'ticker.best'
  | 'ticker.cats'
  | 'ticker.solved'
  | `period.pill.${PeriodKind}`
  | 'ticker.points'
  | 'ticker.daily'
  | 'ticker.unique'
  | 'ticker.tip.cat'
  | 'ticker.tip.drag'
  // UI batch, messages
  | 'ticker.odds.firstTry'
  | 'ticker.odds.retry'
  | 'ticker.odds.tries'
  | 'ticker.retry.found'
  | 'ticker.retry.close'
  | 'ticker.retry.again'
  | 'ticker.hard.first'
  | 'ticker.hard.beaten'
  | 'ticker.flawless'
  | 'ticker.streak'
  | 'ticker.dailies'
  | 'ticker.milestone';

export interface TickerLine {
  readonly key: TickerKey;
  /**
   * Plural keys (ticker.cats, ticker.solved, ticker.points, period.pill.*, and the UI batch's ticker.odds.tries,
   * ticker.retry.close, ticker.hard.beaten, ticker.flawless, ticker.streak, ticker.dailies): rendered with
   * tn(key, count, { count: formatNumber(count) }); ticker.odds.tries keeps a half ("2.5").
   */
  readonly count?: number;
  /** ticker.best (level mode only): the stored best time in ms (LevelBest[0]), rendered with formatClock ("4:12"). */
  readonly ms?: number;
  /** UI batch: ticker.odds.firstTry / .retry: the model's rounded percentage (game/level-odds.ts). */
  readonly pct?: number;
  /** UI batch: ticker.retry.found: the lost attempt's cats placed and the board size. */
  readonly placed?: number;
  readonly n?: number;
  /** UI batch: ticker.milestone: the level number. */
  readonly level?: number;
}

const PLURAL = new Set<string>([
  'ticker.cats',
  'ticker.solved',
  'ticker.points',
  'period.pill.day',
  'period.pill.week',
  'period.pill.month',
  'ticker.odds.tries',
  'ticker.retry.close',
  'ticker.hard.beaten',
  'ticker.flawless',
  'ticker.streak',
  'ticker.dailies',
]);

const whole = (x: number | undefined): number => Math.max(0, Math.floor(x ?? 0));

/** A line's text in the current language. */
export function tickerText(line: TickerLine): string {
  switch (line.key) {
    case 'ticker.best':
      return t('ticker.best', { time: formatClock(line.ms ?? 0) });
    case 'ticker.odds.firstTry':
    case 'ticker.odds.retry':
      return t(line.key, { pct: formatNumber(whole(line.pct)) });
    case 'ticker.retry.found':
      return t('ticker.retry.found', { placed: formatNumber(whole(line.placed)), n: formatNumber(whole(line.n)) });
    case 'ticker.milestone':
      return t('ticker.milestone', { level: whole(line.level) });
    default:
      break;
  }
  if (PLURAL.has(line.key)) {
    const n = line.key === 'ticker.odds.tries' ? Math.max(0, Math.round((line.count ?? 0) * 2) / 2) : whole(line.count);
    return tn(line.key as Parameters<typeof tn>[0], n, { count: formatNumber(n) });
  }
  return translate(line.key as I18nKey);
}

/**
 * When each line starts and how far it moves (ms from the call; px): both cross in T, line 2 first
 * (delayMs), line 1 lead × T later; each travels the column's width `vw` plus its own width.
 * UI batch: T = crossMs, or longer when the longer line would pass maxPxPerSec × s (s = the screen's --s).
 */
export function tickerPlan(widths: readonly [number, number], vw: number, s = 1): readonly { readonly delay: number; readonly dur: number; readonly from: number; readonly to: number }[] {
  const T = cfg.fx.tickers;
  const speed = T.maxPxPerSec * (s > 0 ? s : 1);
  const path = vw + Math.max(widths[0], widths[1]);
  const dur = speed > 0 ? Math.max(T.crossMs, Math.ceil((1000 * path) / speed)) : T.crossMs;
  return widths.map((w, i) => ({
    delay: i === 1 ? T.delayMs : T.delayMs + Math.round(T.lead * dur),
    dur,
    from: vw,
    to: -w,
  }));
}

export interface TickersOptions {
  /** The game screen's fx layer (.game-fx): fixed over the viewport, inherits --s, --y-top and --col-w. */
  readonly host: HTMLElement;
  reduced(): boolean;
}

export interface Tickers {
  /**
   * Shows the two lines (a running pair is removed first). No-op when fx.tickers.enabled is off.
   * `sinceMs`: how long ago the board entry asked for them (the chunk was still loading).
   */
  play(lines: readonly [TickerLine, TickerLine], sinceMs?: number): void;
  /** The running pair's root, or null. */
  current(): HTMLElement | null;
  destroy(): void;
}

function build(doc: Document, line: TickerLine, n: 1 | 2): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'ticker';
  el.dataset.line = String(n);
  el.dataset.key = line.key;
  const text = doc.createElement('span');
  text.className = 'ticker__text';
  text.textContent = tickerText(line);
  el.append(icon('art-paw-cap', { class: 'ticker__paw' }), text, icon(n === 1 ? 'art-bolt' : 'art-star', { class: 'ticker__icon' }));
  return el;
}

export function createTickers(opts: TickersOptions): Tickers {
  let box: HTMLElement | null = null;
  let anims: Animation[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const a of anims) {
      try {
        a.cancel();
      } catch {
        // already gone
      }
    }
    anims = [];
    box?.remove();
    box = null;
  };

  return {
    play(lines, sinceMs = 0) {
      stop();
      const late = Math.max(0, sinceMs);
      const host = opts.host;
      if (!cfg.fx.tickers.enabled || !host.isConnected) return;
      const doc = host.ownerDocument;
      const root = doc.createElement('div');
      root.className = 'tickers';
      root.setAttribute('aria-hidden', 'true');
      const reduced = opts.reduced();
      // UI batch: reduced motion stacks the lines in place and lets a long one wrap (celebrate.css) instead of clipping.
      if (reduced) root.dataset.reduced = '1';
      const els = [build(doc, lines[0], 1), build(doc, lines[1], 2)] as const;
      root.append(...els);
      host.appendChild(root);
      box = root;
      const win = doc.defaultView;
      const rtl = win?.getComputedStyle(root).direction === 'rtl';
      const sign = rtl ? -1 : 1;
      const s = parseFloat(win?.getComputedStyle(host).getPropertyValue('--s') ?? '') || 1;
      // Audit B14: they cross the game column (.tickers is the column, celebrate.css), not the viewport.
      const vw = root.getBoundingClientRect().width || doc.documentElement.clientWidth || win?.innerWidth || 0;
      const widths = [els[0].getBoundingClientRect().width, els[1].getBoundingClientRect().width] as const;
      const T = cfg.fx.tickers;
      let left = 2;
      const done = (el: HTMLElement): void => {
        el.remove();
        left -= 1;
        if (left <= 0 && box === root) stop();
      };
      if (reduced) {
        // In place at the column's inline start (12 s), fading in and out.
        const x = 12 * s;
        const f = cfg.fx.reducedMotionFadeMs;
        const total = f + T.reducedHoldMs + f;
        for (const el of els) {
          el.style.transform = `translateX(${sign * x}px)`;
          if (typeof el.animate === 'function') {
            try {
              const a = el.animate([{ opacity: 0 }, { opacity: 1, offset: f / total }, { opacity: 1, offset: (f + T.reducedHoldMs) / total }, { opacity: 0 }], {
                duration: total,
                delay: T.delayMs - late,
                fill: 'both',
              });
              a.onfinish = () => done(el);
              anims.push(a);
              continue;
            } catch {
              // shown still below
            }
          }
        }
        if (anims.length === 0) timer = setTimeout(() => stop(), Math.max(0, T.delayMs + total - late));
        return;
      }
      const plan = tickerPlan(widths, vw, s);
      els.forEach((el, i) => {
        const p = plan[i];
        if (!p) return;
        const from = `translateX(${sign * p.from}px)`;
        const to = `translateX(${sign * p.to}px)`;
        el.style.transform = from;
        if (typeof el.animate !== 'function') return;
        try {
          const a = el.animate([{ transform: from }, { transform: to }], { duration: p.dur, delay: p.delay - late, easing: 'linear', fill: 'both' });
          a.onfinish = () => done(el);
          anims.push(a);
        } catch {
          // no motion: removed by the timer below
        }
      });
      if (anims.length < 2) {
        const end = Math.max(...plan.map((p) => p.delay + p.dur));
        timer = setTimeout(() => stop(), Math.max(0, end - late));
      }
    },
    current: () => box,
    destroy: stop,
  };
}
