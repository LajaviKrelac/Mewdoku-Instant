// Owner: B
// Victory screen (new overlay `victory`, phase2b §2.5; replaces O3 `win` and, for dailies, O7
// `daily_result`, which stay one release unopened). Full screen, opaque --page; 12 --accent-soft sun
// rays behind the cat turning once per fx.victoryRaysTurnMs (static with reduced motion). Top to
// bottom: praise word, the win pose, "Level 37 complete", the reward row (three fish, "+3", the total,
// a bonus chip, "+55 points"), the event milestone line; then the wide orange primary button
// (btn--primary btn--lg, enabled `buttonDelayMs` after open) and a ghost "Home". The fish pill (with
// "+") sits on this screen too. With `bannerReserved` the root gets data-banner (phase2b §3.2).
// Lazy overlay chunk. F0 stub: props final; body is B's.
//
// Classes (proposed): .overlay[data-overlay=victory] > .victory[data-variant][data-banner]
import type { Reward } from '../../game/events';
import type { I18nKey } from '../../i18n';
import type { OverlayView } from '../dom';

/**
 * level: "Level {L+1}"; tutorial (first run): "You're ready!" + "Play Level 2"; tutorial_replay:
 * no fish, "Home"; daily: time, mistakes, hints, countdown, "Done"; event: progress + "Puzzle {i+1}"
 * or "Back to event" after the last (§2.5 Variants).
 */
export type VictoryVariant = 'level' | 'tutorial' | 'tutorial_replay' | 'daily' | 'event';

export interface VictoryDailyView {
  readonly dateKey: string;
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Epoch ms of the next daily (countdown; daily.ready once passed). */
  readonly nextPuzzleAt: number;
}

export interface VictoryEventView {
  readonly nameKey: I18nKey;
  /** Puzzle just solved, 0-based (the UI shows index + 1). */
  readonly index: number;
  readonly total: number;
  /** The progress bar animates from solvedBefore to solvedAfter (400 ms, CSS). */
  readonly solvedBefore: number;
  readonly solvedAfter: number;
  /** "Event reward: +30 fish" when this win reached a milestone (already granted). */
  readonly reward: Reward | null;
  /** All puzzles solved: the button says "Back to event". */
  readonly last: boolean;
}

export interface VictoryProps {
  readonly variant: VictoryVariant;
  /** Index into PRAISE_KEYS (the app picks it). */
  readonly praise: number;
  /** The level just won (tutorial: 1); null for daily and event. */
  readonly level: number | null;
  /** The primary button's level ("Level 38"); 2 for the first-run tutorial; null otherwise. */
  readonly nextLevel: number | null;
  /** Fish of this win (base + bonus) and the wallet total after it; null = no fish (tutorial replay, restored board). */
  readonly fish: { readonly earned: number; readonly total: number } | null;
  /** Bonus chip "Hard level bonus +2" / "Daily bonus +2". */
  readonly bonus: { readonly kind: 'hard' | 'daily'; readonly count: number } | null;
  /** "+55 points"; null when the win scores none (tutorial). */
  readonly pointsEarned: number | null;
  readonly daily: VictoryDailyView | null;
  readonly event: VictoryEventView | null;
  /** fx.winButtonDelayMs (600): the primary button turns active this long after open. */
  readonly buttonDelayMs: number;
  readonly reducedMotion: boolean;
  /** phase2b §3.2: reserve ads.banner.reservePx (+ safe bottom) under the buttons. */
  readonly bannerReserved: boolean;
  /** Clock for the daily countdown. */
  now(): number;
  /** The orange primary: next level / Play Level 2 / Home (replay) / Done (daily) / next puzzle or back to event. */
  onPrimary(): void;
  onHome(): void;
  /** The fish pill's "+": open the shop. */
  onShop(): void;
}

export function createVictoryScreen(): OverlayView<VictoryProps> {
  throw new Error('not implemented: createVictoryScreen (B, phase2b §2.5)');
}
