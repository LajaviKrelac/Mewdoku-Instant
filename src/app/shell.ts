// Owner: app
// Home and the shared modals (02 §4–5, §12, §14): S1 Home with its callbacks, O5 Settings (applied at
// once, saved with 'touch'), O6 How to play (skip / replay tutorial), O7 reopened from a solved daily
// card, and the stale-daily rule applied whenever Home is shown.
import type { AudioEngine } from '../audio/audio-engine';
import { dailyCardState, dateKeyOf, localDateKey, localMidnightAfter, msUntilLocalMidnight } from '../game/progression';
import type { SaveDataV1, Settings } from '../game/types';
import type { PlatformAdapter } from '../platform/types';
import oflUrl from '../assets/fonts/OFL.txt?url';
import { t } from '../i18n';
import type { View } from '../ui/dom';
import type { HomeView } from '../ui/screens/home-screen';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';
import type { AppBus } from './events';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import type { Session } from './session';
import { withSlot } from './session-parts';
import type { AppState, Store } from './store';
import { selectHomeView, type ViewContext } from './views';

export interface ShellDeps {
  readonly store: Store<AppState>;
  readonly bus: AppBus;
  readonly clock: Clock;
  readonly router: Router;
  readonly platform: Pick<PlatformAdapter, 'id' | 'capabilities'>;
  readonly saves: SaveScheduler;
  /** Lazy: the session is created after the shell (it calls shell.showHome). */
  session(): Session;
  readonly audio: Pick<AudioEngine, 'setMuted'>;
  /** Resolves settings.reduceMotion against the system preference and applies it to the app root. */
  applyReducedMotion(setting: Settings['reduceMotion']): boolean;
  /** __APP_VERSION__ for About. */
  readonly version: string;
  /** Font licence link in About (default: the bundled OFL.txt). */
  readonly fontLicenceUrl?: string;
  readonly config?: GameConfig;
}

export interface Shell {
  showHome(): void;
  openSettings(): void;
  openHowToPlay(): void;
  /** Sound mute + reduced motion from save.settings (boot, and after every change). */
  applySettings(): void;
  dispose(): void;
}

/** 02 §12: a daily slot for a date before today is cleared (Home shown, or at launch). */
export function clearStaleDaily(save: SaveDataV1, today: string): SaveDataV1 {
  const slot = save.inProgress.daily;
  if (!slot) return save;
  const date = dateKeyOf(slot.id);
  return date !== null && date >= today ? save : withSlot(save, 'daily', null);
}

export function createShell(deps: ShellDeps): Shell {
  const c = deps.config ?? cfg;
  const { store, router, clock, saves } = deps;
  const save = (): SaveDataV1 => store.get().save;
  const updateSave = (fn: (s: SaveDataV1) => SaveDataV1): void =>
    store.update((s) => {
      const next = fn(s.save);
      return next === s.save ? s : { ...s, save: next };
    });
  const ctx = (): ViewContext => ({ now: clock.now(), capabilities: deps.platform.capabilities(), platformId: deps.platform.id });

  let home: View<HomeView> | null = null;
  let unbindHome: (() => void) | null = null;

  const releaseHome = (): void => {
    unbindHome?.();
    unbindHome = null;
    home = null;
  };
  const offScreen = deps.bus.on('screen', ({ screen }) => {
    if (screen !== 'home') releaseHome();
  });

  function openSolvedDaily(today: string): void {
    const rec = save().daily[today];
    if (!rec) return;
    const now = clock.now();
    router.open('daily_result', {
      dateKey: today,
      ms: rec[0],
      mistakes: rec[1],
      hints: rec[2],
      kitties: rec[3],
      nextPuzzleAt: localMidnightAfter(today) ?? now + msUntilLocalMidnight(now),
      now: () => clock.now(),
      onDone: () => router.close('daily_result'), // reopened from Home: no transition, no gate
    });
  }

  function settingsProps() {
    return {
      settings: save().settings,
      showVibration: deps.platform.capabilities().haptics,
      version: deps.version,
      fontLicenceUrl: deps.fontLicenceUrl ?? oflUrl,
      onChange: (patch: Partial<Settings>) => {
        updateSave((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
        saves.touch();
        shell.applySettings();
        router.update('settings', settingsProps());
      },
      onHowToPlay: () => shell.openHowToPlay(),
      onClose: () => router.close('settings'),
    };
  }

  const shell: Shell = {
    showHome() {
      const today = localDateKey(clock.now());
      const cleaned = clearStaleDaily(save(), today);
      if (cleaned !== save()) {
        updateSave(() => cleaned);
        saves.touch();
      }
      releaseHome();
      store.update((s) => ({ ...s, screen: 'home', game: null, session: null }));
      home = router.showHome(selectHomeView(store.get(), ctx(), c), {
        onPlay: () => {
          const s = save();
          void deps.session().start(s.tutorialDone ? { mode: 'level', level: s.progress.level } : { mode: 'tutorial', replay: false });
        },
        onDaily: () => {
          const day = localDateKey(clock.now());
          const state = dailyCardState(save(), day, c);
          if (state === 'locked') router.toast(t('home.daily.lockedToast', { level: c.daily.unlockAfterLevel }));
          else if (state === 'solved') openSolvedDaily(day);
          else void deps.session().start({ mode: 'daily', dateKey: day });
        },
        onSettings: () => shell.openSettings(),
        onTrophy: () => undefined, // Phase 4 (leaderboards); hidden while unsupported
        onCard: () => undefined, // Phase 3 hook
      });
      const view = home;
      unbindHome = store.select(
        (s) => s.save,
        () => view.update(selectHomeView(store.get(), ctx(), c)),
      );
    },
    openSettings() {
      router.open('settings', settingsProps());
    },
    openHowToPlay() {
      const m = store.get().session;
      const done = save().tutorialDone;
      const firstRun = !!m && m.request.mode === 'tutorial' && !m.request.replay && !done;
      router.open('how_to_play', {
        showSkip: firstRun,
        showReplay: done,
        onSkip: () => {
          router.closeAll();
          deps.session().onSkipTutorial();
        },
        onReplay: () => {
          router.closeAll();
          const session = deps.session();
          if (store.get().game) session.saveNow(); // leaving a level or daily keeps its board (02 §4.2)
          void session.start({ mode: 'tutorial', replay: true });
        },
        onClose: () => router.close('how_to_play'),
      });
    },
    applySettings() {
      const settings = save().settings;
      try {
        deps.audio.setMuted('setting', !settings.sound);
      } catch {
        // audio unavailable
      }
      let reduced = store.get().ui.reducedMotion;
      try {
        reduced = deps.applyReducedMotion(settings.reduceMotion);
      } catch {
        // keep the previous value
      }
      store.update((s) => (s.ui.reducedMotion === reduced ? s : { ...s, ui: { ...s.ui, reducedMotion: reduced } }));
    },
    dispose() {
      offScreen();
      releaseHome();
    },
  };
  return shell;
}
