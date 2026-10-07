// Owner: game
// GameMode registry (02 §22 Phase 3 hook): rules flags, save slot, helper charging, win flow.
import { cfg, type GameConfig } from '../app/config';
import type { Puzzle } from '../engine/types';
import { TUTORIAL_COLORS } from './tutorial';
import type { ModeId, RuleFlags } from './types';

export interface GameMode {
  readonly id: ModeId;
  readonly rules: RuleFlags;
  /** Which InProgress slot holds the board; null = never saved (tutorial). */
  readonly saveSlot: 'level' | 'daily' | null;
  /** false in the tutorial: hints are free and not charged (02 §9.3). */
  readonly chargesHelpers: boolean;
  /** Paw usable in this mode (false in the tutorial). */
  readonly kittyAllowed: boolean;
  /** O3 for levels and the tutorial, O7 for dailies (02 §10.1). */
  readonly winFlow: 'level' | 'daily' | 'tutorial';
  /** Interstitial trigger after the win flow's button, or null (tutorial: no gate). */
  readonly winGate: 'next_level' | 'daily_done' | null;
  /** Fixed palette indices per region label (tutorial, 02 §11.5); null → engine/colors assignColors(). */
  readonly fixedColors: readonly number[] | null;
  /** `mode` param for analytics (02 §20). */
  readonly analyticsMode: string;
  /** HUD title (02 §5 S2): 'level' → "Level L" (the tutorial is "Level 1"), 'daily' → "Daily · date". */
  readonly hudTitle: 'level' | 'daily';
  /** Top-bar Home button (02 §4.2: none during the tutorial; Gear is always there). */
  readonly homeButton: boolean;
}

/** RuleFlags for a mode from cfg (hearts 3, revive 1/1; tutorial: mistakePenalty false). */
export function rulesFor(id: ModeId, c: GameConfig = cfg): RuleFlags {
  return Object.freeze({
    mistakeModel: 'solution',
    mistakePenalty: id !== 'tutorial',
    autoX: false,
    heartsPerAttempt: c.hearts.perAttempt,
    maxRevives: c.revive.maxPerAttempt,
    heartsOnRevive: c.revive.heartsRestored,
  });
}

function buildModes(c: GameConfig): Readonly<Record<ModeId, GameMode>> {
  const tutorial: GameMode = {
    id: 'tutorial',
    rules: rulesFor('tutorial', c),
    saveSlot: null,
    chargesHelpers: false,
    kittyAllowed: false,
    winFlow: 'tutorial',
    winGate: null,
    fixedColors: TUTORIAL_COLORS,
    analyticsMode: 'tutorial',
    hudTitle: 'level',
    homeButton: false,
  };
  const level: GameMode = {
    id: 'level',
    rules: rulesFor('level', c),
    saveSlot: 'level',
    chargesHelpers: true,
    kittyAllowed: true,
    winFlow: 'level',
    winGate: 'next_level',
    fixedColors: null,
    analyticsMode: 'level',
    hudTitle: 'level',
    homeButton: true,
  };
  const daily: GameMode = {
    id: 'daily',
    rules: rulesFor('daily', c),
    saveSlot: 'daily',
    chargesHelpers: true,
    kittyAllowed: true,
    winFlow: 'daily',
    winGate: 'daily_done',
    fixedColors: null,
    analyticsMode: 'daily',
    hudTitle: 'daily',
    homeButton: true,
  };
  return Object.freeze({
    tutorial: Object.freeze(tutorial),
    level: Object.freeze(level),
    daily: Object.freeze(daily),
  });
}

export const MODES: Readonly<Record<ModeId, GameMode>> = buildModes(cfg);

export function getMode(id: ModeId): GameMode {
  const mode = MODES[id];
  if (!mode) throw new Error(`unknown mode: ${String(id)}`);
  return mode;
}

/** fixedColors as a Uint8Array when the mode has them and they fit the board, else null. */
export function fixedColorsFor(id: ModeId, puzzle: Puzzle): Uint8Array | null {
  const fixed = getMode(id).fixedColors;
  if (!fixed || fixed.length !== puzzle.n) return null;
  return Uint8Array.from(fixed);
}
