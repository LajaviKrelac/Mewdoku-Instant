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
// Phase 2e (G3, spec §2.5, §5.3, §9.4): Home's lead is the ranking chip (the records chip while no ranking
// server is configured) and the streak strip sits under Play; the victory gains the streak row on the day's
// first counted win. Captured as G3-2e-<screen>-<width>.png in docs/phase2e/screenshots/ (VISUAL_OUT_2E
// overrides). The ranking views themselves (the post-win panel's bracket, the sheet, the result card, the name sheet,
// the Settings rows) and O2's Buy rows on the FB build are the last block of this file ("the ranking views in the real
// app"), with the ranking API answered inside the page; the 2b–2d captures keep the records path (`?flags=-ladder`).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContextOptions, type Page, type Route, type TestInfo } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { cfg } from '../../src/app/config';
import { dailyDateKey } from '../../src/game/progression';
import { defaults } from '../../src/game/save';
import { catIncrement, comboPoints, comboRuleFor, comboRunMax, periodKeyAt, pointsRuleFor } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';
import { NICK_WORDS_V1 } from '../../src/shared/nick-words';
import type { BracketRow, BracketView, PlayerView, ResultView, RulesView, SessionResponse, WinSubmission } from '../../src/shared/rank-api';
import { gotItNewRanking, gotItOn } from './helpers/new-ranking';

// Leaderboard update: the "New ranking" card is closed with Got it whenever it shows.
gotItNewRanking(test);

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

/**
 * Phase 2e: the 2b–2d captures and the 2e records chip show the personal-records path (`?flags=-ladder`, spec §7.3), also
 * in an e2e build with a ranking origin (lead L0b); the ranking views have their own block at the end of this file.
 */
async function open(page: Page, save: SaveData): Promise<void> {
  await page.goto('/?flags=-ladder');
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
    // Phase 2c §2.8: this week's fish at the lead, not a fish pill with a shop "+". Phase 2e (G3, spec §2.5):
    // the ranking chip holds the lead; with no ranking server it is the records chip (trophy + this week's
    // fish, named like the period pill) and the period pill stays hidden.
    const chip = page.locator('.screen--home .home__rank .ladder-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-state', 'records');
    await expect(chip).toHaveAttribute('aria-label', '39 fish this week');
    await expect(chip.locator('.ladder-chip__n')).toHaveText('39');
    await expect(page.locator('.screen--home .home__rank .period-pill')).toBeHidden();
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
    const sol = await startLevel(page);
    // The heads pill's box before the win (final audit B1: as wide as its heads, the pills row centred).
    const heads = (await page.locator('.pill--heads').boundingBox()) as { x: number; width: number };
    for (let r = 0; r < sol.length; r++) await placeCat(page, r * sol.length + (sol[r] as number));
    // §2.2: the period counter shows this week's total before the win, the kept fish fly to it;
    // Phase 2d §1.13: in the heads pill's place and size (the heads fade out).
    const counter = page.locator('.pills .period-pill[data-in-game]');
    await expect(counter).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.pill--heads')).toBeHidden({ timeout: 1000 });
    const over = await hud(page);
    const cb = (await counter.boundingBox()) as { x: number; width: number };
    expect(Math.abs(cb.x - heads.x), 'over the heads pill').toBeLessThanOrEqual(1);
    expect(Math.abs(cb.width - heads.width), 'as wide as the heads pill').toBeLessThanOrEqual(1);
    expect(cb.x, 'inside the pills row').toBeGreaterThanOrEqual((over.pills as Box).left - 0.5);
    await expect(page.locator('.fx-layer .fx-fish').first()).toBeAttached({ timeout: 4000 });
    await page.waitForTimeout(450);
    await shot(page, 'win-flight');
    await expect(counter).toHaveAttribute('aria-label', '42 fish this week', { timeout: 4000 });
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(0);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ranking__title')).toHaveText('Your records'); // audit B4: my records, titled as the sheet titles them
    await expect(page.locator('.ranking__sub')).toHaveText('+3 fish · This week: 42');
    await page.waitForTimeout(700);
    await shot(page, 'ranking');
    await page.waitForTimeout(1300); // the tap gate
    await page.mouse.click(10, (page.viewportSize()?.height ?? 600) - 10);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    // §2.7, 2c.1 §10.3: the level's total first, then the kept fish; no "Perfect ×N" and no fish pill. UI batch
    // (victory): the fish alone (no "+3", no "This week: 42"), the praise lines under the subtitle, no Home.
    await expect(page.locator('.victory__kept')).toHaveAttribute('data-count', '3');
    await expect(page.locator('.victory__period, .victory__plus, .victory__home')).toHaveCount(0);
    await expect(page.locator('.victory__line:not([hidden])').first()).toBeVisible();
    await expect(page.locator('.victory__points')).toHaveText(/^\d{1,2},\d{3} points$/);
    await expect(page.locator('.victory__score')).toHaveCount(0);
    // Phase 2e (G3, spec §5.3): the day's first counted win shows the streak row (a fresh streak: day 1).
    await expect(page.locator('.victory__streak .victory__streak-text')).toHaveText('Streak: day 1 of 7');
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
    const page = await gotItOn(await ctx.newPage());
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
    // look-spec §1.1, §1.4–§1.11 (the original's measured positions at 402 × 874), with the combo bar's row
    // (user, 2026-10-12): 22 under the bar, paid by barToPills −6, rulesToBoard −8, boardToTools −8, so the pills
    // and the rules sit 16 lower, the board 8 lower, and the helpers and the banner where they were.
    near((b(g.back).left + b(g.back).right) / 2, 31.5, 'back centre x');
    near((b(g.back).top + b(g.back).bottom) / 2, 88.0, 'back centre y');
    near((b(g.gear).left + b(g.gear).right) / 2, 370.0, 'gear centre x');
    near((b(g.dot).left + b(g.dot).right) / 2, 384.8, 'dot centre x');
    near((b(g.dot).top + b(g.dot).bottom) / 2, 73.3, 'dot centre y');
    near((b(g.level).left + b(g.level).right) / 2, 149.5, 'Level column centre');
    near((b(g.score).left + b(g.score).right) / 2, 252.0, 'Score column centre');
    near(b(g.heads).left, 12.0, 'heads pill left');
    near(b(g.heads).right, 282.0, 'heads pill right');
    near(b(g.heads).top, 140.3, 'pills top');
    near(b(g.lives).left, 293.3, 'fish pill left');
    near(b(g.rules).top, 180.0, 'rules top');
    near(b(g.rules).left, 13.3, 'rules left');
    near(b(g.board).top, 258.0, 'board top');
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
    // Level 310 is 12×12; 11 cats in a row, each inside the combo's countdown (the s-th at combo xs),
    // with 3 fish reach comboRunMax(11, 3) = 32,210; the winning cat adds 1,632 at x1 (the wait outlasts the 2 s) or 7,018 at x12.
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
    // 2d.1 §2.5: the 11th cat's "+6,144" (1,536 + 153.6 × 10 × 3 at combo x11) pops one pitch above its tile (inside the
    // viewport); a star flies to the Score, which then counts up. No chip in the bar.
    const rule = pointsRuleFor('level');
    const combo = comboRuleFor('level');
    const fmt = (x: number): string => x.toLocaleString('en-US');
    await expect(page.locator('.game-fx svg.fx-plus text').last()).toHaveText(`+${fmt(comboPoints(catIncrement(11, rule), 11, combo, 3))}`);
    await page.waitForTimeout(300);
    const mid = await hud(page);
    expect((mid.plus as Box).left, '"+N" inside the viewport').toBeGreaterThanOrEqual(-0.5);
    expect((mid.plus as Box).right, '"+N" inside the viewport').toBeLessThanOrEqual(mid.vw + 0.5);
    expect((mid.plus as Box).top, '"+N" below the bar').toBeGreaterThanOrEqual((mid.gear as Box).bottom - 0.5);
    await expect(page.locator('.points-pill__chip, .points-pill__label')).toHaveCount(0);
    await shot(page, 'score-plus');
    await expect(page.locator('.game-fx .fx-star').last()).toBeAttached({ timeout: 1500 });
    await shot(page, 'score-star');
    const eleven = comboRunMax(11, rule, combo, 3);
    await expect(page.locator('.points-pill__n')).toHaveText(fmt(eleven), { timeout: 4000 });
    await expect(page.locator('.pill--heads .head[data-done]')).toHaveCount(11);
    await shot(page, 'score-hud');
    await cell(page, (n - 1) * n + (sol[n - 1] as number)).dblclick();
    await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'won');
    const final = (await page.evaluate(() => (window as TestWindow).__mewdoku?.state()?.levelPoints)) ?? 0;
    expect([1, 12].map((c) => eleven + comboPoints(catIncrement(12, rule), c, combo, 3))).toContain(final);
    await expect(page.locator('.points-pill[data-final] .points-pill__n:not(.is-out)')).toHaveText(fmt(final));
    const counter = page.locator('.pills .period-pill[data-in-game]');
    await expect(counter).toBeVisible({ timeout: 4000 });
    await expect(page.locator('.pill--heads')).toBeHidden({ timeout: 1000 });
    await expect(page.locator('.fx-layer .fx-fish').first()).toBeAttached({ timeout: 4000 });
    await page.waitForTimeout(450);
    await shot(page, 'score-winflow');
    // Critic C10: a running "+3" sits inside the period counter, never over the bar's columns.
    const label = page.locator('.pills .period-pill__label');
    // The label is transient: measured once, null when it has already gone (it may leave between a count and a measure).
    const lb = (await label.count()) ? await label.boundingBox() : null;
    if (lb) {
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
  // The installed clock keeps running between the read and the pause, so pause a little ahead of it (a
  // target already passed throws "Cannot fast-forward to the past"; +1 ms raced under load at I-6).
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
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
    const page = await gotItOn(await ctx.newPage());
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
        // Phase 2e (requests-G1 R8): the victory's banner comes when the window of the board's last load ends (one timer,
        // spec §3.1), never inside it.
        await page.clock.fastForward(cfg.ads.banner.minReloadSec * 1000);
        await page.clock.runFor(1500);
        const top = await bannerTop(page);
        await clearOfBand(page, '.victory__primary', top);
        // UI batch (victory): no Home under the primary in any variant.
        await expect(page.locator('.victory__home')).toHaveCount(0);
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
    // UI batch (victory): the kept-fish row is the fish alone; the praise line sits over the rays too.
    expect(await onTop(page, '.victory__kept')).toBe(true);
    expect(await onTop(page, '.victory__line:not([hidden])')).toBe(true);
    expect(await onTop(page, '.victory__points .victory__points-text')).toBe(true);
  });
});

// ─────────────────────────────── Phase 2e (G3): the chip, the streak strip, the victory's streak row ───────────────────────────────

const OUT_2E = process.env.VISUAL_OUT_2E ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/phase2e/screenshots');
mkdirSync(OUT_2E, { recursive: true });
const DAY_MS = 86_400_000;
/** A streak counted yesterday and the day before (day 2 of the cycle); today not counted yet. */
const streakSave = (): SaveData =>
  returning({ dayStreak: { dates: [dailyDateKey(NOW - 2 * DAY_MS), dailyDateKey(NOW - DAY_MS)], run: 2, best: 9, paid: [] } });

test.describe('Phase 2e (G3): the ranking chip, the streak pill and the victory streak row', () => {
  test('Home (layout 2026-10-11): profile top left, streak pill top centre, the records chip floating at the left, Play and the daily pill low', async ({ page }) => {
    await open(page, streakSave());
    const vw = page.viewportSize()?.width ?? 0;
    const chip = page.locator('.screen--home .home__rank .ladder-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-state', 'records');
    const pill = page.locator('.screen--home .top-bar .streak-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-state', 'alive');
    await expect(pill).toHaveText('2');
    await expect(pill).toHaveAttribute('aria-label', 'Streak: day 2 of 7. Solve a puzzle today for day 3.');
    const profile = (await page.locator('.screen--home .top-bar .home__profile').boundingBox())!;
    const pillBox = (await pill.boundingBox())!;
    const gear = (await page.locator('.screen--home .top-bar__btn--settings').boundingBox())!;
    const chipBox = (await chip.boundingBox())!;
    const play = (await page.locator('.home__play').boundingBox())!;
    const daily = (await page.locator('.screen--home .daily-card').boundingBox())!;
    // Relative to Home's column (a centred column on a desktop window).
    const col = (await page.locator('.screen--home .top-bar').boundingBox())!;
    const cw = col.width;
    // One top row: profile left, pill centred, gear right.
    expect(profile.x - col.x).toBeLessThan(cw * 0.25);
    expect(Math.abs(pillBox.x + pillBox.width / 2 - vw / 2)).toBeLessThan(2);
    expect(gear.x - col.x).toBeGreaterThan(cw * 0.75);
    expect(Math.abs(profile.y + profile.height / 2 - (pillBox.y + pillBox.height / 2))).toBeLessThan(2);
    // The ranking button at the left edge, between the top row and Play; Play above the daily pill, both centred.
    expect(chipBox.x - col.x).toBeLessThan(cw * 0.1);
    expect(chipBox.y).toBeGreaterThan(profile.y + profile.height);
    expect(chipBox.y + chipBox.height).toBeLessThan(play.y);
    expect(daily.y).toBeGreaterThan(play.y + play.height);
    expect(Math.abs(play.x + play.width / 2 - vw / 2)).toBeLessThan(2);
    expect(Math.abs(daily.x + daily.width / 2 - vw / 2)).toBeLessThan(2);
    await page.screenshot({ path: join(OUT_2E, `G3-2e-home-${page.viewportSize()?.width ?? 0}.png`) });
  });

  test('victory: "Streak: day 3 of 7" on the day\'s first counted win, today\'s step filled', async ({ page }) => {
    await open(page, streakSave());
    await solve(page);
    await expect(page.locator('.overlay[data-overlay="ranking"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(2000);
    const vp = page.viewportSize() ?? { width: 390, height: 844 };
    await page.mouse.click(10, vp.height - 10);
    await expect(page.locator('.overlay[data-overlay="victory"]')).toBeVisible({ timeout: 4000 });
    const row = page.locator('.victory__streak');
    await expect(row).toBeVisible();
    await expect(row.locator('.victory__streak-text')).toHaveText('Streak: day 3 of 7');
    await expect(row.locator('.streak-step[data-kind="today"]')).toHaveCount(1);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT_2E, `G3-2e-victory-${vp.width}.png`) });
  });
});

// ─────────────────────── Phase 2e (G3): the ranking views in the real app (a route fake of the ranking API) ───────────────────────
//
// Spec §10.3 "visual.spec.ts / i18n.spec.ts (G3): the panel, sheet, result card, name sheet, O2 with Buy, streak strip at
// 320 / 390 / 1280 and in ar / de" and §7.7. The e2e builds talk to the ranking server at VITE_LADDER_URL (the web twin with
// VITE_LADDER_WEB=anon; lead L0b). These captures answer the ranking routes inside the page (page.route) with fixed answers
// in the server's wire shape (src/shared/rank-api.ts; the client checks them with its own parsers): a bracket of 37 with
// my row 5th, a paid result card, my profile. Fixed rows and times, so a capture looks the same on every run.
// TEST DATA ONLY (H-1): the names are our own word-list words, the counts are made up for layout, and nothing here reaches
// a bundle (spec §10.6 #3). The real server flows (the rows equal the server's, hearts, claims, opt-out, delete) are G1's
// ladder.spec.ts against the local dev server.
// Skipped when the build has no ranking origin (the client never asks). The O2 Buy rows need payments: the FB e2e build
// (E2E_FBIG_URL, default the fbig-e2e preview :4174) with the FBInstant stub, loaded as fbig.spec.ts loads it.
// Variants: every web project at its own size; 402 × 874 (web-390, the recordings' phone); de and ar at 320 × 568
// (web-320) with the i18n checks (no sideways overflow, no clipped button text, rtl in Arabic, names never translated).
// The de/ar ranking checks live here rather than in i18n.spec.ts so the route fake has one home (a shared helper would be
// a new file; requests-G3 R17). Captures: docs/phase2e/screenshots/G3-app-<view>-<variant>.png.

const FBIG_URL = (process.env.E2E_FBIG_URL ?? 'http://127.0.0.1:4174').replace(/\/+$/, '');
const FB_STUB_SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fbinstant-stub.js'), 'utf8');
const LADDER_ROUTE = /\/v1\/(config|session|wins|bracket|rewards|hearts|me)(\/[a-z/]*)?(\?.*)?$/;
const HOUR = 3_600_000;
const FAKE_BRACKET = 'mgk0b7q1z4a8';
const FAKE_ENDED = 'mgjz1k2a9q3x';

const FAKE_RULES: RulesView = {
  periodMode: 'rolling',
  durationMs: 24 * HOUR,
  maxMembers: 50,
  scoringModes: ['level', 'daily', 'event'],
  places: [
    { place: 1, hints: 2, kitties: 2 },
    { place: 2, hints: 1, kitties: 1 },
    { place: 3, hints: 1, kitties: 0 },
  ],
  minMembers: 5,
  doubleByVideo: true,
  claimTtlMs: 7 * 24 * HOUR,
  hearts: { enabled: true, allowSelf: true, maxGivenPerBracket: 20 },
  nickname: { freeText: false, changeCooldownMs: 24 * HOUR },
};

interface FakeOpts {
  /** Players in my bracket (me included) at sign-in; 0 = no bracket yet (my next win opens one with me alone). */
  readonly members?: number;
  /** My points at sign-in (the others' are fixed, best first: 31, 31, 30, 29, 27, 27, 26, 25, …). */
  readonly myPoints?: number;
  /** Finished brackets of the last days (result cards). */
  readonly results?: readonly ResultView[];
  readonly pool?: 'web' | 'fb';
}

interface FakeLadder {
  /** "METHOD /v1/path" of every call the page made. */
  readonly calls: string[];
}

/** The other players of the fixture bracket: our own words, fixed points falling with the place. */
function fakeOthers(n: number): { slot: number; nickname: string; avatarId: number; points: number; hearts: number; likedByMe: boolean }[] {
  const top = [31, 31, 30, 29, 27, 27, 26, 25, 24];
  return Array.from({ length: n }, (_, i) => ({
    slot: i + 1,
    nickname: `${NICK_WORDS_V1.adj[(i * 17 + 9) % NICK_WORDS_V1.adj.length]} ${NICK_WORDS_V1.noun[(i * 23 + 4) % NICK_WORDS_V1.noun.length]} ${((i * 37) % 99) + 1}`,
    avatarId: (i * 5 + 1) % 12,
    points: top[i] ?? Math.max(1, 24 - Math.floor((i - 8) * 0.8)),
    hearts: i % 4,
    likedByMe: i === 1,
  }));
}

/** A finished bracket I took 2nd place in, with an unclaimed reward (the result card's paid case). */
const paidResult = (now: number): ResultView => ({
  bracketId: FAKE_ENDED,
  endedAt: now - 2 * HOUR,
  place: 2,
  members: 37,
  points: 31,
  reward: { rewardId: `${FAKE_ENDED}:7`, place: 2, grant: { hints: 1, kitties: 1 }, canDouble: true, expiresAt: now + 5 * 24 * HOUR, claim: null },
});

/** Answers the ranking API inside the page (the e2e build's VITE_LADDER_URL, whatever its host). */
async function fakeLadder(page: Page, o: FakeOpts = {}): Promise<FakeLadder> {
  const calls: string[] = [];
  const t0 = Date.now();
  const pool = o.pool ?? 'web';
  const endsAt = t0 + 7 * HOUR + 47 * 60_000 + 30_000;
  let me: PlayerView = {
    code: '7KQ2M9XD',
    nickname: 'Velvet Pounce 27',
    nick: { adj: 2, noun: 5, num: 27 },
    avatarId: 4,
    status: 'ok',
    pool,
    trust: pool === 'fb' ? 'signed' : 'anon',
    listed: true,
    nicknameChangeAt: null,
  };
  const members0 = o.members ?? 37;
  let inBracket = members0 > 0;
  const others = fakeOthers(Math.max(0, members0 - 1));
  let myPoints = o.myPoints ?? 25;
  const results = [...(o.results ?? [])];
  const view = (): BracketView => {
    const now = Date.now();
    if (!inBracket) {
      return { state: 'none', bracketId: null, pool, mode: 'rolling', openedAt: null, endsAt: null, members: 0, maxMembers: 50, rows: [], me: null, final: false, heartsNew: 0, result: null, serverTime: now };
    }
    const all = [...others.map((r) => ({ ...r, me: false })), { slot: 0, nickname: me.nickname, avatarId: me.avatarId, points: myPoints, hearts: others.length > 0 ? 2 : 0, likedByMe: false, me: true }];
    all.sort((a, b) => b.points - a.points || Number(a.me) - Number(b.me));
    // Leaderboard update: fixed activity per place ("Playing now", "Online now", "Nm ago"; mine is now).
    const ago = [0, 30_000, 4 * 60_000, 11 * 60_000, 47 * 60_000, 3 * HOUR];
    const rows: BracketRow[] = all.map((r, k) => ({
      rank: k + 1,
      slot: r.slot,
      nickname: r.nickname,
      avatarId: r.avatarId,
      points: r.points,
      hearts: r.hearts,
      me: r.me,
      likedByMe: r.likedByMe,
      seenAt: r.me ? now : now - (ago[k % ago.length] as number),
      playing: !r.me && k % ago.length === 0,
    }));
    return {
      state: 'open',
      bracketId: FAKE_BRACKET,
      pool,
      mode: 'rolling',
      openedAt: endsAt - 24 * HOUR,
      endsAt,
      members: rows.length,
      maxMembers: 50,
      rows,
      me: rows.find((r) => r.me) ?? null,
      final: false,
      heartsNew: 0,
      result: null,
      serverTime: now,
    };
  };
  const session = (): SessionResponse => {
    const v = view();
    return {
      token: `v1.${'e'.repeat(48)}.${'f'.repeat(32)}`,
      expiresAt: Date.now() + 24 * HOUR,
      player: me,
      rules: FAKE_RULES,
      results,
      bracket: v.state === 'none' ? null : { state: v.state, bracketId: v.bracketId, rank: v.me?.rank ?? null, members: v.members, points: myPoints, endsAt: v.endsAt },
      limits: { maxWinsPerRequest: 10, queueMax: 20 },
      serverTime: Date.now(),
    };
  };

  await page.route(LADDER_ROUTE, async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*?(\/v1\/)/, '/v1/');
    const cors = {
      'Access-Control-Allow-Origin': req.headers().origin ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '7200',
      Vary: 'Origin',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const key = `${req.method()} ${path}`;
    calls.push(key);
    const reply = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: body === null ? '' : JSON.stringify(body) });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    const now = Date.now();
    switch (key) {
      case 'GET /v1/config':
        return reply(200, { switches: {}, ttlSec: 3600, serverTime: now });
      case 'POST /v1/session/nonce':
        return reply(200, { nonce: `n1.${(now + 300_000).toString(36)}.${'a'.repeat(16)}.${'b'.repeat(16)}`, expiresAt: now + 300_000, serverTime: now });
      case 'POST /v1/session':
        return reply(200, session());
      case 'POST /v1/wins': {
        const wins = (Array.isArray(body.wins) ? body.wins : []) as WinSubmission[];
        inBracket = true;
        myPoints += wins.reduce((n, w) => n + w.fish, 0);
        return reply(200, { results: wins.map((w) => ({ winId: w.winId, verdict: 'accepted', points: w.fish })), windowPoints: myPoints, bracket: view(), serverTime: now });
      }
      case 'GET /v1/bracket':
        return reply(200, view());
      case 'POST /v1/hearts': {
        const slot = Number(body.slot);
        const row = others.find((r) => r.slot === slot);
        if (row) {
          row.hearts += 1;
          row.likedByMe = true;
        }
        return reply(200, { bracketId: FAKE_BRACKET, slot, hearts: row?.hearts ?? 3, likedByMe: true, givenInBracket: 1, serverTime: now });
      }
      case 'POST /v1/rewards/claim': {
        const r = results.find((x) => x.reward?.rewardId === body.rewardId);
        if (!r?.reward) return reply(404, { error: { code: 'not_found', message: 'reward' }, serverTime: now });
        const k = body.double === true ? 2 : 1;
        return reply(200, { rewardId: r.reward.rewardId, grant: { hints: r.reward.grant.hints * k, kitties: r.reward.grant.kitties * k }, doubled: k === 2, claimedAt: now, place: r.place, alreadyClaimed: false, serverTime: now });
      }
      case 'PUT /v1/me/profile': {
        const n = body.nickname as { adj?: number; noun?: number; num?: number } | undefined;
        if (n && typeof n.adj === 'number' && typeof n.noun === 'number') {
          const num = typeof n.num === 'number' ? n.num : 1;
          me = { ...me, nick: { adj: n.adj, noun: n.noun, num }, nickname: `${NICK_WORDS_V1.adj[n.adj]} ${NICK_WORDS_V1.noun[n.noun]} ${num}`, nicknameChangeAt: now + 24 * HOUR };
        }
        if (typeof body.avatarId === 'number') me = { ...me, avatarId: body.avatarId };
        if (typeof body.listed === 'boolean') me = { ...me, listed: body.listed };
        return reply(200, { player: me, serverTime: now });
      }
      case 'GET /v1/me':
        return reply(200, { player: me, data: { brackets: 4, wins30d: 63, rewards: 2, createdAt: now - 30 * 24 * HOUR }, serverTime: now });
      case 'DELETE /v1/me':
        return reply(204, null);
      default:
        return reply(404, { error: { code: 'not_found', message: path }, serverTime: now });
    }
  });
  return { calls };
}

interface Variant {
  /** The screenshot suffix ('size' = the project's own width). */
  readonly id: string;
  /** The project it runs in (null: every web project that runs visual.spec.ts). */
  readonly project: string | null;
  readonly ctx?: BrowserContextOptions;
  /** The UI language this variant must show (the browser locale picks it). */
  readonly lang?: 'de' | 'ar';
  /** The FB stub's getLocale() for the O2 capture on the FB build. */
  readonly fbLocale?: string;
}

const PHONE_320: BrowserContextOptions = { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const VARIANTS: readonly Variant[] = [
  { id: 'size', project: null },
  { id: '402', project: 'web-390', ctx: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
  { id: 'de-320', project: 'web-320', lang: 'de', fbLocale: 'de_DE', ctx: { ...PHONE_320, locale: 'de-DE' } },
  { id: 'ar-320', project: 'web-320', lang: 'ar', fbLocale: 'ar_AR', ctx: { ...PHONE_320, locale: 'ar-EG' } },
];

/** Runs `fn` on the variant's page: the test's own page, or a page of a fresh context with the variant's options. */
async function onVariant(browser: Browser, page: Page, info: TestInfo, v: Variant, fn: (p: Page, suffix: string) => Promise<void>): Promise<void> {
  test.skip(v.project !== null && info.project.name !== v.project, `variant ${v.id} runs in ${v.project}`);
  if (!v.ctx) return fn(page, String(page.viewportSize()?.width ?? 0));
  const ctx = await browser.newContext(v.ctx);
  try {
    await fn(await gotItOn(await ctx.newPage()), v.id);
  } finally {
    await ctx.close();
  }
}

const shot2e = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: join(OUT_2E, `G3-app-${name}.png`) });

/** Opens the web build with the route fake and `save`; resolves once the ranking client signed in (else skips). */
async function openRanked(page: Page, save: SaveData, o: FakeOpts = {}): Promise<FakeLadder> {
  const fake = await fakeLadder(page, o);
  await page.goto('/?ads=ok');
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(save));
  await page.reload();
  await ready(page, 'home');
  const signedIn = await page
    .waitForFunction(() => (window as TestWindow).__mewdoku?.ladder?.()?.signedIn === true, undefined, { timeout: 10_000 })
    .then(() => true, () => false);
  test.skip(!signedIn && !fake.calls.some((c) => c.startsWith('POST /v1/session')), 'this build has no ranking origin (VITE_LADDER_URL + VITE_LADDER_WEB=anon, lead L0b)');
  expect(signedIn, `the client signed in (${fake.calls.join(', ')})`).toBe(true);
  await page.waitForTimeout(500); // the Home mascot pops in
  return fake;
}

/** The language checks of a variant: <html lang/dir>, and the given text holds none of the English words. */
async function expectLang(page: Page, v: Variant, sample: string, english: RegExp): Promise<void> {
  if (!v.lang) return;
  await expect(page.locator('html')).toHaveAttribute('lang', v.lang);
  await expect(page.locator('html')).toHaveAttribute('dir', v.lang === 'ar' ? 'rtl' : 'ltr');
  expect(sample, `${v.lang}: "${sample}"`).not.toMatch(english);
}

/**
 * Fit checks on small screens (spec §10.3 layout, §7.7): no sideways page scroll; every visible text and button of
 * `root` inside the viewport sideways; no button's own text spills out of it or is cut by an ellipsis.
 */
async function expectFits(page: Page, root: string): Promise<void> {
  const r = await page.evaluate((sel) => {
    const out: string[] = [];
    const w = window.innerWidth;
    const host = document.querySelector(sel);
    if (!host) return { scroll: 0, width: w, out: [`missing ${sel}`] };
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      if (el.closest('[hidden], [inert], .sr-only, [aria-hidden="true"]')) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!hasText && !el.matches('button')) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < -1 || b.right > w + 1) out.push(`${el.className || el.tagName} outside: ${Math.round(b.left)}…${Math.round(b.right)}`);
      const btn = el.closest<HTMLElement>('button');
      if (btn && btn !== el && hasText) {
        const a = btn.getBoundingClientRect();
        if (b.left < a.left - 1 || b.right > a.right + 1) out.push(`${el.className} spills out of its button`);
        if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} cut: "${el.textContent}"`);
      }
    }
    // A dialog title never runs under its head's round buttons (a long German compound at 320 px).
    for (const head of Array.from(host.querySelectorAll<HTMLElement>('.overlay__head'))) {
      if (head.closest('[hidden]') || head.getClientRects().length === 0) continue;
      const title = head.querySelector<HTMLElement>('.overlay__title');
      if (!title) continue;
      const range = document.createRange();
      range.selectNodeContents(title);
      const text = Array.from(range.getClientRects());
      for (const btn of Array.from(head.querySelectorAll<HTMLElement>('button'))) {
        if (btn.closest('[hidden]') || btn.getClientRects().length === 0) continue;
        const b = btn.getBoundingClientRect();
        if (text.some((t) => t.right > b.left + 1 && t.left < b.right - 1 && t.bottom > b.top + 1 && t.top < b.bottom - 1)) out.push(`title "${title.textContent}" under ${btn.className}`);
      }
    }
    return { scroll: document.documentElement.scrollWidth, width: w, out };
  }, root);
  expect(r.scroll, 'page scrolls sideways').toBeLessThanOrEqual(r.width);
  expect(r.out).toEqual([]);
}

/** `el` lies inside `scroller`'s visible box (vertically). */
async function inScrollView(page: Page, scroller: string, el: string): Promise<boolean> {
  return page.evaluate(
    ([s, e]) => {
      const a = document.querySelector(s as string)?.getBoundingClientRect();
      const b = document.querySelector(e as string)?.getBoundingClientRect();
      return !!a && !!b && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    },
    [scroller, el],
  );
}

/** A box inside the viewport. */
async function inViewport(page: Page, sel: string): Promise<boolean> {
  const b = await page.locator(sel).first().boundingBox();
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  return !!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
}

test.describe('Phase 2e (G3): the ranking views in the real app (route fake; spec §2.4–§2.7, §4.1, §7.7, §10.3)', () => {
  for (const v of VARIANTS) {
    test(`[${v.id}] the post-win panel: my bracket of 37, exactly the rows sent, my row centred, the footer in view`, async ({ browser, page }, info) => {
      await onVariant(browser, page, info, v, async (p, suffix) => {
        await openRanked(p, returning());
        await p.locator('.home__play').click();
        await p.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
        await p.waitForTimeout(800);
        await p.evaluate(() => {
          if (!(window as TestWindow).__mewdoku?.solve()) throw new Error('solve failed');
        });
        const panel = p.locator('.overlay[data-overlay="ranking"]');
        const list = panel.locator('.rank-list[data-kind="bracket"]');
        await expect(list).toBeVisible({ timeout: 15_000 });
        await expect(list).toHaveAttribute('data-stale', '0');
        // Exactly the 37 rows sent, in their order; places 1–3 carry a medal AND the number; my row 5th (28 fish).
        await expect(list.locator('ol.rank-rows > li.rank-row')).toHaveCount(37);
        await expect(list.locator('ol.rank-rows > li.rank-row[data-rank="1"] .rank-row__medal svg')).toHaveCount(1);
        await expect(list.locator('ol.rank-rows > li.rank-row[data-rank="4"] .rank-row__medal')).toBeHidden();
        const mine = list.locator('ol.rank-rows > li.rank-row[data-me="1"]');
        await expect(mine).toHaveAttribute('data-rank', '5');
        await expect(mine.locator('.rank-row__name')).toHaveText('Velvet Pounce 27');
        await expect(mine.locator('.rank-row__name')).toHaveAttribute('dir', 'auto');
        await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 8_000 });
        await p.waitForTimeout(500);
        // On open the list scrolls so my row is in view; the pinned copy shows only while it is scrolled away.
        expect(await inScrollView(p, '.overlay[data-overlay="ranking"] ol.rank-rows', '.overlay[data-overlay="ranking"] li.rank-row[data-me="1"]')).toBe(true);
        await expect(list.locator('.rank-row--pinned')).toBeHidden();
        // The 37 rows scroll inside the card; the footer stays on screen (spec §10.3 layout).
        expect(await inViewport(p, '.overlay[data-overlay="ranking"] .ranking__tap')).toBe(true);
        await expectFits(p, '.overlay[data-overlay="ranking"]');
        const count = (await panel.locator('.ranking__count').textContent()) ?? '';
        if (!v.lang) {
          await expect(panel.locator('.ranking__title')).toHaveText('Leaderboard'); // leaderboard update: the ribbon title
          await expect(panel.locator('.ranking__sub')).toHaveText('+3 fish · Your total: 28');
          expect(count).toBe('37 players');
          await expect(panel.locator('.ranking__rewards')).toHaveText('The top 3 win hints and kitties.');
        }
        await expectLang(p, v, count + ((await panel.locator('.ranking__sub').textContent()) ?? ''), /\bplayers\b|Your total/);
        await shot2e(p, `panel-${suffix}`);
        // A drag inside the list scrolls it and never continues (spec §2.4 Taps); my pinned copy then shows.
        await p.locator('.overlay[data-overlay="ranking"] ol.rank-rows').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await p.waitForTimeout(200);
        await expect(list.locator('.rank-row--pinned')).toBeVisible();
        await expect(panel).toBeVisible();
        await shot2e(p, `panel-scrolled-${suffix}`);
      });
    });

    test(`[${v.id}] alone in a new bracket: my row only and "You're the only player in this ranking." (H-2, C-4)`, async ({ browser, page }, info) => {
      test.skip(v.id === '402', 'the project sizes and de / ar only');
      await onVariant(browser, page, info, v, async (p, suffix) => {
        await openRanked(p, returning(), { members: 0, myPoints: 0 });
        await expect(p.locator('.screen--home .ladder-chip')).toHaveAttribute('data-state', 'join');
        await p.locator('.home__play').click();
        await p.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
        await p.waitForTimeout(800);
        await p.evaluate(() => {
          if (!(window as TestWindow).__mewdoku?.solve()) throw new Error('solve failed');
        });
        const panel = p.locator('.overlay[data-overlay="ranking"]');
        const list = panel.locator('.rank-list[data-kind="bracket"]');
        await expect(list).toBeVisible({ timeout: 15_000 });
        // Exactly one row (mine) and the honest line: no placeholder, no promise that others will join.
        await expect(list.locator('ol.rank-rows > li.rank-row')).toHaveCount(1);
        await expect(list.locator('ol.rank-rows > li.rank-row[data-me="1"]')).toHaveAttribute('data-rank', '1');
        await expect(list.locator('.ranking__alone')).toBeVisible();
        if (!v.lang) {
          await expect(list.locator('.ranking__alone')).toHaveText("You're the only player in this ranking.");
          await expect(list.locator('.ranking__count')).toHaveText('1 player');
          await expect(list.locator('.ranking__rewards')).toHaveText('Rewards need at least 5 players in this ranking.');
        }
        await expect(panel.locator('.ranking__tap')).toBeEnabled({ timeout: 8_000 });
        await p.waitForTimeout(400);
        await expectFits(p, '.overlay[data-overlay="ranking"]');
        await shot2e(p, `panel-alone-${suffix}`);
      });
    });

    test(`[${v.id}] Home chip → the ranking sheet (list, info), the name sheet from my row's pencil, the Settings rows`, async ({ browser, page }, info) => {
      await onVariant(browser, page, info, v, async (p, suffix) => {
        const fake = await openRanked(p, returning({ dayStreak: { dates: [dailyDateKey(NOW - DAY_MS)], run: 3, best: 9, paid: [] } }), { myPoints: 28 });
        const chip = p.locator('.screen--home .ladder-chip');
        await expect(chip).toHaveAttribute('data-state', 'bracket');
        // (t() wraps interpolated values in bidi isolates in an RTL locale: compare without them.)
        await expect.poll(async () => ((await chip.locator('.ladder-chip__rank').textContent()) ?? '').replace(/[\u2066-\u2069]/g, '')).toBe('#5');
        await expect(chip.locator('.ladder-chip__n')).toHaveText('28');
        expect(await inViewport(p, '.screen--home .ladder-chip')).toBe(true);
        await shot2e(p, `home-${suffix}`);

        await chip.click();
        const sheet = p.locator('.overlay[data-overlay="ladder"]');
        await expect(sheet.locator('.rank-list[data-kind="bracket"]')).toBeVisible({ timeout: 8_000 });
        await expect(sheet.locator('ol.rank-rows > li.rank-row')).toHaveCount(37);
        await expect(sheet.locator('li.rank-row[data-me="1"] .rank-row__edit')).toBeVisible();
        // Spec §2.4 / §2.9: "Last updated" and the offline line only for a cached bracket with NO answer; here the
        // server just answered GET /v1/bracket, so the list is fresh and its hearts can be given (requests-G3 R16, G1).
        expect.soft(fake.calls).toContain('GET /v1/bracket');
        await expect.soft(sheet.locator('.rank-list[data-kind="bracket"]'), 'a fresh answer is not stale (R16)').toHaveAttribute('data-stale', '0');
        await p.waitForTimeout(500);
        expect(await inScrollView(p, '.overlay[data-overlay="ladder"] ol.rank-rows', '.overlay[data-overlay="ladder"] li.rank-row[data-me="1"]')).toBe(true);
        await expectFits(p, '.overlay[data-overlay="ladder"]');
        await shot2e(p, `sheet-${suffix}`);

        await sheet.locator('.ladder-sheet__info').click();
        await expect(sheet.locator('.ladder-info')).toBeVisible();
        const infoText = (await sheet.locator('.ladder-info').textContent()) ?? '';
        if (!v.lang) {
          expect(infoText).toContain('A ranking lasts 24 hours and holds up to 50 players.'); // leaderboard update: the sign-in join's wording
          expect(infoText).toContain('the top 3 win hints and kitties if at least 5 players took part');
          expect(infoText).toContain('never your Facebook name or photo');
        }
        await expectLang(p, v, infoText, /\bplayers\b|ranking lasts/);
        await expectFits(p, '.overlay[data-overlay="ladder"]');
        await shot2e(p, `info-${suffix}`);
        await p.keyboard.press('Escape');
        await expect(sheet.locator('.rank-list[data-kind="bracket"]')).toBeVisible();

        await sheet.locator('li.rank-row[data-me="1"] .rank-row__edit').click();
        const nick = p.locator('.overlay[data-overlay="nickname"]');
        await expect(nick).toBeVisible({ timeout: 8_000 });
        await expect(nick.locator('.nickname__preview .nickname__name')).toHaveText('Velvet Pounce 27');
        await expect(nick.locator('[role="radiogroup"].nickname__avatars [role="radio"]')).toHaveCount(12);
        await expect(nick.locator('select.nickname__adj')).toHaveValue('2');
        await expect(nick.locator('select.nickname__noun')).toHaveValue('5');
        await expect(nick.locator('input.nickname__num')).toHaveValue('27');
        await expectFits(p, '.overlay[data-overlay="nickname"]');
        await shot2e(p, `nick-${suffix}`);
        // Save fits or scrolls inside the dialog (spec §10.3 layout).
        await nick.locator('button.nickname__save').scrollIntoViewIfNeeded();
        expect(await inViewport(p, '.overlay[data-overlay="nickname"] button.nickname__save')).toBe(true);
        await p.keyboard.press('Escape');
        await expect(nick).toBeHidden();
        await p.keyboard.press('Escape');
        await expect(sheet).toBeHidden();

        await p.locator('.screen--home .top-bar__btn--settings').click();
        const settings = p.locator('.overlay[data-overlay="settings"]');
        const rows = settings.locator('.settings__ladder');
        await expect(rows).toBeVisible();
        await expect(rows.locator('.settings__ladder-value')).toHaveText('Velvet Pounce 27');
        await expect(rows.locator('button.switch.settings__ladder-listed')).toHaveAttribute('aria-checked', 'true');
        await expect(rows.locator('.settings__ladder-code')).toContainText('7KQ2-M9XD');
        await rows.scrollIntoViewIfNeeded();
        await expectFits(p, '.overlay[data-overlay="settings"]');
        await shot2e(p, `settings-${suffix}`);
        await rows.locator('.settings__ladder-delete').click();
        await expect(settings.locator('.settings__view--confirm')).toBeVisible();
        if (!v.lang) await expect(settings.locator('.settings__confirm-text')).toHaveText('Delete your ranking name, picture and results from our server? Your game progress stays.');
        await expectFits(p, '.overlay[data-overlay="settings"]');
        await shot2e(p, `settings-delete-${suffix}`);
      });
    });

    test(`[${v.id}] the result card on Home: #2 of 37, the reward, ▶ Collect ×2 and Collect`, async ({ browser, page }, info) => {
      await onVariant(browser, page, info, v, async (p, suffix) => {
        await openRanked(p, returning(), { myPoints: 28, results: [paidResult(Date.now())] });
        const card = p.locator('.overlay[data-overlay="ladder_result"]');
        await expect(card).toHaveAttribute('data-case', 'paid', { timeout: 10_000 });
        await expect(card.locator('button.ladder-result__double')).toBeVisible();
        await expect(card.locator('button.ladder-result__collect')).toBeVisible();
        await expect(card.locator('button.ladder-result__ok')).toBeHidden();
        if (!v.lang) {
          await expect(card.locator('.ladder-result__place')).toHaveText('You finished #2 of 37.');
          await expect(card.locator('.ladder-result__line')).toHaveText('Your reward: +1 hint and +1 kitty');
          // audit B12, B13: named by its visible label, described by the visible video line under it
          await expect(card.getByRole('button', { name: 'Collect ×2', exact: true })).toBeVisible();
          await expect(card.locator('.ladder-result__double-note')).toHaveText('You can watch a video to double your reward.');
          await expect(card.locator('button.ladder-result__double')).toHaveAccessibleDescription('You can watch a video to double your reward.');
        }
        await expectLang(p, v, (await card.locator('.ladder-result__place').textContent()) ?? '', /You finished/);
        await p.waitForTimeout(400);
        await expectFits(p, '.overlay[data-overlay="ladder_result"]');
        await shot2e(p, `result-${suffix}`);
        // Collect: the server's grant, once; the card closes.
        const before = await p.evaluate(() => (window as TestWindow).__mewdoku?.app().save.stock);
        await card.locator('button.ladder-result__collect').click();
        await expect(card).toBeHidden({ timeout: 8_000 });
        await expect
          .poll(async () => p.evaluate(() => (window as TestWindow).__mewdoku?.app().save.stock))
          .toEqual({ hints: (before?.hints ?? 0) + 1, kitties: (before?.kitties ?? 0) + 1 });
      });
    });

    test(`[${v.id}] O2 on the FB build: Watch video, "Buy 15 hints · $1.99", "Buy No Ads · $3.99" and its line`, async ({ browser, page }, info) => {
      await onVariant(browser, page, info, v, async (p, suffix) => {
        const up = await fetch(FBIG_URL).then((r) => r.ok, () => false);
        test.skip(!up, `no FB e2e build at ${FBIG_URL} (E2E_FBIG_URL)`);
        await fakeLadder(p, { pool: 'fb', myPoints: 28 });
        await p.route('https://connect.facebook.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: FB_STUB_SRC }));
        const save = returning({ stock: { hints: 0, kitties: 3 } });
        await p.addInitScript((config) => {
          (window as unknown as { __FB_STUB_CONFIG__: unknown }).__FB_STUB_CONFIG__ = config;
        }, { persist: false, data: { save }, ...(v.fbLocale ? { locale: v.fbLocale } : {}) });
        await p.goto(`${FBIG_URL}/`);
        await ready(p, 'home');
        await p.waitForTimeout(500);
        await p.locator('.home__play').click();
        await p.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
        // After the level-start tickers have crossed (they would show through the scrim).
        await expect(p.locator('.game-fx .tickers')).toHaveCount(0, { timeout: 15_000 });
        await p.locator('.tool-bar .tool--bulb').click();
        const o2 = p.locator('.overlay[data-overlay="rewarded"]');
        await expect(o2).toBeVisible();
        const pack = o2.locator('button.rewarded__buy[data-product="hints_15"]');
        const noAds = o2.locator('button.rewarded__buy[data-product="remove_ads"]');
        await expect(pack).toHaveAttribute('data-state', 'ready', { timeout: 8_000 });
        await expect(noAds).toHaveAttribute('data-state', 'ready');
        await expect(o2.locator('button.rewarded__buy')).toHaveCount(2);
        await expect(pack).toContainText('$1.99');
        await expect(noAds).toContainText('$3.99');
        await expect(o2.locator('.rewarded__buy-note')).toBeVisible();
        if (!v.lang) {
          await expect(pack.locator('.btn__label')).toHaveText('Buy 15 hints · $1.99');
          await expect(noAds.locator('.btn__label')).toHaveText('Buy No Ads · $3.99');
          await expect(o2.locator('.overlay__body')).toHaveText('Watch a short video for 1 hint, or buy a Bulb Bundle.');
          await expect(o2.locator('.rewarded__buy-note')).toHaveText('Removes banners and full-screen ads. Videos for helpers stay.');
        }
        await expectLang(p, v, (await pack.textContent()) ?? '', /\bBuy\b|hints/);
        await p.waitForTimeout(400); // the card's pop-in
        // Every button and the No Ads line on screen without a scroll, also at 320 × 568 with the play band.
        const panelFits = await o2.locator('.overlay__panel').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
        expect(panelFits, 'O2 fits its dialog').toBe(true);
        for (const b of ['.rewarded__accept', 'button.rewarded__buy[data-product="hints_15"]', 'button.rewarded__buy[data-product="remove_ads"]', '.rewarded__decline']) {
          const box = await o2.locator(b).boundingBox();
          expect(box && box.height >= 43.5 && box.width >= 43.5, `${b} ≥ 44 × 44`).toBe(true);
        }
        await expectFits(p, '.overlay[data-overlay="rewarded"]');
        await shot2e(p, `o2-buy-${suffix}`);
      });
    });
  }
});
