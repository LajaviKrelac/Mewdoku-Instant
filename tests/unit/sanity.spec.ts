// Owner: lead. Smoke tests for the shared modules (i18n, config, ramp, clock, store, events), the
// clean-room phrase guard over EVERY locale catalogue (phase2b §6.9, G-CLEAN) and the per-owner
// English catalogue split (phase2b §12.1 F0 item 7).
import { describe, expect, it } from 'vitest';
import { cfg, dragStartPx, mergeConfig } from '../../src/app/config';
import { createFakeClock, delay } from '../../src/app/clock';
import { createEventBus } from '../../src/app/events';
import { createStore } from '../../src/app/store';
import { breatherBand, breatherPool, dailySlotFor, isHardLevel, pickWeighted, rampRowFor, RAMP } from '../../src/game/ramp';
import { colorName, formatClock, formatDuration, formatNumber, formatShortDate, interpolate, joinList, setLocale, t, tn } from '../../src/i18n';
import { COLOR_KEYS, en, EN_PARTS } from '../../src/i18n/en';
import { displayWidth, META } from '../../src/i18n/meta';
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
    expect(joinList(['Violet'])).toBe('Violet');
    expect(joinList(['Violet', 'Denim'])).toBe('Violet and Denim');
    expect(joinList(['2', '4', '5'])).toBe('2, 4 and 5');
    // Phase 2c: the lives are fish (fish-lives-spec §1.6).
    expect(tn('a11y.mistake', 1)).toBe('Wrong tile. 1 fish left.');
    expect(tn('a11y.mistake', 2)).toBe('Wrong tile. 2 fish left.');
    expect(colorName(7)).toBe('Violet');
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

describe('Phase 2c.1 English: level points per cat (fish-lives-spec §10.4, §10.7)', () => {
  it('the HUD label, the screen-reader line, the victory row and the How to play note read as specified', () => {
    expect(t('game.points.a11y', { count: formatNumber(2016) })).toBe('Level points: 2,016');
    // Appended to the cat's own line: "Cat placed. 3 of 8. 2,016 points." (one utterance, §10.4).
    expect(`${t('a11y.catPlaced', { placed: 3, n: 8 })} ${tn('a11y.points', 2016, { count: formatNumber(2016) })}`).toBe('Cat placed. 3 of 8. 2,016 points.');
    expect(tn('a11y.points', 1, { count: formatNumber(1) })).toBe('1 point.');
    expect(tn('points.count', 7296, { count: formatNumber(7296) })).toBe('7,296 points');
    expect(tn('points.count', 13248, { count: formatNumber(13248) })).toBe('13,248 points');
    expect(en['howto.levelPoints']).toMatch(/^Every cat you find earns points/);
    // The retired per-win and perfect-streak copy is gone.
    for (const k of ['victory.points', 'victory.streak', 'victory.streak.a11y.one', 'rank.records.streak', 'rank.records.streakBest']) expect(k in en, k).toBe(false);
  });
});

describe('Phase 2d English (look-spec Appendix A; G3)', () => {
  it('the new keys read as specified; {count} is the mouse\'s cells', () => {
    expect(t('game.score')).toBe('Score');
    expect(t('game.tool.mouse')).toBe('Mouse');
    expect(t('game.tool.mouse.a11y', { count: formatNumber(cfg.mouse.cells) })).toBe('Mouse: crosses out 3 tiles that have no cat');
    expect(t('game.tool.video.a11y', { tool: t('game.tool.kitty') })).toBe('Kitty: watch a video for more');
    expect(tn('a11y.mouse', 1, { count: formatNumber(1) })).toBe('The mouse crossed out 1 tile.');
    expect(tn('a11y.mouse', 3, { count: formatNumber(3) })).toBe('The mouse crossed out 3 tiles.');
    expect(t('rewarded.title.mouse')).toBe('Call the mouse?');
    expect(t('rewarded.video.mouse', { count: '3' })).toBe('Watch a short video and the mouse crosses out 3 tiles that have no cat.');
    expect(t('rewarded.free.mouse')).toBe('The mouse is free this time.');
    expect(t('rewarded.countdown.mouse', { time: '1:05' })).toBe('The mouse is back in 1:05');
    expect(t('common.settings.new')).toBe('Settings, something new');
    expect(t('mouse.unavailable')).toBe('The mouse is hiding. Try again in a moment.');
    expect(en['howto.helpers']).toBe('Stuck? The bulb explains one step. The kitty finds a cat for you. The mouse crosses out a few tiles that have no cat.');
    expect(en['settings.patterns.note']).toBe('Adds a small symbol to every colour and outlines the crosses.');
    expect(EN_PARTS.enUi2d['game.score']).toBe('Score');
  });

  it('the start-toast lines are honest: no number, no percentage, ≤ 32 characters', () => {
    for (const k of ['toast.start.level', 'toast.start.hard', 'toast.start.retry'] as const) {
      expect(en[k], k).not.toMatch(/\d|%|players?/i);
      expect(en[k].length, k).toBeLessThanOrEqual(32);
    }
  });

  it('the cat counter\'s "3 / 8" is gone from every catalogue; its screen-reader name stays (the heads pill\'s)', () => {
    expect('game.cats' in en).toBe(false);
    expect(t('game.cats.a11y', { placed: 3, n: 10 })).toBe('3 of 10 cats placed');
    for (const [file, mod] of Object.entries(LOCALE_MODULES)) {
      expect('game.cats' in (mod.catalog ?? {}), file).toBe(false);
      expect(mod.catalog?.['game.cats.a11y'], file).toBeTruthy();
      expect(mod.catalog?.['game.score'], file).toBeTruthy();
    }
  });
});

describe('Phase 2d.1 English (helpers-spec Appendix A; G3)', () => {
  it('the new keys read as specified, in their own file', () => {
    expect(t('fx.done')).toBe('Done!');
    expect(t('a11y.unitDone', { unit: 'row 1' })).toBe('row 1 complete.');
    expect(t('ticker.best', { time: '4:12' })).toBe('Your best time here: 4:12');
    expect(tn('ticker.cats', 1, { count: '1' })).toBe('1 cat is hiding here');
    expect(tn('ticker.cats', 9, { count: '9' })).toBe('9 cats are hiding here');
    expect(tn('ticker.solved', 12, { count: '12' })).toBe("You've solved 12 levels");
    expect(tn('ticker.points', 576, { count: '576' })).toBe('576 level points so far');
    expect(t('ticker.daily')).toBe("Today's daily puzzle is waiting");
    expect(t('ticker.unique')).toBe('Every puzzle has exactly one answer');
    expect(t('ticker.tip.cat')).toBe('Tip: double-tap a tile to place a cat');
    expect(t('ticker.tip.drag')).toBe('Tip: drag across tiles to cross out many');
    expect(Object.keys(EN_PARTS.enUi2d1).sort()).toEqual(
      ['a11y.unitDone', 'fx.done', 'ticker.best', 'ticker.cats.one', 'ticker.cats.other', 'ticker.daily', 'ticker.points.one', 'ticker.points.other', 'ticker.solved.one', 'ticker.solved.other', 'ticker.tip.cat', 'ticker.tip.drag', 'ticker.unique'].sort(),
    );
    expect(t('color.4')).toBe('Denim');
  });

  it('every catalogue has the Appendix A keys and its own colour 4; "Done!" fits 8 characters everywhere; meta notes the limits', () => {
    expect(META['fx.done']?.maxLength).toBe(8);
    for (const k of Object.keys(EN_PARTS.enUi2d1).filter((k) => k.startsWith('ticker.'))) expect(META[k as keyof typeof META]?.maxLength, k).toBe(40);
    for (const [file, mod] of Object.entries(LOCALE_MODULES)) {
      const cat = mod.catalog ?? {};
      expect(cat['fx.done'], file).toBeTruthy();
      expect(displayWidth(cat['fx.done'] ?? ''), file).toBeLessThanOrEqual(8);
      for (const k of ['a11y.unitDone', 'ticker.best', 'ticker.daily', 'ticker.unique', 'ticker.tip.cat', 'ticker.tip.drag', 'ticker.cats.other', 'ticker.solved.other', 'ticker.points.other'] as const) {
        expect(cat[k], `${file} ${k}`).toBeTruthy();
      }
      expect(cat['color.4'], file).toBeTruthy();
      expect(cat['color.4'], file).not.toMatch(/^(Minze|Menta|Menthe|Hortelã|Mięta|Мята|Nane|Bạc hà|มินต์|ミント|민트|薄荷|पुदीना|نعناع|Mint)$/);
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
