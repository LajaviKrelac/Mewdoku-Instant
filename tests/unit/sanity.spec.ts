// Owner: lead. Smoke tests for the shared modules (i18n, config, ramp, clock, store, events), the
// clean-room phrase guard over EVERY locale catalogue (phase2b §6.9, G-CLEAN) and the per-owner
// English catalogue split (phase2b §12.1 F0 item 7).
import { describe, expect, it } from 'vitest';
import { cfg, dragStartPx, mergeConfig } from '../../src/app/config';
import { createFakeClock, delay } from '../../src/app/clock';
import { createEventBus } from '../../src/app/events';
import { createStore } from '../../src/app/store';
import { breatherBand, breatherPool, dailySlotFor, isHardLevel, pickWeighted, rampRowFor, RAMP } from '../../src/game/ramp';
import { colorName, formatClock, formatDuration, formatShortDate, interpolate, joinList, setLocale, t, tn } from '../../src/i18n';
import { COLOR_KEYS, en, EN_PARTS } from '../../src/i18n/en';
import { BANNED_PHRASES } from '../../scripts/i18n-check';

/**
 * Known phrases of the original game (06 §3) and its event names (phase2b §0.2), plus "golden fish"
 * (our copy says "fish", differences §4). One list, shared with scripts/i18n-check.ts so the two
 * guards cannot drift; lowercase, matched case-insensitively in every catalogue.
 */
// 'kelas master': the original's Indonesian victory label (differences-vs-original §2.3; review CLEAN-1).
const REQUIRED_BANNED = ['meowdoku', 'meow cup', 'long live meow', 'moonlit meows', 'golden fish', 'exclusive territory', 'one per color', 'no touching', 'kelas master'];

/** Every translated catalogue that exists (src/i18n/locales/<id>.ts, E), keyed by file. */
const LOCALE_MODULES = import.meta.glob<{ catalog?: Record<string, string> }>('../../src/i18n/locales/*.ts', { eager: true });

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

  it('formats lists, plurals, colours, dates and times', async () => {
    expect(joinList(['Lavender'])).toBe('Lavender');
    expect(joinList(['Lavender', 'Mint'])).toBe('Lavender and Mint');
    expect(joinList(['2', '4', '5'])).toBe('2, 4 and 5');
    // Phase 2c: the lives are fish (fish-lives-spec §1.6).
    expect(tn('a11y.mistake', 1)).toBe('Wrong tile. 1 fish left.');
    expect(tn('a11y.mistake', 2)).toBe('Wrong tile. 2 fish left.');
    expect(colorName(7)).toBe('Lavender');
    expect(formatShortDate('2026-10-06')).toBe('Tue 6 Oct');
    expect(formatClock(252_000)).toBe('4:12');
    expect(formatDuration((7 * 60 + 48) * 60_000 + 5_000)).toBe('7 h 48 min');
    // phase2b §6.3 / F0: setLocale is async (it will load the locale's chunk).
    await expect(setLocale('en_US')).resolves.toBe('en');
    await expect(setLocale('xx_XX')).resolves.toBe('en');
  });

  it('has 12 colour names and stays clear of the original phrasing (06 §3)', () => {
    expect(COLOR_KEYS).toHaveLength(12);
    const all = Object.values(en).join('\n').toLowerCase();
    for (const banned of BANNED_PHRASES) expect(all, banned).not.toContain(banned);
  });

  it('the shared banned list (scripts/i18n-check.ts) is lowercase and holds the clean-room minimum', () => {
    for (const p of BANNED_PHRASES) expect(p, p).toBe(p.toLowerCase());
    for (const p of REQUIRED_BANNED) expect(BANNED_PHRASES, p).toContain(p);
  });

  it('every locale catalogue stays clear of the original phrasing too (phase2b §6.9, G-CLEAN)', () => {
    const catalogues: [string, Record<string, string>][] = [['en', en]];
    for (const [file, mod] of Object.entries(LOCALE_MODULES)) catalogues.push([file, mod.catalog ?? {}]);
    for (const [name, catalog] of catalogues) {
      const all = Object.values(catalog).join('\n').toLowerCase();
      for (const banned of BANNED_PHRASES) expect(all, `${name}: ${banned}`).not.toContain(banned);
    }
  });

  it('the English catalogue is split by owner with no key in two files (phase2b §12.1 F0 item 7)', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [part, strings] of Object.entries(EN_PARTS)) {
      for (const key of Object.keys(strings)) {
        const other = seen.get(key);
        if (other) clashes.push(`${key}: ${other} and ${part}`);
        else seen.set(key, part);
      }
    }
    expect(clashes).toEqual([]);
    expect([...seen.keys()].sort()).toEqual(Object.keys(en).sort());
  });

  it('phase2b Appendix A: the cat descriptions describe Tux; the paw booster is still "kitty"', () => {
    for (const k of ['a11y.mascot', 'a11y.illustration.boot', 'a11y.illustration.win', 'a11y.illustration.fail'] as const) {
      expect(en[k]).toMatch(/^A black-and-white cat/);
      expect(en[k].toLowerCase()).not.toContain('ginger');
    }
    expect(en['game.tool.kitty']).toBe('Kitty');
    expect(tn('event.reward.kitties', 2)).toBe('2 kitties');
    // Phase 2c (fish-lives-spec A.3): fish are no currency, so no swap copy is left.
    expect('rewarded.swap' in en).toBe(false);
  });

  it('Phase 2c: the lives are fish in the English copy; "heart" survives only as the pattern glyph and an event name', () => {
    const hearts = Object.entries(en).filter(([, v]) => /\bhearts?\b/i.test(v.replace(/\{\w+\}/g, ''))).map(([k]) => k);
    expect(hearts.sort()).toEqual(['event.yarn.name', 'glyph.9']);
    expect(t('game.hearts.a11y', { hearts: 2, max: 3 })).toBe('2 of 3 fish left');
    expect(t('fail.title')).toBe('Out of fish');
    expect(t('a11y.lost')).toBe('Out of fish.');
    expect(t('a11y.revived')).toBe('One fish back. Keep going.');
    expect(t('fail.continue.a11y.freeLabel')).toBe('Continue +1 fish');
    // No currency words for fish anywhere (glossary §2): fish are lives and leaderboard points.
    const currency = Object.entries(en).filter(([, v]) => /\b(coins?|money|wallet|swap)\b/i.test(v)).map(([k]) => k);
    expect(currency).toEqual([]);
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
