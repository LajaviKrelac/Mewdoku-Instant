// Owner: C (Phase 2b; was app). Phase 2c (G1): the win's rewards are level points with the perfect
// streak and this period's leaderboard points from the fish (lives) kept; no fish wallet
// (docs/phase2c/fish-lives-spec.md §3.1–§3.9).
// Pure parts of the session's effects layer (04 §5.2): per-event feedback (sound, vibration, live
// announcement; 02 §16, §18), analytics payloads (02 §20) and win bookkeeping (02 §10.1 + phase2b
// §4.3 event wins + phase2c §3.7: all saved with the win, before any animation).
import type { SfxId } from '../audio/sfx';
import { applyEventWin, type EventDef, type Milestone } from '../game/events';
import { getMode } from '../game/modes';
import { addPeriodPoints, addPoints, keptPoints, levelPointsFor, periodKeyAt, periodTotal, streakAfterWin } from '../game/scoring';
import { applyDailyWin, applyLevelWin, applyTutorialDone } from '../game/stats';
import type { GameEvent, GameState, ModeId, SaveData } from '../game/types';
import { colorName, t, tn } from '../i18n';
import { cfg, type GameConfig, type PeriodKind, type ScoredMode } from './config';
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

/** The period part of a win (phase2c §3.4, §3.7): this period's leaderboard points before and after. */
export interface WinPeriodSummary {
  readonly kind: PeriodKind;
  /** The current period's key (its first day, YYYY-MM-DD, UTC). */
  readonly key: string;
  /** Leaderboard points this win added (fish kept × period.pointsPerFish; 0 when it adds none). */
  readonly gained: number;
  /** This period's total before the win (0 after a rollover) and after it. */
  readonly before: number;
  readonly total: number;
}

/**
 * What one win earned and how it ends (phase2b §2.10, phase2c §3.7): the input of the win flow, the
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
  /** Fish (lives) kept: state.hearts at WON (1…maxKept). */
  readonly kept: number;
  /** The attempt's lives (rules.heartsPerAttempt): the victory's kept-fish row shows this many slots. */
  readonly maxKept: number;
  /** 0 mistakes and 0 revives. */
  readonly perfect: boolean;
  /** The perfect streak after this win (unchanged by a win that does not count or the tutorial). */
  readonly streak: { readonly current: number; readonly best: number };
  /** Whether this win moved the streak (counted, perfect, in a mode of levelPoints.modes): "Perfect ×N". */
  readonly streakUp: boolean;
  /** This period's leaderboard points; null for the tutorial (never scored). */
  readonly period: WinPeriodSummary | null;
  /** Level points of this win (§3.1); 0 when it scores none. */
  readonly pointsEarned: number;
  /** Lifetime level points (points.total) after the win. */
  readonly pointsTotal: number;
  readonly event: EventWinSummary | null;
}

export interface WinBookkeeping {
  readonly save: SaveData;
  /** One `critical` save (02 §15); false for a tutorial replay, which saves nothing. */
  readonly critical: boolean;
  readonly events: readonly AnalyticsEvent[];
  /** The rewards, for the win flow, the panel and the victory (phase2c §3.7). */
  readonly summary: WinSummary;
  readonly pointsEarned: number;
}

export interface WinContext {
  readonly now: number;
  /** The event of an event session (SessionMeta.event). */
  readonly event?: { readonly def: EventDef; readonly index: number } | null;
  readonly restored?: boolean;
  readonly config?: GameConfig;
}

const inModes = (mode: ModeId, modes: readonly ScoredMode[]): boolean => (modes as readonly string[]).indexOf(mode) >= 0;

/**
 * 02 §10.1 + phase2b §4.3 + phase2c §3.7 win bookkeeping per mode: level, daily, event, first-run
 * tutorial, tutorial replay (none). The rewards are added only when the win COUNTS: a level not
 * counted before (applyLevelWin's guard), a daily's first win for its date, an event puzzle once per
 * index; the tutorial is never scored. Order inside the call: mode bookkeeping (progress / daily /
 * event record and milestones) → streak → level points → period points; everything returned is saved
 * in the same critical save as the win.
 */
export function winBookkeeping(save: SaveData, meta: SessionMeta, state: GameState, ctx: WinContext = { now: 0 }): WinBookkeeping {
  const c = ctx.config ?? cfg;
  const size = state.puzzle.n;
  const flow = getMode(meta.mode).winFlow;
  const replay = meta.request.mode === 'tutorial' && meta.request.replay;
  const solveMs = ms(state.elapsedMs);
  const perfect = state.mistakes === 0 && state.revivesUsed === 0;
  const kept = Math.max(0, state.hearts);
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
    kept,
    maxKept: state.rules.heartsPerAttempt,
    perfect,
  };
  /** Streak, level points and period points of a counted win (§3.7 order), and the summary. */
  const reward = (next: SaveData, counted: boolean, mode: ModeId, event: EventWinSummary | null, critical: boolean, events: AnalyticsEvent[]): WinBookkeeping => {
    let out = next;
    let pts = 0;
    let streakUp = false;
    let period: WinPeriodSummary | null = null;
    const scored = mode !== 'tutorial';
    if (scored) {
      const before = periodTotal(out, ctx.now, c);
      period = { kind: c.period.kind, key: periodKeyAt(ctx.now, c), gained: 0, before, total: before };
    }
    if (counted && scored) {
      const streaked = streakAfterWin(out, mode, perfect, c);
      streakUp = perfect && streaked.streak.current > out.streak.current;
      out = streaked;
      pts = levelPointsFor({ mode, n: size, hard: meta.hard, streak: perfect ? out.streak.current : 0 }, c);
      if (pts > 0) out = { ...out, points: { total: addPoints(out.points.total, pts, c) } };
      const before = period?.before ?? 0;
      out = addPeriodPoints(out, keptPoints(mode, kept, c), ctx.now, c);
      const total = periodTotal(out, ctx.now, c);
      // gained is what the total really moved (a capped total at period.max adds less, or nothing).
      period = { kind: c.period.kind, key: periodKeyAt(ctx.now, c), gained: total - before, before, total };
      if (inModes(mode, c.levelPoints.modes) || inModes(mode, c.period.modes)) {
        events.push({ name: 'win_points', params: { mode, fish: kept, total, points: pts, streak: out.streak.current } });
      }
    }
    const summary: WinSummary = {
      ...base,
      counted,
      streak: { current: out.streak.current, best: out.streak.best },
      streakUp,
      period,
      pointsEarned: pts,
      pointsTotal: out.points.total,
      event,
    };
    return { save: out, critical, events, summary, pointsEarned: pts };
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
