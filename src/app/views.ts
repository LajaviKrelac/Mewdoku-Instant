// Owner: app
// Selectors from AppState to the UI view models (UI modules define the view types; the app maps).
import type { Capabilities, PlatformId } from '../platform/types';
import type { GameView } from '../ui/screens/game-screen';
import type { HomeView } from '../ui/screens/home-screen';
import type { AppState } from './store';

export interface ViewContext {
  /** Clock now(), for today's date key. */
  readonly now: number;
  readonly capabilities: Capabilities;
  readonly platformId: PlatformId;
}

export function selectHomeView(state: AppState, ctx: ViewContext): HomeView {
  throw new Error('not implemented: selectHomeView');
}

/** null when no game is mounted. */
export function selectGameView(state: AppState, ctx: ViewContext): GameView | null {
  throw new Error('not implemented: selectGameView');
}
