// Owner: B
// Ranking panel (new overlay `ranking`, phase2b §2.4): a dimmed full-screen --scrim with a centred
// --stage panel (orange --title-on-dark title, the subtitle for this win, the list area) and the
// "Tap to keep going" footer in --tap-text. Opens at t = fx.winOverlayDelayMs (4.5 s) of the win flow.
// NEVER fabricates a row: the list shows only what `list` carries (CONTRACTS-2b §6).
// A tap anywhere, Enter, Space or Esc continues once `tapMinMs` has passed since open (dismiss()
// handles Esc). role="dialog" labelled by the title; a live region reads the rank and points.
// The footer is a real button (data-autofocus), so keyboard and screen-reader users land on it; it
// stays aria-disabled until the gate, then pulses (rank.tapPulseMs). On continue the panel fades out
// over rank.panelOutMs (.is-leaving) while the app closes it and opens the victory screen.
// Reduced motion (§2.7): the whole overlay fades in over fx.reducedMotionFadeMs (WAAPI, so the global
// reduced-motion CSS rule does not cut it), no pop and no pulse.
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=ranking] > .overlay__scrim--dark + .overlay__panel--stage.ranking[data-list]
//          > .ranking__card(.ranking__title .ranking__sub .rank-list[data-kind]) .ranking__tap
//          (the dialog element holds the card and the footer, so aria-modal never hides the footer)
//          List parts (shared with the rankings hub): .rank-list__skeleton .rank-mine(.rank-mine__rank
//          .rank-mine__score .rank-mine__count) .rank-records(.rank-records__row) .rank-list__note .rank-list__seetop
import { cfg } from '../../app/config';
import { formatClock, formatNumber, t, tn, translate, type I18nKey } from '../../i18n';
import { h, setText, type OverlayView } from '../dom';
import { createDelay, createOverlayShell, makeButton, setGated } from './overlay-base';

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

// ─────────────────────────────── shared text helpers ───────────────────────────────

/** The board title (Appendix A rank.title.*). */
export function rankTitle(board: RankingBoardKind, eventNameKey: I18nKey | null): string {
  if (board === 'daily') return t('rank.title.daily');
  if (board === 'event') return t('rank.title.event', { event: eventNameKey ? translate(eventNameKey) : '' });
  return t('rank.title.points');
}

/** "1,240 points", "3:08", "13 / 21 solved · 1:12:04". */
export function formatRankScore(s: RankScoreView): string {
  switch (s.kind) {
    case 'points':
      return t('rank.points', { points: formatNumber(s.points) });
    case 'time':
      return formatClock(s.ms);
    case 'event':
      return `${t('event.card.progress', { solved: formatNumber(s.solved), total: formatNumber(s.total) })} · ${formatClock(s.ms)}`;
  }
}

/** The subtitle for this win (§2.4). */
export function resultText(r: RankingResultView): string {
  switch (r.kind) {
    case 'level':
      return `${t('victory.points', { points: formatNumber(r.pointsEarned) })} · ${formatClock(r.ms)}`;
    case 'daily':
      return t('daily.solvedIn', { time: formatClock(r.ms) });
    case 'event':
      return t('event.card.progress', { solved: formatNumber(r.solved), total: formatNumber(r.total) });
  }
}

/** The live-region sentence (§2.4 A11y): "Your rank: #1,234. 55 points." from what is known. */
export function announcement(p: Pick<RankingPanelProps, 'list' | 'result'>): string {
  const parts: string[] = [];
  const mine = p.list.kind === 'mine' || p.list.kind === 'see_top' ? p.list.mine : null;
  if (mine?.rank != null) parts.push(t('rank.yourRank', { rank: formatNumber(mine.rank) }));
  else if (mine?.score) parts.push(t('rank.yourScore', { score: formatRankScore(mine.score) }));
  if (p.result.kind === 'level') parts.push(t('rank.points', { points: formatNumber(p.result.pointsEarned) }));
  else parts.push(resultText(p.result));
  return parts.map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(' ');
}

// ─────────────────────────────── the list (shared with rank-hub.ts) ───────────────────────────────

export interface RankListRenderOptions {
  /** 'see_top' mode's button. */
  onSeeTop(): void;
}

/** My line: "Your rank: #1,234", "Your score: 1,240 points", "5,678 players" (only what the API gave). */
function mineBlock(mine: RankMineView): HTMLElement {
  const box = h('div', { class: 'rank-mine' });
  if (mine.rank !== null) box.appendChild(h('p', { class: 'rank-mine__rank num' }, t('rank.yourRank', { rank: formatNumber(mine.rank) })));
  if (mine.score !== null) box.appendChild(h('p', { class: 'rank-mine__score' }, t('rank.yourScore', { score: formatRankScore(mine.score) })));
  if (mine.count !== null) box.appendChild(h('p', { class: 'rank-mine__count' }, tn('rank.entries', mine.count, { count: formatNumber(mine.count) })));
  if (mine.rank === null && mine.score === null) box.appendChild(h('p', { class: 'rank-list__note' }, t('rank.noEntries')));
  return box;
}

/** The personal records card (§2.4 "Web / no provider"; §4.8 for the event board). */
function recordsBlock(r: PersonalRecordsView): HTMLElement {
  const rows: [string, string][] = [];
  if (r.thisMs > 0) rows.push([r.board === 'points' ? t('rank.records.thisLevel') : t('rank.records.thisPuzzle'), formatClock(r.thisMs)]);
  if (r.board === 'event' && r.event) {
    const card = h('div', { class: 'rank-records' });
    card.appendChild(
      h(
        'p',
        { class: 'rank-records__event' },
        t('event.results.local', { solved: formatNumber(r.event.solved), total: formatNumber(r.event.total), time: formatClock(r.event.totalMs) }),
      ),
    );
    for (const [label, value] of rows) card.appendChild(recordRow(label, value));
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
      list.append(
        recordsBlock(state.records),
        h('p', { class: 'rank-list__note' }, state.reason === 'local' ? t('rank.localOnly') : t('rank.unavailable')),
      );
      break;
  }
}

// ─────────────────────────────── the panel ───────────────────────────────

const isActionKey = (k: string): boolean => k === 'Enter' || k === ' ' || k === 'Spacebar';

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
  const sub = h('p', { class: 'ranking__sub num', id: shell.descId });
  const list = h('div', { class: 'rank-list' });
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const tap = makeButton({ variant: 'ghost', label: t('rank.tap'), autofocus: true, className: 'ranking__tap', onPress: () => tryContinue() });
  shell.panel.append(h('div', { class: 'ranking__card' }, title, sub, list), tap, live);
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

  // A tap anywhere (scrim, panel, footer) continues after the gate; the "See top players" button does its own thing.
  shell.el.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest('.rank-list__seetop')) return;
    if (target?.closest('.ranking__tap')) return; // its own onPress
    tryContinue();
  });
  shell.el.addEventListener('keydown', (ev) => {
    if (!isActionKey(ev.key)) return;
    const target = ev.target as Element | null;
    if (target?.closest('button')) return; // the button handles Enter / Space itself
    ev.preventDefault();
    tryContinue();
  });

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
    shell.panel.dataset.board = p.board;
    setText(title, rankTitle(p.board, p.eventNameKey));
    setText(sub, resultText(p.result));
    if (p.list.kind !== listKind || p.list.kind !== 'overlay') {
      // Re-render on any data change; the overlay area is left alone (the FB view sits on it).
      renderRankList(list, p.list, { onSeeTop: () => props?.onSeeTop() });
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
      shell.el.classList.remove('is-leaving', 'is-ready');
      setGated(tap, true);
      render(p);
      shell.show();
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
      ready = false;
      shell.hide();
    },
    dismiss: () => tryContinue(),
    destroy() {
      gate.cancel();
      announceDelay.cancel();
      props = null;
      shell.el.remove();
    },
  };
}
