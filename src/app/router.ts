// Owner: app
// Screen switching, overlay stack, focus restore, Esc handling (04 §3, §5.3). Overlays are created
// lazily from the ui/overlays factories, appended to an overlay host once, and toggled.
import type { BootScreen } from '../ui/screens/boot-screen';
import type { GameScreen, GameScreenCallbacks, GameView } from '../ui/screens/game-screen';
import type { HomeCallbacks, HomeView } from '../ui/screens/home-screen';
import type { CoachProps } from '../ui/overlays/coach';
import type { DailyResultProps } from '../ui/overlays/daily-result';
import type { FailOverlayProps } from '../ui/overlays/fail-overlay';
import type { HintCardProps } from '../ui/overlays/hint-card';
import type { HowToPlayProps } from '../ui/overlays/how-to-play';
import type { RewardedPromptProps } from '../ui/overlays/rewarded-prompt';
import type { SettingsProps } from '../ui/overlays/settings-modal';
import type { WinOverlayProps } from '../ui/overlays/win-overlay';
import type { View } from '../ui/dom';
import type { AppBus } from './events';
import type { OverlayId, ScreenId } from './store';

export interface OverlayPropsMap {
  hint: HintCardProps;
  rewarded: RewardedPromptProps;
  win: WinOverlayProps;
  fail: FailOverlayProps;
  settings: SettingsProps;
  how_to_play: HowToPlayProps;
  daily_result: DailyResultProps;
  coach: CoachProps;
}

export interface Router {
  readonly root: HTMLElement;
  screen(): ScreenId;
  /** Replace the current screen (closes all overlays). */
  showBoot(): BootScreen;
  showHome(view: HomeView, cb: HomeCallbacks): View<HomeView>;
  showGame(view: GameView, cb: GameScreenCallbacks): GameScreen;
  /** Push (or re-open on top) an overlay. Modal overlays trap focus and make the rest inert. */
  open<K extends OverlayId>(id: K, props: OverlayPropsMap[K]): void;
  /** Update an open overlay's props (no-op when closed). */
  update<K extends OverlayId>(id: K, props: OverlayPropsMap[K]): void;
  close(id: OverlayId): void;
  closeAll(): void;
  isOpen(id: OverlayId): boolean;
  top(): OverlayId | null;
  stack(): readonly OverlayId[];
  toast(message: string): void;
  /** Esc: dismiss() the top overlay; returns whether something handled it. */
  escape(): boolean;
  destroy(): void;
}

export interface RouterDeps {
  /** Receives 'screen', 'overlay:open', 'overlay:close'. */
  readonly bus?: AppBus;
  readonly doc?: Document;
}

export function createRouter(root: HTMLElement, deps?: RouterDeps): Router {
  throw new Error('not implemented: createRouter');
}
