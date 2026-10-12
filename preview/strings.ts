// Owner: lead (preview link, 2026-10-11). Every word the preview build adds, in English only (the owner's review
// link; the game itself keeps its i18n). Nothing here is in the game's catalogues, so no player ever sees it:
// scripts/release-check.ts fails any non-preview dist that carries PREVIEW_MARKERS.

/** Strings that only the preview build carries (scripts/release-check.ts greps every other dist for them). */
export const PREVIEW_MARKERS = ['Preview ad', 'Preview purchase', 'Preview: sample', 'preview.invalid', 'mewdoku.preview.'] as const;

export const S = {
  tab: 'Preview',
  tabOpen: 'Open the preview menu',
  tabClose: 'Close the preview menu',
  title: 'Preview build',
  intro:
    'Every feature is switched on with stand-ins: ads are mock ads, purchases charge nothing, and the ranking runs on this page with sample players. The real game rules decide when each one shows.',
  now: 'Now:',
  built: 'Built',
  working: 'Loading…',
  dayEnded: 'ranking day ended',
  hide: 'Hide',
  scenario: {
    new: 'New player',
    returning: 'Returning player',
    outOfHelpers: 'Out of helpers',
    endDay: 'End ranking day',
    reset: 'Reset',
  },
  help: {
    new: 'A fresh save: the tutorial, then level 2.',
    returning: 'Level 37, streak on day 6 of 7, daily open, 3 hints, 2 kitties, 5th in today’s ranking.',
    outOfHelpers: '0 hints and 0 kitties: tap a helper in a level to see the video and the Buy rows.',
    endDay: 'Ends today’s sample ranking now (you finish 2nd), so the result card with Collect ×2 shows.',
    reset: 'Clears everything this preview stored and starts again as a returning player.',
  },
  ad: {
    badge: 'Preview ad',
    banner: 'Preview ad · banner',
    interstitialTitle: 'Full-screen ad',
    interstitialBody: 'A real interstitial would play here. It shows only where the game’s ad rules allow one.',
    closeIn: 'Close in {s}',
    close: 'Close',
    rewardedTitle: 'Rewarded video',
    rewardIn: 'Reward in {s}',
    rewardDone: 'Reward earned',
    skip: 'Close without reward',
    reward: {
      hint: 'Watch to get 1 hint',
      kitty: 'Watch to get 1 kitty',
      mouse: 'Watch to call the mouse',
      revive: 'Watch to get 1 fish back',
      rank_double: 'Watch to double your ranking reward',
      group_double: 'Watch to double your reward',
    } as Record<string, string>,
  },
  buy: {
    title: 'Preview purchase — nothing is charged',
    body: 'On Facebook the store’s own payment dialog opens here.',
    confirm: 'Buy',
    cancel: 'Cancel',
    product: { hints_15: '15 hints', kitties_8: '8 kitties', remove_ads: 'No Ads' } as Record<string, string>,
  },
  samplePlayers: 'Preview: sample players',
  sampleRanking: 'Preview: sample ranking',
} as const;

/** "Close in {s}" → "Close in 2". */
export function fill(text: string, vars: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
