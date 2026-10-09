// Owner: D (Phase 2b; was platform)
// Test helpers: load tests/fixtures/fbinstant-stub.js into an isolated fake `window`, a Map-backed
// Storage, and a microtask drain that works with the FakeClock.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import type { PlatformTimers } from '../../../src/platform/types';

export interface StubCall {
  seq: number;
  name: string;
  args: unknown[];
  t: number;
  beforeInit: boolean;
}

export interface StubAdBehaviour {
  load?: string;
  loadDelayMs?: number;
  show?: string;
  showDelayMs?: number;
}

export interface StubConfig {
  supportedAPIs?: string[];
  locale?: string;
  playerId?: string;
  initDelayMs?: number;
  startDelayMs?: number;
  getDataDelayMs?: number;
  setDataDelayMs?: number;
  flushDelayMs?: number;
  data?: Record<string, unknown> | null;
  errors?: {
    getDataAsync?: (string | null)[];
    setDataAsync?: (string | null)[];
    flushDataAsync?: (string | null)[];
    startGameAsync?: (string | null)[];
  };
  ads?: { interstitial?: StubAdBehaviour; rewarded?: StubAdBehaviour };
  presets?: string[];
}

export interface StubControl {
  calls: StubCall[];
  state: { initialized: boolean; started: boolean; progress: number[]; flushing: boolean; adsCreated: number };
  names(): string[];
  count(name: string): number;
  find(name: string): StubCall[];
  configure(patch: StubConfig): void;
  pause(): void;
  playerData(): Record<string, unknown>;
  setPlayerData(data: Record<string, unknown>): void;
  clearCalls(): void;
}

const STUB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/fbinstant-stub.js');
let stubSrc: string | null = null;

/** A fresh stub whose delays run on `timers` (a FakeClock in these tests). */
export function createStub(config: StubConfig, timers: PlatformTimers): { sdk: FBInstantSDK; control: StubControl } {
  const root: Record<string, unknown> = {
    __FB_STUB_NO_INSTALL__: true,
    setTimeout: (fn: () => void, ms: number) => timers.setTimeout(fn, ms),
  };
  stubSrc ??= readFileSync(STUB_PATH, 'utf8');
  new Function('window', stubSrc)(root);
  const create = root.__createFbStub as (c: StubConfig) => { sdk: FBInstantSDK; control: StubControl };
  return create(config);
}

/** Lets pending promise chains settle (several macrotask turns, each draining all microtasks). */
export async function drain(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setImmediate(r));
}

/** Tracks whether a promise has settled, for "not yet" assertions. */
export function track<T>(p: Promise<T>): { readonly done: boolean; readonly value: T | undefined } {
  const s: { done: boolean; value: T | undefined } = { done: false, value: undefined };
  void p.then((v) => {
    s.done = true;
    s.value = v;
  });
  return s;
}

/** Minimal in-memory Storage with switchable failures. */
export class MemoryStorage implements Storage {
  readonly map = new Map<string, string>();
  failWrites = false;
  failReads = false;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('SecurityError');
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, String(value));
  }
  [name: string]: unknown;
}
