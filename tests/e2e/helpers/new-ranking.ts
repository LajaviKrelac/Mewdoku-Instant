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
