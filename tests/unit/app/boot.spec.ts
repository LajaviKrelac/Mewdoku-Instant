// @vitest-environment jsdom
// Owner: app. Boot sequence (04 §5.1) and the Home shell (02 §4.2, §12, §14) with a fake platform and
// fake UI factories: init first, progress 100 before start, merge + sessions+1, restore rules, route
// (tutorial on first run, Home otherwise), ads preloaded last.
import { describe, expect, it } from 'vitest';
import { boot } from '../../../src/app/boot';
import { createFakeClock } from '../../../src/app/clock';
import type { OverlayFactories, RouterFactories } from '../../../src/app/router';
import type { OverlayId } from '../../../src/app/store';
import { defaults, encodeCells } from '../../../src/game/save';
import type { SaveDataV1 } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import type { HomeCallbacks, HomeView } from '../../../src/ui/screens/home-screen';
import { createFakeAudio, createFakeLevels, createFakePlatform, createLoggedEngine, NOW, TODAY } from './harness';

interface Ui {
  home: { view: HomeView; cb: HomeCallbacks } | null;
  overlays: Map<OverlayId, { props: unknown }>;
  factories: Partial<RouterFactories>;
}

function fakeUi(log: string[]): Ui {
  const ui: Ui = { home: null, overlays: new Map(), factories: {} };
  const ids: OverlayId[] = ['hint', 'rewarded', 'win', 'fail', 'settings', 'how_to_play', 'daily_result', 'coach'];
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
        playEntry: () => undefined,
        cellRect: () => null,
        toolRect: () => null,
        boardRect: () => null,
        focusBoard: () => undefined,
      };
    },
    toastLayer: () => ({ el: document.createElement('div'), show: (m) => void log.push(`toast:${m}`), clear: () => undefined, destroy: () => undefined }),
    trapFocus: () => () => undefined,
    setInert: () => undefined,
  };
  return ui;
}

async function start(local: SaveDataV1 | null, opts: { memory?: boolean } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const platform = createFakePlatform(log);
  platform.raw = { local, cloud: null, corrupt: false };
  if (opts.memory) platform.storage.status = () => 'memory';
  const ui = fakeUi(log);
  const fa = createFakeAudio(log);
  const app = await boot(platform, root, {
    clock,
    doc: document,
    search: '',
    routerFactories: ui.factories,
    levels: createFakeLevels(),
    engine: createLoggedEngine(log),
    audio: fa.audio,
    sfx: fa.sfx,
    announcer: { say: () => undefined, clear: () => undefined, destroy: () => undefined },
  });
  return { app, log, clock, platform, ui, muted: fa.muted };
}

const returning = (patch: Partial<SaveDataV1> = {}): SaveDataV1 => ({
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
    const s = await start(returning({ inProgress: { level: slot('L25', 'level'), daily: slot('D2026-10-06', 'daily') } }));
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
