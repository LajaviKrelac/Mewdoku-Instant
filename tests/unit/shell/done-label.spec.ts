// Owner: G3 (Phase 2d.1)
// The completion label (helpers-spec §4.3, D-2d1-6): our word, its place (anchor centre + 0.82 pitch,
// clamped 2 px inside the viewport), one label per anchor, its timings and the reduced-motion fade.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { createCelebrate } from '../../../src/ui/fx/celebrate';
import { LABEL_DROP, LABEL_MARGIN, labelAt, labelCenter } from '../../../src/ui/fx/done-label';

const rect = (left: number, top: number, w: number, h: number): DOMRect =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const translate = (el: Element): [number, number] => {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec((el as SVGElement).style.transform);
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
};

describe('the completion label (helpers-spec §4.3)', () => {
  it('our word "Done!" (≤ 8 characters), never a button', () => {
    expect(en['fx.done']).toBe('Done!');
    expect(en['fx.done'].length).toBeLessThanOrEqual(8);
  });

  it('centred at the anchor tile\'s centre + 0.82 pitch (34.7 px at pitch 42.1)', () => {
    expect(LABEL_DROP).toBe(0.82);
    expect(LABEL_MARGIN).toBe(2);
    const c = labelCenter(rect(311, 257.7, 39, 39), 42.1);
    expect(c.x).toBeCloseTo(330.5, 6);
    expect(c.y - (257.7 + 19.5)).toBeCloseTo(34.52, 2);
  });

  it('pops 0.78 → 1.07 at 83 → 1.0 at 170, opaque by 60, fades linearly from 560 to 720 (labelMs)', () => {
    expect(cfg.fx.unitDone.labelMs).toBe(720);
    expect(labelAt(0, false)).toEqual({ scale: 0.78, opacity: 0.3 });
    expect(labelAt(60, false).opacity).toBe(1);
    expect(labelAt(83, false).scale).toBe(1.07);
    expect(labelAt(170, false).scale).toBe(1);
    expect(labelAt(560, false).opacity).toBe(1);
    expect(labelAt(640, false).opacity).toBeCloseTo(0.5, 6);
    expect(labelAt(720, false).opacity).toBe(0);
    // Reduced motion: no scale; in and out over 150 ms each, the same total.
    const f = cfg.fx.reducedMotionFadeMs;
    expect(labelAt(0, true)).toEqual({ scale: 1, opacity: 0 });
    expect(labelAt(f, true).opacity).toBe(1);
    expect(labelAt(720 - f, true).opacity).toBe(1);
    expect(labelAt(720, true).opacity).toBe(0);
  });

  it('one aria-hidden label per anchor tile (units sharing an anchor share it), clamped inside the viewport, gone after labelMs', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const tiles: Record<number, DOMRect> = { 7: rect(100, 100, 39, 39), 80: rect(vw - 40, 400, 39, 39) };
    const fx = createCelebrate(layer, {
      cellRect: (c) => tiles[c] ?? null,
      color: () => 'var(--r0)',
      pitch: () => 42,
      s: () => 1,
      reduced: () => false,
      scoreRect: () => null,
      countTo: () => undefined,
    });
    // Row 0 and column 7 share their anchor (one label); colour 3 has its own.
    fx.play({
      type: 'UNITS_DONE',
      units: [
        { kind: 'row', index: 0, anchor: 7 },
        { kind: 'col', index: 7, anchor: 7 },
        { kind: 'region', index: 3, anchor: 80 },
      ],
    });
    const labels = Array.from(layer.querySelectorAll<SVGSVGElement>('svg.fx-done-label'));
    expect(labels.map((l) => l.dataset.anchor)).toEqual(['7', '80']);
    for (const l of labels) {
      expect(l.getAttribute('aria-hidden')).toBe('true');
      expect(l.querySelector('text')?.textContent).toBe('Done!');
      expect(l.querySelector('text')?.getAttribute('paint-order')).toBe('stroke');
      expect(l.querySelector('linearGradient stop')?.getAttribute('style')).toContain('var(--done-top)');
    }
    const [x1, y1] = translate(labels[0] as SVGSVGElement);
    expect(x1).toBeCloseTo(119.5, 2);
    expect(y1).toBeCloseTo(119.5 + 0.82 * 42, 2);
    // Near the right edge: moved left so its outer edge keeps 2 px.
    const [x2] = translate(labels[1] as SVGSVGElement);
    expect(x2).toBeLessThan(vw - 40 + 19.5);
    expect(labels[0]?.style.opacity).toBe('0.3');
    vi.advanceTimersByTime(cfg.fx.unitDone.labelMs + 20);
    expect(layer.querySelector('svg.fx-done-label')).toBeNull();
  });
});
