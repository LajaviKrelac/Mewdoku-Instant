// Owner: E (phase2b §6.9); G2 (Phase 2c: lives are fish in every locale, the 2c victory rows, no web
// shop; Phase 2c.1: the level-points counter and the victory's points row per locale). Localized layout at 320×568 (web-320) and 390×844 (web-390): for German,
// Russian, Arabic, Thai, Japanese and the pseudo-locale "xx-long" (+40 % length, accents; dev and
// e2e builds only, ?i18n=pseudo), Home, the game screen and Settings render in that language with
// no horizontal overflow, no clipped button, chip or title, and — for Arabic — dir=rtl with the board
// left to right and the top-bar actions on the right (the FB safe zone is top-left).
// Screenshots: attached to the report; with I18N_SHOTS=1 the 320 px set is also written to
// docs/i18n/screenshots/ for the native reviewers (docs/i18n/review-log.md).
// Phase 2c (fish-lives-spec §5.2, §7.3): the web build has no shop at all, so the shop checks moved to
// fbig.spec.ts (G3); each locale checks the lives pill's label (its own "fish left" copy) and the
// victory's kept-fish row, level points and streak chip at 320 px instead. Phase 2c.1 (fish-lives-spec
// §10.8): there is no streak chip; de, fr and ar at 320 px solve a 12×12 level for the largest level
// total ("13,248" in each locale's number format) and check that the pills row never overflows (the
// counter centred, clear of the cat counter and the lives, also while the period counter takes the cat
// counter's cell) and that the victory's points row fits.
// Phase 2d (G3, look-spec §1.4–§1.13, §5.3): the game screen's new HUD per locale: the game bar's
// Level / Score columns fit between the discs (the fit steps), the level number is never cut, the
// heads and fish pills fit, the rule cards (diagrams only at 320 px) and the score's "+N" chip stays
// clear of the gear; in Arabic the game bar mirrors (back at the right, the gear and its dot at the
// left) while the board stays left to right.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { catalog as ar } from '../../src/i18n/locales/ar';
import { catalog as de } from '../../src/i18n/locales/de';
import { catalog as fr } from '../../src/i18n/locales/fr';
import { catalog as ja } from '../../src/i18n/locales/ja';
import { catalog as ru } from '../../src/i18n/locales/ru';
import { catalog as th } from '../../src/i18n/locales/th';
import { en } from '../../src/i18n/en';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const SHOTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/i18n/screenshots');

interface Case {
  /** Report name. */
  readonly name: string;
  /** Browser locale (navigator.language). */
  readonly browser: string;
  /** The locale the game must resolve to (<html lang>). */
  readonly lang: string;
  readonly rtl?: boolean;
  readonly pseudo?: boolean;
  /** The Settings title the catalogue defines (proves the catalogue is the one on screen). */
  readonly settingsTitle: string;
  /** The catalogue's lives label template (game.hearts.a11y), filled with 3 of 3 (Phase 2c §1.1). */
  readonly livesLabel: string;
}

const lives = (template: string | undefined): string => (template ?? en['game.hearts.a11y']).replace('{hearts}', '3').replace('{max}', '3');

const CASES: readonly Case[] = [
  { name: 'de', browser: 'de-DE', lang: 'de', settingsTitle: de['settings.title'] ?? '', livesLabel: lives(de['game.hearts.a11y']) },
  { name: 'ru', browser: 'ru-RU', lang: 'ru', settingsTitle: ru['settings.title'] ?? '', livesLabel: lives(ru['game.hearts.a11y']) },
  { name: 'ar', browser: 'ar-EG', lang: 'ar', rtl: true, settingsTitle: ar['settings.title'] ?? '', livesLabel: lives(ar['game.hearts.a11y']) },
  { name: 'th', browser: 'th-TH', lang: 'th', settingsTitle: th['settings.title'] ?? '', livesLabel: lives(th['game.hearts.a11y']) },
  { name: 'ja', browser: 'ja-JP', lang: 'ja', settingsTitle: ja['settings.title'] ?? '', livesLabel: lives(ja['game.hearts.a11y']) },
  { name: 'xx-long', browser: 'en-US', lang: 'en', pseudo: true, settingsTitle: '⟦', livesLabel: '' },
];

const strip = (s: string): string => s.replace(/[⁦-⁩]/g, '').trim();

async function bootHome(page: Page, c: Case): Promise<void> {
  const url = c.pseudo ? '/?i18n=pseudo' : '/';
  await page.goto(url);
  await page.waitForFunction(() => {
    const app = (window as TestWindow).__mewdoku?.app();
    return app !== undefined && app.screen !== 'boot';
  });
  const save = await page.evaluate(() => {
    const s = (window as TestWindow).__mewdoku?.app().save;
    if (!s) throw new Error('no save');
    return JSON.stringify({ ...s, tutorialDone: true, progress: { ...s.progress, level: 37, completed: 36 } });
  });
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), save);
  await page.goto(url);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForFunction((lang) => document.documentElement.lang === lang, c.lang);
  await page.waitForTimeout(400); // entry motion
}

/** No horizontal page scroll, and no visible text element past either side of the viewport. */
async function noOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const w = window.innerWidth;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      if (el.closest('[hidden], [inert], .sr-only, [aria-hidden="true"]')) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < -1 || b.right > w + 1) out.push(`${el.className || el.tagName}: ${Math.round(b.left)}…${Math.round(b.right)}`);
    }
    return { scroll: document.documentElement.scrollWidth, width: w, out };
  });
  expect(r.scroll, 'page scrolls sideways').toBeLessThanOrEqual(r.width);
  expect(r.out, 'text outside the viewport').toEqual([]);
}

/**
 * Buttons, their labels, rule chips and titles show their whole text: nothing is cut by hidden
 * overflow or an ellipsis, and no button's text spills out of the button. (Text that wraps past its
 * own box but stays visible is left to noOverflow; the pseudo-locale reports it in the screenshots.)
 */
async function noClipping(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const out: string[] = [];
    const sel =
      '.btn, .btn__label, .chip, .chip__text, .top-bar__text, .top-bar__suffix, .overlay__title, .settings-row__label, .segmented__opt, .switch__state, .daily-card__text > *, .tool__badge, .shop__name, .victory__sub, .victory__praise, .ranking__title, .ranking__sub, .period-pill, .victory__kept, .victory__period, .victory__points, .points-pill, .points-pill__count';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest('[hidden], [inert], .sr-only')) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (el.clientWidth === 0) continue;
      const clipsX = s.overflowX !== 'visible' || s.textOverflow === 'ellipsis';
      const clipsY = s.overflowY !== 'visible' || s.webkitLineClamp !== 'none';
      const wide = clipsX && el.scrollWidth > el.clientWidth + 1;
      const tall = clipsY && el.scrollHeight > el.clientHeight + 1;
      // A button's own text must stay inside the button even when the button lets it overflow.
      const btn = el.closest<HTMLElement>('.btn');
      const spills = btn !== null && btn !== el && (() => {
        const a = el.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        return a.left < b.left - 1 || a.right > b.right + 1;
      })();
      if (wide || tall || spills) {
        out.push(`${el.className}: "${(el.textContent ?? '').trim().slice(0, 40)}" ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
      }
    }
    return out;
  });
  expect(clipped, 'clipped text').toEqual([]);
}

async function shot(page: Page, info: TestInfo, c: Case, screen: string): Promise<void> {
  const name = `${c.name}-${info.project.name}-${screen}.png`;
  const body = await page.screenshot();
  await info.attach(name, { body, contentType: 'image/png' });
  // The 320 px set is the one reviewers need (the tightest layout); 390 stays in the report.
  if (process.env.I18N_SHOTS && info.project.name === 'web-320') {
    mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS_DIR, name) });
  }
}

for (const c of CASES) {
  test.describe(`locale ${c.name}`, () => {
    test.use({ locale: c.browser });

    test('Home, game and Settings fit and read in the locale', async ({ page }, info) => {
      await bootHome(page, c);
      const html = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
      expect(html.lang).toBe(c.lang);
      expect(html.dir).toBe(c.rtl ? 'rtl' : 'ltr');
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'home');

      // Game screen.
      await page.locator('.home__play').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.waitForTimeout(900); // board entry
      await noOverflow(page);
      await noClipping(page);
      // Phase 2c §1.1: three fish where the hearts were, labelled in the locale ("3 of 3 fish left").
      await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(3);
      if (!c.pseudo) expect(strip((await page.locator('.pill--lives').getAttribute('aria-label')) ?? '')).toBe(strip(c.livesLabel));
      await shot(page, info, c, 'game');

      // Phase 2d §1.4: the game bar's columns fit between the discs; the level number is whole.
      await barFits(page);
      const geo = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.board');
        const cells = document.querySelectorAll<HTMLElement>('.cell');
        const x = (sel: string): number => document.querySelector<HTMLElement>(sel)?.getBoundingClientRect().left ?? 0;
        return {
          boardDir: board ? getComputedStyle(board).direction : '',
          x0: cells[0]?.getBoundingClientRect().left ?? 0,
          x1: cells[1]?.getBoundingClientRect().left ?? 0,
          back: x('.screen--game .top-bar__btn--back'),
          gear: x('.screen--game .top-bar__btn--settings'),
          width: window.innerWidth,
        };
      });
      // The board stays left to right in every language: column 1 (cell 0) is left of column 2 (cell 1).
      expect(geo.boardDir).toBe('ltr');
      expect(geo.x0).toBeLessThan(geo.x1);
      // The game bar mirrors in Arabic (§1.18): back at the right, the gear at the left.
      if (c.rtl) expect(geo.back, 'back disc on the right').toBeGreaterThan(geo.gear);
      else expect(geo.back, 'back disc on the left').toBeLessThan(geo.gear);

      // Settings (the gear).
      await page.locator('.screen--game .top-bar__btn--settings').click();
      const title = page.locator('.overlay__title').first();
      await expect(title).toBeVisible();
      const text = strip((await title.textContent()) ?? '');
      if (c.pseudo) expect(text.startsWith(c.settingsTitle)).toBe(true);
      else expect(text).toBe(c.settingsTitle);
      await page.waitForTimeout(300);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'settings');
    });

    // Review UX-8: the win flow's screens are checked per locale too (Phase 2c: the web has no shop;
    // the period pill, the ranking subtitle and the victory's kept-fish row and points; 2c.1: no streak chip).
    test('the period pill, the ranking panel and the victory fit and read in the locale', async ({ page }, info) => {
      await bootHome(page, c);
      await expect(page.locator('.screen--home .period-pill')).toBeVisible();
      await expect(page.locator('.screen--home .fish-pill__plus')).toHaveCount(0);
      await page.locator('.home__play').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
      const tap = page.locator('[data-overlay="ranking"] .ranking__tap');
      await expect(tap).toBeEnabled({ timeout: 10_000 });
      await page.waitForTimeout(300);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'ranking');
      await tap.click();
      await expect(page.locator('[data-overlay="victory"] .victory__primary')).toBeVisible({ timeout: 4000 });
      await expect(page.locator('[data-overlay="victory"] .victory__kept')).toBeVisible();
      await expect(page.locator('[data-overlay="victory"] .victory__points')).toBeVisible();
      await expect(page.locator('[data-overlay="victory"] .victory__streak')).toHaveCount(0);
      await page.waitForTimeout(800);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'victory');
    });
  });
}

// ── Phase 2b review fixes (group U) ───────────────────────────────────────────────────────────────
// A11Y-I18N-1: Settings → Language relabels the open dialog, a How to play opened before the switch
// and the Home behind it (its period pill too) at once. ROB-2: a locale chunk that failed is fetched
// again from a cache-busting URL when the language is chosen again. UX-3: with the FB safe zone
// (emulated <html data-fb-safe>) no dialog control sits in the top-left 64 × 64, also mirrored in
// Arabic. I18N-TEXT-2: the Russian event title keeps its " · N". I18N-TEXT-1: the Home event card
// grows with 150 % text. Phase 2c: the web has no shop (§5.2), so the shop cases (UX-8 names, UX-10
// Arabic price gap) live in fbig.spec.ts (G3).

const IN_EVENT_MS = new Date('2026-11-16T12:00:00Z').getTime();

async function seededHome(page: Page, patch: Record<string, unknown> = {}, query = '/'): Promise<void> {
  await page.goto(query);
  await page.waitForFunction(() => {
    const app = (window as TestWindow).__mewdoku?.app();
    return app !== undefined && app.screen !== 'boot';
  });
  const json = await page.evaluate((p) => {
    const s = (window as TestWindow).__mewdoku?.app().save;
    if (!s) throw new Error('no save');
    return JSON.stringify({ ...s, tutorialDone: true, sessions: 4, progress: { ...s.progress, level: 37, completed: 36 }, ...p });
  }, patch);
  await page.evaluate((j) => (window as TestWindow).__mewdoku?.seedSave(j), json);
  await page.goto(query);
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'home');
  await page.waitForTimeout(400);
}

const visibleText = (page: Page, sel: string): Promise<string> =>
  page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getClientRects().length > 0 && !e.closest('[hidden]'));
    return (el?.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  }, sel);

test.describe('review fixes: switching and loading languages (A11Y-I18N-1, ROB-2)', () => {
  test.use({ locale: 'en-US' });

  test('Settings → Language relabels Settings, a How to play opened before, and Home at once', async ({ page }) => {
    await seededHome(page);
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] .settings__howto-link').click();
    await expect(page.locator('[data-overlay="how_to_play"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-overlay="how_to_play"]')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] .settings__language-link').click();
    await page.locator('[data-overlay="settings"] .lang-opt[data-locale="de"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'de');
    await expect.poll(() => visibleText(page, '[data-overlay="settings"] .overlay__title')).toBe(de['settings.language']);
    await page.locator('[data-overlay="settings"] .settings__view--language .overlay__back').click();
    expect(await visibleText(page, '[data-overlay="settings"] .overlay__title')).toBe(de['settings.title']);
    expect(await visibleText(page, '[data-overlay="settings"] [data-setting="sound"] .settings-row__label')).toBe(de['settings.sound']);
    expect(await visibleText(page, '.home__tagline')).toBe(de['app.tagline']);
    // The Home period pill follows the language (its label is "0 Fische diese Woche").
    const pillLabel = await page.locator('.screen--home .period-pill').getAttribute('aria-label');
    expect(strip(pillLabel ?? '')).toBe((de['period.pill.week.other'] ?? '').replace('{count}', '0'));
    await page.keyboard.press('Escape');
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] .settings__howto-link').click();
    await expect(page.locator('[data-overlay="how_to_play"]')).toBeVisible();
    expect(await visibleText(page, '[data-overlay="how_to_play"] .howto__lives')).toBe(de['howto.hearts']);
    expect(await visibleText(page, '[data-overlay="how_to_play"] .howto__points')).toBe(de['howto.points.week']);
  });

  test('a locale chunk that failed loads from a cache-busting URL when the language is chosen again', async ({ page }) => {
    let n = 0;
    const urls: string[] = [];
    // The boot prefetch and the boot's own attempt both fail (an offline moment): English.
    await page.route(/\/assets\/locale-de-[^/]*\.js/, (route) => {
      n++;
      urls.push(route.request().url());
      return n <= 2 ? route.abort('failed') : route.continue();
    });
    await seededHome(page, { settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system', locale: 'de' } });
    await page.unroute(/\/assets\/locale-de-[^/]*\.js/);
    await page.route(/\/assets\/locale-de-[^/]*\.js/, (route) => {
      urls.push(route.request().url());
      return route.continue();
    });
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] .settings__language-link').click();
    await page.locator('[data-overlay="settings"] .lang-opt[data-locale="auto"]').click();
    await page.locator('[data-overlay="settings"] .lang-opt[data-locale="de"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'de', undefined, { timeout: 5000 });
    expect(urls.some((u) => /\?retry=\d+$/.test(u)), urls.join(' ')).toBe(true);
  });
});

test.describe('review fixes: Arabic (UX-3)', () => {
  test.use({ locale: 'ar-EG' });

  test('with the FB safe zone, no dialog control sits in the top-left 64 × 64 (mirrored heads too)', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-320', 'the small phone is the tight case');
    await seededHome(page);
    // Emulate the FBIG marker (the FB build's top bar sets it; the web build's clears it on render).
    await page.evaluate(() => {
      const keep = (): void => {
        if (!document.documentElement.hasAttribute('data-fb-safe')) document.documentElement.setAttribute('data-fb-safe', '');
      };
      new MutationObserver(keep).observe(document.documentElement, { attributes: true, attributeFilter: ['data-fb-safe'] });
      keep();
    });
    // A control counts when it is really there to tap: on screen, not clipped by its own scrolled
    // panel and not covered by a dialog on top (Phase 2c: How to play opens over a scrolled Settings).
    const zoneHits = (): Promise<string[]> =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.overlay button, .overlay a[href]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || el.closest('[hidden]')) continue;
          if (!el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) continue;
          if (r.left < 64 && r.top < 64) out.push(`${el.className} [${Math.round(r.left)},${Math.round(r.top)}]`);
        }
        return out;
      });
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await expect(page.locator('[data-overlay="settings"]')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await zoneHits(), 'Settings').toEqual([]);
    await page.locator('[data-overlay="settings"] .settings__about-link').click();
    await page.waitForTimeout(300);
    expect(await zoneHits(), 'About').toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('[data-overlay="settings"] .settings__howto-link').click();
    await expect(page.locator('[data-overlay="how_to_play"]')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await zoneHits(), 'How to play').toEqual([]);
  });
});

test.describe('review fixes: Russian at the small phone (I18N-TEXT-2)', () => {
  test.use({ locale: 'ru-RU' });

  test('the event title keeps its puzzle number', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-320', 'the small phone is the tight case');
    await page.clock.setFixedTime(IN_EVENT_MS);
    await seededHome(page);
    await page.locator('.event-card').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'event');
    await page.locator('.screen--event .event__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.app().screen === 'game');
    await page.waitForTimeout(600);
    const title = await page.evaluate(() => {
      const h1 = document.querySelector<HTMLElement>('.screen--game .top-bar__text') as HTMLElement;
      const suffix = h1.querySelector<HTMLElement>('.top-bar__suffix') as HTMLElement;
      const a = h1.getBoundingClientRect();
      const b = suffix.getBoundingClientRect();
      return { text: suffix.textContent, inside: b.left >= a.left - 1 && b.right <= a.right + 1 && b.width > 0 };
    });
    // Phase 2d §1.4: the Level column's value is the suffix without its separator.
    expect(title.text?.replace(/[⁦-⁩]/g, '')).toBe('1');
    expect(title.inside).toBe(true);
    await barFits(page);
  });
});

// Phase 2c.1 integration (N1): on a Hard level the Arabic title "المستوى 310" beside the "صعب" badge
// was cut to "المستوى …" at 320 px; the level number now sits in the non-shrinking suffix.
test.describe('2c.1 integration N1: Arabic Hard-level title at the small phone', () => {
  test.use({ locale: 'ar-EG' });

  test('the level title keeps its level number next to the Hard badge', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-320', 'the small phone is the tight case');
    await seededHome(page, { progress: { level: 310, completed: 309, best: {} } });
    await page.locator('.home__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await page.waitForTimeout(600);
    const title = await page.evaluate(() => {
      const h1 = document.querySelector<HTMLElement>('.screen--game .top-bar__text') as HTMLElement;
      const suffix = h1.querySelector<HTMLElement>('.top-bar__suffix') as HTMLElement;
      const badge = h1.querySelector<HTMLElement>('.badge--hard') as HTMLElement;
      const a = h1.getBoundingClientRect();
      const b = suffix.getBoundingClientRect();
      const c = badge.getBoundingClientRect();
      return { whole: h1.getAttribute('aria-label'), text: suffix.textContent, hard: !badge.hidden, inside: b.left >= a.left - 1 && b.right <= a.right + 1 && b.width > 0, apart: c.right <= b.left + 0.5 || c.left >= b.right - 0.5 };
    });
    expect(title.hard).toBe(true);
    // Phase 2d §1.4: the h1's name is the whole title; the value line holds "310" and the badge beside it.
    expect(title.whole?.replace(/[⁦-⁩]/g, '')).toBe('المستوى 310');
    expect(title.text?.replace(/[⁦-⁩]/g, '')).toBe('310');
    expect(title.inside).toBe(true);
    expect(title.apart, 'the Hard badge never covers the number').toBe(true);
    await barFits(page);
  });
});

test.describe('review fixes: larger text (I18N-TEXT-1)', () => {
  test.use({ locale: 'en-US' });

  test('the Home event card grows with 150 % text instead of clipping it', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-390', 'one size');
    await page.clock.setFixedTime(IN_EVENT_MS);
    await seededHome(page, { events: { 'lantern-walk-2026': { solved: 2, ms: 400000, lastAt: IN_EVENT_MS - 3_600_000 } } });
    await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const c = (document.querySelector('.event-card') as HTMLElement).getBoundingClientRect();
      const t = (document.querySelector('.event-card__title') as HTMLElement).getBoundingClientRect();
      const s = (document.querySelector('.event-card__sub') as HTMLElement).getBoundingClientRect();
      return { c: [c.top, c.bottom], t: [t.top, t.bottom], s: [s.top, s.bottom] };
    });
    expect(r.t[0] ?? 0).toBeGreaterThanOrEqual((r.c[0] ?? 0) - 0.5);
    expect(r.s[1] ?? 0).toBeLessThanOrEqual((r.c[1] ?? 0) + 0.5);
  });
});

// ── Phase 2c.1 (G2, fish-lives-spec §10.8): the points counter and the victory points row at 320 px ──
interface PointsCase {
  readonly name: string;
  readonly browser: string;
  readonly lang: string;
  readonly rtl?: boolean;
  /** The catalogue's victory row template (points.count.other, or the form 13 248 selects). */
  readonly row: string;
  /** The HUD label template (game.points.a11y). */
  readonly label: string;
}
const POINTS_CASES: readonly PointsCase[] = [
  { name: 'de', browser: 'de-DE', lang: 'de', row: de['points.count.other'] ?? '', label: de['game.points.a11y'] ?? '' },
  { name: 'fr', browser: 'fr-FR', lang: 'fr', row: fr['points.count.other'] ?? '', label: fr['game.points.a11y'] ?? '' },
  // 13 248 ends in 48, Arabic's "many" form.
  { name: 'ar', browser: 'ar-EG', lang: 'ar', rtl: true, row: ar['points.count.many'] ?? '', label: ar['game.points.a11y'] ?? '' },
];

/** Phase 2d §1.5: the heads pill (or the win flow's period counter over it) and the fish pill: disjoint, inside the row. */
async function rowFits(page: Page, start: '.pill--heads' | '.pills .period-pill'): Promise<void> {
  const g = await page.evaluate((first) => {
    const box = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || el.hidden || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, r: r.right };
    };
    const row = document.querySelector('.pills') as HTMLElement;
    return { row: box('.pills'), parts: [box(first), box('.pill--lives')], scroll: row.scrollWidth, client: row.clientWidth };
  }, start);
  const row = g.row as { l: number; r: number };
  for (const p of g.parts) expect(p, `${start} / lives shown`).not.toBeNull();
  const parts = (g.parts as { l: number; r: number }[]).slice().sort((a, b) => a.l - b.l);
  expect((parts[1] as { l: number }).l, 'pills overlap').toBeGreaterThanOrEqual((parts[0] as { r: number }).r - 0.5);
  expect((parts[0] as { l: number }).l).toBeGreaterThanOrEqual(row.l - 0.5);
  expect((parts[1] as { r: number }).r).toBeLessThanOrEqual(row.r + 0.5);
  expect(g.scroll, 'pills row overflows').toBeLessThanOrEqual(g.client + 1);
}

/**
 * Phase 2d §1.4 (critic C5, C9): the Level and Score columns sit between the two discs with 4 px to
 * spare and never overlap; the level number is whole (never cut, never ellipsized); a running "+N"
 * chip ends before the gear's inner edge − 4 px.
 */
async function barFits(page: Page): Promise<void> {
  const g = await page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || el.hidden || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, r: r.right };
    };
    const value = document.querySelector<HTMLElement>('.screen--game .top-bar__text .top-bar__suffix') as HTMLElement;
    const chip = document.querySelector<HTMLElement>('.screen--game .points-pill__label');
    return {
      back: rect('.screen--game .top-bar__btn--back'),
      gear: rect('.screen--game .top-bar__btn--settings') as { l: number; r: number },
      level: rect('.screen--game .top-bar__text') as { l: number; r: number },
      levelValue: rect('.screen--game .top-bar__text .top-bar__suffix') as { l: number; r: number },
      score: rect('.screen--game .top-bar--game .points-pill'),
      valueWhole: value.scrollWidth <= value.clientWidth + 1,
      chip: chip ? { l: chip.getBoundingClientRect().left, r: chip.getBoundingClientRect().right } : null,
    };
  });
  const discs = [g.back, g.gear].filter((d): d is { l: number; r: number } => d !== null).sort((a, b) => a.l - b.l);
  const left = discs.length === 2 ? (discs[0] as { r: number }).r : -Infinity;
  const right = (discs[discs.length - 1] as { l: number }).l;
  const cols = [g.level, g.score].filter((c): c is { l: number; r: number } => c !== null).sort((a, b) => a.l - b.l);
  for (const c of cols) {
    expect(c.l, 'a column under the left disc').toBeGreaterThanOrEqual(left + 4 - 1);
    expect(c.r, 'a column under the right disc').toBeLessThanOrEqual(right - 4 + 1);
  }
  if (cols.length === 2) expect((cols[1] as { l: number }).l, 'Level and Score overlap').toBeGreaterThanOrEqual((cols[0] as { r: number }).r - 0.5);
  expect(g.levelValue.r - g.levelValue.l, 'the level value shows').toBeGreaterThan(0);
  expect(g.valueWhole, 'the level value is whole').toBe(true);
  if (g.chip) {
    const gearInner = g.gear.l > (g.back?.l ?? 0) ? g.gear.l - 4 : g.gear.r + 4;
    if (g.gear.l > (g.back?.l ?? 0)) expect(g.chip.r, '"+N" before the gear').toBeLessThanOrEqual(gearInner + 1);
    else expect(g.chip.l, '"+N" before the gear').toBeGreaterThanOrEqual(gearInner - 1);
  }
}

for (const c of POINTS_CASES) {
  test.describe(`level points in ${c.name} at 320 px (2c.1 §10.8; Phase 2d: the Score column)`, () => {
    test.use({ locale: c.browser });

    test('the row fits with "13,248" in the locale\'s format, and the victory points row fits', async ({ page }, info) => {
      test.skip(info.project.name !== 'web-320', 'the small phone is the tight case');
      await seededHome(page, { progress: { level: 310, completed: 309, best: {} } });
      await page.waitForFunction((lang) => document.documentElement.lang === lang, c.lang);
      await page.locator('.home__play').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.waitForTimeout(900);
      expect(await page.evaluate(() => (window as TestWindow).__mewdoku?.solution()?.length)).toBe(12);
      await rowFits(page, '.pill--heads');
      await expect(page.locator('.pill--heads .head')).toHaveCount(12);
      await barFits(page);
      // Twelve cats in a row (through the session, as double taps): the largest level total.
      await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
      const n = page.locator('.points-pill[data-final] .points-pill__n:not(.is-out)');
      await expect(n).toBeVisible();
      await page.waitForTimeout(450); // the last roll
      const shown = strip((await n.textContent()) ?? '');
      const want = new Intl.NumberFormat(c.lang === 'ar' ? 'ar-u-nu-latn' : c.lang).format(13248);
      expect(shown.replace(/[\u00a0\u202f]/g, ' ')).toBe(want.replace(/[\u00a0\u202f]/g, ' '));
      expect(strip((await page.locator('.points-pill').getAttribute('aria-label')) ?? '')).toBe(strip(c.label.replace('{count}', shown)));
      await rowFits(page, '.pill--heads');
      await barFits(page);
      await noOverflow(page);
      await noClipping(page);
      // Phase 2d §1.13: the period counter takes the heads pill's place; the row still fits.
      await expect(page.locator('.pills .period-pill[data-in-game]')).toBeVisible({ timeout: 4000 });
      await expect(page.locator('.pill--heads')).toBeHidden({ timeout: 1000 });
      await rowFits(page, '.pills .period-pill');
      await shot(page, info, { name: c.name, browser: c.browser, lang: c.lang, settingsTitle: '', livesLabel: '' }, 'points-winflow');
      const tap = page.locator('[data-overlay="ranking"] .ranking__tap');
      await expect(tap).toBeEnabled({ timeout: 10_000 });
      await tap.click();
      const row = page.locator('[data-overlay="victory"] .victory__points');
      await expect(row).toBeVisible({ timeout: 4000 });
      await page.waitForTimeout(800);
      expect(strip((await row.textContent()) ?? '')).toBe(strip(c.row.replace('{count}', shown)));
      const fit = await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, w: window.innerWidth };
      });
      expect(fit.l).toBeGreaterThanOrEqual(16 - 0.5);
      expect(fit.r).toBeLessThanOrEqual(fit.w - 16 + 0.5);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, { name: c.name, browser: c.browser, lang: c.lang, settingsTitle: '', livesLabel: '' }, 'points-victory');
    });
  });
}
