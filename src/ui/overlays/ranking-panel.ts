// Owner: B
// Ranking panel (new overlay `ranking`, phase2b §2.4): a dimmed full-screen --scrim with a centred
// --stage panel (orange --title-on-dark title, the subtitle for this win, the list area) and the
// "Tap to keep going" footer in --tap-text. Opens at t = fx.winOverlayDelayMs (4.5 s) of the win flow.
// NEVER fabricates a row: the list shows only what `list` carries (CONTRACTS-2b §6).
// A tap anywhere, Enter, Space or Esc continues once `tapMinMs` has passed since open (dismiss()
// handles Esc). role="dialog" labelled by the title; a live region reads the rank and points.
// Lazy overlay chunk. F0 stub: props final; body is B's.
//
// Classes (proposed): .overlay[data-overlay=ranking] > .overlay__scrim--dark + .overlay__panel--stage.ranking
import type { I18nKey } from '../../i18n';
import type { OverlayView } from '../dom';

/** Which board the panel or hub tab shows (phase2b §5.3). */
export type RankingBoardKind = 'points' | 'daily' | 'event';

/** A score already decoded by the app (game/scoring.ts decodeScore); the UI formats it. */
export type RankScoreView =
  | { readonly kind: 'points'; readonly points: number }
  | { readonly kind: 'time'; readonly ms: number }
  | { readonly kind: 'event'; readonly solved: number; readonly total: number; readonly ms: number };

/** My line when other players' rows cannot be shown in the panel (§2.4). */
export interface RankMineView {
  /** Present only when the provider can tell (caps().myRank): "Your rank: #1 234". */
  readonly rank: number | null;
  /** "Your score: 1 240"; null when the provider returned nothing for me. */
  readonly score: RankScoreView | null;
  /** Total entries, only if the API returned it. */
  readonly count: number | null;
}

/** The player's own records: the web, no provider, a timeout or an error (§2.4, §4.8). */
export interface PersonalRecordsView {
  readonly board: RankingBoardKind;
  /** This win's solve time. */
  readonly thisMs: number;
  /** Board size of this win, and the best time on that size (null when none). */
  readonly n: number;
  readonly bestSizeMs: number | null;
  readonly totalPoints: number;
  readonly levelsSolved: number;
  /** Event board: "Your results: 7 of 21, total 1:12:04". */
  readonly event: { readonly solved: number; readonly total: number; readonly totalMs: number } | null;
}

/**
 * The list area (phase2b §2.4): loading skeleton (static grey bars, no fake data), one of the three
 * FB modes, or the personal records with rank.localOnly ('local') or rank.unavailable ('unavailable').
 */
export type RankingListState =
  | { readonly kind: 'loading' }
  /** FB overlay views can be placed in a rect: the app places the overlay inside the list area (onListArea). */
  | { readonly kind: 'overlay' }
  /** Overlay views exist but cannot be placed: my line + secondary button "See top players" (onSeeTop). */
  | { readonly kind: 'see_top'; readonly mine: RankMineView }
  /** No overlay views: my line only, never other players' rows. */
  | { readonly kind: 'mine'; readonly mine: RankMineView }
  | { readonly kind: 'records'; readonly records: PersonalRecordsView; readonly reason: 'local' | 'unavailable' };

/** The subtitle: this win's result ("+55 points · 2:14", "Solved in 3:08", "13 of 21 solved"). */
export type RankingResultView =
  | { readonly kind: 'level'; readonly pointsEarned: number; readonly ms: number }
  | { readonly kind: 'daily'; readonly ms: number }
  | { readonly kind: 'event'; readonly solved: number; readonly total: number };

export interface RankingPanelProps {
  readonly board: RankingBoardKind;
  /** The event's name key for rank.title.event ("{event}: top players"); null for other boards. */
  readonly eventNameKey: I18nKey | null;
  readonly result: RankingResultView;
  readonly list: RankingListState;
  /** rank.panelTapMinMs (or fx.win.reduced.tapMinMs): taps before this, counted from open(), are ignored. */
  readonly tapMinMs: number;
  readonly reducedMotion: boolean;
  /** Tap, Enter, Space or Esc after the gate: the app closes the panel and opens the victory screen. */
  onContinue(): void;
  /** 'see_top' mode: open the FB overlay view full screen (RankingProvider.showList without a rect). */
  onSeeTop(): void;
  /** 'overlay' mode: the list area's client rect once laid out (RankingProvider.showList(board, view, rect)). */
  onListArea(rect: DOMRect): void;
}

export function createRankingPanel(): OverlayView<RankingPanelProps> {
  throw new Error('not implemented: createRankingPanel (B, phase2b §2.4)');
}
