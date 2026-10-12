// Owner: B (Phase 2b); G2 (Phase 2c: the period board, the fish score, the period records; 2c.1: Total points);
// G3 (Phase 2e: the worldwide daily ranking's 'bracket' state)
// Ranking panel (new overlay `ranking`, phase2b §2.4): a dimmed full-screen --scrim with a centred
// --stage panel (orange --title-on-dark title, the subtitle for this win, the list area) and the
// "Tap to keep going" footer in --tap-text. Opens at t = fx.winOverlayDelayMs (4.5 s) of the win flow.
// NEVER fabricates a row: the list shows only what `list` carries (CONTRACTS-2b §6).
// A tap anywhere, Enter, Space or Esc continues once `tapMinMs` has passed since open (dismiss()
// handles Esc). role="dialog" labelled by the title; a live region reads the rank and points.
// The footer is a real button (data-autofocus), so keyboard and screen-reader users land on it; it
// stays aria-disabled until the gate, then fades in over 200 ms and pulses (rank.tapPulseMs; 2026-10-12: the
// pulse waits out the fade, overlay-chunk.css). On continue the panel fades out
// over rank.panelOutMs (.is-leaving) while the app closes it and opens the victory screen.
// Reduced motion (§2.7): the whole overlay fades in over fx.reducedMotionFadeMs (WAAPI, so the global
// reduced-motion CSS rule does not cut it), no pop and no pulse.
// Lazy overlay chunk.
// Phase 2c (fish-lives-spec §2.6, §4.6): after every scored win the panel shows THE leaderboard, the
// period board ('period': "Weekly ranking", "+2 fish · This week: 42", scores as "42 fish"); without
// a provider the records card shows This week · Your best week · Total points · Levels solved
// (Phase 2c.1 §4.6, D24: "Total points" replaced the retired "Perfect streak").
//
// Phase 2e (G3, spec §2.4, §7.7, §9.4): the 'bracket' state shows MY BRACKET of the worldwide daily ranking:
// the title "Daily ranking" with an (i) button (onInfo), the subtitle "+2 fish · Your total: 14", then the
// bracket list (bracket-list.ts, from the lazy `ladder` chunk through props.bracketList): "Ends in 7 h 48 min ·
// 37 players", the rewards line, exactly the server's rows (H-3) with my row highlighted and a pinned copy,
// the hearts. The panel stays interactive: a heart, the (i) button, a tap or a drag inside the list never
// continues; a tap elsewhere, the footer, Enter, Space or Esc does (after the gate). My rank is announced
// politely once ("You are #5 of 37 in the daily ranking."); the countdown never is. Without the factory the
// 'bracket' state shows the static skeleton (no fake rows). The records note widens: 'opted_out'
// (ladder.optedOut) and 'paused' (ladder.paused); 'unavailable' while the ladder is active reads
// ladder.unavailable (the 2b rank.unavailable stays for the event boards).
//
// Classes: .overlay[data-overlay=ranking] > .overlay__scrim--dark + .overlay__panel--stage.ranking[data-list]
//          > .ranking__card(.ranking__head(.ranking__title button.ranking__info) .ranking__sub .rank-list[data-kind]) .ranking__tap
//          (the dialog element holds the card and the footer, so aria-modal never hides the footer)
//          List parts (shared with the rankings hub): .rank-list__skeleton .rank-mine(.rank-mine__rank
//          .rank-mine__score .rank-mine__count) .rank-records(.rank-records__row) .rank-list__note .rank-list__seetop
import { cfg, type PeriodKind } from '../../app/config';
import { formatClock, formatNumber, t, tn, translate, type I18nKey } from '../../i18n';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { icon } from '../art/sprite';
import { periodBestLabel, periodRankTitle, periodResultText, periodTabLabel } from '../period-text';
import { createDelay, createOverlayShell, makeButton, setGated, setButtonLabel } from './overlay-base';

/**
 * Which board the panel or hub tab shows (phase2b §5.3; Phase 2c §4.1: 'period' is the leaderboard;
 * the retired paw-points board 'points' was removed at I-3).
 */
export type RankingBoardKind = 'period' | 'daily' | 'event';

/** A score already decoded by the app (game/scoring.ts decodeScore); the UI formats it. */
export type RankScoreView =
  | { readonly kind: 'time'; readonly ms: number }
  | { readonly kind: 'event'; readonly solved: number; readonly total: number; readonly ms: number }
  /** Phase 2c: a period score, the fish kept this period ("42 fish"). */
  | { readonly kind: 'fish'; readonly fish: number };

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
  /** Phase 2c §4.6 (board 'period'): this period's total and the best period's total (row hidden while 0). */
  readonly period?: { readonly kind: PeriodKind; readonly total: number; readonly best: number };
}

// ─────────────────────────────── Phase 2e: the worldwide daily ranking (spec §2.4, CONTRACTS §8) ───────────────────────────────

/** One row of my bracket, exactly as the server sent it (H-3); the app adds only heartEnabled. */
export interface BracketRowView {
  readonly rank: number;
  readonly slot: number;
  /** The ranking name (our English words in every locale), rendered with textContent and dir="auto". */
  readonly name: string;
  readonly avatarId: number;
  /** Fish kept, summed in this bracket. */
  readonly points: number;
  readonly hearts: number;
  readonly me: boolean;
  readonly likedByMe: boolean;
  /** The heart button is enabled (hearts on, not yet given, under the cap, not offline). */
  readonly heartEnabled: boolean;
}

/** My bracket for the panel and the sheet (CONTRACTS §8). Never carries an invented row or count. */
export interface BracketListView {
  readonly bracketId: string;
  /** EXACTLY the server's rows, in its order (H-3). */
  readonly rows: readonly BracketRowView[];
  /** The server's count ("37 players"). */
  readonly members: number;
  /** DEVICE-clock ms (the app applied the server offset); null: no countdown line. */
  readonly endsAt: number | null;
  readonly final: boolean;
  /** 'places': "The top 3 win …" (paidPlaces); 'min': "Rewards need at least 5 players …"; 'none': no line. */
  readonly rewardsLine: 'places' | 'min' | 'none';
  /** rules.places.length. */
  readonly paidPlaces: number;
  /** rules.minMembers. */
  readonly minMembers: number;
  /** Hearts received from other players since my last read; 0 = no line. */
  readonly heartsNew: number;
  /** Queued fish shown on my row ("+2 waiting"); 0 = none. */
  readonly waiting: number;
  /**
   * A cached bracket shown while offline or down: "Last updated hh:mm"; `offline` adds the offline line
   * (2026-10-12: only when the device is offline or the last call failed for want of a network, never on a
   * 503, a timeout or a boot from the stored cache).
   */
  readonly stale: { readonly at: number; readonly offline: boolean } | null;
  /** My ranking name for nick.first.line, shown once; else null. */
  readonly firstLineName: string | null;
  /** ladder.panelRows (0 = every row, in a scroll list). */
  readonly panelRows: number;
  /** rules.hearts.enabled. */
  readonly hearts: boolean;
  /** Device clock for the countdown. */
  now(): number;
}

/** The records card's note: rank.localOnly, ladder.unavailable, ladder.optedOut or ladder.paused (spec §2.9). */
export type RecordsReason = 'local' | 'unavailable' | 'opted_out' | 'paused';

/**
 * Phase 2e: the bracket list's factory (src/ui/overlays/bracket-list.ts, in the lazy `ladder` chunk).
 * The ranking panel lives in the overlay chunk, so the app passes the factory from the loaded `ladder`
 * chunk (RankingPanelProps.bracketList); until it is there a 'bracket' state shows the static skeleton.
 */
export type BracketListFactory = (view: BracketListView, cb: BracketListCallbacks) => BracketListHandle;

export interface BracketListCallbacks {
  onHeart(slot: number): void;
  /** The pencil on my row (the ranking sheet only); absent = no pencil. */
  onEditName?(): void;
}

export interface BracketListHandle {
  readonly el: HTMLElement;
  update(view: BracketListView): void;
  /** Scrolls my row to the middle of the list (after the list is shown and laid out). */
  centerMe(): void;
  destroy(): void;
}

/**
 * The list area (phase2b §2.4): loading skeleton (static grey bars, no fake data), one of the three
 * FB modes, or the personal records with rank.localOnly ('local') or rank.unavailable ('unavailable').
 * Phase 2e (spec §2.4): 'bracket', my bracket of the worldwide daily ranking; the records card's note
 * widens with 'opted_out' (ladder.optedOut) and 'paused' (ladder.paused).
 */
export type RankingListState =
  | { readonly kind: 'loading' }
  /** FB overlay views can be placed in a rect: the app places the overlay inside the list area (onListArea). */
  | { readonly kind: 'overlay' }
  /** Overlay views exist but cannot be placed: my line + secondary button "See top players" (onSeeTop). */
  | { readonly kind: 'see_top'; readonly mine: RankMineView }
  /** No overlay views: my line only, never other players' rows. */
  | { readonly kind: 'mine'; readonly mine: RankMineView }
  | { readonly kind: 'records'; readonly records: PersonalRecordsView; readonly reason: RecordsReason }
  /** Phase 2e: my bracket (rows exactly as the server sent them). */
  | { readonly kind: 'bracket'; readonly view: BracketListView };

/**
 * The subtitle: this win's result ("+2 fish · This week: 42", "Solved in 3:08", "13 of 21 solved").
 * The 2b paw-points subtitle ('level', "+55 points · 2:14") was removed with its board at I-3.
 */
export type RankingResultView =
  | { readonly kind: 'daily'; readonly ms: number }
  | { readonly kind: 'event'; readonly solved: number; readonly total: number }
  /** Phase 2c §2.6: "+2 fish · This week: 42" (gained > 0), else "This week: 42". */
  | { readonly kind: 'period'; readonly gained: number; readonly total: number; readonly periodKind: PeriodKind }
  /**
   * Phase 2e §2.4: "+2 fish · Your total: 14" (my points in my current ranking, as the server last said). Audit B9 /
   * A-H1: fish still waiting to be sent are never added in; `waiting` > 0 appends "· +3 waiting" (as my row shows).
   */
  | { readonly kind: 'ladder'; readonly gained: number; readonly total: number; readonly waiting?: number };

export interface RankingPanelProps {
  readonly board: RankingBoardKind;
  /** The event's name key for rank.title.event ("{event}: top players"); null for other boards. */
  readonly eventNameKey: I18nKey | null;
  readonly result: RankingResultView;
  readonly list: RankingListState;
  /** rank.panelTapMinMs (or fx.win.reduced.tapMinMs): taps before this, counted from open(), are ignored. */
  readonly tapMinMs: number;
  readonly reducedMotion: boolean;
  /** Phase 2c §2.6: the period's kind for board 'period' (rank.title.period.<kind>); default cfg.period.kind. */
  readonly periodKind?: PeriodKind;
  /** Tap, Enter, Space or Esc after the gate: the app closes the panel and opens the victory screen. */
  onContinue(): void;
  /** 'see_top' mode: open the FB overlay view full screen (RankingProvider.showList without a rect). */
  onSeeTop(): void;
  /** 'overlay' mode: the list area's client rect once laid out (RankingProvider.showList(board, view, rect)). */
  onListArea(rect: DOMRect): void;
  // ── Phase 2e (spec §2.4; required since I-3) ──
  /** A heart button of the 'bracket' list (the app sends it; the panel never continues on it). */
  onHeart(slot: number): void;
  /** The (i) button next to the title in the 'bracket' state: the app opens the ranking sheet's info view. */
  onInfo(): void;
  /**
   * The bracket list's factory from the lazy `ladder` chunk (bracket-list.ts createBracketList). Absent:
   * a 'bracket' state shows the static skeleton until an update brings it (no fake rows meanwhile).
   */
  readonly bracketList?: BracketListFactory;
}

// ─────────────────────────────── shared text helpers ───────────────────────────────

/** The board title (Appendix A rank.title.*; Phase 2c: rank.title.period.<kind> "Weekly ranking"). */
export function rankTitle(board: RankingBoardKind, eventNameKey: I18nKey | null, periodKind: PeriodKind = cfg.period.kind): string {
  if (board === 'daily') return t('rank.title.daily');
  if (board === 'event') return t('rank.title.event', { event: eventNameKey ? translate(eventNameKey) : '' });
  return periodRankTitle(periodKind);
}

/** "42 fish" (Phase 2c), "3:08", "13 / 21 solved · 1:12:04". */
export function formatRankScore(s: RankScoreView): string {
  switch (s.kind) {
    case 'fish':
      return tn('fish.count', s.fish, { count: formatNumber(s.fish) });
    case 'time':
      return formatClock(s.ms);
    case 'event':
      return `${t('event.card.progress', { solved: formatNumber(s.solved), total: formatNumber(s.total) })} · ${formatClock(s.ms)}`;
  }
}

/** The subtitle for this win (§2.4). */
export function resultText(r: RankingResultView): string {
  switch (r.kind) {
    case 'daily':
      return t('daily.solvedIn', { time: formatClock(r.ms) });
    case 'event':
      return t('event.card.progress', { solved: formatNumber(r.solved), total: formatNumber(r.total) });
    case 'period':
      return periodResultText(r.periodKind, r.gained, r.total);
    case 'ladder':
      return periodResultText('ladder', r.gained, r.total, r.waiting ?? 0);
  }
}

/**
 * The live-region sentence (§2.4 A11y), from what is known. Phase 2c §2.6, the period board: "Your rank: #12. 42 fish."; "Your score: 42 fish." when only the
 * score is known; else the subtitle ("+2 fish · This week: 42.").
 */
export function announcement(p: Pick<RankingPanelProps, 'list' | 'result'>): string {
  const parts: string[] = [];
  // Phase 2e (§7.7): "You are #5 of 37 in the daily ranking." from the server's own row and count.
  if (p.list.kind === 'bracket') {
    const me = p.list.view.rows.find((r) => r.me);
    if (me) parts.push(t('ladder.announce', { rank: formatNumber(me.rank), count: formatNumber(p.list.view.members) }));
    parts.push(resultText(p.result));
    return parts.map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(' ');
  }
  const mine = p.list.kind === 'mine' || p.list.kind === 'see_top' ? p.list.mine : null;
  if (mine?.rank != null) parts.push(t('rank.yourRank', { rank: formatNumber(mine.rank) }));
  else if (mine?.score) parts.push(t('rank.yourScore', { score: formatRankScore(mine.score) }));
  if (p.result.kind === 'period') {
    if (mine?.rank != null) parts.push(tn('fish.count', p.result.total, { count: formatNumber(p.result.total) }));
    else if (!mine?.score) parts.push(resultText(p.result));
  } else parts.push(resultText(p.result));
  return parts.map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(' ');
}

// ─────────────────────────────── the list ───────────────────────────────

export interface RankListRenderOptions {
  /** 'see_top' mode's button. */
  onSeeTop(): void;
  /** Phase 2e: the worldwide ranking is in use (the records note reads ladder.unavailable). */
  readonly ladder?: boolean;
}

/** My line: "Your rank: #1,234", "Your score: 42 fish", "5,678 players" (only what the API gave). */
function mineBlock(mine: RankMineView): HTMLElement {
  const box = h('div', { class: 'rank-mine' });
  if (mine.rank !== null) box.appendChild(h('p', { class: 'rank-mine__rank num' }, t('rank.yourRank', { rank: formatNumber(mine.rank) })));
  if (mine.score !== null) box.appendChild(h('p', { class: 'rank-mine__score' }, t('rank.yourScore', { score: formatRankScore(mine.score) })));
  if (mine.count !== null) box.appendChild(h('p', { class: 'rank-mine__count' }, tn('rank.entries', mine.count, { count: formatNumber(mine.count) })));
  if (mine.rank === null && mine.score === null) box.appendChild(h('p', { class: 'rank-list__note' }, t('rank.noEntries')));
  return box;
}

/**
 * Phase 2c §4.6, board 'period' (2c.1, D24): This week · Your best week (hidden while 0) · Total points
 * (the lifetime sum of counted level totals) · Levels solved. Only facts from the save.
 */
export function periodRecordRows(r: PersonalRecordsView): [string, string][] {
  const kind = r.period?.kind ?? cfg.period.kind;
  const fish = (n: number): string => tn('fish.count', n, { count: formatNumber(n) });
  const rows: [string, string][] = [[periodTabLabel(kind), fish(r.period?.total ?? 0)]];
  const best = r.period?.best ?? 0;
  if (best > 0) rows.push([periodBestLabel(kind), fish(best)]);
  rows.push([t('rank.records.total'), formatNumber(r.totalPoints)]);
  rows.push([t('rank.records.solved'), formatNumber(r.levelsSolved)]);
  return rows;
}

/** The personal records card (§2.4 "Web / no provider"; §4.8 for the event board; 2c §4.6 the period board). */
function recordsBlock(r: PersonalRecordsView): HTMLElement {
  if (r.board === 'period') {
    const card = h('dl', { class: 'rank-records', dataset: { board: 'period' } });
    for (const [label, value] of periodRecordRows(r)) card.appendChild(recordRow(label, value));
    return card;
  }
  const rows: [string, string][] = [];
  if (r.thisMs > 0) rows.push([t('rank.records.thisPuzzle'), formatClock(r.thisMs)]);
  if (r.board === 'event' && r.event) {
    // The summary line, then the rows in their own <dl>: a dt/dd pair is valid only inside a <dl>
    // (review A11Y-DL-1).
    const card = h('div', { class: 'rank-records' });
    card.appendChild(
      h(
        'p',
        { class: 'rank-records__event' },
        t('event.results.local', { solved: formatNumber(r.event.solved), total: formatNumber(r.event.total), time: formatClock(r.event.totalMs) }),
      ),
    );
    if (rows.length > 0) {
      const dl = h('dl', { class: 'rank-records__list' });
      for (const [label, value] of rows) dl.appendChild(recordRow(label, value));
      card.appendChild(dl);
    }
    return card;
  }
  if (r.n > 0) rows.push([t('rank.records.bestSize', { n: r.n }), r.bestSizeMs === null ? '—' : formatClock(r.bestSizeMs)]);
  rows.push([t('rank.records.solved'), formatNumber(r.levelsSolved)]);
  rows.push([t('rank.records.total'), formatNumber(r.totalPoints)]);
  const card = h('dl', { class: 'rank-records' });
  for (const [label, value] of rows) card.appendChild(recordRow(label, value));
  return card;
}

function recordRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'rank-records__row' }, h('dt', { class: 'rank-records__label' }, label), h('dd', { class: 'rank-records__value num' }, value));
}

/** Skeleton rows: static grey bars, never fake names or numbers (§2.4 "Loading / failure"). */
function skeleton(): HTMLElement {
  const box = h('div', { class: 'rank-list__skeleton', 'aria-hidden': 'true' });
  for (let k = 0; k < 4; k++) {
    box.appendChild(h('span', { class: 'rank-list__bar' }, h('i', { class: 'rank-list__dot' }), h('i', { class: 'rank-list__line' })));
  }
  return box;
}

/** Renders `state` into `list` (cleared first). Shared by the ranking panel and the rankings hub. */
export function renderRankList(list: HTMLElement, state: RankingListState, opts: RankListRenderOptions): void {
  list.textContent = '';
  list.dataset.kind = state.kind;
  switch (state.kind) {
    case 'loading':
      list.append(skeleton(), h('p', { class: 'rank-list__note' }, t('rank.loading')));
      break;
    case 'overlay':
      // The FB overlay view is placed over this area by the app (onListArea); nothing of ours inside.
      break;
    case 'see_top':
      list.append(
        mineBlock(state.mine),
        makeButton({ variant: 'secondary', label: t('rank.seeTop'), icon: 'icon-users', className: 'rank-list__seetop', onPress: () => opts.onSeeTop() }),
      );
      break;
    case 'mine':
      list.appendChild(mineBlock(state.mine));
      break;
    case 'records':
      list.append(recordsBlock(state.records), h('p', { class: 'rank-list__note' }, recordsNote(state.reason, opts.ladder === true)));
      break;
    case 'bracket':
      // The bracket list comes from the lazy `ladder` chunk (the panel swaps it in); until then the static
      // skeleton, never a fake row (H-1, H-3).
      list.dataset.kind = 'loading';
      list.append(skeleton(), h('p', { class: 'rank-list__note' }, t('rank.loading')));
      break;
  }
}

/**
 * The records card's note (spec §2.9): rank.localOnly (the web, no ranking), ladder.optedOut, ladder.paused;
 * 'unavailable' reads ladder.unavailable while the worldwide ranking is in use, else the 2b rank.unavailable.
 */
export function recordsNote(reason: RecordsReason, ladder: boolean): string {
  switch (reason) {
    case 'local':
      return t('rank.localOnly');
    case 'opted_out':
      return t('ladder.optedOut');
    case 'paused':
      return t('ladder.paused');
    case 'unavailable':
      return ladder ? t('ladder.unavailable') : t('rank.unavailable');
  }
}

// ─────────────────────────────── the panel ───────────────────────────────

const isActionKey = (k: string): boolean => k === 'Enter' || k === ' ' || k === 'Spacebar';
/** Phase 2e: a pointer that moved this far (CSS px, |dx| + |dy|) between down and click was a drag, not a tap. */
const DRAG_PX = 10;

export function createRankingPanel(): OverlayView<RankingPanelProps> {
  let props: RankingPanelProps | null = null;
  let ready = false;
  let continued = false;
  let listKind: RankingListState['kind'] | null = null;
  let rectFor: string | null = null;
  const shell = createOverlayShell({ id: 'ranking', scrim: 'dark', panel: 'stage' });
  shell.panel.classList.add('ranking');
  const gate = createDelay();
  const announceDelay = createDelay();

  const title = h('h2', { class: 'overlay__title ranking__title', id: shell.titleId });
  // Phase 2e: the (i) button next to the title in the 'bracket' state (opens the sheet's info view).
  const info = makeButton({ variant: 'icon', icon: 'icon-info', ariaLabel: t('ladder.info'), className: 'ranking__info', onPress: () => props?.onInfo() });
  info.hidden = true;
  const head = h('div', { class: 'ranking__head' }, title, info);
  // Worded ("+2 fish · Your total: 14", "Solved in 3:08"): no .num (it would force the whole line LTR in Arabic).
  const sub = h('p', { class: 'ranking__sub', id: shell.descId });
  const list = h('div', { class: 'rank-list' });
  /** Phase 2e: the bracket list from the `ladder` chunk, swapped in for `list` in the 'bracket' state. */
  let bracket: { readonly factory: BracketListFactory; readonly handle: BracketListHandle } | null = null;
  let centerAfterOpen = false;
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const tap = makeButton({ variant: 'ghost', label: t('rank.tap'), autofocus: true, className: 'ranking__tap', onPress: () => tryContinue() });
  // The footer follows the language (A11Y-I18N-1).
  const L = createLocaleText();
  L.run(() => {
    setButtonLabel(tap, t('rank.tap'));
    info.setAttribute('aria-label', t('ladder.info'));
  });
  const card = h('div', { class: 'ranking__card' }, head, sub, list);
  shell.panel.append(card, tap, live);
  shell.el.style.setProperty('--pop-ms', `${cfg.rank.panelPopMs}ms`);
  shell.el.style.setProperty('--out-ms', `${cfg.rank.panelOutMs}ms`);
  shell.el.style.setProperty('--pulse-ms', `${cfg.rank.tapPulseMs}ms`);

  function tryContinue(): boolean {
    if (!props || !ready || continued || !shell.isOpen()) return false;
    continued = true;
    shell.el.classList.add('is-leaving');
    props.onContinue();
    return true;
  }

  // Phase 2e (§2.4 Taps): a drag (or a scroll) that started anywhere never counts as a tap to continue.
  let downAt: { x: number; y: number } | null = null;
  let dragged = false;
  shell.el.addEventListener('pointerdown', (ev) => {
    downAt = { x: ev.clientX, y: ev.clientY };
    dragged = false;
  });
  shell.el.addEventListener('pointermove', (ev) => {
    if (downAt && Math.abs(ev.clientX - downAt.x) + Math.abs(ev.clientY - downAt.y) > DRAG_PX) dragged = true;
  });
  // A tap anywhere (scrim, panel, footer) continues after the gate; the "See top players" button does its own thing.
  // Phase 2e: the heart buttons, the (i) button and any tap inside the bracket list never continue.
  shell.el.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    const wasDrag = dragged;
    downAt = null;
    dragged = false;
    if (target?.closest('.rank-list__seetop')) return;
    if (target?.closest('.ranking__tap')) return; // its own onPress
    if (target?.closest('.ranking__info, .rank-list--bracket')) return;
    if (wasDrag) return;
    tryContinue();
  });
  shell.el.addEventListener('keydown', (ev) => {
    if (!isActionKey(ev.key)) return;
    const target = ev.target as Element | null;
    if (target?.closest('button')) return; // the button handles Enter / Space itself
    ev.preventDefault();
    tryContinue();
  });

  /** Phase 2e: the 'bracket' state — the factory's list replaces the plain list area (or the skeleton until it lands). */
  const renderBracket = (p: RankingPanelProps, view: BracketListView): void => {
    const factory = p.bracketList;
    if (!factory) {
      dropBracket();
      renderRankList(list, { kind: 'bracket', view }, { onSeeTop: () => undefined });
      return;
    }
    if (bracket && bracket.factory !== factory) dropBracket();
    if (!bracket) {
      const handle = factory(view, { onHeart: (slot) => props?.onHeart(slot) });
      bracket = { factory, handle };
      list.replaceWith(handle.el);
      centerAfterOpen = true;
    } else bracket.handle.update(view);
    if (centerAfterOpen && shell.isOpen()) scheduleCenter();
  };
  const dropBracket = (): void => {
    if (!bracket) return;
    bracket.handle.el.replaceWith(list);
    bracket.handle.destroy();
    bracket = null;
  };
  let centerRaf = 0;
  /** On open the list scrolls so my row is in the middle (after layout: two frames). */
  const scheduleCenter = (): void => {
    const win = shell.el.ownerDocument.defaultView;
    const run = (): void => {
      centerRaf = 0;
      if (bracket && shell.isOpen()) {
        centerAfterOpen = false;
        bracket.handle.centerMe();
      }
    };
    if (!win?.requestAnimationFrame) return run();
    if (centerRaf) win.cancelAnimationFrame(centerRaf);
    centerRaf = win.requestAnimationFrame(() => {
      centerRaf = win.requestAnimationFrame(run);
    });
  };

  /** 'overlay' mode: report the list area's rect once it is laid out (and again if the mode returns). */
  const reportListArea = (): void => {
    if (!props || props.list.kind !== 'overlay') {
      rectFor = null;
      return;
    }
    if (rectFor === 'overlay') return;
    rectFor = 'overlay';
    const win = shell.el.ownerDocument.defaultView;
    const send = (): void => {
      if (props && props.list.kind === 'overlay' && shell.isOpen()) props.onListArea(list.getBoundingClientRect());
    };
    if (win?.requestAnimationFrame) win.requestAnimationFrame(() => win.requestAnimationFrame(send));
    else send();
  };

  const render = (p: RankingPanelProps): void => {
    props = p;
    L.apply();
    shell.panel.dataset.board = p.board;
    const ladder = p.list.kind === 'bracket' || p.result.kind === 'ladder';
    // Phase 2e: the worldwide ranking is the "Daily ranking" (rank.title.period.day), whatever period.kind is.
    // Audit B4: my own records (web-prod, rankings off, the ranking unavailable) are titled as the sheet titles
    // them, never "… ranking" above a note that says there is none.
    const records = p.list.kind === 'records' && p.board === 'period';
    setText(
      title,
      records
        ? t('ladder.records.title')
        : ladder
          ? t('rank.title.period.day')
          : rankTitle(p.board, p.eventNameKey, p.periodKind ?? (p.result.kind === 'period' ? p.result.periodKind : cfg.period.kind)),
    );
    // Its glyph and the sheet it opens come with the lazy `ladder` chunk: no factory yet, no (i) (never a blank disc).
    info.hidden = !(p.list.kind === 'bracket' && p.bracketList);
    setText(sub, resultText(p.result));
    if (p.list.kind === 'bracket') {
      renderBracket(p, p.list.view);
      listKind = 'bracket';
    } else if (p.list.kind !== listKind || p.list.kind !== 'overlay') {
      dropBracket();
      // Re-render on any data change; the overlay area is left alone (the FB view sits on it).
      renderRankList(list, p.list, { onSeeTop: () => props?.onSeeTop(), ladder });
      listKind = p.list.kind;
    }
    shell.panel.dataset.list = p.list.kind;
    shell.el.toggleAttribute('data-reduced', p.reducedMotion);
    reportListArea();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      ready = false;
      continued = false;
      listKind = null;
      rectFor = null;
      centerAfterOpen = true;
      shell.el.classList.remove('is-leaving', 'is-ready');
      setGated(tap, true);
      render(p);
      shell.show();
      if (bracket) scheduleCenter();
      if (p.reducedMotion && typeof shell.el.animate === 'function') {
        try {
          shell.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cfg.fx.reducedMotionFadeMs, easing: 'linear' });
        } catch {
          // shows at once
        }
      }
      gate.start(p.tapMinMs, () => {
        ready = true;
        setGated(tap, false);
        shell.el.classList.add('is-ready');
      });
      // A moment after open, so screen readers have taken in the dialog first.
      live.textContent = '';
      announceDelay.start(cfg.rank.panelPopMs, () => {
        if (props) live.textContent = announcement(props);
      });
    },
    update(p) {
      render(p);
    },
    close() {
      gate.cancel();
      announceDelay.cancel();
      if (centerRaf) shell.el.ownerDocument.defaultView?.cancelAnimationFrame(centerRaf);
      centerRaf = 0;
      ready = false;
      shell.hide();
    },
    dismiss: () => tryContinue(),
    destroy() {
      gate.cancel();
      announceDelay.cancel();
      if (centerRaf) shell.el.ownerDocument.defaultView?.cancelAnimationFrame(centerRaf);
      dropBracket();
      props = null;
      shell.el.remove();
    },
  };
}
