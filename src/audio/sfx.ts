// Owner: B (Phase 2b)
// Synthesised sound recipes (02 §16): oscillators + envelopes + filtered noise, no audio files.
// Every sound is our own design: a list of tone and noise "voices" scheduled from ctx.currentTime.
// Voice peaks stay ≤ 0.55 so overlapping sounds do not clip after the -12 dBFS master gain.
import { cfg } from '../app/config';
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
  | 'ui' // click
  | 'fish_pop' // phase2b §2.2: soft water-drop "bloop" as a fish pops at its cat
  | 'fish_plink'; // phase2b §2.2: bright arrival "plink", +audio.fishPlinkStepSemitones per fish (opts.index)

export const SFX_IDS: readonly SfxId[] = [
  'mark', 'unmark', 'cat', 'region', 'mistake', 'heart_last', 'win', 'hint_open', 'hint_apply', 'kitty', 'ui', 'fish_pop', 'fish_plink',
];

export interface Sfx {
  /** No-op while muted or before unlock. `index`: region chime step (0-based count of done regions). */
  play(id: SfxId, opts?: { index?: number }): void;
}

/** An oscillator voice. Times in seconds from the sound's start. */
export interface ToneVoice {
  readonly kind: 'tone';
  readonly wave: OscillatorType;
  readonly f0: number;
  /** Exponential glide target at the end of the voice. */
  readonly f1?: number;
  readonly at: number;
  readonly dur: number;
  readonly peak: number;
  readonly attack?: number;
  /** Optional low-pass cutoff (Hz) to soften bright waves. */
  readonly lowpass?: number;
}

/** A filtered white-noise burst. */
export interface NoiseVoice {
  readonly kind: 'noise';
  readonly filter: BiquadFilterType;
  readonly freq: number;
  /** Exponential filter sweep target. */
  readonly freq1?: number;
  readonly q?: number;
  readonly at: number;
  readonly dur: number;
  readonly peak: number;
  readonly attack?: number;
}

export type Voice = ToneVoice | NoiseVoice;

const tone = (wave: OscillatorType, f0: number, at: number, dur: number, peak: number, extra: Partial<ToneVoice> = {}): ToneVoice => ({
  kind: 'tone',
  wave,
  f0,
  at,
  dur,
  peak,
  ...extra,
});
const noise = (filter: BiquadFilterType, freq: number, at: number, dur: number, peak: number, extra: Partial<NoiseVoice> = {}): NoiseVoice => ({
  kind: 'noise',
  filter,
  freq,
  at,
  dur,
  peak,
  ...extra,
});

/** Major-pentatonic steps (semitones) for the region chime ladder. */
const CHIME_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const CHIME_BASE_HZ = 659.25; // E5
const semis = (f: number, st: number): number => f * Math.pow(2, st / 12);

function mistakeVoices(): Voice[] {
  return [
    tone('sine', 150, 0, 0.18, 0.55, { f1: 55, attack: 0.004 }),
    noise('lowpass', 420, 0, 0.12, 0.22, { q: 0.7 }),
    tone('sawtooth', 230, 0.02, 0.2, 0.1, { f1: 140, lowpass: 900 }),
  ];
}

function sparkleVoices(at: number, pitches: readonly number[], spacing: number): Voice[] {
  return [
    noise('highpass', 6500, at, 0.32, 0.06, { attack: 0.01 }),
    ...pitches.map((f, i) => tone('sine', f, at + i * spacing, 0.09, 0.07, { attack: 0.003 })),
  ];
}

/** The voice list of a sound. `rand` in [0, 1) gives the mark's pitch jitter (injectable for tests). */
export function recipe(id: SfxId, opts: { index?: number } = {}, rand: () => number = Math.random): Voice[] {
  switch (id) {
    case 'mark': {
      const j = 1 + (rand() * 2 - 1) * cfg.audio.markPitchJitter;
      return [tone('sine', 2100 * j, 0, 0.05, 0.2, { f1: 1750 * j, attack: 0.002 }), noise('highpass', 4200, 0, 0.02, 0.05)];
    }
    case 'unmark':
      return [tone('triangle', 620, 0, 0.07, 0.24, { f1: 420, attack: 0.002 })];
    case 'cat':
      return [
        tone('sine', 260, 0, 0.09, 0.45, { f1: 720, attack: 0.003 }),
        tone('triangle', 880, 0.07, 0.07, 0.18),
        tone('triangle', 1318.5, 0.13, 0.1, 0.18),
      ];
    case 'region': {
      const step = CHIME_STEPS[Math.min(Math.max(0, opts.index ?? 0), CHIME_STEPS.length - 1)] ?? 0;
      const f = semis(CHIME_BASE_HZ, step);
      return [
        tone('sine', f, 0, 0.45, 0.24, { attack: 0.003 }),
        tone('sine', f * 2, 0, 0.3, 0.07, { attack: 0.003 }),
        tone('triangle', f * 3, 0, 0.15, 0.035, { attack: 0.003 }),
      ];
    }
    case 'mistake':
      return mistakeVoices();
    case 'heart_last':
      return [
        ...mistakeVoices(),
        tone('triangle', 523.25, 0.3, 0.26, 0.2, { attack: 0.01 }),
        tone('triangle', 440, 0.55, 0.26, 0.2, { attack: 0.01 }),
        tone('triangle', 349.23, 0.8, 0.55, 0.2, { attack: 0.01 }),
      ];
    case 'win': {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      return [
        ...notes.map((f, i) => tone('triangle', f, i * 0.085, i === notes.length - 1 ? 0.6 : 0.28, 0.2, { attack: 0.005 })),
        ...notes.map((f, i) => tone('sine', f / 2, i * 0.085, 0.2, 0.08, { attack: 0.005 })),
        ...sparkleVoices(0.36, [2637, 3136, 3520, 4186, 3951], 0.055),
      ];
    }
    case 'hint_open':
      return [
        tone('sine', 1318.5, 0, 0.7, 0.18, { attack: 0.004 }),
        tone('sine', 1318.5 * 2.76, 0, 0.35, 0.045, { attack: 0.004 }),
        tone('sine', 1318.5 * 5.4, 0, 0.15, 0.02, { attack: 0.004 }),
      ];
    case 'hint_apply':
      return [noise('bandpass', 300, 0, 0.3, 0.32, { freq1: 2400, q: 0.8, attack: 0.09 })];
    case 'kitty':
      return [...sparkleVoices(0, [2637, 3322, 3951], 0.05), tone('sine', 300, 0.13, 0.09, 0.4, { f1: 820, attack: 0.003 })];
    case 'ui':
      return [tone('square', 1100, 0, 0.018, 0.07, { lowpass: 3000, attack: 0.001 }), noise('highpass', 2000, 0, 0.012, 0.04)];
    // phase2b §2.2, our own design. The pop is a rounded water-drop "bloop": a sine that bends up an
    // octave and a half in 70 ms, a quieter sub-octave body and a tiny low-passed splash. Kept soft
    // (peak 0.32) because three of them fall 150 ms apart.
    case 'fish_pop':
      return [
        tone('sine', 360, 0, 0.11, 0.32, { f1: 1020, attack: 0.004 }),
        tone('sine', 180, 0, 0.08, 0.12, { f1: 420, attack: 0.004 }),
        noise('lowpass', 1800, 0.004, 0.035, 0.05, { q: 0.9 }),
      ];
    // The arrival is a bell-like "plink" on the pentatonic E ladder, each fish
    // audio.fishPlinkStepSemitones higher (opts.index 0, 1, 2): a sine fundamental, an inharmonic
    // partial (×2.76) for the metallic sheen, and a short high click.
    case 'fish_plink': {
      const f = semis(1318.5, Math.max(0, opts.index ?? 0) * cfg.audio.fishPlinkStepSemitones);
      return [
        tone('sine', f, 0, 0.26, 0.22, { attack: 0.002 }),
        tone('sine', f * 2.76, 0, 0.12, 0.05, { attack: 0.002 }),
        tone('triangle', f * 2, 0.01, 0.08, 0.04, { attack: 0.002 }),
        noise('highpass', 5200, 0, 0.015, 0.035),
      ];
    }
  }
}

/** Scheduling lead so the first sample is never in the past. */
const LEAD_S = 0.005;
const FLOOR = 0.0001;
const NOISE_SECONDS = 1;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const rate = ctx.sampleRate || 44_100;
    buf = ctx.createBuffer(1, Math.floor(rate * NOISE_SECONDS), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

function envelope(ctx: BaseAudioContext, t0: number, v: Voice): GainNode {
  const g = ctx.createGain();
  const attack = Math.min(v.attack ?? 0.002, v.dur / 2);
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.linearRampToValueAtTime(v.peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t0 + v.dur);
  return g;
}

/** Schedules one voice; nodes disconnect themselves when the source ends. */
export function scheduleVoice(ctx: BaseAudioContext, out: AudioNode, v: Voice, start: number): void {
  const t0 = start + v.at;
  const g = envelope(ctx, t0, v);
  const nodes: AudioNode[] = [g];
  let src: AudioScheduledSourceNode;
  if (v.kind === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.f0, t0);
    if (v.f1) osc.frequency.exponentialRampToValueAtTime(v.f1, t0 + v.dur);
    let head: AudioNode = osc;
    if (v.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(v.lowpass, t0);
      osc.connect(lp);
      head = lp;
      nodes.push(lp);
    }
    head.connect(g);
    src = osc;
  } else {
    const b = ctx.createBufferSource();
    b.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = v.filter;
    f.frequency.setValueAtTime(v.freq, t0);
    if (v.freq1) f.frequency.exponentialRampToValueAtTime(v.freq1, t0 + v.dur);
    if (v.q !== undefined) f.Q.setValueAtTime(v.q, t0);
    b.connect(f);
    f.connect(g);
    nodes.push(f);
    src = b;
  }
  g.connect(out);
  src.onended = () => {
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
  src.start(t0);
  src.stop(t0 + v.dur + 0.02);
}

export function createSfx(engine: AudioEngine, rand: () => number = Math.random): Sfx {
  let lastMarkMs = -Infinity;
  return {
    play(id, opts) {
      const ctx = engine.context();
      const out = engine.output();
      if (!ctx || !out || engine.isMuted() || ctx.state !== 'running') return;
      const nowMs = ctx.currentTime * 1000;
      if (id === 'mark') {
        if (nowMs - lastMarkMs < cfg.input.paintSoundThrottleMs) return;
        lastMarkMs = nowMs;
      }
      const start = ctx.currentTime + LEAD_S;
      try {
        for (const v of recipe(id, opts, rand)) scheduleVoice(ctx, out, v, start);
      } catch {
        // Audio must never break the game (e.g. a context closed mid-call).
      }
    },
  };
}
