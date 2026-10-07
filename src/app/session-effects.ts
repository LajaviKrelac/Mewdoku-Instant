// Owner: app
// Pure parts of the session's effects layer (04 §5.2): per-event feedback (sound, vibration, live
// announcement; 02 §16, §18), analytics payloads (02 §20) and win bookkeeping (02 §10.1).
import type { SfxId } from '../audio/sfx';
import { getMode } from '../game/modes';
import { applyDailyWin, applyLevelWin, applyTutorialDone } from '../game/stats';
import type { GameEvent, GameState, SaveDataV1 } from '../game/types';
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

/** `level` analytics param: the level number, 0 for a daily (02 §20). */
export function levelParam(meta: SessionMeta): number {
  return meta.mode === 'daily' ? 0 : (meta.level ?? 0);
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

export interface WinBookkeeping {
  readonly save: SaveDataV1;
  /** One `critical` save (02 §15); false for a tutorial replay, which saves nothing. */
  readonly critical: boolean;
  readonly events: readonly AnalyticsEvent[];
}

/** 02 §10.1 win bookkeeping per mode: level, daily, first-run tutorial, tutorial replay (none). */
export function winBookkeeping(save: SaveDataV1, meta: SessionMeta, state: GameState): WinBookkeeping {
  const size = state.puzzle.n;
  const flow = getMode(meta.mode).winFlow;
  if (flow === 'level') {
    const level = meta.level ?? save.progress.level;
    return {
      save: applyLevelWin(save, level, state),
      critical: true,
      events: [
        {
          name: 'level_win',
          params: {
            level,
            size,
            ms: ms(state.elapsedMs),
            mistakes: state.mistakes,
            hints: state.hintsUsed,
            kitties: state.kittiesUsed,
            revives: state.revivesUsed,
          },
        },
      ],
    };
  }
  if (flow === 'daily') {
    const date = meta.dateKey ?? '';
    return {
      save: applyDailyWin(save, date, state),
      critical: true,
      events: [{ name: 'daily_win', params: { date, size, ms: ms(state.elapsedMs), mistakes: state.mistakes } }],
    };
  }
  if (meta.request.mode === 'tutorial' && meta.request.replay) return { save, critical: false, events: [] };
  return {
    save: applyTutorialDone(save),
    critical: true,
    events: [{ name: 'tutorial_done', params: { ms: ms(state.elapsedMs), skipped: 0 } }],
  };
}
