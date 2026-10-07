// Owner: ui-shell. 02 §16 audio: unlock on the first gesture, -12 dBFS master, mute reasons,
// suspend while hidden/paused, and a synthesised recipe for every sound.
import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createAudioEngine, dbToGain } from '../../../src/audio/audio-engine';
import { createSfx, recipe, SFX_IDS, type ToneVoice } from '../../../src/audio/sfx';
import { FakeAudioContext, fakeAudioWindow } from './fake-audio';

const gesture = (win: Window, type = 'pointerdown'): void => void win.dispatchEvent(new Event(type));
const ctxOf = (i = 0): FakeAudioContext => {
  const c = FakeAudioContext.instances[i];
  if (!c) throw new Error('no context');
  return c;
};

beforeEach(() => {
  FakeAudioContext.instances = [];
});

describe('audio engine', () => {
  it('creates one AudioContext on the first gesture, with the master gain at -12 dBFS', () => {
    const win = fakeAudioWindow();
    const engine = createAudioEngine(win);
    expect(engine.context()).toBeNull();
    expect(engine.output()).toBeNull();
    gesture(win);
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = ctxOf();
    expect(ctx.state).toBe('running');
    expect(engine.context()).toBe(ctx as unknown as AudioContext);
    const master = ctx.gains[0];
    expect(master?.gain.value).toBeCloseTo(dbToGain(cfg.audio.masterDb), 6);
    expect(dbToGain(-12)).toBeCloseTo(0.2512, 4);
    expect(master?.outputs[0]).toBe(ctx.destination);
    expect(ctx.sources[0]?.started).toBe(0); // the silent iOS unlock buffer
    gesture(win, 'keydown');
    engine.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('resumes a context the OS suspended on the next gesture', () => {
    const win = fakeAudioWindow();
    createAudioEngine(win);
    gesture(win);
    const ctx = ctxOf();
    ctx.state = 'suspended';
    gesture(win, 'touchend');
    expect(ctx.state).toBe('running');
  });

  it('is silent but safe without WebAudio', () => {
    const win = fakeAudioWindow(false);
    const engine = createAudioEngine(win);
    gesture(win);
    expect(engine.context()).toBeNull();
    expect(() => createSfx(engine).play('cat')).not.toThrow();
  });

  it('mutes while any reason is active; hidden/pause also suspend the context', () => {
    const win = fakeAudioWindow();
    const engine = createAudioEngine(win);
    engine.setMuted('setting', true); // before unlock: the master starts at 0
    gesture(win);
    const ctx = ctxOf();
    const gain = ctx.gains[0]?.gain;
    expect(gain?.value).toBe(0);
    expect(engine.isMuted()).toBe(true);
    engine.setMuted('setting', false);
    expect(engine.isMuted()).toBe(false);
    expect(gain?.value).toBeCloseTo(dbToGain(cfg.audio.masterDb), 6);

    engine.setMuted('ad', true);
    expect(gain?.value).toBe(0);
    expect(ctx.state).toBe('running');
    engine.setMuted('hidden', true);
    expect(ctx.state).toBe('suspended');
    engine.setMuted('ad', false);
    expect(engine.isMuted()).toBe(true); // still hidden
    engine.setMuted('hidden', false);
    expect(ctx.state).toBe('running');
    expect(engine.isMuted()).toBe(false);

    engine.setMuted('pause', true);
    expect(ctx.calls.suspend).toBe(2);
    engine.setMuted('pause', true); // idempotent
    expect(ctx.calls.suspend).toBe(2);
  });

  it('destroy closes the context and stops listening', () => {
    const win = fakeAudioWindow();
    const engine = createAudioEngine(win);
    gesture(win);
    engine.destroy();
    expect(ctxOf().state).toBe('closed');
    expect(engine.context()).toBeNull();
    gesture(win);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});

describe('sfx', () => {
  const ready = () => {
    const win = fakeAudioWindow();
    const engine = createAudioEngine(win);
    gesture(win);
    return { engine, ctx: ctxOf(), sfx: createSfx(engine, () => 0.5) };
  };
  const started = (ctx: FakeAudioContext): number =>
    [...ctx.oscillators, ...ctx.sources].filter((s) => s.started !== null).length;

  it('does nothing before unlock or while muted', () => {
    const win = fakeAudioWindow();
    const engine = createAudioEngine(win);
    const sfx = createSfx(engine);
    sfx.play('win');
    gesture(win);
    const ctx = ctxOf();
    const before = started(ctx);
    engine.setMuted('setting', true);
    sfx.play('win');
    expect(started(ctx)).toBe(before);
  });

  it('schedules oscillators and noise for every sound, all wired to the master', () => {
    const { ctx, sfx, engine } = ready();
    for (const id of SFX_IDS) {
      const before = started(ctx);
      ctx.currentTime += 1; // past the mark throttle
      sfx.play(id, { index: 2 });
      expect(started(ctx), id).toBeGreaterThan(before);
    }
    const master = engine.output() as unknown as object;
    const envelopes = ctx.gains.slice(1);
    expect(envelopes.length).toBeGreaterThan(SFX_IDS.length);
    for (const g of envelopes) expect(g.outputs[0]).toBe(master);
    for (const s of [...ctx.oscillators, ...ctx.sources.slice(1)]) {
      expect(s.stopped).not.toBeNull();
      expect((s.stopped ?? 0) > (s.started ?? 0)).toBe(true);
    }
    // Nodes clean up after themselves.
    const osc = ctx.oscillators[0];
    osc?.onended?.();
    expect(osc?.outputs).toHaveLength(0);
  });

  it('throttles mark ticks while painting', () => {
    const { ctx, sfx } = ready();
    sfx.play('mark');
    const after1 = started(ctx);
    ctx.currentTime += (cfg.input.paintSoundThrottleMs - 5) / 1000;
    sfx.play('mark');
    expect(started(ctx)).toBe(after1);
    ctx.currentTime += 10 / 1000;
    sfx.play('mark');
    expect(started(ctx)).toBeGreaterThan(after1);
    sfx.play('unmark'); // other sounds are not throttled
  });

  it('recipes: rising region chime, jittered mark, bounded peaks, four-part heart_last', () => {
    const first = (id: 'region', index: number): number => (recipe(id, { index })[0] as ToneVoice).f0;
    expect(first('region', 1)).toBeGreaterThan(first('region', 0));
    expect(first('region', 5)).toBeGreaterThan(first('region', 4));
    expect(first('region', 99)).toBe(first('region', 11));
    const lo = (recipe('mark', {}, () => 0)[0] as ToneVoice).f0;
    const hi = (recipe('mark', {}, () => 0.999999)[0] as ToneVoice).f0;
    expect(hi / lo).toBeGreaterThan(1.05);
    expect(hi / lo).toBeLessThan(1.07);
    for (const id of SFX_IDS) {
      for (const v of recipe(id, { index: 3 })) {
        expect(v.peak).toBeGreaterThan(0);
        expect(v.peak).toBeLessThanOrEqual(0.55);
        expect(v.dur).toBeGreaterThan(0);
      }
    }
    expect(recipe('heart_last').length).toBe(recipe('mistake').length + 3);
  });
});
