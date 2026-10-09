// Owner: D
// Our own XML template for the leaderboard overlay view (phase2b §5.4): a title, then a `For` over the
// rows, each with the rank, an `Image` photo, a `Text` name and a `Text` score, and an `If` for "me".
// The name and photo are bound from the row's id; all numbers arrive pre-formatted (rankText,
// scoreText), so the XML holds no decoding logic. Lazy `fb-social` chunk.
//
// Written by us. The element names (View, Text, Image, For, If, Condition, Else), the attributes
// (content, src, source, itemName, sortKey, onTapEvent, lhs/operator/rhs) and the binding forms
// `{{FBInstant.player.name}}`, `{{FBInstant.player.photo}}` and the dynamic key
// `FBInstant.player.friends[{{id}}]` were checked against Meta's public NEZP sample views and its
// Unity plugin reference (read 2026-10-09; 06 allows Meta's own samples, no text copied).
//
// [uncertain: §14 G3] — not verified on a device:
//   - how another player's name and photo bind from a leaderboard id. Meta's samples only show the
//     player's own name and photo and `friends[<player ID>]` for connected players, so other rows
//     use that form (PLAYER_BINDING below, the one place to change); a row whose player is not a
//     connected player may render without a name or photo, but rank and score always show;
//   - the For element's default sort direction (we sort by an ascending position field);
//   - the stylesheet argument: Meta's sample passes a file path. Every element here is styled
//     inline instead, so the view needs no stylesheet file (RANK_LIST_CSS is empty).
// Colours mirror our tokens (src/styles/tokens.css, phase2b §1.4): an overlay iframe cannot read the
// page's CSS custom properties.

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

/** Texts and mode the template needs besides the rows (all localised by the caller). */
export interface RankListExtras {
  /** Shown when there are no rows (rank.noEntries). */
  readonly emptyText: string;
  /** The close control's label (common.close). */
  readonly closeText: string;
  /** Full-screen presentation: the view shows its own close control (§2.4 "See top players"). */
  readonly closable: boolean;
}

/** The custom event a tap on the view's close control sends (overlayViews.setCustomEventHandler). Ours. */
export const RANK_LIST_CLOSE_EVENT = 'mewdoku_rank_close';

/** Row kinds the template branches on: my row highlighted, my row plain, another player's row. */
type RowKind = 'mine' | 'self' | 'other';

/** The JSON object passed to createOverlayViewWithXMLString as `data` (stringified by the caller). */
export interface RankListOverlayData {
  readonly title: string;
  readonly rows: readonly { readonly pos: number; readonly id: string; readonly rank: string; readonly score: string; readonly kind: RowKind }[];
  /** '0' when empty, so a Condition can compare strings. */
  readonly count: string;
  readonly emptyText: string;
  readonly closeText: string;
  readonly closable: 'yes' | 'no';
}

/** Builds the view data: rows in the caller's order, nothing added. */
export function rankListData(data: RankListData, extras: RankListExtras): RankListOverlayData {
  const rows = data.rows.map((r, i) => ({
    pos: i + 1,
    id: r.id,
    rank: r.rankText,
    score: r.scoreText,
    kind: (r.isMe ? (data.highlightMe ? 'mine' : 'self') : 'other') as RowKind,
  }));
  return {
    title: data.title,
    rows,
    count: String(rows.length),
    emptyText: extras.emptyText,
    closeText: extras.closeText,
    closable: extras.closable ? 'yes' : 'no',
  };
}

/** [uncertain: G3] Another player's name/photo binding, from the row id expression. */
export const PLAYER_BINDING = {
  name: (idExpr: string): string => `{{FBInstant.player.friends[${idExpr}].name}}`,
  photo: (idExpr: string): string => `{{FBInstant.player.friends[${idExpr}].photo}}`,
} as const;

/** Our own palette for the view (mirrors of tokens.css values: --stage, --title-on-dark, --accent, --ink-3). */
const C = {
  stage: '#2A2430',
  title: '#E57010',
  accent: '#E57010',
  rowLine: 'rgba(255,255,255,0.08)',
  meRow: 'rgba(229,112,16,0.16)',
  dim: '#B2AAB4',
  text: '#FFFFFF',
} as const;

const S = {
  root: `display:flex;flex-direction:column;width:100%;height:100%;background:${C.stage};color:${C.text};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;`,
  title: `color:${C.title};font-size:24px;font-weight:700;text-align:center;padding:14px 12px 10px;`,
  list: 'display:flex;flex-direction:column;overflow-y:auto;padding:0 8px 8px;',
  row: `display:flex;flex-direction:row;align-items:center;height:48px;padding:0 10px;border-bottom:1px solid ${C.rowLine};`,
  rowMine: `display:flex;flex-direction:row;align-items:center;height:48px;padding:0 10px 0 6px;border-left:4px solid ${C.accent};background:${C.meRow};border-radius:8px;`,
  rank: 'width:52px;font-size:16px;font-weight:700;',
  photo: 'width:32px;height:32px;border-radius:16px;margin-right:10px;',
  name: 'flex:1;font-size:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;',
  score: 'font-size:16px;font-weight:700;margin-left:8px;',
  empty: `color:${C.dim};font-size:16px;text-align:center;padding:24px 12px;`,
  close: `align-self:center;margin:8px 0 14px;padding:10px 28px;border-radius:22px;background:${C.accent};`,
  closeText: 'color:#FFFFFF;font-size:18px;font-weight:700;',
} as const;

/** One row: rank, photo, name, score. `self` rows bind the player's own name and photo. */
function rowXml(style: string, self: boolean): string {
  const name = self ? '{{FBInstant.player.name}}' : PLAYER_BINDING.name('{{row.id}}');
  const photo = self ? '{{FBInstant.player.photo}}' : PLAYER_BINDING.photo('{{row.id}}');
  return (
    `<View style="${style}">` +
    `<Text content="{{row.rank}}" style="${S.rank}"/>` +
    `<Image src="${photo}" style="${S.photo}"/>` +
    `<Text content="${name}" style="${S.name}"/>` +
    `<Text content="{{row.score}}" style="${S.score}"/>` +
    `</View>`
  );
}

const ifEquals = (lhs: string, rhs: string, then: string, otherwise = ''): string =>
  `<If><Condition lhs="${lhs}" operator="EQUALS" rhs="${rhs}"/>${then}${otherwise ? `<Else>${otherwise}</Else>` : ''}</If>`;

/** Stylesheet argument for createOverlayViewWithXMLString: none, every element is styled inline (see header). */
export const RANK_LIST_CSS = '';

let cached: { readonly xml: string; readonly css: string } | null = null;

/** The overlay templates. */
export function rankListTemplate(): { readonly xml: string; readonly css: string } {
  if (cached) return cached;
  const rows =
    `<For source="{{rows}}" itemName="row" sortKey="pos">` +
    ifEquals('{{row.kind}}', 'mine', rowXml(S.rowMine, true), ifEquals('{{row.kind}}', 'self', rowXml(S.row, true), rowXml(S.row, false))) +
    `</For>`;
  const close = `<View style="${S.close}" onTapEvent="${RANK_LIST_CLOSE_EVENT}"><Text content="{{closeText}}" style="${S.closeText}"/></View>`;
  const xml =
    `<View style="${S.root}">` +
    `<Text content="{{title}}" style="${S.title}"/>` +
    `<View style="${S.list}">` +
    ifEquals('{{count}}', '0', `<Text content="{{emptyText}}" style="${S.empty}"/>`, rows) +
    `</View>` +
    ifEquals('{{closable}}', 'yes', close) +
    `</View>`;
  cached = { xml, css: RANK_LIST_CSS };
  return cached;
}
