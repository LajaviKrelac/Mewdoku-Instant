// Owner: C (Phase 2b)
// GameMode registry (02 §22 Phase 3 hook): rules flags, save slot, helper charging, win flow.
// Phase 2c.1 (G1): RuleFlags.points, what a correct cat is worth in the mode (fish-lives-spec §3.2.1).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.12): mouseAllowed (the third helper) = kittyAllowed.
import { cfg, type GameConfig } from '../app/config';
import type { Puzzle } from '../engine/types';
import { pointsRuleFor } from './scoring';
import { TUTORIAL_COLORS } from './tutorial';
import type { ModeId, RuleFlags } from './types';

export interface GameMode {
  readonly id: ModeId;
  readonly rules: RuleFlags;
  /** Which InProgress slot holds the board; null = never saved (tutorial). phase2b §4.4 adds 'event'. */
  readonly saveSlot: 'level' | 'daily' | 'event' | null;
  /** false in the tutorial: hints are free and not charged (02 §9.3). */
  readonly chargesHelpers: boolean;
  /** Paw usable in this mode (false in the tutorial). */
  readonly kittyAllowed: boolean;
  /** Phase 2d §1.12: the mouse helper is offered in this mode (= kittyAllowed; never in the tutorial). */
  readonly mouseAllowed: boolean;
  /** O3 for levels and the tutorial, O7 for dailies (02 §10.1). phase2b §2.6 adds 'event' (victory, event variant). */
  readonly winFlow: 'level' | 'daily' | 'tutorial' | 'event';
  /** Interstitial trigger after the win flow's button, or null (tutorial: no gate). phase2b §3.2 adds 'event_next'. */
  readonly winGate: 'next_level' | 'daily_done' | 'event_next' | null;
  /** Fixed palette indices per region label (tutorial, 02 §11.5); null → engine/colors assignColors(). */
  readonly fixedColors: readonly number[] | null;
  /** `mode` param for analytics (02 §20). */
  readonly analyticsMode: string;
  /**
   * HUD title (02 §5 S2): 'level' → "Level L" (the tutorial is "Level 1"), 'daily' → "Daily · date",
   * 'event' → "Lantern Walk · 13" (phase2b §4.4, event.title.game).
   */
  readonly hudTitle: 'level' | 'daily' | 'event';
  /** Top-bar Home button (02 §4.2: none during the tutorial; Gear is always there). */
  readonly homeButton: boolean;
}

/**
 * RuleFlags for a mode from cfg (hearts 3, revive 1/1; tutorial: mistakePenalty false). Phase 2c.1:
 * `points` = pointsRuleFor(id) ({576, 96} in levelPoints.modes, {0, 0} for the tutorial).
 */
export function rulesFor(id: ModeId, c: GameConfig = cfg): RuleFlags {
  return Object.freeze({
    mistakeModel: 'solution',
    mistakePenalty: id !== 'tutorial',
    autoX: false,
    heartsPerAttempt: c.hearts.perAttempt,
    maxRevives: c.revive.maxPerAttempt,
    heartsOnRevive: c.revive.heartsRestored,
    points: pointsRuleFor(id, c),
  });
}

function buildModes(c: GameConfig): Readonly<Record<ModeId, GameMode>> {
  const tutorial: GameMode = {
    id: 'tutorial',
    rules: rulesFor('tutorial', c),
    saveSlot: null,
    chargesHelpers: false,
    kittyAllowed: false,
    mouseAllowed: false,
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
    mouseAllowed: true,
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
    mouseAllowed: true,
    winFlow: 'daily',
    winGate: 'daily_done',
    fixedColors: null,
    analyticsMode: 'daily',
    hudTitle: 'daily',
    homeButton: true,
  };
  // phase2b §4.4: level rules (an event may lower hearts through EventDef.rules, applied by C's
  // event-flow), its own save slot, the event board's win flow and the `event_next` interstitial.
  // F0 registers the mode; C implements the flow (app/event-flow.ts).
  const event: GameMode = {
    id: 'event',
    rules: rulesFor('event', c),
    saveSlot: 'event',
    chargesHelpers: true,
    kittyAllowed: true,
    mouseAllowed: true,
    winFlow: 'event',
    winGate: 'event_next',
    fixedColors: null,
    analyticsMode: 'event',
    hudTitle: 'event',
    homeButton: true,
  };
  return Object.freeze({
    tutorial: Object.freeze(tutorial),
    level: Object.freeze(level),
    daily: Object.freeze(daily),
    event: Object.freeze(event),
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
