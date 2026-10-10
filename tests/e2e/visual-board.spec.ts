// Owner: G2 (Phase 2d)
// Visual review captures of the board at 320, 390 and 1280 (the web-320, web-390 and web-1280
// projects, configured like visual.spec.ts). Created at Phase 2d L0 (look-spec §3.2 item 1) by moving,
// unchanged, the board capture of tests/e2e/visual.spec.ts: the mid-game board (two cats, three X
// marks: even gutters and the white X over its edge). Stored like visual.spec.ts's captures, as
// docs/phase2c/screenshots/G2-visual-<screen>-<width>.png (VISUAL_OUT overrides the folder), and
// reviewed by a person, never diffed in CI. Phase 2d (look-spec §5.3) adds the X close-ups (default
// and patterns on, wrong X, ghost X), every palette colour on a 12 × 12 board, the tile radius and gap.
// The helpers below are copies of visual.spec.ts's (no shared helper module under tests/e2e).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import { defaults } from '../../src/game/save';
import { periodKeyAt } from '../../src/game/scoring';
import type { SaveData } from '../../src/game/types';

type TestWindow = Window & { __mewdoku?: E2EHooks };

const OUT = process.env.VISUAL_OUT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/phase2c/screenshots');
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
  await page.screenshot({ path: join(OUT, `G2-visual-${name}-${width}.png`) });
}

const solution = (page: Page) => page.evaluate(() => (window as TestWindow).__mewdoku?.solution() ?? []);
const cell = (page: Page, i: number) => page.locator('.cell').nth(i);

async function startLevel(page: Page): Promise<number[]> {
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing');
  await page.waitForTimeout(300);
  return solution(page);
}

async function placeCat(page: Page, i: number): Promise<void> {
  await cell(page, i).dblclick();
  await page.waitForTimeout(350); // cellLockAfterCatMs
}

test.describe('Classic look, visual review: the board (phase2b §1.12; Phase 2c; moved from visual.spec.ts at Phase 2d L0)', () => {
  test('mid-game', async ({ page }) => {
    await open(page, returning());
    const sol = await startLevel(page);
    const n = sol.length;
    for (const r of [0, 2]) await placeCat(page, r * n + (sol[r] as number));
    for (const i of [n + ((sol[1] as number) + 2) % n, n + ((sol[1] as number) + 3) % n, 3 * n + ((sol[3] as number) + 1) % n]) {
      await cell(page, i).click();
      await page.waitForTimeout(330);
    }
    // even gutters and the white X over its edge
    const x = page.locator('.cell[data-s="m"]').first();
    await expect(x.locator('.cell__xe')).toHaveCount(2);
    expect(await x.evaluate((el) => getComputedStyle(el.querySelector('.cell__x') as Element).stroke)).toBe('rgb(255, 255, 255)');
    // Phase 2c §1.1: three fish where the hearts were.
    await expect(page.locator('.pill--lives .life[data-full]')).toHaveCount(3);
    // Phase 2c.1 §10.2: two cats in a row score 576 + 672; marks score nothing.
    await expect(page.locator('.points-pill')).toBeVisible();
    await expect(page.locator('.points-pill__n')).toHaveText('1,248');
    await expect(page.locator('.points-pill')).toHaveAttribute('aria-label', 'Level points: 1,248');
    await expect(page.locator('.pill--lives')).toHaveAttribute('aria-label', '3 of 3 fish left');
    await expect(page.locator('.pill--hearts, .heart')).toHaveCount(0);
    await page.waitForTimeout(400);
    await shot(page, 'game');
  });
});
