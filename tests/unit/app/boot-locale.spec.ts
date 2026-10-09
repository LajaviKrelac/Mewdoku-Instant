// @vitest-environment jsdom
// Owner: C. The boot locale wait (phase2b §6.3): after start() the real locale (platform getLocale on
// FB, navigator.languages on the web) is resolved with the saved override, and its chunk may hold the
// first route for at most i18n.localeTimeoutMs; on a timeout the game starts and the language
// switches when the chunk lands (the store's ui.locale / ui.dir follow, 'locale:changed' is emitted).
import { describe, expect, it, vi } from 'vitest';

const calls: { input: unknown; override: unknown }[] = [];
let resolveLocale: ((id: string) => void) | null = null;
let hang = false;

vi.mock('../../../src/i18n', async (orig) => {
  const m = await orig<typeof import('../../../src/i18n')>();
  return {
    ...m,
    setLocale: vi.fn((input: unknown, opts?: { override?: unknown }) => {
      calls.push({ input, override: opts?.override });
      if (!hang) return Promise.resolve('en');
      return new Promise((r) => {
        resolveLocale = (id) => r(id);
      });
    }),
  };
});

import { boot } from '../../../src/app/boot';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import type { RouterFactories } from '../../../src/app/router';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createFakeAudio, createFakeLevels, createFakePlatform, createLoggedEngine, NOW } from './harness';

function factories(log: string[]): Partial<RouterFactories> {
  return {
    overlays: {},
    loadOverlays: async () => ({}),
    bootScreen: () => ({ el: document.createElement('div'), setProgress: () => undefined, destroy: () => undefined }),
    homeScreen: () => {
      log.push('screen:home');
      return { el: document.createElement('main'), update: () => undefined, destroy: () => undefined };
    },
    toastLayer: () => ({ el: document.createElement('div'), show: () => undefined, clear: () => undefined, destroy: () => undefined }),
    trapFocus: () => () => undefined,
    setInert: () => undefined,
    screenTransition: null,
  };
}

function begin(save: SaveData) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const platform = createFakePlatform(log);
  platform.getLocale = () => 'de_DE';
  platform.raw = { local: save, cloud: null, corrupt: false };
  const fa = createFakeAudio(log);
  const done = boot(platform, root, {
    clock,
    doc: document,
    search: '',
    routerFactories: factories(log),
    levels: createFakeLevels(),
    engine: createLoggedEngine(log),
    audio: fa.audio,
    sfx: fa.sfx,
    announcer: { say: () => undefined, clear: () => undefined, destroy: () => undefined },
  });
  return { done, log, clock };
}

const returning = (locale: SaveData['settings']['locale'] = 'auto'): SaveData => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  progress: { level: 25, completed: 24, best: {} },
  settings: { ...defaults(0).settings, locale },
});

async function turns(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

describe('boot locale (phase2b §6.3)', () => {
  it('resolves the platform locale with the saved override after start()', async () => {
    calls.length = 0;
    hang = false;
    const s = begin(returning('fr'));
    const app = await s.done;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const last = calls[calls.length - 1];
    expect(last?.override).toBe('fr');
    expect(JSON.stringify(last?.input)).toContain('de');
    expect(s.log).toContain('screen:home');
    app.dispose();
  });

  it('a slow locale chunk holds the first route for at most i18n.localeTimeoutMs, then the game starts', async () => {
    calls.length = 0;
    hang = true;
    resolveLocale = null;
    const s = begin(returning());
    await turns();
    await s.clock.advanceAsync(cfg.i18n.localeTimeoutMs - 50);
    await turns();
    expect(s.log).not.toContain('screen:home');
    await s.clock.advanceAsync(100);
    const app = await s.done;
    expect(s.log).toContain('screen:home');
    expect(app.store.get().ui.locale).toBe('en');
    (resolveLocale as ((id: string) => void) | null)?.('de'); // the chunk lands late: the language switches then
    app.dispose();
    hang = false;
  });
});
