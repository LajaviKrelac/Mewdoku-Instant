// Owner: ui-shell
// AudioContext lifecycle (02 §16, 04 §5.6): created on the first pointerdown, one master GainNode at
// audio.masterDb, muted for any active reason, suspended while hidden/paused.

/** Every active reason mutes; sound plays only when none is active. */
export type MuteReason = 'setting' | 'hidden' | 'pause' | 'ad';

export interface AudioEngine {
  /** Creates/resumes the AudioContext. Call from a user gesture; idempotent. */
  unlock(): void;
  /** null until unlocked or when WebAudio is unavailable. */
  context(): AudioContext | null;
  /** Master gain node that sfx connect to; null until unlocked. */
  output(): AudioNode | null;
  setMuted(reason: MuteReason, muted: boolean): void;
  isMuted(): boolean;
  destroy(): void;
}

export function createAudioEngine(win?: Window): AudioEngine {
  throw new Error('not implemented: createAudioEngine');
}
