// Owner: C (Phase 2b; was app). Phase 2c (G1): the win's rewards are level points and this period's
// leaderboard points from the fish (lives) kept; no fish wallet (docs/phase2c/fish-lives-spec.md
// §3.1–§3.9). Phase 2c.1 (G1, §3.2.5, §3.7, §10.4–§10.5): the level points are the attempt's running
// total (GameState.levelPoints, earned per cat); a counted win adds it to the lifetime points.total;
// a scoring cat's announcement ends with the running total; no perfect streak, no "Perfect ×N".
// Pure parts of the session's effects layer (04 §5.2): per-event feedback (sound, vibration, live
// announcement; 02 §16, §18), analytics payloads (02 §20) and win bookkeeping (02 §10.1 + phase2b
// §4.3 event wins + phase2c §3.7: all saved with the win, before any animation).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.12): the mouse's MARKED announces a11y.mouse.
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §1.6, §4.3): the mouse's MARKED carries no sound of its
// own (the session plays `mouse` and `mark` with its visits); UNITS_DONE plays the `unit_done` chime
// (pitch index = units − 1) unless the same action plays the region chime (REGION_DONE), and adds
// "{units} complete." to the action's utterance, leaving out a region whose REGION_DONE is in it.
import type { SfxId } from '../audio/sfx';
import { applyEventWin, type EventDef, type Milestone } from '../game/events';
import { popcount } from '../game/factory';
import { getMode } from '../game/modes';
import { addPeriodPoints, addPoints, keptPoints, periodKeyAt, periodTotal } from '../game/scoring';
import { applyDailyWin, applyLevelWin, applyTutorialDone } from '../game/stats';
import type { DoneUnit, GameEvent, GameState, ModeId, SaveData } from '../game/types';
import { capitalizeFirst, colorName, formatNumber, joinList, t, tn } from '../i18n';
import { unitName } from '../ui/overlays/hint-text';
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

/**
 * Sound, vibration and announcement for one reducer event, given the state AFTER the action.
 * WON's sound and vibration are played by the session after fx.winHappyDelayMs (02 §10.1).
 * `events` (phase 2d.1): every event of the same action (UNITS_DONE looks for its REGION_DONE).
 */
export function feedbackFor(ev: GameEvent, state: GameState, colors: Uint8Array, c: GameConfig = cfg, events: readonly GameEvent[] = [ev]): Feedback {
  const n = state.puzzle.n;
  const placed = state.catsPlaced;
  switch (ev.type) {
    case 'MARKED':
      // Phase 2d §1.12: the mouse's X marks are the action's one line ("The mouse crossed out 3 tiles.").
      // Phase 2d.1 §1.6: no sound here: the session plays `mouse` at each arrival and `mark` (with the
      // mark haptic) as each X lands.
      if (ev.source === 'mouse') {
        const count = ev.cells.length;
        return { announce: tn('a11y.mouse', count, { count: formatNumber(count) }) };
      }
      return { sfx: 'mark', haptic: c.haptics.mark, announce: tn('a11y.marked', ev.cells.length) };
    case 'UNMARKED':
      return { sfx: 'unmark', announce: tn('a11y.unmarked', ev.cells.length) };
    case 'CAT_PLACED':
      if (ev.source === 'kitty') return { sfx: 'kitty', haptic: c.haptics.kitty, announce: t('a11y.kitty', { placed, n }) };
      if (ev.source === 'hint') return { announce: t('a11y.catPlaced', { placed, n }) }; // HINT_APPLIED has the sound
      return { sfx: 'cat', haptic: c.haptics.cat, announce: t('a11y.catPlaced', { placed, n }) };
    case 'CAT_REMOVED':
      return { sfx: 'unmark', announce: t('a11y.catRemoved', { placed, n }) };
    case 'POINTS':
      // phase2c.1 §10.4 (D22): the running total only, appended to the cat's own line by commit (one
      // utterance); never the increment or the run; no sound and no vibration of its own (D23).
      return { announce: tn('a11y.points', ev.total, { count: formatNumber(ev.total) }) };
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
    case 'UNITS_DONE':
      return unitsFeedback(ev.units, events, n, colors);
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

/**
 * Phase 2d.1 §4.3: the `unit_done` chime once per action (its pitch steps up with the number of units:
 * sfxIndex = units − 1), skipped when the same action plays the region chime (a one-tile colour would
 * stack kitty + region + unit_done in one frame); the utterance "Row 1 and column 9 complete." names
 * every unit except a region whose REGION_DONE is in the same action ("Green done." already says it).
 */
function unitsFeedback(units: readonly DoneUnit[], events: readonly GameEvent[], n: number, colors: Uint8Array): Feedback {
  const regionsDone = new Set<number>();
  for (const e of events) if (e.type === 'REGION_DONE') regionsDone.add(e.region);
  const named = units.filter((u) => !(u.kind === 'region' && regionsDone.has(u.index)));
  const ctx = { n, colors, patterns: false };
  const announce = named.length > 0 ? capitalizeFirst(t('a11y.unitDone', { unit: joinList(named.map((u) => unitName(u, ctx))) })) : undefined;
  return {
    ...(regionsDone.size === 0 && units.length > 0 ? { sfx: 'unit_done' as const, sfxIndex: units.length - 1 } : {}),
    ...(announce ? { announce } : {}),
  };
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
  // phase2c.1 §3.7: `perfect`, `streak` and `streakUp` are removed (no streak of wins any more).
  /** This period's leaderboard points; null for the tutorial (never scored). */
  readonly period: WinPeriodSummary | null;
  /**
   * phase2c.1 §3.7: the level's total, GameState.levelPoints at WON (0 in the tutorial and outside
   * levelPoints.modes), counted or not.
   */
  readonly pointsEarned: number;
  /** Lifetime level points after the win: points.total, which a COUNTED win raised by pointsEarned. */
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
  /** The level's total (summary.pointsEarned). */
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
 * event record and milestones) → lifetime level points (phase2c.1: the level's total,
 * state.levelPoints, into points.total) → period points; everything returned is saved in the same
 * critical save as the win. The level's total is reported (pointsEarned) whether the win counts or not.
 */
export function winBookkeeping(save: SaveData, meta: SessionMeta, state: GameState, ctx: WinContext = { now: 0 }): WinBookkeeping {
  const c = ctx.config ?? cfg;
  const size = state.puzzle.n;
  const flow = getMode(meta.mode).winFlow;
  const replay = meta.request.mode === 'tutorial' && meta.request.replay;
  const solveMs = ms(state.elapsedMs);
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
  };
  /** Level points and period points of a counted win (§3.7 order), and the summary. */
  const reward = (next: SaveData, counted: boolean, mode: ModeId, event: EventWinSummary | null, critical: boolean, events: AnalyticsEvent[]): WinBookkeeping => {
    let out = next;
    let period: WinPeriodSummary | null = null;
    const scored = mode !== 'tutorial';
    // phase2c.1 §3.2.5: the attempt's running total (0 in the tutorial and outside levelPoints.modes).
    const pts = scored && inModes(mode, c.levelPoints.modes) ? Math.max(0, Math.floor(state.levelPoints)) : 0;
    if (scored) {
      const before = periodTotal(out, ctx.now, c);
      period = { kind: c.period.kind, key: periodKeyAt(ctx.now, c), gained: 0, before, total: before };
    }
    if (counted && scored) {
      if (pts > 0) out = { ...out, points: { total: addPoints(out.points.total, pts, c) } };
      const before = period?.before ?? 0;
      out = addPeriodPoints(out, keptPoints(mode, kept, c), ctx.now, c);
      const total = periodTotal(out, ctx.now, c);
      // gained is what the total really moved (a capped total at period.max adds less, or nothing).
      period = { kind: c.period.kind, key: periodKeyAt(ctx.now, c), gained: total - before, before, total };
      if (inModes(mode, c.levelPoints.modes) || inModes(mode, c.period.modes)) {
        // phase2c.1 §10.5: points = the level's total, run = the cat run at WON (no streak of wins).
        events.push({ name: 'win_points', params: { mode, fish: kept, total, points: pts, run: Math.max(0, state.catStreak) } });
      }
    }
    const summary: WinSummary = {
      ...base,
      counted,
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
