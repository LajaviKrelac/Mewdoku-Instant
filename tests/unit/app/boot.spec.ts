// @vitest-environment jsdom
// Owner: app. Boot sequence (04 §5.1) and the Home shell (02 §4.2, §12, §14) with a fake platform and
// fake UI factories: init first, progress 100 before start, merge + sessions+1, restore rules, route
// (tutorial on first run, Home otherwise), ads preloaded last.
import { describe, expect, it, vi } from 'vitest';

// loadChunk is wrapped (still the real one) so a test can see which lazy chunks boot loads through it.
vi.mock('../../../src/workers/lazy-chunk', async (orig) => {
  const m = await orig<typeof import('../../../src/workers/lazy-chunk')>();
  return { ...m, loadChunk: vi.fn(m.loadChunk) };
});

import { boot, showBootFailure } from '../../../src/app/boot';
import { loadChunk } from '../../../src/workers/lazy-chunk';
import { cfg } from '../../../src/app/config';
import type { LevelsRepo } from '../../../src/game/levels-repo';
import type { ExternalSave } from '../../../src/platform/types';
import { createFakeClock } from '../../../src/app/clock';
import type { OverlayFactories, RouterFactories } from '../../../src/app/router';
import type { OverlayId } from '../../../src/app/store';
import { defaults, encodeCells } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import type { HomeCallbacks, HomeView } from '../../../src/ui/screens/home-screen';
import { createFakeAudio, createFakeLevels, createFakePlatform, createLoggedEngine, NOW, TODAY, type FakePlatform } from './harness';

interface Ui {
  home: { view: HomeView; cb: HomeCallbacks } | null;
  overlays: Map<OverlayId, { props: unknown }>;
  factories: Partial<RouterFactories>;
}

function fakeUi(log: string[]): Ui {
  const ui: Ui = { home: null, overlays: new Map(), factories: {} };
  const ids: OverlayId[] = ['hint', 'rewarded', 'fail', 'settings', 'how_to_play', 'daily_result', 'coach'];
  const overlays = Object.fromEntries(
    ids.map((id) => [
      id,
      () => {
        const entry = { props: null as unknown };
        ui.overlays.set(id, entry);
        return {
          el: document.createElement('div'),
          modal: id !== 'coach',
          open: (p: unknown) => void ((entry.props = p), log.push(`open:${id}`)),
          update: (p: unknown) => void (entry.props = p),
          close: () => void log.push(`close:${id}`),
          dismiss: () => false,
          destroy: () => undefined,
        };
      },
    ]),
  ) as unknown as OverlayFactories;
  ui.factories = {
    overlays,
    bootScreen: () => ({ el: document.createElement('div'), setProgress: (p) => void log.push(`splash:${p}`), destroy: () => undefined }),
    homeScreen: (view, cb) => {
      ui.home = { view, cb };
      log.push('screen:home');
      return { el: document.createElement('main'), update: (v) => void (ui.home = { view: v, cb }), destroy: () => undefined };
    },
    gameScreen: (view) => {
      log.push(`screen:game:${view.board.puzzleId}`);
      return {
        el: document.createElement('section'),
        update: () => undefined,
        destroy: () => undefined,
        playEvent: () => undefined,
        playEntry: () => 0,
        cellRect: () => null,
        toolRect: () => null,
        boardRect: () => null,
        focusBoard: () => undefined,
        fishRect: () => null,
        showFishPill: () => undefined,
        fishLabel: () => undefined,
        glow: () => ({ done: Promise.resolve(), cancel: () => undefined, finish: () => undefined }),
      };
    },
    toastLayer: () => ({ el: document.createElement('div'), show: (m) => void log.push(`toast:${m}`), clear: () => undefined, destroy: () => undefined }),
    trapFocus: () => () => undefined,
    setInert: () => undefined,
  };
  return ui;
}

interface StartOpts {
  memory?: boolean;
  /** Boot with the real lazy sound recipes instead of the fake sfx. */
  realSfx?: boolean;
  /** Stands in for the lazy overlay chunk (default: the real one); gets boot's log. */
  loadOverlays?: (log: string[]) => RouterFactories['loadOverlays'];
  levels?: Partial<LevelsRepo>;
  /** Adjusts the fake platform before boot (failures, storage hooks). */
  prepare?: (platform: FakePlatform) => void;
}

/** boot() without awaiting it, for tests that drive the fake clock while it runs. */
function begin(local: SaveData | null, opts: StartOpts = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const platform = createFakePlatform(log);
  platform.raw = { local, cloud: null, corrupt: false };
  if (opts.memory) platform.storage.status = () => 'memory';
  opts.prepare?.(platform);
  const ui = fakeUi(log);
  const fa = createFakeAudio(log);
  const done = boot(platform, root, {
    clock,
    doc: document,
    search: '',
    routerFactories: opts.loadOverlays ? { ...ui.factories, loadOverlays: opts.loadOverlays(log) } : ui.factories,
    levels: createFakeLevels(opts.levels),
    engine: createLoggedEngine(log),
    audio: fa.audio,
    ...(opts.realSfx ? {} : { sfx: fa.sfx }),
    announcer: { say: () => undefined, clear: () => undefined, destroy: () => undefined },
  });
  return { done, root, log, clock, platform, ui, muted: fa.muted };
}

async function start(local: SaveData | null, opts: StartOpts = {}) {
  const b = begin(local, opts);
  const app = await b.done;
  return { ...b, app };
}

/** Lets boot's promise chains run until they wait on the fake clock (real macrotask turns). */
async function settle(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

const returning = (patch: Partial<SaveData> = {}): SaveData => ({
  ...defaults(NOW - 3 * 86_400_000),
  tutorialDone: true,
  sessions: 4,
  progress: { level: 25, completed: 24, best: {} },
  ...patch,
});

describe('boot', () => {
  it('first run: init first, progress 100 before start, straight into the tutorial, ads preloaded last', async () => {
    const s = await start(null);
    const order = s.log.filter((x) => /^(platform:|progress:|screen:|preload:)/.test(x));
    expect(order).toEqual([
      'platform:init',
      'progress:10',
      'progress:40',
      'progress:100',
      'platform:start',
      'screen:game:T1',
      'preload:interstitial',
      'preload:rewarded',
    ]);
    expect(s.log).toContain('splash:100');
    expect(s.app.store.get().save.sessions).toBe(1);
    expect(s.app.store.get().session?.mode).toBe('tutorial');
    expect(s.log).toContain('open:coach');
    s.app.dispose();
  });

  it('returning player: Home, sessions + 1 saved with touch', async () => {
    const s = await start(returning());
    expect(s.log).toContain('screen:home');
    expect(s.ui.home?.view).toMatchObject({ level: 25, continueLevel: false });
    expect(s.app.store.get().save.sessions).toBe(5);
    await s.clock.advanceAsync(400);
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['debounced']);
    expect(s.platform.writes[0]?.data.sessions).toBe(5);
    s.app.dispose();
  });

  it('restore rules at launch: a stale daily slot is cleared, a valid level slot is kept', async () => {
    const cells = new Uint8Array(25);
    cells[3] = 1;
    const slot = (id: `L${number}` | `D${string}`, mode: 'level' | 'daily') => ({
      id,
      mode,
      cells: encodeCells(cells),
      hearts: 3,
      revivesUsed: 0,
      mistakes: 0,
      hintsUsed: 0,
      kittiesUsed: 0,
      elapsedMs: 1000,
      savedAt: NOW - 86_400_000,
    });
    const s = await start(returning({ inProgress: { level: slot('L25', 'level'), daily: slot('D2026-10-06', 'daily'), event: null } }));
    const save = s.app.store.get().save;
    expect(save.inProgress.daily).toBeNull();
    expect(save.inProgress.level?.id).toBe('L25');
    expect(s.ui.home?.view.continueLevel).toBe(true);
    s.app.dispose();
  });

  it('Home: Play continues the level; the locked daily card toasts', async () => {
    const s = await start(returning({ progress: { level: 12, completed: 11, best: {} } }));
    s.ui.home?.cb.onDaily();
    expect(s.log).toContain(`toast:${t('home.daily.lockedToast', { level: 20 })}`);
    s.ui.home?.cb.onPlay();
    await s.clock.advanceAsync(0);
    expect(s.log).toContain('screen:game:L12');
    s.app.dispose();
  });

  it('Home: the daily starts; a solved daily reopens O7 instead', async () => {
    const s = await start(returning());
    s.ui.home?.cb.onDaily();
    await s.clock.advanceAsync(0);
    expect(s.log).toContain(`screen:game:D${TODAY}`);
    const solved = await start(returning({ daily: { [TODAY]: [61_000, 0, 1, 0] } }));
    solved.ui.home?.cb.onDaily();
    expect(solved.log).toContain('open:daily_result');
    expect(solved.ui.overlays.get('daily_result')?.props).toMatchObject({ dateKey: TODAY, ms: 61_000, hints: 1 });
    s.app.dispose();
    solved.app.dispose();
  });

  it('Settings: a change is applied at once (sound mute) and saved with touch', async () => {
    const s = await start(returning());
    s.ui.home?.cb.onSettings();
    const props = s.ui.overlays.get('settings')?.props as { onChange(p: object): void; settings: { sound: boolean } };
    expect(props.settings.sound).toBe(true);
    s.platform.writes.length = 0;
    props.onChange({ sound: false });
    expect(s.muted.has('setting')).toBe(true);
    expect(s.app.store.get().save.settings.sound).toBe(false);
    await s.clock.advanceAsync(400);
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['debounced']);
    expect((s.ui.overlays.get('settings')?.props as { settings: { sound: boolean } }).settings.sound).toBe(false);
    s.app.dispose();
  });

  it('a memory-only storage shows the one-time toast', async () => {
    const s = await start(returning(), { memory: true });
    expect(s.log).toContain(`toast:${t('toast.storageMemory')}`);
    expect(s.app.store.get().ui.storage).toBe('memory');
    s.app.dispose();
  });

  it('page hide pauses and saves now; FB onPause too; no flush', async () => {
    const s = await start(returning());
    s.ui.home?.cb.onPlay();
    await s.clock.advanceAsync(250);
    s.platform.writes.length = 0;
    s.platform.pauseCb?.();
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['now']);
    expect(s.app.store.get().ui.paused).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(s.app.store.get().ui.paused).toBe(false);
    s.app.dispose();
  });
});

describe('boot: lazy chunks (RP-2, 04 §9)', () => {
  const logged = (log: string[]): RouterFactories['loadOverlays'] => () => {
    log.push('chunk:overlays');
    return Promise.resolve({});
  };
  const order = (log: string[]): string[] => log.filter((x) => /^(chunk:|progress:100|platform:start|screen:)/.test(x));

  it('first run: the overlay chunk (it holds the coach) is fetched behind the loading screen', async () => {
    const s = await start(null, { loadOverlays: logged });
    expect(order(s.log)).toEqual(['chunk:overlays', 'progress:100', 'platform:start', 'screen:game:T1']);
    s.app.dispose();
  });

  it('first run: a chunk that never arrives holds the start no longer than boot.overlayTimeoutMs', async () => {
    const b = begin(null, { loadOverlays: (log) => () => (log.push('chunk:overlays'), new Promise(() => undefined)) });
    await settle();
    expect(b.log).toContain('chunk:overlays');
    expect(b.log).not.toContain('platform:start');
    await b.clock.advanceAsync(cfg.boot.overlayTimeoutMs);
    await settle();
    expect(order(b.log)).toEqual(['chunk:overlays', 'progress:100', 'platform:start', 'screen:game:T1']); // its coach opens when the chunk lands
    (await b.done).dispose();
  });

  it('returning player: the overlay chunk waits until after the first route', async () => {
    const s = await start(returning(), { loadOverlays: logged });
    expect(order(s.log)).toEqual(['progress:100', 'platform:start', 'screen:home', 'chunk:overlays']);
    s.app.dispose();
  });

  it('the sound recipes chunk is fetched through the retrying loader right after the first screen', async () => {
    vi.mocked(loadChunk).mockClear();
    const s = await start(returning(), { realSfx: true });
    await settle();
    const calls = vi.mocked(loadChunk).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // One of the loaders is the sound recipes module (the overlay chunk may be another).
    const mods = await Promise.all(calls.map(([load]) => load() as Promise<Record<string, unknown>>));
    expect(mods.some((m) => typeof m['createSfx'] === 'function')).toBe(true);
    s.app.dispose();
  });
});

describe('boot: bounded waits and start-up failures (RP-1, PLAT-8)', () => {
  it('a level pack that never arrives holds neither platform.start nor Home longer than boot.packTimeoutMs', async () => {
    const b = begin(returning({ progress: { level: 310, completed: 309, best: {} } }), {
      levels: { ensurePackFor: () => new Promise<void>(() => undefined) },
    });
    await settle();
    await b.clock.advanceAsync(cfg.boot.packTimeoutMs - 1);
    await settle();
    expect(b.log).not.toContain('platform:start');
    await b.clock.advanceAsync(1);
    const app = await b.done;
    expect(b.log).toContain('platform:start');
    expect(b.log).toContain('screen:home');
    app.dispose();
  });

  it('retries platform.start() once after boot.platformRetryDelayMs', async () => {
    let fails = 1;
    const b = begin(returning(), {
      prepare: (p) => {
        const real = p.start;
        p.start = () => (fails-- > 0 ? Promise.reject({ code: 'INVALID_OPERATION', message: 'x' }) : real());
      },
    });
    await settle();
    expect(b.log).not.toContain('platform:start');
    await b.clock.advanceAsync(cfg.boot.platformRetryDelayMs);
    const app = await b.done;
    expect(b.log.filter((x) => x === 'platform:start')).toHaveLength(1);
    expect(b.log).toContain('screen:home');
    app.dispose();
  });

  it('retries platform.init() once, then rejects so main.ts can show the honest error', async () => {
    let inits = 0;
    const b = begin(returning(), {
      prepare: (p) => {
        p.init = () => {
          inits++;
          return Promise.reject(new Error('FBInstant SDK is not loaded'));
        };
      },
    });
    const outcome = b.done.then(
      () => 'resolved',
      () => 'rejected',
    );
    await settle();
    await b.clock.advanceAsync(cfg.boot.platformRetryDelayMs);
    expect(await outcome).toBe('rejected');
    expect(inits).toBe(2);
  });

  it('the boot-failure screen says the game could not start and offers a retry, never "keep playing"', () => {
    document.body.innerHTML = '<div id="app"><p>old</p></div>';
    const root = document.getElementById('app') as HTMLElement;
    let reloads = 0;
    showBootFailure(root, () => reloads++);
    expect(root.textContent).toContain(t('boot.failed'));
    expect(root.textContent).not.toContain(t('toast.error'));
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    const button = root.querySelector('button');
    expect(button?.textContent).toBe(t('boot.retry'));
    button?.click();
    expect(reloads).toBe(1);
  });
});

describe('boot: storage warnings (04 §6.2, RP-4 / PLAT-3)', () => {
  it('storage that turns memory-only mid-session shows the toast once and marks ui.storage', async () => {
    let fire: (() => void) | null = null;
    const s = await start(returning(), {
      prepare: (p) => {
        p.storage.onMemoryFallback = (cb) => void (fire = cb);
      },
    });
    expect(s.app.store.get().ui.storage).toBe('ok');
    expect(fire).not.toBeNull();
    fire!();
    fire!();
    expect(s.log.filter((x) => x === `toast:${t('toast.storageMemory')}`)).toHaveLength(1);
    expect(s.app.store.get().ui.storage).toBe('memory');
    s.app.dispose();
  });

  it('memory-only at launch: one toast even when the hook also fires at once', async () => {
    const s = await start(returning(), {
      memory: true,
      prepare: (p) => {
        p.storage.onMemoryFallback = (cb) => cb();
      },
    });
    expect(s.log.filter((x) => x === `toast:${t('toast.storageMemory')}`)).toHaveLength(1);
    s.app.dispose();
  });
});

describe('boot: save copies that arrive after launch (PLAT-1, RP-5)', () => {
  const hook = () => {
    const h: { cb: ((copy: ExternalSave) => void) | null; prepare: (p: FakePlatform) => void } = {
      cb: null,
      prepare: (p) => {
        p.storage.onExternalSave = (cb) => {
          h.cb = cb;
          return () => void (h.cb = null);
        };
      },
    };
    return h;
  };
  const cloudCopy = (): SaveData => ({
    ...returning(),
    updatedAt: NOW - 3_600_000,
    progress: { level: 40, completed: 39, best: { 12: [33_000, 0] } },
    stock: { hints: 9, kitties: 9 },
    settings: { ...defaults(NOW).settings, sound: false },
  });

  it('the late FB cloud copy is merged (it wins stock and settings), applied, and saved once', async () => {
    const h = hook();
    const s = await start(returning({ progress: { level: 5, completed: 4, best: {} } }), { prepare: h.prepare });
    await s.clock.advanceAsync(400);
    s.platform.writes.length = 0;
    h.cb?.({ source: 'cloud', value: cloudCopy() });
    const save = s.app.store.get().save;
    expect(save.progress.level).toBe(40);
    expect(save.stock).toEqual({ hints: 9, kitties: 9 });
    expect(save.settings.sound).toBe(false);
    expect(s.muted.has('setting')).toBe(true);
    expect(s.ui.home?.view).toMatchObject({ level: 40 });
    await s.clock.advanceAsync(400);
    expect(s.platform.writes.map((w) => [w.cloud, w.data.progress.level])).toEqual([['debounced', 40]]);
    s.app.dispose();
    expect(h.cb).toBeNull();
  });

  it('a cloud copy that arrived during launch sends a returning player Home, not into the tutorial', async () => {
    const s = await start(null, {
      prepare: (p) => {
        p.storage.onExternalSave = (cb) => {
          cb({ source: 'cloud', value: cloudCopy() }); // delivered at subscription, before routing
          return () => undefined;
        };
      },
    });
    expect(s.log).toContain('screen:home');
    expect(s.log).not.toContain('screen:game:T1');
    expect(s.app.store.get().save.progress.level).toBe(40);
    s.app.dispose();
  });

  it("another tab's newer save is merged into the store (progress never goes backwards) and not written back", async () => {
    const h = hook();
    const s = await start(returning({ progress: { level: 5, completed: 4, best: {} } }), { prepare: h.prepare });
    await s.clock.advanceAsync(400);
    s.platform.writes.length = 0;
    const other: SaveData = { ...returning(), updatedAt: NOW + 5_000, progress: { level: 6, completed: 5, best: { 5: [2_246, 0] } } };
    h.cb?.({ source: 'tab', value: other });
    expect(s.app.store.get().save.progress).toEqual({ level: 6, completed: 5, best: { 5: [2_246, 0] } });
    await s.clock.advanceAsync(10_000);
    expect(s.platform.writes).toEqual([]);
    // The tab's own next write (page hide) carries the merged progress.
    s.platform.pauseCb?.();
    expect(s.platform.writes.at(-1)?.data.progress.level).toBe(6);
    s.app.dispose();
  });
});
