// Owner: ui-board
// Top bar (02 §5): title + Hard badge, Home and Gear (and Trophy on Home if leaderboards exist) at
// the top RIGHT; the top-left 64×64 px stays empty in the FBIG build (FB safe zone, 02 §19).
import type { View } from '../dom';

export interface TopBarProps {
  /** Localized title ("Level 37", "Daily · Tue 6 Oct"), or null on Home. */
  readonly title: string | null;
  readonly hard: boolean;
  readonly showHome: boolean;
  readonly showSettings: boolean;
  readonly showTrophy: boolean;
  readonly fbSafeZone: boolean;
}

export interface TopBarCallbacks {
  onHome(): void;
  onSettings(): void;
  onTrophy(): void;
}

export function createTopBar(props: TopBarProps, cb: TopBarCallbacks): View<TopBarProps> {
  throw new Error('not implemented: createTopBar');
}
