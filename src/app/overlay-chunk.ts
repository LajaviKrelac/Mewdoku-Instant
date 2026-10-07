// Owner: app
// The overlays that are never needed before the first screen shows, bundled as ONE lazy chunk
// (04 §9 first-load budget): O1 hint card, O2 rewarded prompt, O3 win, O4 fail, O5 settings,
// O6 how to play, O7 daily result. The router imports this module dynamically, starts the download
// right after the first route (boot step 8), and queues any open() that arrives before it lands.
// The coach (O8, first-run tutorial) and the toast layer (O9) stay in the main bundle.
export { createDailyResult } from '../ui/overlays/daily-result';
export { createFailOverlay } from '../ui/overlays/fail-overlay';
export { createHintCard } from '../ui/overlays/hint-card';
export { createHowToPlay } from '../ui/overlays/how-to-play';
export { createRewardedPrompt } from '../ui/overlays/rewarded-prompt';
export { createSettingsModal } from '../ui/overlays/settings-modal';
export { createWinOverlay } from '../ui/overlays/win-overlay';
