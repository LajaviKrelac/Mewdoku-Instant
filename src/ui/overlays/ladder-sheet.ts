// Owner: G3 (Phase 2e)
// The ranking sheet (overlay `ladder`, spec §2.5, §2.9, §7.7, §9.4; CONTRACTS §8), opened from the Home chip
// at any time (and from Settings, and from the panel's (i) for the info view). Lazy `ladder` chunk.
//   list:    (i) "Leaderboard" ×, my bracket (bracket-list.ts), or "Solve a puzzle to join the daily ranking."
//            when I have no bracket now. UI batch (2026-10-13; user: "remove option to edit your username from
//            that screen (pen icon)", "move info icon to the left so you can center the 'Leaderboard' label"): no
//            pencil (the name sheet opens from Settings and the Home picture); the title sits between two equal
//            discs, so it is truly centred (with no bracket the (i) keeps its slot unseen). Esc (or a scrim tap)
//            closes a chest's tooltip first;
//   info:    how it works (ladder.info.*), every count from the server's rules (C-5): the fish, the 24 h and
//            up to N players, "Rankings include computer players." while the server's rules say so (2026-10-12,
//            D-2e-24), the rewards and their minimum, ×2 by video, hearts, names and pictures (never
//            the Facebook name), how to switch the ranking off or delete the data; Back to the list;
//   records: without a server (the web, offline with no cache, not listed, paused): "Your records", the
//            personal records card plus the streak's best run, and the honest note (spec §2.9).
// With `infoOnly` (ladder.noticeFirst) the info view is a one-time dialog with OK only.
// A light sheet in the Classic look (white card, mauve-brown ink, warm shadows); the list is the same
// component the post-win panel shows on its dark stage.
// Classes: .overlay[data-overlay=ladder] > .overlay__panel--sheet.ladder-sheet[data-view=list|info|records][data-info-only?][data-fit?]
//          > .overlay__head(button.overlay__back? button.ladder-sheet__info? h2.overlay__title button.overlay__close)
//          .ladder-sheet__body(.rank-list--bracket | .ladder-sheet__join | ul.ladder-info > li | .rank-records + .rank-list__note)
//          .ladder-sheet__ok (info-only)
import { cfg } from '../../app/config';
import { formatNumber, t, tn } from '../../i18n';
import { mountLadderArt } from '../art/ladder-art';
import { icon, type SymbolId } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { periodBestLabel, periodTabLabel } from '../period-text';
import { createBracketList } from './bracket-list';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';
import type { BracketListHandle, BracketListView, PersonalRecordsView, RecordsReason } from './ranking-panel';
import '../../styles/ladder-chunk.css';

/** The rules the info view explains (from the server's RulesView; never our own constants). */
export interface LadderRulesView {
  readonly periodMode: 'rolling' | 'utc_day';
  readonly maxMembers: number;
  readonly minMembers: number;
  readonly doubleByVideo: boolean;
  readonly heartsEnabled: boolean;
  /** rules.places.length (critic pass C-5). */
  readonly paidPlaces: number;
  /** G3 addition (spec §2.4: the window line from rules.durationMs); absent = 24 h. */
  readonly durationMs?: number;
  /** 2026-10-12, D-2e-24 (H-9): the server's RulesView.computerPlayers; true adds the disclosure line. */
  readonly computerPlayers?: boolean;
}

export interface LadderSheetProps {
  readonly view: 'list' | 'info' | 'records';
  /** My bracket; null in the list view = no bracket now (the join line). */
  readonly list: BracketListView | null;
  readonly records: PersonalRecordsView | null;
  /** null: the info view shows only the lines that need no server rule (fish, names, privacy). */
  readonly rules: LadderRulesView | null;
  /** ladder.noticeFirst: the info view as a one-time dialog with OK only. */
  readonly infoOnly: boolean;
  readonly reducedMotion: boolean;
  onHeart(slot: number): void;
  onClose(): void;
  // ── G3 additions (optional; spec §2.5, §2.9) ──
  /** The records view's note (rank.localOnly, ladder.unavailable, ladder.optedOut, ladder.paused). Default 'local'. */
  readonly recordsReason?: RecordsReason;
  /** The streak's best run (records view, "Best streak · 9 days"); absent or 0 hides the row. */
  readonly streakBest?: number;
}

/** The info view's lines, in order, each with its icon (spec §2.5). Pure (tests). */
export function infoLines(rules: LadderRulesView | null): { icon: SymbolId; text: string }[] {
  const out: { icon: SymbolId; text: string }[] = [{ icon: 'icon-fish', text: t('ladder.info.fish') }];
  if (rules) {
    const count = formatNumber(rules.maxMembers);
    const hours = formatNumber(Math.max(1, Math.round((rules.durationMs ?? 86_400_000) / 3_600_000)));
    // Leaderboard update: with the sign-in join (ladder.autoJoin) a new ranking starts when the game is next opened.
    const rolling = cfg.ladder.autoJoin ? t('ladder.info.window.rollingJoin', { count, hours }) : t('ladder.info.window.rolling', { count, hours });
    out.push({ icon: 'icon-users', text: rules.periodMode === 'utc_day' ? t('ladder.info.window.utcDay', { count }) : rolling });
    // 2026-10-12, D-2e-24 (H-9): "Rankings include computer players." right after the window line, only while the
    // server discloses them (never which rows or how many).
    if (rules.computerPlayers) out.push({ icon: 'icon-users', text: t('ladder.info.computerPlayers') });
    if (rules.paidPlaces > 0) {
      out.push({ icon: 'icon-trophy', text: tn('ladder.info.rewards', rules.paidPlaces, { count: formatNumber(rules.paidPlaces), min: formatNumber(rules.minMembers) }) });
      if (rules.doubleByVideo) out.push({ icon: 'icon-play-video', text: t('ladder.info.double') });
    }
    if (rules.heartsEnabled) out.push({ icon: 'icon-heart-line', text: t('ladder.info.hearts') });
  }
  out.push({ icon: 'nick-tag', text: t('ladder.info.names') });
  // Leaderboard update: what the others see of my activity ("Online now", "4m ago").
  if (cfg.ladder.presence.enabled) out.push({ icon: 'icon-stopwatch', text: t('ladder.info.activity') });
  out.push({ icon: 'icon-gear', text: t('ladder.info.privacy') });
  return out;
}

/** The records rows (the period records card of the panel, plus the streak's best run). */
export function sheetRecordRows(r: PersonalRecordsView, streakBest: number): [string, string][] {
  const fish = (n: number): string => tn('fish.count', n, { count: formatNumber(n) });
  const rows: [string, string][] = [];
  if (r.period) {
    rows.push([periodTabLabel(r.period.kind), fish(r.period.total)]);
    if (r.period.best > 0) rows.push([periodBestLabel(r.period.kind), fish(r.period.best)]);
  }
  rows.push([t('rank.records.total'), formatNumber(r.totalPoints)]);
  rows.push([t('rank.records.solved'), formatNumber(r.levelsSolved)]);
  if (streakBest > 0) rows.push([t('streak.best'), tn('streak.days', streakBest, { count: formatNumber(streakBest) })]);
  return rows;
}

function recordsNote(reason: RecordsReason): string {
  switch (reason) {
    case 'local':
      return t('rank.localOnly');
    case 'opted_out':
      return t('ladder.optedOut');
    case 'paused':
      return t('ladder.paused');
    case 'unavailable':
      return t('ladder.unavailable');
  }
}

type SheetView = 'list' | 'info' | 'records';

export function createLadderSheet(): OverlayView<LadderSheetProps> {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  let props: LadderSheetProps | null = null;
  let view: SheetView = 'list';
  /** The view the sheet opened with (Back in the info view returns there when it was the list). */
  let base: SheetView = 'list';
  /** Review F9 (as in the post-win panel): a scrim tap whose press closed a chest's tooltip only closes it, as Esc. */
  let tipDismissed = false;
  const shell = createOverlayShell({ id: 'ladder', scrim: 'soft', panel: 'sheet', onScrimTap: () => void (tipDismissed || dismiss()) });
  shell.panel.classList.add('ladder-sheet');
  const L = createLocaleText();

  const title = h('h2', { class: 'overlay__title', id: shell.titleId });
  const back = L.attr(
    makeButton({ variant: 'icon', icon: 'icon-chevron', ariaLabel: '', className: 'overlay__back', onPress: () => showView('list') }),
    'aria-label',
    () => t('common.back'),
  );
  const info = L.attr(
    makeButton({ variant: 'icon', icon: 'icon-info', ariaLabel: '', className: 'ladder-sheet__info', onPress: () => showView('info') }),
    'aria-label',
    () => t('ladder.info'),
  );
  const close = L.attr(closeButton(() => props?.onClose()), 'aria-label', () => t('common.close'));
  // Back and (i) never show together (the info view has Back, the list (i)): the title sits between two discs.
  const head = h('div', { class: 'overlay__head' }, back, info, title, close);

  // list view
  const join = h('p', { class: 'ladder-sheet__join' });
  let listHandle: BracketListHandle | null = null;
  shell.el.addEventListener('pointerdown', (ev) => {
    tipDismissed = listHandle?.tipClosedBy?.(ev) === true;
  });
  const listHost = h('div', { class: 'ladder-sheet__list' });
  // info view
  const infoList = h('ul', { class: 'ladder-info' });
  // records view
  const records = h('dl', { class: 'rank-records ladder-sheet__records' });
  const note = h('p', { class: 'rank-list__note' });
  const recordsBox = h('div', { class: 'ladder-sheet__records-box rank-list rank-list--light', dataset: { kind: 'records' } }, records, note);

  const body = h('div', { class: 'ladder-sheet__body', id: shell.descId }, listHost, join, infoList, recordsBox);
  const ok = L.label(
    makeButton({ variant: 'primary', label: '', block: true, className: 'ladder-sheet__ok', onPress: () => props?.onClose() }),
    () => t('common.ok'),
  );
  shell.panel.append(head, body, h('div', { class: 'overlay__actions ladder-sheet__actions' }, ok));

  const renderInfo = (p: LadderSheetProps): void => {
    infoList.textContent = '';
    for (const line of infoLines(p.rules)) {
      infoList.appendChild(h('li', { class: 'ladder-info__line' }, icon(line.icon, { class: 'ladder-info__icon' }), h('span', null, line.text)));
    }
  };

  const renderRecords = (p: LadderSheetProps): void => {
    records.textContent = '';
    if (p.records) {
      for (const [label, value] of sheetRecordRows(p.records, p.streakBest ?? 0)) {
        records.appendChild(
          h('div', { class: 'rank-records__row' }, h('dt', { class: 'rank-records__label' }, label), h('dd', { class: 'rank-records__value num' }, value)),
        );
      }
    }
    records.hidden = !p.records;
    setText(note, recordsNote(p.recordsReason ?? 'local'));
  };

  const renderList = (p: LadderSheetProps): void => {
    const l = p.list;
    join.hidden = l !== null;
    if (!l) {
      setText(join, t('ladder.joinLine'));
      if (listHandle) {
        listHandle.destroy();
        listHandle = null;
      }
      return;
    }
    if (!listHandle) {
      listHandle = createBracketList(l, { onHeart: (slot) => props?.onHeart(slot) });
      listHost.appendChild(listHandle.el);
    } else listHandle.update(l);
  };

  function showView(v: SheetView, moveFocus = true): void {
    view = v;
    shell.panel.dataset.view = v;
    listHost.hidden = v !== 'list';
    join.hidden = v !== 'list' || (props?.list ?? null) !== null;
    infoList.hidden = v !== 'info';
    recordsBox.hidden = v !== 'records';
    const infoOnly = props?.infoOnly === true;
    back.hidden = !(v === 'info' && base === 'list' && !infoOnly);
    // Review F10: with no bracket now the (i) keeps its slot unseen (inline visibility: no focus, no screen reader;
    // the focus trap honours it), so the title stays centred between two equal discs.
    info.hidden = v !== 'list' || infoOnly;
    info.style.visibility = props?.list ? '' : 'hidden';
    close.hidden = infoOnly;
    ok.parentElement!.hidden = !infoOnly;
    // Leaderboard update: the list view is titled "Leaderboard" (the orange ribbon).
    setText(title, v === 'info' ? t('ladder.info') : v === 'records' ? t('ladder.records.title') : t('common.leaderboard'));
    if (v === 'list' && listHandle && shell.isOpen()) listHandle.centerMe();
    if (!moveFocus) return;
    if (v === 'info') (back.hidden ? (infoOnly ? ok : close) : back).focus();
    else if (v === 'list') (props?.list && !infoOnly ? info : close).focus();
  }

  const render = (p: LadderSheetProps): void => {
    props = p;
    L.apply();
    shell.panel.toggleAttribute('data-info-only', p.infoOnly);
    // Full height only while the list is reachable; the records mode and an info view opened on its own fit
    // their content (a bottom sheet, no empty white below).
    shell.panel.toggleAttribute('data-fit', !p.list || base !== 'list');
    shell.el.toggleAttribute('data-reduced', p.reducedMotion);
    renderList(p);
    renderInfo(p);
    renderRecords(p);
    showView(view, false);
  };

  function dismiss(): boolean {
    if (!props || !shell.isOpen()) return false;
    if (listHandle?.closeTip?.()) return true;
    // Esc in the info view returns to the list it came from; otherwise it closes (the notice too).
    if (view === 'info' && base === 'list' && !props.infoOnly) showView('list');
    else props.onClose();
    return true;
  }

  // Settings → Language with the sheet open relabels it at once (A11Y-I18N-1).
  L.watch(() => {
    if (props) render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      base = p.infoOnly ? 'info' : p.view;
      view = base;
      render(p);
      // The router focuses [data-autofocus]: the primary control of the view.
      for (const b of [ok, close, info]) b.removeAttribute('data-autofocus');
      (p.infoOnly ? ok : close).setAttribute('data-autofocus', '');
      shell.show();
      if (view === 'list' && listHandle) {
        const win = shell.el.ownerDocument.defaultView;
        if (win?.requestAnimationFrame) win.requestAnimationFrame(() => listHandle?.centerMe());
        else listHandle.centerMe();
      }
    },
    update(p) {
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss,
    destroy() {
      L.dispose();
      listHandle?.destroy();
      listHandle = null;
      props = null;
      shell.el.remove();
    },
  };
}
