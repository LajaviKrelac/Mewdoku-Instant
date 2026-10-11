// Owner: lead (Phase 2e I-3; was the event part of rank-hub-flow.ts, C, Phase 2b/2c). The event screen's "Top list"
// (phase2b §4.4): the ranking panel for the event board (no tap gate), filled with exactly what ranking-flow got
// from the provider, else my own event records. Phase 2e (spec §2.10, §8.4, D-2e-4) deleted the Rankings hub and
// the Home trophy (the ranking chip and the `ladder` sheet replace them); the FB list states and band reads stay
// for the event boards while VITE_FB_LEADERBOARDS lists them (release builds keep it empty until gate G1).
// Lives in the lazy `social-flows` chunk (boot.ts creates it on the first tap).
import type { EventDef } from '../game/events';
import { eventBoardKey, eventRecord } from '../game/events';
import type { RankingListState, RankScoreView } from '../ui/overlays/ranking-panel';
import { t, translate } from '../i18n';
import { cfg, type GameConfig } from './config';
import type { RankingFlow } from './ranking-flow';
import type { Router } from './router';
import type { AppState, Store } from './store';
import { personalRecords, type ViewContext } from './views';

export interface EventTopFlowDeps {
  readonly store: Store<AppState>;
  readonly router: Pick<Router, 'open' | 'update' | 'close' | 'isOpen'>;
  readonly rankings: RankingFlow;
  viewCtx(): ViewContext;
  readonly config?: GameConfig;
}

export interface EventTopFlow {
  /** The event screen's "Top list": the ranking panel for the event board (no tap gate). */
  open(def: EventDef): void;
}

export function createEventTopFlow(deps: EventTopFlowDeps): EventTopFlow {
  const c = deps.config ?? cfg;
  const { store, router, rankings } = deps;
  let gen = 0;

  /** My records for the event (only facts from the save). */
  function records(ev: EventDef) {
    const state = store.get();
    const rec = eventRecord(state.save, ev.id);
    // No puzzle was just played here: thisMs stays 0, so the card shows no "This puzzle" row (the event total is
    // in its own "N of 21, total m:ss" line; review RANK-1).
    const myScore: RankScoreView | null = rec.solved > 0 ? { kind: 'event', solved: rec.solved, total: ev.puzzles.count, ms: rec.ms } : null;
    return {
      records: personalRecords(state, deps.viewCtx(), { board: 'event', n: 0, thisMs: 0, event: ev }, c),
      myScore,
      eventTotal: ev.puzzles.count,
    };
  }

  function open(def: EventDef): void {
    const mine = ++gen;
    const rec = eventRecord(store.get().save, def.id);
    const board = eventBoardKey(def.id, c);
    const title = t('rank.title.event', { event: translate(def.nameKey) });
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
      onSeeTop: () => void rankings.showList(board, title, undefined, def.puzzles.count),
      // An event board is never a bracket list: no hearts, no info view.
      onHeart: () => undefined,
      onInfo: () => undefined,
      onListArea: (rect: DOMRect) => {
        void rankings.showList(board, title, rect, def.puzzles.count).then((ok) => {
          if (ok || mine !== gen || !router.isOpen('ranking')) return;
          list = { kind: 'records', records: records(def).records, reason: 'unavailable' };
          router.update('ranking', props());
        });
      },
    });
    router.open('ranking', props());
    void rankings.fetch(board).then((result) => {
      if (mine !== gen || !router.isOpen('ranking')) return;
      list = rankings.listState(result, records(def));
      router.update('ranking', props());
    });
  }

  return { open };
}
