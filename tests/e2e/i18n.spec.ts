// Owner: E (phase2b §6.9). Localized layout at 320×568 (web-320) and 390×844 (web-390): for German,
// Russian, Arabic, Thai, Japanese and the pseudo-locale "xx-long" (+40 % length, accents; dev and
// e2e builds only, ?i18n=pseudo), Home, the game screen and Settings render in that language with
// no horizontal overflow, no clipped button, chip or title, and — for Arabic — dir=rtl with the board
// left to right and the top-bar actions on the right (the FB safe zone is top-left).
// Screenshots: attached to the report; with I18N_SHOTS=1 the 320 px set is also written to
// docs/i18n/screenshots/ for the native reviewers (docs/i18n/review-log.md).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { catalog as ar } from '../../src/i18n/locales/ar';
import { catalog as de } from '../../src/i18n/locales/de';
import { catalog as ja } from '../../src/i18n/locales/ja';
import { catalog as ru } from '../../src/i18n/locales/ru';
import { catalog as th } from '../../src/i18n/locales/th';

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
}

const CASES: readonly Case[] = [
  { name: 'de', browser: 'de-DE', lang: 'de', settingsTitle: de['settings.title'] ?? '' },
  { name: 'ru', browser: 'ru-RU', lang: 'ru', settingsTitle: ru['settings.title'] ?? '' },
  { name: 'ar', browser: 'ar-EG', lang: 'ar', rtl: true, settingsTitle: ar['settings.title'] ?? '' },
  { name: 'th', browser: 'th-TH', lang: 'th', settingsTitle: th['settings.title'] ?? '' },
  { name: 'ja', browser: 'ja-JP', lang: 'ja', settingsTitle: ja['settings.title'] ?? '' },
  { name: 'xx-long', browser: 'en-US', lang: 'en', pseudo: true, settingsTitle: '⟦' },
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
      '.btn, .btn__label, .chip, .chip__text, .top-bar__text, .top-bar__suffix, .overlay__title, .settings-row__label, .segmented__opt, .switch__state, .daily-card__text > *, .tool__badge, .shop__name, .victory__sub, .victory__praise, .ranking__title';
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
      await shot(page, info, c, 'game');

      if (c.rtl) {
        // The board stays left to right: column 1 (cell 0) is left of column 2 (cell 1).
        const geo = await page.evaluate(() => {
          const board = document.querySelector<HTMLElement>('.board');
          const cells = document.querySelectorAll<HTMLElement>('.cell');
          const actions = document.querySelector<HTMLElement>('.top-bar__actions');
          return {
            boardDir: board ? getComputedStyle(board).direction : '',
            x0: cells[0]?.getBoundingClientRect().left ?? 0,
            x1: cells[1]?.getBoundingClientRect().left ?? 0,
            actionsLeft: actions?.getBoundingClientRect().left ?? 0,
            width: window.innerWidth,
          };
        });
        expect(geo.boardDir).toBe('ltr');
        expect(geo.x0).toBeLessThan(geo.x1);
        expect(geo.actionsLeft, 'top-bar actions on the right').toBeGreaterThan(geo.width / 2);
      }

      // Settings (the gear is the last top-bar action).
      await page.locator('.top-bar__actions button').last().click();
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

    // Review UX-8: the shop and the win flow's screens are checked per locale too.
    test('the shop, the ranking panel and the victory fit and read in the locale', async ({ page }, info) => {
      await bootHome(page, c);
      await page.locator('.screen--home .fish-pill__plus').click();
      await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
      await page.waitForTimeout(300);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'shop');
      await page.keyboard.press('Escape');
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
      await page.waitForTimeout(800);
      await noOverflow(page);
      await noClipping(page);
      await shot(page, info, c, 'victory');
    });
  });
}

// ── Phase 2b review fixes (group U) ───────────────────────────────────────────────────────────────
// A11Y-I18N-1: Settings → Language relabels the open dialog, a Shop opened before the switch and the
// Home behind it at once. ROB-2: a locale chunk that failed is fetched again from a cache-busting URL
// when the language is chosen again. UX-3: with the FB safe zone (emulated <html data-fb-safe>) no
// dialog control sits in the top-left 64 × 64, also mirrored in Arabic. UX-8, I18N-TEXT-2: Russian
// shop names never run under their button, and the event title keeps its " · N". I18N-TEXT-1: the
// Home event card grows with 150 % text. UX-10: an Arabic price keeps its gap to its label.

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
    return JSON.stringify({ ...s, tutorialDone: true, sessions: 4, progress: { ...s.progress, level: 37, completed: 36 }, wallet: { fish: 40, earned: 40 }, ...p });
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

  test('Settings → Language relabels Settings, a Shop opened before, and Home at once', async ({ page }) => {
    await seededHome(page);
    await page.locator('.screen--home .fish-pill__plus').click();
    await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-overlay="shop"]')).toBeHidden();
    await page.locator('.screen--home .top-bar__btn--settings').click();
    await page.locator('[data-overlay="settings"] .settings__language-link').click();
    await page.locator('[data-overlay="settings"] .lang-opt[data-locale="de"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'de');
    await expect.poll(() => visibleText(page, '[data-overlay="settings"] .overlay__title')).toBe(de['settings.language']);
    await page.locator('[data-overlay="settings"] .settings__view--language .overlay__back').click();
    expect(await visibleText(page, '[data-overlay="settings"] .overlay__title')).toBe(de['settings.title']);
    expect(await visibleText(page, '[data-overlay="settings"] [data-setting="sound"] .settings-row__label')).toBe(de['settings.sound']);
    expect(await visibleText(page, '.home__tagline')).toBe(de['app.tagline']);
    await page.keyboard.press('Escape');
    await page.locator('.screen--home .fish-pill__plus').click();
    await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
    expect(await visibleText(page, '[data-overlay="shop"] .shop__section--swap .shop__heading')).toBe(de['shop.swap']);
    expect(await visibleText(page, '[data-overlay="shop"] .shop__row[data-item="hint"] .shop__name')).toBe(de['shop.swap.hint']);
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

test.describe('review fixes: Arabic (UX-3, UX-10)', () => {
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
    const zoneHits = (): Promise<string[]> =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.overlay button, .overlay a[href]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || el.closest('[hidden]')) continue;
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
    await page.keyboard.press('Escape');
    await page.locator('.screen--home .fish-pill__plus').click();
    await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await zoneHits(), 'Shop').toEqual([]);
  });

  test('a price after a button label keeps its gap in right-to-left', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-390', 'the swap button stacks below 390 px');
    await seededHome(page);
    await page.locator('.screen--home .fish-pill__plus').click();
    const btn = page.locator('[data-overlay="shop"] .shop__row[data-item="hint"] .shop__swap');
    await expect(btn).toBeVisible();
    const gap = await btn.evaluate((b) => {
      const label = (b.querySelector('.btn__label') as HTMLElement).getBoundingClientRect();
      const price = (b.querySelector('.num') as HTMLElement).getBoundingClientRect();
      return Math.min(Math.abs(label.left - price.right), Math.abs(price.left - label.right));
    });
    expect(gap).toBeGreaterThanOrEqual(6);
  });
});

test.describe('review fixes: Russian at the small phone (UX-8, I18N-TEXT-2)', () => {
  test.use({ locale: 'ru-RU' });

  test('shop names stay clear of their buttons; the event title keeps its puzzle number', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-320', 'the small phone is the tight case');
    await page.clock.setFixedTime(IN_EVENT_MS);
    await seededHome(page);
    await page.locator('.screen--home .fish-pill__plus').click();
    await expect(page.locator('[data-overlay="shop"]')).toBeVisible();
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-overlay="shop"] .shop__row')).map((row) => {
        const name = row.querySelector<HTMLElement>('.shop__name') as HTMLElement;
        const action = row.querySelector<HTMLElement>('.shop__action') as HTMLElement;
        return { name: name.textContent, sw: name.scrollWidth, cw: name.clientWidth, right: name.getBoundingClientRect().right, actionLeft: action.getBoundingClientRect().left };
      }),
    );
    for (const r of rows) {
      expect(r.sw, `${r.name} fits`).toBeLessThanOrEqual(r.cw + 1);
      expect(r.right, `${r.name} ends before its button`).toBeLessThanOrEqual(r.actionLeft + 1);
    }
    await page.keyboard.press('Escape');
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
    expect(title.text?.replace(/[⁦-⁩]/g, '')).toBe(' · 1');
    expect(title.inside).toBe(true);
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
