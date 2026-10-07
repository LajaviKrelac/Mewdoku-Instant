// Owner: app
// The overlays that are never needed before the first screen shows, bundled as ONE lazy chunk
// (04 §9 first-load budget): O1 hint card, O2 rewarded prompt, O3 win, O4 fail, O5 settings,
// O6 how to play, O7 daily result, and O8 the tutorial coach. The router imports this module
// dynamically and queues any open() that arrives before it lands. Returning players get it right
// after the first route (boot step 8); on a first run boot fetches it alongside the pack and font
// waits (boot.overlayTimeoutMs), so the tutorial's first board shows with its coach.
// The toast layer (O9) and the loading indicator (O10) stay in the main bundle.
export { createCoach } from '../ui/overlays/coach';
export { createDailyResult } from '../ui/overlays/daily-result';
export { createFailOverlay } from '../ui/overlays/fail-overlay';
export { createHintCard } from '../ui/overlays/hint-card';
export { createHowToPlay } from '../ui/overlays/how-to-play';
export { createRewardedPrompt } from '../ui/overlays/rewarded-prompt';
export { createSettingsModal } from '../ui/overlays/settings-modal';
export { createWinOverlay } from '../ui/overlays/win-overlay';
