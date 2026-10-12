// Leaderboard update. Since the sign-in joins a ranking at once (ladder.autoJoin), Home shows the "New ranking" card
// (overlay `ladder_session`) once per ranking the player was joined to without a win. Every spec that reaches Home
// with the ranking on calls gotItNewRanking(test): the card is closed with "Got it" whenever it shows before an
// action or an assertion (Playwright's locator handler), as a player would. The card's own test removes the handler.
import { type Page, test as base } from '@playwright/test';

export const newRankingOk = (page: Page) => page.locator('.overlay[data-overlay="ladder_session"] .ladder-session__ok');

/** The handler on one page (a page a test makes itself, outside the `page` fixture, calls it too). */
export async function gotItOn(page: Page): Promise<Page> {
  await page.addLocatorHandler(newRankingOk(page), async (ok) => {
    await ok.click();
  });
  return page;
}

export function gotItNewRanking(t: typeof base): void {
  t.beforeEach(async ({ page }) => {
    await gotItOn(page);
  });
}

type HookWindow = Window & { __mewdoku?: { ladder?(): { active: boolean; homeSettled?: boolean } } };

/**
 * Home with the ranking settled: waits until a Home visit's ranking steps ran (or the ranking is not in use), then
 * closes the "New ranking" card if it opened. For checks that read the page without an action or an assertion that
 * the locator handler would see (hit areas, element-from-point, screenshots).
 */
export async function settleHome(page: Page, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const l = (window as HookWindow).__mewdoku?.ladder?.();
        return !l || !l.active || l.homeSettled === true;
      },
      undefined,
      { timeout },
    )
    .catch(() => undefined);
  const ok = newRankingOk(page);
  if (await ok.isVisible().catch(() => false)) {
    await ok.click();
    await ok.waitFor({ state: 'hidden' });
  }
}
