// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §4.7): the first (default) tab is
// this period's board ("This week", period_points, read in the current UTC period's band); "Paw
// points" is gone; "Today" only with rank.dailyBoard.
// The Rankings hub (phase2b §5.5: the Home trophy, shown when capabilities().leaderboards) with its
// tabs "This week", "Today", "Event" (while one runs) and "Groups" (flag groupChallenges), and the
// event screen's "Top list" (§4.4: the ranking panel for the event board; on the web, personal
// results). Each list shows exactly what ranking-flow got from the provider, else personal records.
// C-internal module; RankHubProps and RankingPanelProps (B) are fixed.
import type { EventDef } from '../game/events';
import { eventBoardKey, eventRecord } from '../game/events';
import { localDateKey } from '../game/progression';
import { dailySlotFor } from '../game/ramp';
import { periodKeyAt, periodTotal } from '../game/scoring';
import type { BoardKey } from '../game/types';
import type { RankHubProps, RankHubTab } from '../ui/overlays/rank-hub';
import type { RankingBoardKind, RankingListState, RankScoreView } from '../ui/overlays/ranking-panel';
import { periodRankTitle } from '../ui/period-text';
import { t, translate } from '../i18n';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';
import type { GroupFlow } from './group-flow';
import type { RankBand, RankingFlow } from './ranking-flow';
import type { Router } from './router';
import type { AppState, Store } from './store';
import { personalRecords, type ViewContext } from './views';

export interface RankHubFlowDeps {
  readonly store: Store<AppState>;
  readonly router: Pick<Router, 'open' | 'update' | 'close' | 'isOpen' | 'toast'>;
  readonly clock: Clock;
  readonly rankings: RankingFlow;
  readonly groups?: GroupFlow;
  /** The running event now, if any (event-flow). */
  activeEvent(): EventDef | null;
  viewCtx(): ViewContext;
  readonly config?: GameConfig;
}

export interface RankHubFlow {
  /** Opens the hub on a tab (default: this period's board). */
  open(tab?: RankHubTab): void;
  /** The event screen's "Top list": the ranking panel for the event board (no tap gate). */
  openEventTopList(def: EventDef): void;
}

export function createRankHubFlow(deps: RankHubFlowDeps): RankHubFlow {
  const c = deps.config ?? cfg;
  const { store, router, clock, rankings } = deps;
  let gen = 0;

  type ListTab = Exclude<RankHubTab, 'groups'>;
  const boardOf = (tab: ListTab, ev: EventDef | null): BoardKey =>
    tab === 'daily' ? c.rank.boards.daily : tab === 'event' && ev ? eventBoardKey(ev.id, c) : c.rank.boards.period;
  const kindOf = (tab: ListTab): RankingBoardKind => (tab === 'daily' ? 'daily' : tab === 'event' ? 'event' : 'period');
  /** The band a tab reads (phase2c §4.5): today for the daily tab, the current UTC period for the period tab. */
  const bandOf = (tab: ListTab): RankBand | undefined =>
    tab === 'daily' ? { day: localDateKey(clock.now()) } : tab === 'event' ? undefined : { periodKey: periodKeyAt(clock.now(), c) };

  /** My records for a hub tab: this period, today's daily or the event (only facts from the save). */
  function listContext(tab: ListTab, ev: EventDef | null) {
    const state = store.get();
    const ctx = deps.viewCtx();
    const save = state.save;
    let n = 0;
    let thisMs = 0;
    let myScore: RankScoreView | null = null;
    let day: string | null = null;
    let periodKey: string | null = null;
    if (tab === 'daily') {
      const today = localDateKey(clock.now());
      day = today;
      n = dailySlotFor(today).n;
      const rec = save.daily[today];
      thisMs = rec ? rec[0] : 0;
      myScore = rec ? { kind: 'time', ms: rec[0] } : null;
    } else if (tab === 'event' && ev) {
      const rec = eventRecord(save, ev.id);
      // No puzzle was just played here: thisMs stays 0, so the card shows no "This puzzle" row (the
      // event total is in its own "N of 21, total m:ss" line; review RANK-1).
      myScore = rec.solved > 0 ? { kind: 'event', solved: rec.solved, total: ev.puzzles.count, ms: rec.ms } : null;
    } else {
      const last = save.progress.level - 1;
      const best = save.progress.best[last];
      thisMs = best ? best[0] : 0;
      n = (last >= 1 ? ctx.levelSize?.(last) : null) ?? 0;
      // phase2c §4.5: "Your score: 42 fish" is this period's total as the save knows it (0 after a rollover).
      periodKey = periodKeyAt(clock.now(), c);
      myScore = { kind: 'fish', fish: periodTotal(save, clock.now(), c) };
    }
    const records = personalRecords(state, ctx, { board: kindOf(tab), n, thisMs, event: tab === 'event' ? ev : null }, c);
    return {
      records,
      myScore,
      ...(ev && tab === 'event' ? { eventTotal: ev.puzzles.count } : {}),
      ...(day ? { day } : {}),
      ...(periodKey ? { periodKey } : {}),
    };
  }

  const titleOf = (tab: ListTab, ev: EventDef | null): string =>
    tab === 'daily' ? t('rank.title.daily') : tab === 'event' && ev ? t('rank.title.event', { event: translate(ev.nameKey) }) : periodRankTitle(c.period.kind);

  function open(first: RankHubTab = 'period'): void {
    const ev = deps.activeEvent();
    const groupsOn = deps.groups?.enabled() === true;
    // phase2c §4.7: this period first; "Today" only with rank.dailyBoard; no "Paw points".
    const tabs: RankHubTab[] = ['period'];
    if (c.rank.dailyBoard) tabs.push('daily');
    if (ev) tabs.push('event');
    if (groupsOn) tabs.push('groups');
    let tab: RankHubTab = tabs.includes(first) ? first : 'period';
    let list: RankingListState = { kind: 'loading' };
    let groups: RankHubProps['groups'] = groupsOn
      ? { canStart: true, active: null, rewardMode: c.groups.rewardMode, minWins: c.groups.minWinsForReward, hours: c.groups.durationH, kitties: c.groups.rewardKitties }
      : null;
    const mine = ++gen;

    const props = (): RankHubProps => ({
      tabs,
      tab,
      periodKind: c.period.kind,
      eventNameKey: ev ? ev.nameKey : null,
      list,
      groups,
      now: () => clock.now(),
      onTab: (next) => {
        if (next === tab || !tabs.includes(next)) return;
        tab = next;
        load();
      },
      onSeeTop: () => {
        if (tab !== 'groups') void rankings.showList(boardOf(tab, ev), titleOf(tab, ev), undefined, ev?.puzzles.count, bandOf(tab));
      },
      onListArea: (rect) => {
        if (tab === 'groups') return;
        const board = boardOf(tab, ev);
        void rankings.showList(board, titleOf(tab, ev), rect, ev?.puzzles.count, bandOf(tab)).then((ok) => {
          if (ok || mine !== gen || tab === 'groups' || !router.isOpen('rank_hub')) return;
          list = { kind: 'records', records: listContext(tab, ev).records, reason: 'unavailable' };
          refresh();
        });
      },
      onStartGroup: () => {
        void deps.groups?.start(t('group.title')).then((ok) => {
          if (ok) loadGroups();
        });
      },
      onClose: () => {
        gen++;
        rankings.closeList();
        router.close('rank_hub');
      },
    });
    const refresh = (): void => {
      if (mine === gen && router.isOpen('rank_hub')) router.update('rank_hub', props());
    };
    function loadGroups(): void {
      const g = deps.groups;
      if (!g || !groups) return;
      void g.active().then((active) => {
        if (mine !== gen || !groups) return;
        groups = { ...groups, canStart: active === null, active: active ? { endsAt: active.endsAt, wins: active.wins } : null };
        refresh();
      });
    }
    function load(): void {
      rankings.closeList();
      if (tab === 'groups') {
        refresh();
        loadGroups();
        return;
      }
      const current = tab;
      list = { kind: 'loading' };
      refresh();
      void rankings.fetch(boardOf(current, ev), bandOf(current)).then((result) => {
        if (mine !== gen || tab !== current) return;
        list = rankings.listState(result, listContext(current, ev));
        refresh();
      });
    }
    router.open('rank_hub', props());
    load();
    if (groupsOn && tab !== 'groups') loadGroups();
  }

  function openEventTopList(def: EventDef): void {
    const mine = ++gen;
    const rec = eventRecord(store.get().save, def.id);
    const board = eventBoardKey(def.id, c);
    let list: RankingListState = { kind: 'loading' };
    const props = () => ({
      board: 'event' as const,
      eventNameKey: def.nameKey,
      result: { kind: 'event' as const, solved: rec.solved, total: def.puzzles.count },
      list,
      tapMinMs: 0,
      reducedMotion: store.get().ui.reducedMotion,
      onContinue: () => {
        gen++;
        rankings.closeList();
        router.close('ranking');
      },
      onSeeTop: () => void rankings.showList(board, titleOf('event', def), undefined, def.puzzles.count),
      onListArea: (rect: DOMRect) => {
        void rankings.showList(board, titleOf('event', def), rect, def.puzzles.count).then((ok) => {
          if (ok || mine !== gen || !router.isOpen('ranking')) return;
          list = { kind: 'records', records: listContext('event', def).records, reason: 'unavailable' };
          router.update('ranking', props());
        });
      },
    });
    router.open('ranking', props());
    void rankings.fetch(board).then((result) => {
      if (mine !== gen || !router.isOpen('ranking')) return;
      list = rankings.listState(result, listContext('event', def));
      router.update('ranking', props());
    });
  }

  return { open, openEventTopList };
}
