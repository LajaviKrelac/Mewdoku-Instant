// Owner: B
// Rankings hub (new overlay `rank_hub`, phase2b §5.5): a sheet from the Home trophy (shown when
// capabilities().leaderboards) with tabs "Paw points", "Today", "Event" (while an event is active)
// and "Groups" (flag groupChallenges). Each list tab shows the same states as the ranking panel
// (RankingListState: the three FB modes, loading, personal records). The Groups tab offers "Start a
// group challenge" (group.start) and the running challenge. Never a fabricated row.
// Lazy overlay chunk. F0 stub: props final; body is B's.
//
// Classes (proposed): .overlay[data-overlay=rank_hub] > .overlay__panel--sheet.rank-hub[data-tab]
import type { I18nKey } from '../../i18n';
import type { OverlayView } from '../dom';
import type { RankingListState } from './ranking-panel';

export type RankHubTab = 'points' | 'daily' | 'event' | 'groups';

/** The Groups tab (phase2b §5.6). */
export interface RankHubGroupsView {
  /** "Start a group challenge" is offered (no running challenge, GroupProvider present). */
  readonly canStart: boolean;
  /** The running challenge in this context, if any: wins so far and its end. */
  readonly active: { readonly endsAt: number; readonly wins: number } | null;
  /** group.body.participation / group.body.rank parameters. */
  readonly rewardMode: 'participation' | 'rank';
  readonly minWins: number;
  readonly hours: number;
  readonly kitties: number;
}

export interface RankHubProps {
  readonly tabs: readonly RankHubTab[];
  readonly tab: RankHubTab;
  /** The active event's name key for the Event tab title; null without an event. */
  readonly eventNameKey: I18nKey | null;
  /** The current list tab's content (ignored on the Groups tab). */
  readonly list: RankingListState;
  /** The Groups tab's content; null when the tab is absent. */
  readonly groups: RankHubGroupsView | null;
  /** Clock for "Ends in …". */
  now(): number;
  onTab(tab: RankHubTab): void;
  onSeeTop(): void;
  onListArea(rect: DOMRect): void;
  onStartGroup(): void;
  onClose(): void;
}

export function createRankHub(): OverlayView<RankHubProps> {
  throw new Error('not implemented: createRankHub (B, phase2b §5.5)');
}
