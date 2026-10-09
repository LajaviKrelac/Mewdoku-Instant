// @vitest-environment jsdom
// Owner: C. The boot locale wait (phase2b §6.3): after start() the real locale (platform getLocale on
// FB, navigator.languages on the web) is resolved with the saved override, and its chunk may hold the
// first route for at most i18n.localeTimeoutMs; on a timeout the game starts and the language
// switches when the chunk lands (the store's ui.locale / ui.dir follow, 'locale:changed' is emitted).
import { describe, expect, it, vi } from 'vitest';

const calls: { input: unknown; override: unknown }[] = [];
let resolveLocale: ((id: string) => void) | null = null;
let hang = false;
/** The boot's bounded prefetch of the guessed chunk never settles (review PERF-2). */
let hangPrefetch = false;

vi.mock('../../../src/i18n', async (orig) => {
  const m = await orig<typeof import('../../../src/i18n')>();
  return {
    ...m,
    prefetchLocale: vi.fn((id: Parameters<typeof m.prefetchLocale>[0]) => (hangPrefetch ? new Promise<boolean>(() => undefined) : m.prefetchLocale(id))),
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
import { buildLocales } from '../../../src/i18n';
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

function begin(save: SaveData, opts: { platformId?: 'web' | 'fbig' } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const platform = createFakePlatform(log);
  if (opts.platformId) (platform as { id: string }).id = opts.platformId;
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
  /** navigator.language(s) as a German browser reports them, for one test. */
  function germanBrowser(): () => void {
    const nav = window.navigator;
    const before = { language: Object.getOwnPropertyDescriptor(nav, 'language'), languages: Object.getOwnPropertyDescriptor(nav, 'languages') };
    Object.defineProperty(nav, 'language', { value: 'de-DE', configurable: true });
    Object.defineProperty(nav, 'languages', { value: ['de-DE'], configurable: true });
    return () => {
      for (const k of ['language', 'languages'] as const) {
        const d = before[k];
        if (d) Object.defineProperty(nav, k, d);
        else delete (nav as unknown as Record<string, unknown>)[k];
      }
    };
  }

  it('the guessed locale is the platform locale and its chunk hangs: ONE bounded wait, not two (review PERF-2)', async () => {
    expect(buildLocales()).toContain('de');
    const restore = germanBrowser();
    calls.length = 0;
    hang = true;
    hangPrefetch = true;
    resolveLocale = null;
    try {
      const s = begin(returning());
      await turns();
      await s.clock.advanceAsync(cfg.i18n.localeTimeoutMs - 50);
      await turns();
      expect(s.log).not.toContain('screen:home'); // step 3: the guessed chunk's bounded wait
      await s.clock.advanceAsync(100);
      await turns();
      expect(s.log).toContain('screen:home'); // step 4 does not wait for the same chunk again
      const app = await s.done;
      expect(app.store.get().ui.locale).toBe('en'); // English first; the chunk switches it when it lands
      app.dispose();
    } finally {
      restore();
      hang = false;
      hangPrefetch = false;
    }
  });

  it('a resolved locale that differs from the guess still gets its own bounded wait (§6.3 "if it differs")', async () => {
    const restore = germanBrowser();
    calls.length = 0;
    hang = true;
    hangPrefetch = true;
    resolveLocale = null;
    try {
      const s = begin(returning('fr')); // the saved choice is French: not the guessed German
      await turns();
      await s.clock.advanceAsync(2 * cfg.i18n.localeTimeoutMs - 50);
      await turns();
      expect(s.log).not.toContain('screen:home');
      await s.clock.advanceAsync(100);
      await turns();
      expect(s.log).toContain('screen:home');
      (await s.done).dispose();
    } finally {
      restore();
      hang = false;
      hangPrefetch = false;
    }
  });

  it('FBIG (no boot screen after startGameAsync): a long step-4 wait shows the loading indicator, never a blank page (PERF-2)', async () => {
    calls.length = 0;
    hang = true;
    resolveLocale = null;
    try {
      const s = begin(returning('fr'), { platformId: 'fbig' });
      await turns();
      await s.clock.advanceAsync(cfg.loading.indicatorDelayMs + 10);
      await turns();
      expect(document.getElementById('app')?.getAttribute('aria-busy')).toBe('true');
      await s.clock.advanceAsync(cfg.i18n.localeTimeoutMs);
      const app = await s.done;
      expect(s.log).toContain('screen:home');
      expect(document.getElementById('app')?.hasAttribute('aria-busy')).toBe(false);
      app.dispose();
    } finally {
      hang = false;
    }
  });
});
