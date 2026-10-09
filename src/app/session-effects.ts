// Owner: C (Phase 2b; was app)
// Pure parts of the session's effects layer (04 §5.2): per-event feedback (sound, vibration, live
// announcement; 02 §16, §18), analytics payloads (02 §20) and win bookkeeping (02 §10.1 + phase2b
// §2.8 fish, §4.3 event wins, §5.3 points: all saved with the win, before any animation).
import type { SfxId } from '../audio/sfx';
import { addFish, fishForWin } from '../game/economy';
import { applyEventWin, type EventDef, type Milestone } from '../game/events';
import { getMode } from '../game/modes';
import { addPoints, pointsFor } from '../game/scoring';
import { applyDailyWin, applyLevelWin, applyTutorialDone } from '../game/stats';
import type { GameEvent, GameState, ModeId, SaveData } from '../game/types';
import { colorName, t, tn } from '../i18n';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent } from './events';
import type { SessionMeta } from './store';

export interface Feedback {
  readonly sfx?: SfxId;
  /** Region chime step (0-based count of done regions before this one). */
  readonly sfxIndex?: number;
  readonly haptic?: number | readonly number[];
  readonly announce?: string;
}

function popcount(x: number): number {
  let v = x >>> 0;
  let n = 0;
  while (v) {
    v &= v - 1;
    n++;
  }
  return n;
}

/**
 * Sound, vibration and announcement for one reducer event, given the state AFTER the action.
 * WON's sound and vibration are played by the session after fx.winHappyDelayMs (02 §10.1).
 */
export function feedbackFor(ev: GameEvent, state: GameState, colors: Uint8Array, c: GameConfig = cfg): Feedback {
  const n = state.puzzle.n;
  const placed = state.catsPlaced;
  switch (ev.type) {
    case 'MARKED':
      return { sfx: 'mark', haptic: c.haptics.mark, announce: tn('a11y.marked', ev.cells.length) };
    case 'UNMARKED':
      return { sfx: 'unmark', announce: tn('a11y.unmarked', ev.cells.length) };
    case 'CAT_PLACED':
      if (ev.source === 'kitty') return { sfx: 'kitty', haptic: c.haptics.kitty, announce: t('a11y.kitty', { placed, n }) };
      if (ev.source === 'hint') return { announce: t('a11y.catPlaced', { placed, n }) }; // HINT_APPLIED has the sound
      return { sfx: 'cat', haptic: c.haptics.cat, announce: t('a11y.catPlaced', { placed, n }) };
    case 'CAT_REMOVED':
      return { sfx: 'unmark', announce: t('a11y.catRemoved', { placed, n }) };
    case 'MISTAKE':
      return ev.heartsLeft <= 0
        ? { sfx: 'heart_last', haptic: c.haptics.heartLast, announce: tn('a11y.mistake', 0) }
        : { sfx: 'mistake', haptic: c.haptics.mistake, announce: tn('a11y.mistake', ev.heartsLeft) };
    case 'REGION_DONE':
      return {
        sfx: 'region',
        sfxIndex: Math.max(0, popcount(state.regionsDone) - 1),
        announce: t('a11y.regionDone', { color: colorName(colors[ev.region] ?? ev.region) }),
      };
    case 'HINT_APPLIED':
      return { sfx: 'hint_apply', announce: t('a11y.hintApplied') };
    case 'REVIVED':
      return { announce: t('a11y.revived') };
    case 'WON':
      return { announce: t('a11y.won') };
    case 'LOST':
      return { announce: t('a11y.lost') };
    case 'PULSE':
    default:
      return {};
  }
}

/** `level` analytics param: the level number, 0 for a daily or an event puzzle (02 §20). */
export function levelParam(meta: SessionMeta): number {
  return meta.mode === 'daily' || meta.mode === 'event' ? 0 : (meta.level ?? 0);
}

const ms = (x: number): number => Math.max(0, Math.round(x));

/** Events logged when a board is mounted (also after Retry). */
export function startEvents(meta: SessionMeta, state: GameState): AnalyticsEvent[] {
  const size = state.puzzle.n;
  const out: AnalyticsEvent[] = [
    {
      name: 'level_start',
      params: { level: levelParam(meta), size, grade: state.puzzle.grade, hard: meta.hard ? 1 : 0, mode: meta.mode },
    },
  ];
  if (meta.mode === 'daily' && meta.dateKey) {
    out.push({ name: 'daily_start', params: { date: meta.dateKey, size, ms: ms(state.elapsedMs), mistakes: state.mistakes } });
  }
  if (meta.mode === 'event' && meta.event) {
    out.push({ name: 'event_start', params: { id: meta.event.def.id, index: meta.event.index, size } });
  }
  if (meta.mode === 'tutorial' && meta.tutorialStep !== null) {
    out.push({ name: 'tutorial_step', params: { step: meta.tutorialStep } });
  }
  return out;
}

export function failEvent(meta: SessionMeta, state: GameState): AnalyticsEvent {
  return {
    name: 'level_fail',
    params: { level: levelParam(meta), size: state.puzzle.n, ms: ms(state.elapsedMs), cats: state.catsPlaced },
  };
}

export function mistakeEvent(meta: SessionMeta, state: GameState): AnalyticsEvent {
  return { name: 'mistake', params: { level: levelParam(meta), size: state.puzzle.n, cats: state.catsPlaced } };
}

/** The event part of a win (phase2b §4.3, §4.5). */
export interface EventWinSummary {
  readonly def: EventDef;
  /** Puzzle just solved, 0-based. */
  readonly index: number;
  readonly solvedBefore: number;
  readonly solvedAfter: number;
  /** Milestones this win reached (their rewards are already in the save). */
  readonly milestones: readonly Milestone[];
  /** The event's record after the win (solved count and total ms). */
  readonly totalMs: number;
}

/**
 * What one win earned and how it ends (phase2b §2.2, §2.6, §2.10): the input of the win flow, the
 * ranking panel, the victory screen and the ranking submission. Everything here is already saved.
 */
export interface WinSummary {
  readonly mode: ModeId;
  /** The first-run tutorial, its replay, or a board restored already full (02 §15 step 4). */
  readonly replay: boolean;
  readonly restored: boolean;
  /** Whether this win counted (level not counted before, daily first win for the date, event index once). */
  readonly counted: boolean;
  readonly level: number | null;
  readonly dateKey: string | null;
  readonly hard: boolean;
  readonly n: number;
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Fish of this win; null when none were awarded (replay, a win that did not count). */
  readonly fish: { readonly base: number; readonly bonus: number; readonly bonusKind: 'hard' | 'daily' | null; readonly before: number; readonly total: number } | null;
  readonly pointsEarned: number;
  readonly pointsTotal: number;
  readonly event: EventWinSummary | null;
}

export interface WinBookkeeping {
  readonly save: SaveData;
  /** One `critical` save (02 §15); false for a tutorial replay, which saves nothing. */
  readonly critical: boolean;
  readonly events: readonly AnalyticsEvent[];
  /** phase2b §2.10: the rewards, for the win flow (`{ save, fishEarned, pointsEarned, bonus }` and the rest). */
  readonly summary: WinSummary;
  /** Fish added to the wallet by this win, milestones included (0 when none). */
  readonly fishEarned: number;
  readonly pointsEarned: number;
  readonly bonus: number;
}

export interface WinContext {
  readonly now: number;
  /** The event of an event session (SessionMeta.event). */
  readonly event?: { readonly def: EventDef; readonly index: number } | null;
  readonly restored?: boolean;
  readonly config?: GameConfig;
}

/**
 * 02 §10.1 + phase2b §2.8, §4.3, §5.3 win bookkeeping per mode: level, daily, event, first-run
 * tutorial, tutorial replay (none). Fish and points are added only when the win COUNTS: a level not
 * counted before (applyLevelWin's guard), a daily's first win for its date, an event puzzle once per
 * index, the first-run tutorial once. Everything returned is saved in the same critical save as the win.
 */
export function winBookkeeping(save: SaveData, meta: SessionMeta, state: GameState, ctx: WinContext = { now: 0 }): WinBookkeeping {
  const c = ctx.config ?? cfg;
  const size = state.puzzle.n;
  const flow = getMode(meta.mode).winFlow;
  const replay = meta.request.mode === 'tutorial' && meta.request.replay;
  const solveMs = ms(state.elapsedMs);
  const base = {
    mode: meta.mode,
    replay,
    restored: ctx.restored === true,
    level: meta.level,
    dateKey: meta.dateKey,
    hard: meta.hard,
    n: size,
    ms: solveMs,
    mistakes: state.mistakes,
    hints: state.hintsUsed,
    kitties: state.kittiesUsed,
  };
  const points = (mode: ModeId): number =>
    pointsFor(
      {
        mode,
        n: size,
        hard: meta.hard,
        mistakes: state.mistakes,
        revivesUsed: state.revivesUsed,
        hintsUsed: state.hintsUsed,
        kittiesUsed: state.kittiesUsed,
        tutorial: mode === 'tutorial',
      },
      c,
    );
  /** Fish + points of a counted win (and the summary parts). */
  const reward = (next: SaveData, counted: boolean, mode: ModeId, event: EventWinSummary | null, critical: boolean, events: AnalyticsEvent[]): WinBookkeeping => {
    let out = next;
    let fish: WinSummary['fish'] = null;
    let pts = 0;
    if (counted) {
      const award = fishForWin(mode, { hard: meta.hard, replay }, c);
      const before = save.wallet.fish;
      if (award.base + award.bonus > 0) {
        out = addFish(out, award.base + award.bonus, c);
        fish = { base: award.base, bonus: award.bonus, bonusKind: award.bonusKind, before, total: out.wallet.fish };
      }
      pts = points(mode);
      if (pts > 0) out = { ...out, points: { total: addPoints(out.points.total, pts, c) } };
    }
    const summary: WinSummary = { ...base, counted, fish, pointsEarned: pts, pointsTotal: out.points.total, event };
    return {
      save: out,
      critical,
      events,
      summary,
      fishEarned: out.wallet.fish - save.wallet.fish,
      pointsEarned: pts,
      bonus: fish?.bonus ?? 0,
    };
  };

  if (flow === 'level') {
    const level = meta.level ?? save.progress.level;
    const counted = level >= save.progress.level;
    return reward(applyLevelWin(save, level, state), counted, 'level', null, true, [
      {
        name: 'level_win',
        params: {
          level,
          size,
          ms: solveMs,
          mistakes: state.mistakes,
          hints: state.hintsUsed,
          kitties: state.kittiesUsed,
          revives: state.revivesUsed,
        },
      },
    ]);
  }
  if (flow === 'daily') {
    const date = meta.dateKey ?? '';
    const counted = save.daily[date] === undefined;
    return reward(applyDailyWin(save, date, state), counted, 'daily', null, true, [
      { name: 'daily_win', params: { date, size, ms: solveMs, mistakes: state.mistakes } },
    ]);
  }
  if (flow === 'event') {
    const ev = ctx.event;
    if (!ev) {
      // An event session always carries its def; without it nothing can be counted (never thrown at a win).
      return reward(save, false, 'event', null, false, []);
    }
    const r = applyEventWin(save, ev.def, ev.index, state, ctx.now, c);
    const events: AnalyticsEvent[] = [
      { name: 'event_win', params: { id: ev.def.id, index: ev.index, size, ms: solveMs, mistakes: state.mistakes } },
      ...r.milestones.map((m): AnalyticsEvent => ({ name: 'event_milestone', params: { id: ev.def.id, at: m.at } })),
    ];
    const rec = r.save.events[ev.def.id];
    const summary: EventWinSummary = {
      def: ev.def,
      index: ev.index,
      solvedBefore: r.solvedBefore,
      solvedAfter: r.solvedAfter,
      milestones: r.milestones,
      totalMs: rec?.ms ?? 0,
    };
    return reward(r.save, r.counted, 'event', summary, true, events);
  }
  if (replay) return reward(save, false, 'tutorial', null, false, []);
  const counted = !save.tutorialDone;
  return reward(applyTutorialDone(save), counted, 'tutorial', null, true, [{ name: 'tutorial_done', params: { ms: solveMs, skipped: 0 } }]);
}
