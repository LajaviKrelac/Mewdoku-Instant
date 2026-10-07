// Owner: ui-shell
// Synthesised sound recipes (02 §16): oscillators + envelopes + filtered noise, no audio files.
import type { AudioEngine } from './audio-engine';

export type SfxId =
  | 'mark' // soft high tick, ±3 % pitch; throttled to 1 per input.paintSoundThrottleMs
  | 'unmark' // lower tock
  | 'cat' // rounded pop + rising two-note chirp
  | 'region' // bright chime; pitch rises with opts.index
  | 'mistake' // dull thud + short downward buzz
  | 'heart_last' // mistake sound, then a slow descending three-note figure
  | 'win' // upward five-note arpeggio + sparkle noise
  | 'hint_open' // soft bell
  | 'hint_apply' // whoosh
  | 'kitty' // sparkle + pop
  | 'ui'; // click

export interface Sfx {
  /** No-op while muted or before unlock. `index`: region chime step (0-based count of done regions). */
  play(id: SfxId, opts?: { index?: number }): void;
}

export function createSfx(engine: AudioEngine): Sfx {
  throw new Error('not implemented: createSfx');
}
