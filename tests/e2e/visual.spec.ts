// Owner: A (phase2b §1.12); G2 (Phase 2c: the lives are fish, the period pill and counter, the 2c victory;
// Phase 2c.1: the level-points counter, its "+N", the period counter in the cat counter's cell, the
// victory's points row); G3 (Phase 2d: the game screen's measured look, look-spec §5.3)
// Visual review screenshots of the Classic look at 320, 390 and 1280 (the web-320, web-390 and
// web-1280 projects): Home, the fish loss, the win flight, ranking, victory, fail, settings and event.
// Phase 2d L0 (look-spec §3.2 item 1): the board capture (mid-game) moved, unchanged, to
// visual-board.spec.ts (G2). Phase 2c (fish-lives-spec §9 "screenshots re-captured"): they are stored under
// docs/phase2c/screenshots/ as G2-visual-<screen>-<width>.png (VISUAL_OUT overrides the folder) and
// reviewed by a person, never diffed in CI. Each test also asserts the few things a screenshot cannot
// show on its own: the screen is really there, the Classic tokens are live, and the 2c parts (three
// fish for lives, the period pill, the kept-fish row) are on screen. The shop is FB-only in 2c (§5.2):
// fbig.spec.ts covers it.
// Phase 2c.1 (fish-lives-spec §10.2–§10.3, §10.8): the points counter on a 12×12 level with 11 cats and
// a 5-digit total (points-hud-<width>.png), a "+N" mid-rise (points-plus-<width>.png) and the win flow
// with the period counter in column 1 (points-winflow-<width>.png) at 320, 390 and 1280; the counter
// stays centred and clear of its neighbours.
// Phase 2d (G3, look-spec §1, §5.3): the screenshots go to docs/phase2d/screenshots/ as
// G3-visual-<screen>-<width>.png (VISUAL_OUT overrides the folder). The full game screen in the
// recording's state (a 10×10 level, five X's on row 0, 3 fish, Score 0, hints 2, kitties 2) at every
// project size, and at 402 × 874 with the recording's safe areas (62 / 34) and the banner band, its rows
// checked against the measured positions (±2 px, look-spec §1.1 / §5.4); the bulb at its pulse peak;
// the start toast mid-drift; the win flow with the period counter over the heads pill; the Score's
// "+N" on a 12×12 level, clear of the gear; Home and Settings with the 2d tokens and the gear's dot.
// Phase 2d.1 (G3, helpers-spec §7.7): the start toast became the two level-start tickers (captured
// mid-crossing); the bulb pulses only after fx.helperPulse.idleMs without a move (G1 H1); the Score's
// "+N" moved over the placed tile, a star flies to the Score and it counts up (no chip in the bar). New
// captures on one of our 9 × 9 levels (273, a two-tile colour in the top-right corner) with Playwright's
// clock and the animations put at their age on it: the tickers mid-crossing, the kitty's "+N" at rest,
// the star mid-flight, the count-up mid-way, the completion label, the hint overlay settled and Apply's
// labels, at 402 × 874 (the recordings' phone) and in de and ar at 320 × 568 (G3-2d1-<moment>-<width>.png).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import { periodKeyAt } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const OUT = process.env.VISUAL_OUT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/phase2d/screenshots');
mkdirSync(OUT, { recursive: true });

const NOW = Date.now();
/** A returning player: level 12, 39 fish this week (this UTC week's key); a stale 2c `streak` record (frozen in 2c.1, never shown). */
const returning = (patch: Partial<SaveData> = {}): SaveData => {
  const base = defaults(NOW - 3 * 86_400_000);
  const key = periodKeyAt(NOW);
  return {
    ...base,
    tutorialDone: true,
    sessions: 4,
    progress: { level: 12, completed: 11, best: {} },
    streak: { current: 3, best: 9 },
    period: { key, total: 39, bestKey: key, bestTotal: 39 },
    ...patch,
  };
};

async function ready(page: Page, screen?: string): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const app = (window as TestWindow).__mewdoku?.app();
      return !!app && app.screen !== 'boot' && (!want || app.screen === want);
    },
    screen ?? null,
  );
}

async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await ready(page, 'home');
  await page.waitForTimeout(500); // the Home mascot pops in
}

async function shot(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(OUT, `G3-visual-${name}-${width}.png`) });
}

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** Client rects of the game screen's rows and parts (null when hidden). */
const hud = (page: Page) =>
  page.evaluate(() => {
    const box = (sel: string) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => !e.hidden && e.getClientRects().length > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      back: box('.top-bar--game .top-bar__btn--back'),
      gear: box('.top-bar--game .top-bar__btn--settings'),
      dot: box('.top-bar--game .top-bar__dot'),
      level: box('.top-bar__text'),
      score: box('.top-bar--game .points-pill'),
      pills: box('.pills'),
      heads: box('.pill--heads'),
      lives: box('.pill--lives'),
      rules: box('.rule-chips'),
      board: box('.board'),
      tools: box('.tool-bar .tool--paw'),
      mouse: box('.tool-bar .tool--mouse'),
      plus: box('.game-fx svg.fx-plus text'),
    };
  });

/** The rows top-down, inside the viewport, none overlapping the next (look-spec §1.1). */
async function expectStack(page: Page): Promise<Awaited<ReturnType<typeof hud>>> {
  const g = await hud(page);
  const rows = [g.back, g.pills, g.rules, g.board, g.tools] as (Box | null)[];
  for (const r of rows) expect(r, 'row shown').not.toBeNull();
  for (let k = 1; k < rows.length; k++) expect((rows[k] as Box).top, `row ${k} below row ${k - 1}`).toBeGreaterThanOrEqual((rows[k - 1] as Box).bottom - 0.5);
  for (const r of rows as Box[]) {
    expect(r.top).toBeGreaterThanOrEqual(-0.5);
    expect(r.bottom).toBeLessThanOrEqual(g.vh + 0.5);
    expect(r.left).toBeGreaterThanOrEqual(-0.5);
    expect(r.right).toBeLessThanOrEqual(g.vw + 0.5);
  }
  return g;
}

/** The recording's state (look-spec §5.4 step 1): row 0 columns 0–4 crossed out. */
async function markRow0(page: Page): Promise<void> {
  for (let c = 0; c < 5; c++) await cell(page, c).click();
  await page.waitForTimeout(400);
}

const solution = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
const cell = (page: Page, i: number) => page.locator('.cell').nth(i);

async function startLevel(page: Page): Promise<number[]> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(300);
  return solution(page);
}

/** Level 96 (10×10) as in the recording: a returning player with 2 hints and 2 kitties. */
const recordingSave = (): SaveData => returning({ progress: { level: 96, completed: 95, best: {} }, stock: { hints: 2, kitties: 2 } });

async function placeCat(page: Page, i: number): Promise<void> {
  await cell(page, i).dblclick();
  await page.waitForTimeout(350); // cellLockAfterCatMs
}

async function solve(page: Page): Promise<void> {
  const sol = await startLevel(page);
  for (let r = 0; r < sol.length; r++) await placeCat(page, r * sol.length + (sol[r] as number));
}

test.describe('Classic look, visual review (phase2b §1.12; Phase 2c)', () => {
  test('home', async ({ page }) => {
    await open(page, returning());
    await expect(page.locator('.home__mascot svg.illus--home')).toBeVisible();
    // the one token set is live: off-white page, orange accent
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { page: cs.getPropertyValue('--page').trim(), accent: cs.getPropertyValue('--accent').trim() };
    });
    expect(vars).toEqual({ page: '#f7f2ef', accent: '#e57010' });
    // Phase 2d §1.15, §2.2: the gear's red dot (Settings never opened); white round buttons.
    await expect(page.locator('.screen--home .top-bar__btn--settings .top-bar__dot')).toBeVisible();
    await expect(page.locator('.screen--home .top-bar__btn--settings')).toHaveAttribute('aria-label', 'Settings, something new');
    // Phase 2c §2.8: the period pill (this week's fish), not a fish pill with a shop "+".
    const pill = page.locator('.screen--home .top-bar .period-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('aria-label', '39 fish this week');
    await expect(pill.locator('.period-pill__n')).toHaveText('39');
    await expect(page.locator('.fish-pill, .fish-pill__plus')).toHaveCount(0);
    await shot(page, 'home');
  });

  test('a mistake: the fish loss mid-animation, then two fish left', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    await cell(page, ((sol[0] as number) + 1) % n).dblclick();
    // §1.3: the falling fish and the droplets are in the last slot while the loss plays (700 ms).
    await expect(page.locator('.life.life--lose .life__lost')).toHaveCount(1);
    await page.waitForTimeout(260);
    await shot(page, 'mistake-mid-loss');
    await page.waitForTimeout(900);
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(2);
    await expect(page.locator('.pill--lives')).toHaveAttribute('aria-label', '2 of 3 fish left');
    await expect(page.locator('.life__lost')).toHaveCount(0);
    await shot(page, 'mistake-after');
  });

  test('fail', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    // one wrong cat in each of three rows: three fish lost
    for (const r of [0, 2, 4]) await placeCat(page, r * n + (((sol[r] as number) + 1) % n));
    await expect(page.locator('.overlay[data-overlay="fail"]')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.overlay[data-overlay="fail"] .overlay__title')).toHaveText('Out of fish');
    await expect(page.locator('.fail__continue .btn__badge .btn__badge-icon use')).toHaveAttribute('href', '#icon-fish');
    await page.waitForTimeout(900);
    await shot(page, 'fail');
  });

  test('the win flight, the ranking panel and the victory', async ({ page }) => {
    await open(page, returning());
    await solve(page);
    // §2.2: the period counter shows this week's total before the win, the kept fish fly to it;
    // Phase 2d §1.13: in the heads pill's place (the heads fade out).
    const counter = page.locator('.pills .period-pill[data-in-game]');
    await expect(counter).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.pill--heads')).toBeHidden({ timeout: 1000 });
    const over = await hud(page);
    const cb = (await counter.boundingBox()) as { x: number; width: number };
    expect(Math.abs(cb.x - (over.pills as Box).left), 'over the heads pill').toBeLessThanOrEqual(1);
    await expect(page.locator('.fx-layer .fx-fish').first()).toBeAttached({ timeout: 4000 });
    await page.waitForTimeout(450);
    await shot(page, 'win-flight');
    await expect(counter).toHaveAttribute('aria-label', '42 fish this week', { timeout: 4000 });
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(0);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ranking__title')).toHaveText('Weekly ranking');
    await expect(page.locator('.ranking__sub')).toHaveText('+3 fish · This week: 42');
    await page.waitForTimeout(700);
    await shot(page, 'ranking');
    await page.waitForTimeout(1300); // the tap gate
    await page.mouse.click(10, (page.viewportSize()?.height ?? 600) - 10);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    // §2.7, 2c.1 §10.3: the level's total first, then the kept fish, "+3", "This week: 42"; no
    // "Perfect ×N" and no fish pill.
    await expect(page.locator('.victory__kept')).toHaveAttribute('data-count', '3');
    await expect(page.locator('.victory__period')).toHaveText('This week: 42');
    await expect(page.locator('.victory__points')).toHaveText(/^\d{1,2},\d{3} points$/);
    await expect(page.locator('.victory__streak, .victory__score')).toHaveCount(0);
    await expect(page.locator('.victory__top, .fish-pill')).toHaveCount(0);
    await page.waitForTimeout(900);
    await shot(page, 'victory');
  });

  test('the game screen in the recording\'s state: bar, heads, fish, cards, helpers, the pulse and the tickers', async ({ page }) => {
    await open(page, recordingSave());
    await page.locator('.home__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    // Phase 2d.1 §5 (was the 2d start toast): two tickers cross right → left on a fresh level; decorative.
    await page.waitForSelector('.game-fx[data-celebrate=ready]', { state: 'attached', timeout: 10_000 });
    const tickers = page.locator('.game-fx .tickers');
    await expect(tickers).toBeAttached();
    await expect(tickers).toHaveAttribute('aria-hidden', 'true');
    await expect(tickers.locator('.ticker')).toHaveCount(2);
    await page.waitForTimeout(2500); // both on screen, mid-crossing
    await shot(page, 'tickers');
    await markRow0(page);
    await expect(page.locator('.cell[data-s="m"]')).toHaveCount(5);
    const g = await expectStack(page);
    // The bar (§1.4): back · Level / 96 · Score / 0 · gear with the dot; the pair between the discs.
    await expect(page.locator('.top-bar__text')).toHaveAttribute('aria-label', 'Level 96');
    await expect(page.locator('.top-bar__text .top-bar__suffix')).toHaveText('96');
    await expect(page.locator('.points-pill__name')).toHaveText('Score');
    await expect(page.locator('.points-pill__n')).toHaveText('0');
    await expect(page.locator('.top-bar--game .top-bar__dot')).toBeVisible();
    for (const col of [g.level, g.score] as Box[]) {
      expect(col.left).toBeGreaterThanOrEqual((g.back as Box).right + 4 - 1);
      expect(col.right).toBeLessThanOrEqual((g.gear as Box).left - 4 + 1);
    }
    // The pills (§1.5, §1.6): ten heads, none found yet; three fish.
    await expect(page.locator('.pill--heads .head')).toHaveCount(10);
    await expect(page.locator('.pill--heads .head[data-done]')).toHaveCount(0);
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(3);
    // The cards (§1.7) and the helpers (§1.11): kitty 2, bulb 2, the mouse with its video badge. The bulb
    // pulses (X's on the board, hint stock) once fx.helperPulse.idleMs (5 s) has passed without a move
    // (2d.1 §4.6, G1 H1; the view re-renders on the 1 s tick).
    await expect(page.locator('.rule-chips .chip .chip__art')).toHaveCount(3);
    await expect(page.locator('.tool--paw .tool__badge')).toHaveText('2');
    await expect(page.locator('.tool--bulb .tool__badge')).toHaveText('2');
    await expect(page.locator('.tool--mouse')).not.toHaveAttribute('data-off', '');
    await expect(page.locator('.tool--mouse .tool__badge--video')).toBeVisible();
    await expect(page.locator('.tool--bulb')).toHaveAttribute('data-pulse', '', { timeout: 8000 });
    await expect(page.locator('.tool--paw')).not.toHaveAttribute('data-pulse', '');
    // Every round button keeps a 44 × 44 hit area at every s (critic C6): the area's corners hit the button.
    for (const sel of ['.top-bar--game .top-bar__btn--back', '.top-bar--game .top-bar__btn--settings', '.tool--paw', '.tool--bulb', '.tool--mouse']) {
      const hit = await page.evaluate((q) => {
        const el = document.querySelector<HTMLElement>(q) as HTMLElement;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // A corner past the screen's edge (a disc near the top at 320 × 568) is checked at the edge.
        const at = (v: number, max: number): number => Math.min(max - 0.5, Math.max(0.5, v));
        return [[-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5]].every(([dx, dy]) =>
          el.contains(document.elementFromPoint(at(cx + (dx as number), window.innerWidth), at(cy + (dy as number), window.innerHeight))),
        );
      }, sel);
      expect(hit, `${sel} hit area`).toBe(true);
    }
    await expect(page.locator('.game-fx .tickers')).toHaveCount(0, { timeout: 12_000 }); // crossed (2d.1 §5)
    await shot(page, 'game');
    // The bulb at its pulse peak (32 % of the 1.5 s cycle, §1.11).
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (t?.closest('.tool--bulb')) {
          a.pause();
          a.currentTime = 480;
        }
      }
    });
    await page.waitForTimeout(100);
    await shot(page, 'pulse-peak');
  });

  test('402 × 874 with the recording\'s safe areas and the banner: the rows at the measured positions (±2 px)', async ({ browser }, info) => {
    test.skip(info.project.name !== 'web-390', 'one phone size: the recording\'s');
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/?ads=ok');
    await ready(page);
    await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(recordingSave()));
    await page.reload();
    await ready(page, 'home');
    await page.addStyleTag({ content: ':root{--dev-safe-top:62px;--dev-safe-bottom:34px}' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.locator('.home__play').click();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
    await page.waitForTimeout(1200);
    await markRow0(page);
    // The recording's frame is after the tickers have crossed (2d.1 §5).
    await expect(page.locator('.game-fx .tickers')).toHaveCount(0, { timeout: 12_000 });
    const g = await expectStack(page);
    const near = (got: number, want: number, what: string): void => expect(Math.abs(got - want), `${what}: ${got.toFixed(1)} vs ${want}`).toBeLessThanOrEqual(2);
    const b = (x: Box | null): Box => x as Box;
    // look-spec §1.1, §1.4–§1.11 (the original's measured positions at 402 × 874).
    near((b(g.back).left + b(g.back).right) / 2, 31.5, 'back centre x');
    near((b(g.back).top + b(g.back).bottom) / 2, 88.0, 'back centre y');
    near((b(g.gear).left + b(g.gear).right) / 2, 370.0, 'gear centre x');
    near((b(g.dot).left + b(g.dot).right) / 2, 384.8, 'dot centre x');
    near((b(g.dot).top + b(g.dot).bottom) / 2, 73.3, 'dot centre y');
    near((b(g.level).left + b(g.level).right) / 2, 149.5, 'Level column centre');
    near((b(g.score).left + b(g.score).right) / 2, 252.0, 'Score column centre');
    near(b(g.heads).left, 12.0, 'heads pill left');
    near(b(g.heads).right, 282.0, 'heads pill right');
    near(b(g.heads).top, 124.3, 'pills top');
    near(b(g.lives).left, 293.3, 'fish pill left');
    near(b(g.rules).top, 164.0, 'rules top');
    near(b(g.rules).left, 13.3, 'rules left');
    near(b(g.board).top, 250.0, 'board top');
    near(b(g.board).left, 5.67, 'board left');
    near(b(g.tools).top, 694.0, 'helpers top');
    near((b(g.tools).left + b(g.tools).right) / 2, 98.8, 'kitty centre x');
    near((b(g.mouse).left + b(g.mouse).right) / 2, 305.0, 'mouse centre x');
    const banner = await page.locator('[data-testid="mock-banner"]').boundingBox();
    if (banner) near(banner.y, 777.7, 'banner top');
    await page.screenshot({ path: join(OUT, 'G3-visual-recording-402.png') });
    await ctx.close();
  });

  for (const lang of ['de', 'ar'] as const) {
    test(`the game screen in ${lang} at 320 × 568: the stack fits, the bar's columns stay between the discs`, async ({ page }, info) => {
      test.skip(info.project.name !== 'web-320', 'the small phone only (look-spec §5.3)');
      const save = recordingSave();
      await open(page, { ...save, settings: { ...save.settings, locale: lang } });
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await page.locator('.home__play').click();
      await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
      await page.waitForTimeout(1200);
      await markRow0(page);
      await expect(page.locator('.game-fx .tickers')).toHaveCount(0, { timeout: 12_000 });
      const g = await expectStack(page);
      // Arabic mirrors the bar: the back disc at the right, the gear at the left (§4.8).
      const [start, end] = lang === 'ar' ? [g.gear, g.back] : [g.back, g.gear];
      expect((start as Box).right).toBeLessThan((end as Box).left);
      for (const col of [g.level, g.score] as Box[]) {
        expect(col.left).toBeGreaterThanOrEqual((start as Box).right + 4 - 1);
        expect(col.right).toBeLessThanOrEqual((end as Box).left - 4 + 1);
      }
      await shot(page, `game-${lang}`);
    });
  }

  test('the Score on a 12×12 level: 11 cats in a row, each "+N" over its tile, the star, the count-up, and the win flow', async ({ page }) => {
    // Level 310 is 12×12; 11 cats in a row reach 11,616, the winning cat 13,248.
    await open(page, returning({ progress: { level: 310, completed: 309, best: {} } }));
    const sol = await startLevel(page);
    await page.waitForSelector('.game-fx[data-celebrate=ready]', { state: 'attached', timeout: 10_000 });
    const n = sol.length;
    expect(n).toBe(12);
    await expect(page.locator('.points-pill__n')).toHaveText('0');
    await expect(page.locator('.pill--heads .head')).toHaveCount(12);
    for (let r = 0; r < n - 1; r++) {
      await cell(page, r * n + (sol[r] as number)).dblclick();
      if (r < n - 2) await page.waitForTimeout(350);
    }
    // 2d.1 §2.5: the 11th cat's "+1,536" pops one pitch above its tile (inside the viewport); a star
    // flies to the Score, which then counts up. No chip in the bar.
    await expect(page.locator('.game-fx svg.fx-plus text').last()).toHaveText('+1,536');
    await page.waitForTimeout(300);
    const mid = await hud(page);
    expect((mid.plus as Box).left, '"+N" inside the viewport').toBeGreaterThanOrEqual(-0.5);
    expect((mid.plus as Box).right, '"+N" inside the viewport').toBeLessThanOrEqual(mid.vw + 0.5);
    expect((mid.plus as Box).top, '"+N" below the bar').toBeGreaterThanOrEqual((mid.gear as Box).bottom - 0.5);
    await expect(page.locator('.points-pill__chip, .points-pill__label')).toHaveCount(0);
    await shot(page, 'score-plus');
    await expect(page.locator('.game-fx .fx-star').last()).toBeAttached({ timeout: 1500 });
    await shot(page, 'score-star');
    await expect(page.locator('.points-pill__n')).toHaveText('11,616', { timeout: 4000 });
    await expect(page.locator('.pill--heads .head[data-done]')).toHaveCount(11);
    await shot(page, 'score-hud');
    await cell(page, (n - 1) * n + (sol[n - 1] as number)).dblclick();
    await expect(page.locator('.points-pill[data-final] .points-pill__n:not(.is-out)')).toHaveText('13,248');
    const counter = page.locator('.pills .period-pill[data-in-game]');
    await expect(counter).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.pill--heads')).toBeHidden({ timeout: 1000 });
    await expect(page.locator('.fx-layer .fx-fish').first()).toBeAttached({ timeout: 4000 });
    await page.waitForTimeout(450);
    await shot(page, 'score-winflow');
    // Critic C10: a running "+3" sits inside the period counter, never over the bar's columns.
    const label = page.locator('.pills .period-pill__label');
    if (await label.count()) {
      const lb = (await label.boundingBox()) as { y: number; height: number };
      const pills = (await hud(page)).pills as Box;
      expect(lb.y).toBeGreaterThanOrEqual(pills.top - 8);
    }
    await expect(page.locator('.points-pill[data-final]')).toBeVisible();
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
  });

  test('settings', async ({ page }) => {
    await open(page, returning());
    await page.locator('.top-bar__btn--settings').click();
    await expect(page.locator('.overlay[data-overlay="settings"]')).toBeVisible();
    // §5.2: the web build has no payments, so Settings has no Shop row.
    await expect(page.locator('.overlay[data-overlay="settings"] .settings__shop-link')).toBeHidden();
    await page.waitForTimeout(400);
    await shot(page, 'settings');
  });

  test('how to play: the lives are fish, the weekly points note, and the three helpers', async ({ page }) => {
    await open(page, returning());
    await page.locator('.top-bar__btn--settings').click();
    await page.locator('.overlay[data-overlay="settings"] .settings__howto-link').click();
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__lives use')).toHaveAttribute('href', '#icon-fish');
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__points')).toContainText('every Monday at 00:00 UTC');
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__points')).not.toContainText('streak');
    // 2c.1 §10.7: the level-points note with our sparkle follows it.
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__level-points use')).toHaveAttribute('href', '#icon-points');
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__level-points')).toContainText('Every cat you find earns points');
    // Phase 2d: the helpers note names the kitty, the bulb and the mouse, next to their art.
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__helpers')).toContainText('The mouse crosses out a few tiles that have no cat.');
    await expect(page.locator('.overlay[data-overlay="how_to_play"] .howto__helper-art use')).toHaveCount(3);
    await page.locator('.overlay[data-overlay="how_to_play"] .howto__helpers').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, 'howto');
  });

  test('event', async ({ page }) => {
    // inside Lantern Walk (2026-11-13 → 2026-11-27 UTC); level 12 is past its unlock level
    await page.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
    await open(page, returning());
    await expect(page.locator('.event-card')).toBeVisible();
    await shot(page, 'event-card');
    await page.locator('.event-card').click();
    await ready(page, 'event');
    await expect(page.locator('[data-event-theme="lantern-walk-2026"]').first()).toBeVisible();
    await expect(page.locator('.event__node-icon use[href="#icon-fish"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    await shot(page, 'event');
  });
});

// ── Phase 2b review fixes (group U): short phones with the banner band ─────────────────────────────
// The banner band never covers a primary action (UX-1, I18N-LAYOUT-1): the victory screen's "Done",
// "Level N" and "Puzzle N" and its Home, and the event screen's Play, Top list and Home sit at least
// ads.banner.buttonClearancePx (16) above the mock banner at 320 × 568 (web-320) and 360 × 640 and
// 375 × 667 (web-390). Home with the event card and the banner never overlaps itself (UX-2,
// I18N-LAYOUT-2). The victory rays never paint over the reward rows (UX-13; Phase 2c: the kept-fish
// row replaced the fish pill; 2c.1: the points row is the first reward row).

const IN_EVENT = new Date('2026-11-16T12:00:00Z').getTime(); // Lantern Walk: 2026-11-13 → 2026-11-27
const CLEARANCE = 16;
type Size = readonly [number, number];
const shortPhones = (project: string): readonly Size[] =>
  project === 'web-320' ? [[320, 568]] : project === 'web-390' ? [[360, 640], [375, 667]] : [];

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}
const boxOf = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getBoundingClientRect().height > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }, sel);
/** The element at the centre of `sel` is `sel` itself (nothing, the banner included, covers it). */
const onTop = (page: Page, sel: string): Promise<boolean> =>
  page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getBoundingClientRect().height > 0);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  }, sel);

async function bannerTop(page: Page): Promise<number> {
  const b = await boxOf(page, '[data-testid="mock-banner"]');
  expect(b, 'the mock banner shows').not.toBeNull();
  return (b as Box).top;
}

/** Above the band by the clearance, and really on top (a tap lands on it). */
async function clearOfBand(page: Page, sel: string, top: number, clearance = CLEARANCE): Promise<void> {
  const b = await boxOf(page, sel);
  expect(b, sel).not.toBeNull();
  expect((b as Box).bottom, `${sel} bottom vs the banner at ${top}`).toBeLessThanOrEqual(top - clearance + 0.5);
  expect(await onTop(page, sel), `${sel} is not covered`).toBe(true);
}

async function openAt(page: Page, [w, h]: Size, query = '?ads=ok'): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.clock.install({ time: IN_EVENT });
  await page.goto(`/${query}`);
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(returning({ progress: { level: 37, completed: 36, best: {} } })));
  await page.reload();
  await ready(page, 'home');
  await page.clock.runFor(1500);
}

async function playUntilVictory(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(250);
    if ((await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.status)) === 'playing') break;
  }
  await page.clock.fastForward(61_000); // past the banner's reload window
  await page.evaluate(() => (window as TestWindow).__mewdoku?.solve());
  await page.clock.runFor(6500);
  await page.locator('[data-overlay="ranking"] .ranking__tap').click();
  await page.clock.runFor(1500);
  await page.waitForTimeout(300);
  await page.clock.runFor(1000);
  await expect(page.locator('.victory')).toHaveAttribute('data-banner', '');
}

// ── Phase 2d.1 (G3, helpers-spec §7.7): the helpers' moments on one of our 9 × 9 levels ──

/** Level 273 (ours, 9 × 9): a two-tile colour at (0,8) and (1,8); one kitty, one hint. */
const helperSave = (locale?: 'de' | 'ar'): SaveData => {
  const save = returning({ progress: { level: 273, completed: 272, best: {} }, stock: { hints: 1, kitties: 1 } });
  return locale ? { ...save, settings: { ...save.settings, locale } } : save;
};

/** 2d.1 captures: docs/phase2d/screenshots/G3-2d1-<moment>-<width>.png (VISUAL_OUT overrides the folder). */
async function shot2d1(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: join(OUT, `G3-2d1-${name}-${width}.png`) });
}

/** Playwright's clock drives the timers and rAF; the CSS / WAAPI animations are put at their age on it. */
async function syncAnims(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Window & { __births?: WeakMap<Animation, number> };
    w.__births ??= new WeakMap();
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (!w.__births.has(a)) w.__births.set(a, now);
      try {
        a.pause();
        a.currentTime = now - (w.__births.get(a) as number);
      } catch {
        // finished
      }
    }
  });
}

async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1));
  await syncAnims(page);
}

/** Moves the paused clock on by ms in ≤ 8 ms steps (the fx loop's frames), animations along. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0.001; left -= 8) {
    await page.clock.runFor(Math.min(8, left));
    await syncAnims(page);
  }
}

/** Home → level 273 with the fx chunk in (the clock installed, still running). */
async function helperGame(page: Page, locale?: 'de' | 'ar', safe = false): Promise<void> {
  await page.clock.install({ time: new Date(NOW) });
  await page.goto('/?ads=ok');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(helperSave(locale)));
  await page.reload();
  await ready(page, 'home');
  if (safe) {
    await page.addStyleTag({ content: ':root{--dev-safe-top:62px;--dev-safe-bottom:34px}' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  }
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForSelector('.game-fx[data-celebrate=ready]', { state: 'attached', timeout: 10_000 });
}

/** The tickers at still-a's moment (line 2 at 0.489 of its crossing), captured, then sent off. */
async function tickersMid(page: Page, name: string): Promise<void> {
  await expect(page.locator('.game-fx .tickers .ticker')).toHaveCount(2);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('.tickers')) {
        a.pause();
        a.currentTime = 150 + 0.489 * 9000;
      }
    }
  });
  await page.waitForTimeout(100);
  const boxes = await page.locator('.game-fx .ticker').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
  const vw = page.viewportSize()?.width ?? 0;
  // Both on screen, line 2 below line 1 (separate slots).
  for (const b of boxes) expect(b.r > 0 && b.l < vw, 'a ticker on screen').toBe(true);
  expect((boxes[1] as { t: number }).t).toBeGreaterThanOrEqual((boxes[0] as { b: number }).b - 0.5);
  await shot2d1(page, name);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) if (((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('.tickers')) a.finish();
  });
  await expect(page.locator('.game-fx .tickers')).toHaveCount(0);
}

/** The kitty on (0,8) after (1,8) was crossed: "+576" at rest (300), the star (1 066), the count-up (1 450). */
async function kittyMoments(page: Page, tag: string, all: boolean): Promise<void> {
  await cell(page, 17).click(); // (1,8): the colour's other tile, so the kitty's cat completes the colour
  await page.waitForTimeout(1200);
  await pauseClock(page);
  await page.locator('.tool--paw').click();
  await page.waitForFunction(() => ((window as TestWindow).__mewdoku?.state()?.levelPoints ?? 0) > 0, null, { timeout: 10_000 });
  await syncAnims(page);
  await advance(page, 300);
  // "+576" (in Arabic the number is a bidi isolate inside the sign's run).
  await expect(page.locator('.game-fx svg.fx-plus text')).toHaveText(/^\+[\u2066-\u2069]?576[\u2066-\u2069]?$/);
  await expect(page.locator('.game-fx .fx-done-label')).toHaveCount(1); // the colour is done
  const plus = (await page.locator('.game-fx svg.fx-plus text').boundingBox()) as { x: number; width: number };
  const vw = page.viewportSize()?.width ?? 0;
  expect(plus.x).toBeGreaterThanOrEqual(0);
  expect(plus.x + plus.width).toBeLessThanOrEqual(vw);
  await shot2d1(page, `plus-${tag}`);
  await advance(page, 1066 - 300);
  await expect(page.locator('.game-fx .fx-star')).toBeAttached();
  await shot2d1(page, `star-${tag}`);
  if (all) {
    await advance(page, 1450 - 1066);
    const n = Number((await page.locator('.points-pill__n').innerText()).replace(/\D/g, ''));
    expect(n, 'mid-way through the count-up').toBeGreaterThan(0);
    expect(n).toBeLessThan(576);
    await shot2d1(page, `count-${tag}`);
    await advance(page, 2400 - 1450);
  } else {
    await advance(page, 2400 - 1066);
  }
  await expect(page.locator('.points-pill__n')).toHaveText(/576/);
  await expect(page.locator('.pill--heads .head[data-done] .head__face')).toHaveCount(1);
}

/** The hint settled (its card 5.9 s above the board, Apply 31 s below it), then Apply's labels (+66). */
async function hintMoments(page: Page, tag: string): Promise<void> {
  await advance(page, 2000);
  await page.locator('.tool--bulb').click();
  await page.waitForSelector('.overlay[data-overlay=hint]:not([hidden])', { timeout: 10_000 });
  await syncAnims(page);
  await advance(page, 2200);
  const r = await page.evaluate(() => {
    const b = (sel: string) => {
      const x = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { l: x.left, r: x.right, t: x.top, b: x.bottom };
    };
    const s = Number(getComputedStyle(document.querySelector('.screen--game') as HTMLElement).getPropertyValue('--s')) || 1;
    return { s, card: b('.hint-card'), apply: b('.hint-apply'), board: b('.board'), bar: b('.screen--game .top-bar'), vh: window.innerHeight };
  });
  const near = (got: number, want: number, what: string): void => expect(Math.abs(got - want), `${what}: ${got.toFixed(1)} vs ${want.toFixed(1)}`).toBeLessThanOrEqual(2);
  near(r.card.b, r.board.t - 5.9 * r.s, 'card bottom');
  near((r.card.l + r.card.r) / 2, (r.board.l + r.board.r) / 2, 'card centre');
  expect(r.card.t, 'card below the bar').toBeGreaterThanOrEqual(r.bar.b - 0.5);
  near(r.apply.t, r.board.b + 31 * r.s, 'Apply top');
  near((r.apply.l + r.apply.r) / 2, (r.board.l + r.board.r) / 2, 'Apply centre');
  expect(r.apply.b).toBeLessThanOrEqual(r.vh + 0.5);
  await shot2d1(page, `hint-${tag}`);
  await page.locator('.hint-apply').click();
  await syncAnims(page);
  await advance(page, 66);
  await expect(page.locator('.overlay[data-overlay=hint]')).toBeHidden();
  expect(await page.locator('.game-fx .fx-done-label').count()).toBeGreaterThanOrEqual(1);
  await shot2d1(page, `label-${tag}`);
}

test.describe('Phase 2d.1 helpers (helpers-spec §7.7): tickers, "+N", star, count-up, labels, hint', () => {
  test('402 × 874 with the recordings\' safe areas: every moment', async ({ browser }, info) => {
    test.skip(info.project.name !== 'web-390', 'the recordings\' phone');
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await helperGame(page, undefined, true);
    await tickersMid(page, 'tickers-en');
    await kittyMoments(page, 'en', true);
    await hintMoments(page, 'en');
    await ctx.close();
  });

  for (const lang of ['de', 'ar'] as const) {
    test(`${lang} at 320 × 568: the tickers, the "+N", the star, the hint and a label`, async ({ page }, info) => {
      test.skip(info.project.name !== 'web-320', 'the small phone only');
      test.setTimeout(120_000);
      await helperGame(page, lang);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await tickersMid(page, `tickers-${lang}`);
      await kittyMoments(page, lang, false);
      await hintMoments(page, lang);
    });
  }
});

test.describe('short phones with the banner band (review UX-1, UX-2, I18N-LAYOUT-1, I18N-LAYOUT-2)', () => {
  for (const variant of ['level', 'daily', 'event'] as const) {
    test(`the ${variant} victory keeps its buttons above the banner`, async ({ page }, info) => {
      const sizes = shortPhones(info.project.name);
      test.skip(sizes.length === 0, 'phone sizes only');
      for (const size of sizes) {
        await openAt(page, size);
        if (variant === 'daily') await page.locator('.daily-card').click();
        else if (variant === 'level') await page.locator('.home__play').click();
        else {
          await page.locator('.event-card').click();
          await page.clock.runFor(1500);
          await ready(page, 'event');
          await page.locator('.screen--event .event__play').click();
        }
        await playUntilVictory(page);
        const top = await bannerTop(page);
        await clearOfBand(page, '.victory__primary', top);
        if (variant !== 'daily') await clearOfBand(page, '.victory__home', top, 0);
        await shot(page, `review-victory-${variant}-banner-${size[1]}`);
      }
    });
  }

  test('the event screen keeps Play, Top list and Home above the banner', async ({ page }, info) => {
    const sizes = shortPhones(info.project.name);
    test.skip(sizes.length === 0, 'phone sizes only');
    for (const size of sizes) {
      await openAt(page, size);
      await page.clock.fastForward(61_000); // the banner may load again on the next screen
      await page.locator('.event-card').click();
      await page.clock.runFor(2000);
      await ready(page, 'event');
      await page.clock.runFor(1500);
      await expect(page.locator('.screen--event')).toHaveAttribute('data-banner', '');
      const top = await bannerTop(page);
      await clearOfBand(page, '.event__play', top);
      await clearOfBand(page, '.event__top', top, 0);
      await clearOfBand(page, '.event__home', top, 0);
    }
  });

  test('Home with the event card and the banner never overlaps itself', async ({ page }, info) => {
    const sizes = shortPhones(info.project.name);
    test.skip(sizes.length === 0, 'phone sizes only');
    for (const size of sizes) {
      await openAt(page, size);
      await page.waitForTimeout(400);
      await expect(page.locator('.screen--home')).toHaveAttribute('data-event', '');
      await expect(page.locator('.screen--home')).toHaveAttribute('data-banner', '');
      const bar = (await boxOf(page, '.screen--home .top-bar')) as Box;
      const word = (await boxOf(page, '.home__wordmark')) as Box;
      const card = (await boxOf(page, '.event-card')) as Box;
      const mascot = await boxOf(page, '.home__mascot > svg');
      expect(word.top, 'the wordmark starts below the top bar').toBeGreaterThanOrEqual(bar.bottom - 0.5);
      if (mascot) expect(mascot.bottom, 'the mascot ends above the event card').toBeLessThanOrEqual(card.top + 0.5);
      await clearOfBand(page, '.home__play', await bannerTop(page));
      await shot(page, `review-home-event-banner-${size[1]}`);
    }
  });

  test('the victory rays never paint over the kept-fish row (UX-13)', async ({ page }, info) => {
    test.skip(info.project.name !== 'web-390', 'one size is enough');
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page, returning());
    await solve(page);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(2000);
    await page.mouse.click(10, 630);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    // Make the rays solid, huge and hit-testable (hit testing follows paint order): the pill must
    // still be the element on top.
    await page.addStyleTag({
      content:
        '.victory__rays{pointer-events:auto!important;background:#f00!important;-webkit-mask-image:none!important;mask-image:none!important;width:3000px!important;height:3000px!important;margin:-1500px 0 0 -1500px!important}',
    });
    expect(await onTop(page, '.victory__kept .victory__period')).toBe(true);
    expect(await onTop(page, '.victory__points .victory__points-text')).toBe(true);
  });
});
