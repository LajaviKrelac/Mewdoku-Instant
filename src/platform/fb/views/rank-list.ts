// Owner: D
// Our own XML and CSS templates for the leaderboard overlay view (phase2b §5.4): a `For` over the rows,
// each with the rank, an `Image` photo, a `Text` name and a `Text` score, and an `If` for "me". The
// name and photo are bound from the row's id; all numbers arrive pre-formatted (rankText, scoreText),
// so the XML holds no decoding logic. Check the binding syntax against Meta's public NEZP sample
// before writing them (05 [nezp-lb]); copy no text from it. Lazy `fb-social` chunk.
// F0 stub: the data shape is final; the templates are D's.

/** One row handed to the view as data. Never fabricated: only entries the API returned. */
export interface RankListRow {
  /** The entry's session id (NEZP) or player id (classic), for the name/photo bindings. */
  readonly id: string;
  /** formatNumber(rank) with '#', by the caller. */
  readonly rankText: string;
  /** RankListView.formatScore(score). */
  readonly scoreText: string;
  readonly isMe: boolean;
}

export interface RankListData {
  readonly title: string;
  readonly rows: readonly RankListRow[];
  readonly highlightMe: boolean;
}

/** The overlay templates. */
export function rankListTemplate(): { readonly xml: string; readonly css: string } {
  throw new Error('not implemented: rankListTemplate (D, phase2b §5.4)');
}
