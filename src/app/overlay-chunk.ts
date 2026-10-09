// Owner: C (Phase 2b)
// The overlays that are never needed before the first screen shows, bundled as ONE lazy chunk
// (04 §9 first-load budget): O1 hint card, O2 rewarded prompt, O4 fail, O5 settings, O6 how to
// play, O7 daily result, and O8 the tutorial coach. The router imports this module dynamically and
// queues any open() that arrives before it lands. Returning players get it right after the first
// route (boot step 8); on a first run boot fetches it alongside the pack and font waits
// (boot.overlayTimeoutMs), so the tutorial's first board shows with its coach.
// The toast layer (O9) and the loading indicator (O10) stay in the main bundle.
// Phase 2b adds the win-flow UI and the shop (phase2b §2.11, §11 "core overlay chunk"): ranking,
// victory, shop, rank_hub and group_result. The victory screen replaced the Phase 2 O3 win overlay,
// which was removed at integration.
// 2b integration (04 §9): the overlays' stylesheet comes with this chunk (Vite emits it as its own
// CSS file and loads it before the chunk resolves), so the first-load stylesheet carries none of it.
import '../styles/overlay-chunk.css';

export { createCoach } from '../ui/overlays/coach';
export { createDailyResult } from '../ui/overlays/daily-result';
export { createFailOverlay } from '../ui/overlays/fail-overlay';
export { createHintCard } from '../ui/overlays/hint-card';
export { createHowToPlay } from '../ui/overlays/how-to-play';
export { createRewardedPrompt } from '../ui/overlays/rewarded-prompt';
export { createSettingsModal } from '../ui/overlays/settings-modal';
export { createGroupResult } from '../ui/overlays/group-result';
export { createRankHub } from '../ui/overlays/rank-hub';
export { createRankingPanel } from '../ui/overlays/ranking-panel';
export { createShopSheet } from '../ui/overlays/shop-sheet';
export { createVictoryScreen } from '../ui/overlays/victory-screen';
