// Owner: B
// Rankings hub (new overlay `rank_hub`, phase2b §5.5): a sheet from the Home trophy (shown when
// capabilities().leaderboards) with tabs "Paw points", "Today", "Event" (while an event is active)
// and "Groups" (flag groupChallenges). Each list tab shows the same states as the ranking panel
// (RankingListState: the three FB modes, loading, personal records). The Groups tab offers "Start a
// group challenge" (group.start) and the running challenge. Never a fabricated row.
// Tabs follow the WAI-ARIA tabs pattern (role tablist / tab / tabpanel, roving tabindex, arrow keys,
// Home / End); a tab press calls onTab and the app answers with update() (the hub never switches by
// itself). 'overlay' mode reports the list area's rect through onListArea, as the panel does.
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=rank_hub] > .overlay__panel--sheet.rank-hub[data-tab]
//          .overlay__head .rank-hub__tabs > .rank-hub__tab[aria-selected] ; .rank-hub__panel > .rank-list | .rank-groups
import { formatNumber, t, tn, translate, type I18nKey } from '../../i18n';
import { h, setText, type OverlayView } from '../dom';
import { formatDaysHours } from '../screens/home-screen';
import { closeButton, createOverlayShell, makeButton, nextId, setGated } from './overlay-base';
import { rankTitle, renderRankList, type RankingListState } from './ranking-panel';

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

/** The tab's label (§5.5: "Paw points", "Today", "Event", "Groups"); the panel heading names the event. */
export function tabLabel(tab: RankHubTab, eventNameKey: I18nKey | null): string {
  switch (tab) {
    case 'points':
      return t('rank.title.points');
    case 'daily':
      return t('rank.tab.today');
    case 'event':
      void eventNameKey;
      return t('rank.tab.event');
    case 'groups':
      return t('rank.tab.groups');
  }
}

export function createRankHub(): OverlayView<RankHubProps> {
  let props: RankHubProps | null = null;
  const close = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'rank_hub', scrim: 'soft', panel: 'sheet', onScrimTap: () => void close() });
  shell.panel.classList.add('rank-hub');

  const panelId = nextId('rank-hub-panel');
  const tabs = h('div', { class: 'rank-hub__tabs', role: 'tablist', 'aria-labelledby': shell.titleId });
  const heading = h('h3', { class: 'rank-hub__heading', id: shell.descId });
  const list = h('div', { class: 'rank-list rank-list--light' });

  // ── Groups tab ──
  const groupsBody = h('p', { class: 'rank-groups__body' });
  const groupsActive = h('p', { class: 'rank-groups__active' });
  const start = makeButton({ variant: 'secondary', label: t('group.start'), icon: 'icon-users', block: true, className: 'rank-groups__start', onPress: () => props?.onStartGroup() });
  const groups = h('div', { class: 'rank-groups' }, groupsBody, groupsActive, start);

  const tabPanel = h('div', { class: 'rank-hub__panel', role: 'tabpanel', id: panelId, tabindex: '-1' }, heading, list, groups);
  shell.panel.append(
    h('div', { class: 'overlay__head' }, h('h2', { class: 'overlay__title', id: shell.titleId }, t('rank.hub')), closeButton(() => void close())),
    tabs,
    tabPanel,
  );

  const tabButtons = new Map<RankHubTab, HTMLButtonElement>();
  let tabsKey = '';

  const press = (tab: RankHubTab): void => {
    if (props && props.tab !== tab) props.onTab(tab);
  };
  tabs.addEventListener('keydown', (ev) => {
    if (!props) return;
    const order = props.tabs;
    const i = order.indexOf((ev.target as HTMLElement).dataset.tab as RankHubTab);
    if (i < 0) return;
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (i + 1) % order.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (i - 1 + order.length) % order.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = order.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    const tab = order[next] as RankHubTab;
    tabButtons.get(tab)?.focus();
    press(tab);
  });

  const renderTabs = (p: RankHubProps): void => {
    const key = `${p.tabs.join(',')}|${p.eventNameKey ?? ''}`;
    if (key !== tabsKey) {
      tabsKey = key;
      tabs.textContent = '';
      tabButtons.clear();
      for (const tab of p.tabs) {
        const b = h(
          'button',
          { type: 'button', class: 'rank-hub__tab', role: 'tab', id: `${panelId}-${tab}`, 'aria-controls': panelId, dataset: { tab } },
          tabLabel(tab, p.eventNameKey),
        );
        b.addEventListener('click', () => press(tab));
        tabButtons.set(tab, b);
        tabs.appendChild(b);
      }
    }
    for (const [tab, b] of tabButtons) {
      const on = tab === p.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    tabPanel.setAttribute('aria-labelledby', `${panelId}-${p.tab}`);
  };

  let listKind: RankingListState['kind'] | null = null;
  let listTab: RankHubTab | null = null;
  let rectSent = false;
  const reportListArea = (): void => {
    if (!props || props.tab === 'groups' || props.list.kind !== 'overlay') {
      rectSent = false;
      return;
    }
    if (rectSent) return;
    rectSent = true;
    const win = shell.el.ownerDocument.defaultView;
    const send = (): void => {
      if (props && props.tab !== 'groups' && props.list.kind === 'overlay' && shell.isOpen()) props.onListArea(list.getBoundingClientRect());
    };
    if (win?.requestAnimationFrame) win.requestAnimationFrame(() => win.requestAnimationFrame(send));
    else send();
  };

  const renderGroups = (g: RankHubGroupsView | null, now: number): void => {
    if (!g) {
      groups.hidden = true;
      return;
    }
    setText(
      groupsBody,
      g.rewardMode === 'participation'
        ? tn('group.body.participation', g.minWins, { hours: g.hours, kitties: g.kitties })
        : t('group.body.rank', { hours: g.hours, kitties: g.kitties }),
    );
    groupsActive.hidden = !g.active;
    if (g.active) {
      const ends = t('group.endsIn', { time: formatDaysHours(g.active.endsAt - now) });
      // "Ends in 2 d 3 h · 2 / 3 wins" (participation mode counts towards minWins).
      setText(
        groupsActive,
        g.rewardMode === 'participation'
          ? `${ends} · ${t('group.wins', { wins: formatNumber(Math.min(g.active.wins, g.minWins)), needed: formatNumber(g.minWins) })}`
          : ends,
      );
    }
    start.hidden = !g.canStart;
    setGated(start, !g.canStart);
  };

  const render = (p: RankHubProps): void => {
    props = p;
    shell.panel.dataset.tab = p.tab;
    renderTabs(p);
    const isGroups = p.tab === 'groups';
    list.hidden = isGroups;
    groups.hidden = !isGroups;
    if (isGroups) {
      setText(heading, t('group.title'));
      renderGroups(p.groups, p.now());
      listKind = null;
    } else {
      setText(heading, rankTitle(p.tab, p.eventNameKey));
      if (p.list.kind !== listKind || p.list.kind !== 'overlay' || p.tab !== listTab) {
        renderRankList(list, p.list, { onSeeTop: () => props?.onSeeTop() });
        listKind = p.list.kind;
      }
    }
    if (p.tab !== listTab) rectSent = false;
    listTab = p.tab;
    reportListArea();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      listKind = null;
      listTab = null;
      rectSent = false;
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss: close,
    destroy() {
      props = null;
      shell.el.remove();
    },
  };
}
