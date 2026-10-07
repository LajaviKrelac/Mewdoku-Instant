// Owner: ui-shell
// O5 settings (02 §5 O5, §14) with the "About & credits" sub-view (version, font licence, privacy link).
import type { Settings } from '../../game/types';
import type { OverlayView } from '../dom';

export interface SettingsProps {
  readonly settings: Settings;
  /** capabilities().haptics; false hides "Vibration". */
  readonly showVibration: boolean;
  /** __APP_VERSION__. */
  readonly version: string;
  /** Applied at once by the app (save 'touch'). */
  onChange(patch: Partial<Settings>): void;
  onHowToPlay(): void;
  onClose(): void;
}

export function createSettingsModal(): OverlayView<SettingsProps> {
  throw new Error('not implemented: createSettingsModal');
}
