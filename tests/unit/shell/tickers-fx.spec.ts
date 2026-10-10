// Owner: G3 (Phase 2d.1)
// The two level-start tickers (helpers-spec §5, D-2d1-12): the text of every line kind (ticker.best with
// formatClock, the plural keys with formatNumber), both lines crossing in T with line 2 lead × T ahead,
// removal, reduced motion and RTL. jsdom has no layout: widths come from a stubbed client rect.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { createTickers, tickerPlan, tickerText, type TickerLine } from '../../../src/ui/fx/tickers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('dir');
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  document.body.textContent = '';
});

interface Call {
  readonly frames: Keyframe[];
  readonly opts: KeyframeAnimationOptions;
  readonly anim: { onfinish: (() => void) | null; cancel: () => void };
}
function fakeAnimate(): Call[] {
  const calls: Call[] = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(frames: Keyframe[], opts: KeyframeAnimationOptions) {
      const anim = { onfinish: null as (() => void) | null, cancel: vi.fn() };
      calls.push({ frames, opts, anim });
      return anim;
    },
  });
  return calls;
}

const lines: readonly [TickerLine, TickerLine] = [{ key: 'ticker.best', ms: 252_000 }, { key: 'ticker.solved', count: 1234 }];

describe('ticker lines (helpers-spec §5.4)', () => {
  it('render every key: ticker.best with formatClock, the plural keys with formatNumber, the others plain', () => {
    expect(tickerText({ key: 'ticker.best', ms: 252_000 })).toBe('Your best time here: 4:12');
    expect(tickerText({ key: 'ticker.cats', count: 9 })).toBe('9 cats are hiding here');
    expect(tickerText({ key: 'ticker.cats', count: 1 })).toBe('1 cat is hiding here');
    expect(tickerText({ key: 'ticker.solved', count: 1234 })).toBe("You've solved 1,234 levels");
    expect(tickerText({ key: 'ticker.points', count: 576 })).toBe('576 level points so far');
    expect(tickerText({ key: 'period.pill.week', count: 42 })).toBe(en['period.pill.week.other'].replace('{count}', '42'));
    for (const key of ['toast.start.level', 'toast.start.hard', 'toast.start.retry', 'ticker.daily', 'ticker.unique', 'ticker.tip.cat', 'ticker.tip.drag'] as const) {
      expect(tickerText({ key })).toBe(en[key]);
    }
  });

  it('no line states a number that is not the player\'s own or the board\'s: the new English lines have only {count} or {time}', () => {
    for (const [k, v] of Object.entries(en)) {
      if (!k.startsWith('ticker.')) continue;
      expect(v.replace(/\{(count|time)\}/g, ''), k).not.toMatch(/\d/);
      expect(v.length, k).toBeLessThanOrEqual(40);
    }
  });
});

describe('the tickers\' motion (helpers-spec §5.3)', () => {
  it('both cross in T = crossMs over vw + their own width; line 2 starts at delayMs, line 1 lead × T later', () => {
    const T = cfg.fx.tickers;
    const plan = tickerPlan([440, 394], 402);
    expect(plan[1]).toEqual({ delay: T.delayMs, dur: T.crossMs, from: 402, to: -394 });
    expect(plan[0]).toEqual({ delay: T.delayMs + Math.round(T.lead * T.crossMs), dur: T.crossMs, from: 402, to: -440 });
    expect((plan[0]?.delay ?? 0) - (plan[1]?.delay ?? 0)).toBe(774);
    // Speeds ∝ path: the longer line is faster (the stills: 324 vs 306 px moved).
    const v = plan.map((p) => (p.from - p.to) / p.dur);
    expect((v[0] ?? 0) / (v[1] ?? 1)).toBeCloseTo(842 / 796, 6);
  });

  it('builds .tickers > two .ticker[data-line][data-key] with the paw, the text and the end icon; linear WAAPI; removed when done', () => {
    const calls = fakeAnimate();
    const host = document.createElement('div');
    host.className = 'game-fx';
    document.body.appendChild(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 29, left: 0, top: 0, right: 300, bottom: 29, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    const t = createTickers({ host, reduced: () => false });
    t.play(lines);
    const root = host.querySelector('.tickers') as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const els = Array.from(root.querySelectorAll<HTMLElement>('.ticker'));
    expect(els.map((e) => [e.dataset.line, e.dataset.key])).toEqual([
      ['1', 'ticker.best'],
      ['2', 'ticker.solved'],
    ]);
    for (const e of els) {
      expect(e.querySelector(':scope > svg.ticker__paw use')?.getAttribute('href')).toBe('#art-paw-cap');
      expect(e.querySelector(':scope > span.ticker__text')).not.toBeNull();
    }
    expect(els[0]?.querySelector('svg.ticker__icon use')?.getAttribute('href')).toBe('#art-bolt');
    expect(els[1]?.querySelector('svg.ticker__icon use')?.getAttribute('href')).toBe('#art-star');
    expect(els[0]?.querySelector('.ticker__text')?.textContent).toBe('Your best time here: 4:12');
    expect(calls).toHaveLength(2);
    const vw = document.documentElement.clientWidth || window.innerWidth;
    expect(calls[0]?.frames).toEqual([{ transform: `translateX(${vw}px)` }, { transform: 'translateX(-300px)' }]);
    expect(calls[0]?.opts).toMatchObject({ duration: cfg.fx.tickers.crossMs, easing: 'linear', fill: 'both' });
    expect((calls[0]?.opts.delay as number) - (calls[1]?.opts.delay as number)).toBe(774);
    calls[1]?.anim.onfinish?.();
    expect(host.querySelectorAll('.ticker')).toHaveLength(1);
    calls[0]?.anim.onfinish?.();
    expect(host.querySelector('.tickers')).toBeNull();
    // A new board (or Retry) replaces a running pair.
    t.play(lines);
    t.play(lines);
    expect(host.querySelectorAll('.tickers')).toHaveLength(1);
    t.destroy();
    expect(host.querySelector('.tickers')).toBeNull();
  });

  it('RTL: they enter at the left edge and move right', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const calls = fakeAnimate();
    const host = document.createElement('div');
    host.style.direction = 'rtl';
    document.body.appendChild(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 250, height: 29, left: 0, top: 0, right: 250, bottom: 29, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    createTickers({ host, reduced: () => false }).play(lines);
    const vw = document.documentElement.clientWidth || window.innerWidth;
    expect(calls[0]?.frames).toEqual([{ transform: `translateX(${-vw}px)` }, { transform: 'translateX(250px)' }]);
  });

  it('reduced motion: no movement; both fade in at the column\'s inline start (12 s), hold reducedHoldMs, fade out', () => {
    const calls = fakeAnimate();
    const host = document.createElement('div');
    host.style.setProperty('--s', '1');
    host.style.setProperty('--col-w', '402px');
    document.body.appendChild(host);
    createTickers({ host, reduced: () => true }).play(lines);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.frames.every((f) => !('transform' in f))).toBe(true);
      expect(c.opts.duration).toBe(2 * cfg.fx.reducedMotionFadeMs + cfg.fx.tickers.reducedHoldMs);
    }
    const el = host.querySelector('.ticker') as HTMLElement;
    expect(el.style.transform).toMatch(/^translateX\(/);
  });

  it('off when fx.tickers.enabled is false is the session\'s call (G1); play() with the host detached shows nothing', () => {
    const host = document.createElement('div');
    createTickers({ host, reduced: () => false }).play(lines);
    expect(host.querySelector('.tickers')).toBeNull();
  });
});
