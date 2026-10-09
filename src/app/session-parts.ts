// Owner: C (Phase 2b; was app)
// Building blocks of the session (04 §5.2): the TICK timer with its stack of pause reasons, one-shot
// board timers, the feedback player (sfx, haptics, announcer; never throws), and the overlay props
// builders for O4 and O8 (the post-win screens are built by views.ts, phase2b §2.4–§2.5).
import type { MuteReason } from '../audio/audio-engine';
import type { HintStep, Puzzle } from '../engine/types';
import { tutorialStep, type TutorialStepIndex } from '../game/tutorial';
import type { GameState, InProgressV2, SaveData } from '../game/types';
import { PRAISE_COUNT, t } from '../i18n';
import { PALETTE_SIZE, regionColorsFor } from '../ui/art/palette';
import type { CoachProps } from '../ui/overlays/coach';
import type { FailOverlayProps } from '../ui/overlays/fail-overlay';
import { hintText, type HintTextContext } from '../ui/overlays/hint-text';
import type { GameScreen } from '../ui/screens/game-screen';
import type { Clock, TimerId } from './clock';
import type { GameConfig } from './config';
import type { PauseReason } from './events';
import type { SessionDeps } from './session-types';
import type { Feedback } from './session-effects';
import type { SessionMeta } from './store';

// ─────────────────────────────── timers ───────────────────────────────

export interface SessionTimers {
  /** Starts or stops the TICK interval to match tickable() and the pause stack (final partial TICK on stop). */
  sync(): void;
  /** Dispatches the time since the last TICK now (before an action that may end the attempt, or a save). */
  flushTick(): void;
  /** One-shot timer cleared by clear() (START, KITTY_DONE, overlay delays). */
  later(ms: number, fn: () => void): void;
  /** Stops everything without a final TICK (teardown). */
  clear(): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  isPaused(reason?: PauseReason): boolean;
}

export interface TimerHooks {
  tickable(): boolean;
  tick(dtMs: number): void;
  /** UiState.paused: page hidden or FB onPause. */
  onPausedChange(paused: boolean): void;
  mute(reason: MuteReason, on: boolean): void;
}

const MUTE_FOR: Readonly<Partial<Record<PauseReason, MuteReason>>> = { hidden: 'hidden', fb_pause: 'pause', ad: 'ad' };
const isHide = (r: PauseReason): boolean => r === 'hidden' || r === 'fb_pause';

export function createSessionTimers(clock: Clock, c: GameConfig, hooks: TimerHooks): SessionTimers {
  const pauses = new Set<PauseReason>();
  const once = new Set<TimerId>();
  let interval: TimerId | null = null;
  let last = 0;
  const delta = (): number => {
    const now = clock.perf();
    const dt = now - last;
    last = now;
    return dt;
  };

  const timers: SessionTimers = {
    sync() {
      const run = pauses.size === 0 && hooks.tickable();
      if (run && interval === null) {
        last = clock.perf();
        interval = clock.setInterval(() => hooks.tick(delta()), c.timer.tickMs);
      } else if (!run && interval !== null) {
        clock.clearInterval(interval);
        interval = null;
        hooks.tick(delta()); // partial delta; a no-op once the status left playing/hint/kitty
      }
    },
    flushTick() {
      if (interval !== null) hooks.tick(delta());
    },
    later(ms, fn) {
      const id: TimerId = clock.setTimeout(() => {
        once.delete(id);
        fn();
      }, ms);
      once.add(id);
    },
    clear() {
      for (const id of once) clock.clearTimeout(id);
      once.clear();
      if (interval !== null) clock.clearInterval(interval);
      interval = null;
    },
    pause(reason) {
      if (pauses.has(reason)) return;
      pauses.add(reason);
      timers.sync();
      const m = MUTE_FOR[reason];
      if (m) hooks.mute(m, true);
      if (isHide(reason)) hooks.onPausedChange(true);
    },
    resume(reason) {
      if (!pauses.delete(reason)) return;
      const m = MUTE_FOR[reason];
      if (m) hooks.mute(m, false);
      if (isHide(reason) && !pauses.has('hidden') && !pauses.has('fb_pause')) hooks.onPausedChange(false);
      timers.sync();
    },
    isPaused: (reason) => (reason ? pauses.has(reason) : pauses.size > 0),
  };
  return timers;
}

// ─────────────────────────────── feedback ───────────────────────────────

export interface FeedbackPlayer {
  /** Sound (mark ticks throttled to input.paintSoundThrottleMs) and vibration (Vibration setting). */
  play(fb: Feedback): void;
  announce(message: string): void;
  announceHint(step: HintStep, ctx: HintTextContext): void;
  /** Runs a side effect, reporting instead of throwing. */
  guard(fn: () => void): void;
}

export function createFeedbackPlayer(
  deps: Pick<SessionDeps, 'sfx' | 'announcer' | 'platform' | 'clock' | 'bus'>,
  c: GameConfig,
  hapticsOn: () => boolean,
): FeedbackPlayer {
  let lastMark = -Infinity;
  const guard = (fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      deps.bus.emit('error', { where: 'effects', error });
    }
  };
  return {
    play(fb) {
      if (fb.sfx === 'mark') {
        const now = deps.clock.perf();
        if (now - lastMark < c.input.paintSoundThrottleMs) return;
        lastMark = now;
      }
      const id = fb.sfx;
      if (id) guard(() => deps.sfx.play(id, fb.sfxIndex === undefined ? undefined : { index: fb.sfxIndex }));
      const pattern = fb.haptic;
      if (pattern !== undefined && hapticsOn()) guard(() => deps.platform.haptics.pulse(pattern));
    },
    announce: (message) => guard(() => deps.announcer.say(message)),
    announceHint: (step, ctx) => guard(() => deps.announcer.say(t('a11y.hint', { text: hintText(step, ctx) }))),
    guard,
  };
}

// ─────────────────────────────── small helpers ───────────────────────────────

/** An in-progress slot of the save (phase2b §9.1 adds 'event'). */
export type SaveSlot = keyof SaveData['inProgress'];

/**
 * The save with `slot` set to `value`. A level board is only ever written to the level slot when it
 * is the current level's (`L{progress.level}`): after a late cloud merge moved progress on, the
 * session still playing the older level must not overwrite the newer level's board (PLAT-1). The
 * save is then returned unchanged. Clearing (null) is always allowed; see withoutSlot.
 */
export function withSlot(save: SaveData, slot: SaveSlot, value: InProgressV2 | null): SaveData {
  if (save.inProgress[slot] === value) return save;
  if (slot === 'level' && value !== null && value.id !== `L${save.progress.level}`) return save;
  return { ...save, inProgress: { ...save.inProgress, [slot]: value } };
}

/**
 * Clears `slot` for the session playing `puzzleId`, except a level slot that holds another level's
 * board for the current level (a late cloud merge, PLAT-1): that board is not this session's to drop.
 */
export function withoutSlot(save: SaveData, slot: SaveSlot, puzzleId: string): SaveData {
  const cur = save.inProgress[slot];
  if (cur === null) return save;
  if (slot === 'level' && cur.id !== puzzleId && cur.id === `L${save.progress.level}`) return save;
  return withSlot(save, slot, null);
}

/** SessionMeta.colors: the given function or ui/art regionColorsFor; never throws (identity fallback). */
export function defaultColors(
  custom: ((puzzle: Puzzle, fixed: readonly number[] | null) => Uint8Array) | undefined,
  puzzle: Puzzle,
  fixed: readonly number[] | null,
): Uint8Array {
  try {
    const colors = (custom ?? regionColorsFor)(puzzle, fixed);
    if (colors.length >= puzzle.n) return colors;
  } catch {
    // fall through
  }
  if (fixed && fixed.length === puzzle.n) return Uint8Array.from(fixed);
  return Uint8Array.from({ length: puzzle.n }, (_, i) => i % PALETTE_SIZE);
}

export function defaultPraise(): number {
  return Math.floor(Math.random() * PRAISE_COUNT) % PRAISE_COUNT;
}

// ─────────────────────────────── overlay props ───────────────────────────────

export const overlayProps = {
  /** O4; buttonDelayMs is 0 when restored from a save (02 §15 step 5). */
  fail(
    continueOffer: FailOverlayProps['continueOffer'],
    buttonDelayMs: number,
    cb: Pick<FailOverlayProps, 'onContinue' | 'onRetry' | 'onHome'>,
  ): FailOverlayProps {
    return { continueOffer, buttonDelayMs, busy: false, ...cb };
  },

  /** O8 for a tutorial step; target rects are read live from the game screen. */
  coach(step: TutorialStepIndex, screen: () => GameScreen | null, onGotIt: () => void): CoachProps {
    const def = tutorialStep(step);
    return {
      step,
      hand: def.hand,
      showGotIt: def.gotIt,
      colorParam: def.colorParam,
      targetRects: () => {
        const s = screen();
        if (!s) return [];
        if (def.target === 'bulb') {
          const r = s.toolRect('bulb');
          return r ? [r] : [];
        }
        const rects: DOMRect[] = [];
        for (const cell of def.focusCells) {
          const r = s.cellRect(cell);
          if (r) rects.push(r);
        }
        return rects;
      },
      onGotIt,
    };
  },
};
