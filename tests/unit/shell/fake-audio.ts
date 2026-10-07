// Owner: ui-shell. A minimal recording WebAudio fake for the audio tests (jsdom has no AudioContext).

export class FakeParam {
  value: number;
  readonly events: [string, number, number][] = [];
  constructor(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.events.push(['set', v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push(['linear', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (!(v > 0)) throw new RangeError('exponential ramp target must be > 0');
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.events.push(['target', v, t]);
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect<T extends FakeNode>(n: T): T {
    this.outputs.push(n);
    return n;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

export class FakeSource extends FakeNode {
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t = 0): void {
    this.started = t;
  }
  stop(t = 0): void {
    this.stopped = t;
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
}

export class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

export class FakeBuffer {
  private readonly data: Float32Array;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  calls = { resume: 0, suspend: 0, close: 0 };

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate);
  }
  resume(): Promise<void> {
    this.calls.resume++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.calls.suspend++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.calls.close++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

/** A window-like EventTarget exposing the fake constructor (or none). */
export function fakeAudioWindow(withAudio = true): Window {
  const target = new EventTarget();
  return Object.assign(target, withAudio ? { AudioContext: FakeAudioContext } : {}) as unknown as Window;
}
