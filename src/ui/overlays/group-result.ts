// Owner: B
// Group challenge result (new overlay `group_result`, phase2b §5.6), shown on the first launch after
// a challenge ended. Participation mode (default) says the challenge has FINISHED (group.finished),
// never that the player won. Offers "Take {count}" and, when a rewarded ad is available, "Watch a
// video for {count}" (4 in total, not 2 + 4). Rank mode (only if §14 G2 finds a standings API):
// rank 1 including ties wins kitties; others with ≥ 1 win get fish ("Thanks for playing: +10 fish").
// Lazy overlay chunk. F0 stub: props final; body is B's.
//
// Classes (proposed): .overlay[data-overlay=group_result] > .overlay__panel--dialog.group-result[data-kind]
import type { OverlayView } from '../dom';

export type GroupResultOutcome =
  /** Participation mode: wins ≥ groups.minWinsForReward. */
  | { readonly kind: 'participation'; readonly kitties: number; readonly kittiesWithAd: number | null }
  /** Rank mode, place 1 (ties share it). */
  | { readonly kind: 'won'; readonly kitties: number; readonly kittiesWithAd: number | null }
  /** Rank mode, any other place: fish for taking part. */
  | { readonly kind: 'place'; readonly place: number; readonly count: number; readonly fish: number };

export interface GroupResultProps {
  readonly outcome: GroupResultOutcome;
  /** A grant or the video is in flight. */
  readonly busy: boolean;
  /** Take the base reward. */
  onTake(): void;
  /** Watch the `group_double` rewarded video (only when kittiesWithAd is not null). */
  onDouble(): void;
}

export function createGroupResult(): OverlayView<GroupResultProps> {
  throw new Error('not implemented: createGroupResult (B, phase2b §5.6)');
}
