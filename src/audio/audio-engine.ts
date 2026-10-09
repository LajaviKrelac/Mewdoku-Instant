// Owner: B (Phase 2b; was ui-shell)
// AudioContext lifecycle (02 §16, 04 §5.6): created on the first pointerdown, one master GainNode at
// audio.masterDb, muted for any active reason, suspended while hidden/paused.
// The engine listens for the first user gesture itself (pointerdown, keydown, touchend in the capture
// phase) and keeps listening so that a context the OS interrupted (iOS) resumes on the next gesture.
import { cfg } from '../app/config';

/** Every active reason mutes; sound plays only when none is active. */
export type MuteReason = 'setting' | 'hidden' | 'pause' | 'ad';

export interface AudioEngine {
  /** Creates/resumes the AudioContext. Call from a user gesture; idempotent. */
  unlock(): void;
  /**
   * Creates the AudioContext ahead of the first gesture, at an idle moment (review PERF-1: creating it
   * inside the first tap took 68 ms of that tap's task at 4× CPU). It stays suspended until a gesture,
   * which then only resumes it and plays the silent iOS unlock buffer. Optional; idempotent.
   */
  prewarm?(): void;
  /** null until unlocked or when WebAudio is unavailable. */
  context(): AudioContext | null;
  /** Master gain node that sfx connect to; null until unlocked. */
  output(): AudioNode | null;
  setMuted(reason: MuteReason, muted: boolean): void;
  isMuted(): boolean;
  destroy(): void;
}

type AudioContextCtor = new () => AudioContext;

/** Linear gain for a dBFS level: -12 dB → 0.251. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Time constant of the mute/unmute ramp (s): short enough to feel instant, long enough not to click. */
const MUTE_RAMP_S = 0.015;
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

function audioContextCtor(win: Window): AudioContextCtor | null {
  const w = win as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAudioEngine(win: Window = window): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let destroyed = false;
  let unavailable = false;
  const reasons = new Set<MuteReason>();
  const level = dbToGain(cfg.audio.masterDb);

  const suspended = (): boolean => reasons.has('hidden') || reasons.has('pause');

  const applyGain = (): void => {
    if (!ctx || !master) return;
    const target = reasons.size > 0 ? 0 : level;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(target, now, MUTE_RAMP_S);
  };

  const applyRunState = (): void => {
    if (!ctx || ctx.state === 'closed') return;
    if (suspended()) {
      if (ctx.state === 'running') ctx.suspend().catch(() => undefined);
    } else if (ctx.state !== 'running') {
      ctx.resume().catch(() => undefined);
    }
  };

  /** iOS only unlocks output after something is played inside the gesture. */
  const primeSilence = (c: AudioContext): void => {
    try {
      const buf = c.createBuffer(1, 1, c.sampleRate || 22_050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // Best effort only.
    }
  };

  /** The context and its master gain (not resumed, not primed); false when WebAudio is unavailable. */
  const create = (): boolean => {
    if (ctx) return true;
    if (destroyed || unavailable) return false;
    const Ctor = audioContextCtor(win);
    if (!Ctor) {
      unavailable = true;
      return false;
    }
    try {
      ctx = new Ctor();
    } catch {
      unavailable = true;
      return false;
    }
    master = ctx.createGain();
    master.gain.value = reasons.size > 0 ? 0 : level;
    master.connect(ctx.destination);
    return true;
  };

  /** Whether the silent unlock buffer has been played inside a gesture (iOS). */
  let primed = false;
  const unlock = (): void => {
    if (destroyed || unavailable) return;
    if (!create() || !ctx) return;
    if (!primed) {
      primed = true;
      primeSilence(ctx);
    }
    applyRunState();
  };

  const onGesture = (): void => {
    if (!ctx || ctx.state !== 'running') unlock();
  };
  for (const type of GESTURES) win.addEventListener(type, onGesture, { capture: true, passive: true });

  return {
    unlock,
    prewarm() {
      // Before a gesture the browser keeps it suspended; nothing is resumed or played here.
      create();
    },
    context: () => ctx,
    output: () => master,
    setMuted(reason, muted) {
      const had = reasons.has(reason);
      if (muted === had) return;
      if (muted) reasons.add(reason);
      else reasons.delete(reason);
      applyGain();
      applyRunState();
    },
    isMuted: () => reasons.size > 0,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const type of GESTURES) win.removeEventListener(type, onGesture, { capture: true });
      master?.disconnect();
      ctx?.close().catch(() => undefined);
      master = null;
      ctx = null;
    },
  };
}
