// Owner: ui-shell
// S1 Home (02 §5): top bar (Trophy*, Gear), wordmark + mascot, primary level button, daily card,
// stock readout. Phase 3 hook: extra cards array (02 §22).
import type { DailyCardState } from '../../game/progression';
import type { View } from '../dom';

export interface DailyCardView {
  readonly state: DailyCardState;
  /** Today, YYYY-MM-DD (formatted with i18n formatShortDate). */
  readonly dateKey: string;
  /** Board size from the weekday table. */
  readonly n: number;
  /** Solve time when state === 'solved'. */
  readonly solvedMs: number | null;
  /** daily.unlockAfterLevel, for "Unlocks after level 20". */
  readonly unlockLevel: number;
}

/** Phase 3 entry points (events, calendar…). Empty in Phase 2. */
export interface HomeCardView {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface HomeView {
  /** Next level to play. */
  readonly level: number;
  readonly hard: boolean;
  /** inProgress.level holds a board → "Continue · Level L". */
  readonly continueLevel: boolean;
  readonly daily: DailyCardView;
  readonly hints: number;
  readonly kitties: number;
  /** capabilities().leaderboards (hidden in Phase 2). */
  readonly showTrophy: boolean;
  readonly fbSafeZone: boolean;
  readonly extraCards: readonly HomeCardView[];
}

export interface HomeCallbacks {
  onPlay(): void;
  /** Any daily card tap; the app shows the "locked" toast, opens O7 when solved, or starts the daily. */
  onDaily(): void;
  onSettings(): void;
  onTrophy(): void;
  onCard(id: string): void;
}

export function createHomeScreen(view: HomeView, cb: HomeCallbacks): View<HomeView> {
  throw new Error('not implemented: createHomeScreen');
}
