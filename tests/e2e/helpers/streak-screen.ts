// UI batch (2026-10-13): streak. The day's first counted win shows the Daily Streak screen (overlay `streak`) after the
// victory's primary press; its Continue then runs what the primary would have (the interstitial gate, the next board or
// Home). Every spec that registers gotItNewRanking(test) also calls continueStreak(test): Continue is pressed whenever
// the screen shows, as a player would. Two parts, because a Playwright locator handler only runs before an action or an
// assertion, never inside page.waitForFunction (the specs' ready()/status waits that follow a victory button):
// - a page script (addInitScript) presses Continue as soon as it is live (it is gated for fx.winButtonDelayMs);
// - a locator handler that only waits for the screen to close before the next action or assertion.
// A test that checks the screen itself calls keepStreakScreen(page) before the win (the page script then leaves it).
import { type Page, test as base } from '@playwright/test';

export const streakScreen = (page: Page) => page.locator('.overlay[data-overlay="streak"]');
export const streakContinue = (page: Page) => page.locator('.overlay[data-overlay="streak"] .streak-screen__continue');

type KeepWindow = Window & { __keepStreakScreen?: boolean };

/** The page script and the handler on one page (a page a test makes itself, outside the `page` fixture, calls it too). */
export async function continueStreakOn(page: Page): Promise<Page> {
  await page.addInitScript(() => {
    const press = (): void => {
      if ((window as KeepWindow).__keepStreakScreen) return;
      const btn = document.querySelector<HTMLElement>('.overlay[data-overlay="streak"]:not([hidden]) .streak-screen__continue');
      if (btn && !btn.closest('[hidden]') && btn.getAttribute('aria-disabled') !== 'true') btn.click();
    };
    const watch = (): void => {
      new MutationObserver(press).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-disabled'] });
    };
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  });
  // The page script presses Continue once it is live; Playwright then waits for the screen to close (the default after
  // a handler) before it goes on with the action or assertion it held.
  await page.addLocatorHandler(streakContinue(page), async () => undefined);
  return page;
}

export function continueStreak(t: typeof base): void {
  t.beforeEach(async ({ page }) => {
    await continueStreakOn(page);
  });
}

/** The streak screen's own checks: the page script leaves the screen up (the test presses Continue itself). */
export async function keepStreakScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as KeepWindow).__keepStreakScreen = true;
  });
  await page.evaluate(() => {
    (window as KeepWindow).__keepStreakScreen = true;
  });
  await page.removeLocatorHandler(streakContinue(page));
}
