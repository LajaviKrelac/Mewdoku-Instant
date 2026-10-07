// Owner: foundation. Smoke tests for the shared modules (i18n, config, ramp, clock, store, events).
import { describe, expect, it } from 'vitest';
import { cfg, dragStartPx, mergeConfig } from '../../src/app/config';
import { createFakeClock, delay } from '../../src/app/clock';
import { createEventBus } from '../../src/app/events';
import { createStore } from '../../src/app/store';
import { breatherBand, breatherPool, dailySlotFor, isHardLevel, pickWeighted, rampRowFor, RAMP } from '../../src/game/ramp';
import { colorName, formatClock, formatDuration, formatShortDate, interpolate, joinList, setLocale, t, tn } from '../../src/i18n';
import { COLOR_KEYS, en } from '../../src/i18n/en';

describe('i18n', () => {
  it('interpolates {params}', () => {
    expect(t('home.play', { level: 37 })).toBe('Level 37');
    expect(t('home.daily.size', { n: 9 })).toBe('9×9');
    expect(interpolate('{a} and {missing}', { a: 1 })).toBe('1 and {missing}');
  });

  it('type-checks params', () => {
    // @ts-expect-error missing params
    expect(t('home.play')).toBe('Level {level}');
    // @ts-expect-error no params expected
    expect(t('app.name', { x: 1 })).toBe('Mewdoku');
  });

  it('formats lists, plurals, colours, dates and times', () => {
    expect(joinList(['Lavender'])).toBe('Lavender');
    expect(joinList(['Lavender', 'Mint'])).toBe('Lavender and Mint');
    expect(joinList(['2', '4', '5'])).toBe('2, 4 and 5');
    expect(tn('a11y.mistake', 1)).toBe('Wrong tile. 1 heart left.');
    expect(tn('a11y.mistake', 2)).toBe('Wrong tile. 2 hearts left.');
    expect(colorName(7)).toBe('Lavender');
    expect(formatShortDate('2026-10-06')).toBe('Tue 6 Oct');
    expect(formatClock(252_000)).toBe('4:12');
    expect(formatDuration((7 * 60 + 48) * 60_000 + 5_000)).toBe('7 h 48 min');
    expect(setLocale('en_US')).toBe('en');
    expect(setLocale('xx_XX')).toBe('en');
  });

  it('has 12 colour names and stays clear of the original phrasing (06 §3)', () => {
    expect(COLOR_KEYS).toHaveLength(12);
    const all = Object.values(en).join('\n').toLowerCase();
    for (const banned of [
      'exclusive territory',
      'aloof',
      'guess right',
      'guess wrong',
      'non-intrusive',
      'test your iq',
      'find the cats',
      'endless levels',
      "guessing won't",
      'zero interruptions',
      'one per color',
      'no touching',
      'meowdoku',
    ]) {
      expect(all, banned).not.toContain(banned);
    }
  });
});

describe('config', () => {
  it('holds the 02 §3 values and is frozen', () => {
    expect(cfg.hearts.perAttempt).toBe(3);
    expect(cfg.ads.interstitial.cooldownSec.map((s) => s.sec)).toEqual([120, 100, 90]);
    expect(Object.isFrozen(cfg.ads.interstitial)).toBe(true);
    expect(dragStartPx(26)).toBe(8);
    expect(dragStartPx(60)).toBe(12);
    const c = mergeConfig({ ads: { enabled: false } });
    expect(c.ads.enabled).toBe(false);
    expect(c.ads.readyTimeoutMs).toBe(4000);
    expect(cfg.ads.enabled).toBe(true);
  });
});

describe('ramp', () => {
  it('covers levels 1–1000 contiguously and looks up rows, hard levels and weekdays', () => {
    expect(RAMP[0]?.from).toBe(1);
    for (let i = 1; i < RAMP.length; i++) expect(RAMP[i]?.from).toBe((RAMP[i - 1]?.to ?? 0) + 1);
    expect(RAMP[RAMP.length - 1]?.to).toBe(cfg.levels.shipped);
    expect(rampRowFor(37).sizes.map(([n]) => n)).toEqual([7, 8, 9]);
    expect(rampRowFor(5000).normal).toEqual([3, 4]);
    expect([29, 30, 31, 40].map((l) => isHardLevel(l))).toEqual([false, true, false, true]);
    expect(breatherPool([[8, 2], [9, 2], [10, 2], [11, 1]])).toEqual([[8, 2], [9, 2]]);
    expect(breatherBand([3, 4])).toEqual([3, 3]);
    expect(dailySlotFor('2026-10-06')).toEqual({ n: 8, band: [3, 3] }); // a Tuesday
    expect(pickWeighted([[5, 2], [6, 1]], () => 2)).toBe(6);
  });
});

describe('clock, store, events', () => {
  it('fake clock fires timers in order and advances time', async () => {
    const clock = createFakeClock(1000);
    const seen: string[] = [];
    clock.setTimeout(() => seen.push('b'), 20);
    clock.setTimeout(() => seen.push('a'), 10);
    const id = clock.setInterval(() => seen.push('i'), 15);
    clock.advance(31);
    clock.clearInterval(id);
    expect(seen).toEqual(['a', 'i', 'b', 'i']);
    expect(clock.now()).toBe(1031);
    const p = delay(clock, 50).then(() => seen.push('d'));
    await clock.advanceAsync(50);
    await p;
    expect(seen[seen.length - 1]).toBe('d');
  });

  it('store notifies selectors on change only', () => {
    const store = createStore({ a: 1, b: { c: 1 } });
    const calls: number[] = [];
    store.select((s) => s.a, (v) => calls.push(v));
    store.update((s) => ({ ...s, b: { c: 2 } }));
    store.update((s) => ({ ...s, a: 2 }));
    expect(calls).toEqual([2]);
  });

  it('event bus delivers typed payloads', () => {
    const bus = createEventBus<{ ping: { n: number } }>();
    let got = 0;
    const off = bus.on('ping', (p) => (got += p.n));
    bus.emit('ping', { n: 2 });
    off();
    bus.emit('ping', { n: 5 });
    expect(got).toBe(2);
  });
});
