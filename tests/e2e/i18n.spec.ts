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
    const sel = '.btn, .btn__label, .chip, .chip__text, .top-bar__text, .overlay__title, .settings-row__label, .segmented__opt, .switch__state, .daily-card__text > *, .tool__badge';
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
  });
}
