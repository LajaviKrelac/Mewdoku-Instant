// Owner: C (Phase 2b; was app)
// Home and the shared modals (02 §4–5, §12, §14): S1 Home with its callbacks, O5 Settings (applied at
// once, saved with 'touch'), O6 How to play (skip / replay tutorial), O7 reopened from a solved daily
// card, and the stale-daily rule applied whenever Home is shown.
// Phase 2b: the Home fish pill "+" (shop, §8.5), the event card and the event screen (§4.4, lazy
// `events` chunk), the trophy's rankings hub (§5.5), the Settings Language / Shop / Remove ads rows
// (§6.8, §8.5), and the banner rules on Home and the event screen (§3.2: shown after the screen
// mounts, hidden before it goes and while a modal is open).
import type { AudioEngine } from '../audio/audio-engine';
import type { EventDef } from '../game/events';
import { dailyCardState, dateKeyOf, localDateKey, localMidnightAfter, msUntilLocalMidnight } from '../game/progression';
import type { LocaleId, SaveData, Settings } from '../game/types';
import type { PlatformAdapter } from '../platform/types';
import oflUrl from '../assets/fonts/OFL.txt?url';
import { buildLocales, t } from '../i18n';
import type { View } from '../ui/dom';
import type { SettingsProps } from '../ui/overlays/settings-modal';
import type { EventScreenView } from '../ui/screens/event-screen';
import type { HomeView } from '../ui/screens/home-screen';
import type { BannerFlow } from './banner-flow';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';
import type { EventFlow } from './event-flow';
import type { AppBus } from './events';
import { isFlagOn } from './flags';
import type { RankHubFlow } from './rank-hub-flow';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import type { Session } from './session';
import { withSlot } from './session-parts';
import type { ShopFlow } from './shop-flow';
import { shallowEqual, type AppState, type OverlayId, type Store } from './store';
import { selectEventView, selectHomeView, type ViewContext } from './views';

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
  // ── phase2b (optional: absent = the feature is off) ──
  readonly events?: EventFlow;
  readonly shop?: ShopFlow;
  readonly banners?: BannerFlow;
  readonly rankHub?: RankHubFlow;
  /** Board size of a shipped level when known (personal records). */
  levelSize?(level: number): number | null;
  /** Settings → Language: applies the new override (boot resolves and loads the locale). */
  applyLocale?(override: 'auto' | LocaleId): void;
}

export interface Shell {
  showHome(): void;
  /** The event screen of `def` (or of the running event); stays put with a toast when it cannot load. */
  showEvent(def?: EventDef | null): Promise<void>;
  openShop(): void;
  /** phase2b §6.3: the locale changed: re-render Home or the event screen in place, refresh Settings. */
  refreshLocale(): void;
  openSettings(): void;
  openHowToPlay(): void;
  /** Sound mute + reduced motion from save.settings (boot, and after every change). */
  applySettings(): void;
  dispose(): void;
}

/** 02 §12: a daily slot for a date before today is cleared (Home shown, or at launch). */
export function clearStaleDaily(save: SaveData, today: string): SaveData {
  const slot = save.inProgress.daily;
  if (!slot) return save;
  const date = dateKeyOf(slot.id);
  return date !== null && date >= today ? save : withSlot(save, 'daily', null);
}

export function createShell(deps: ShellDeps): Shell {
  const c = deps.config ?? cfg;
  const { store, router, clock, saves } = deps;
  const save = (): SaveData => store.get().save;
  const updateSave = (fn: (s: SaveData) => SaveData): void =>
    store.update((s) => {
      const next = fn(s.save);
      return next === s.save ? s : { ...s, save: next };
    });
  const ctx = (): ViewContext => ({
    now: clock.now(),
    capabilities: deps.platform.capabilities(),
    platformId: deps.platform.id,
    ...(deps.events ? { events: deps.events.defs() } : {}),
    ...(deps.levelSize ? { levelSize: deps.levelSize } : {}),
  });

  let home: View<HomeView> | null = null;
  let unbindHome: (() => void) | null = null;
  let eventScreen: View<EventScreenView> | null = null;
  let unbindEvent: (() => void) | null = null;
  let eventShown: EventDef | null = null;
  let navGen = 0;

  const releaseHome = (): void => {
    unbindHome?.();
    unbindHome = null;
    home = null;
  };
  const releaseEvent = (): void => {
    unbindEvent?.();
    unbindEvent = null;
    eventScreen = null;
    eventShown = null;
  };
  const offScreen = deps.bus.on('screen', ({ screen }) => {
    if (screen !== 'home') releaseHome();
    if (screen !== 'event') releaseEvent();
    deps.banners?.screenGone(); // §3.2: the reserve belongs to the screen that set it
  });
  /** §3.2: a banner screen (Home, event) under a modal hides its banner; on close it may show again. */
  const MODALS: readonly OverlayId[] = ['settings', 'how_to_play', 'shop', 'rank_hub', 'ranking', 'group_result', 'daily_result'];
  const bannerScreen = (): boolean => router.screen() === 'home' || router.screen() === 'event';
  const offOpen = deps.bus.on('overlay:open', ({ id }) => {
    if (MODALS.includes(id) && bannerScreen()) void deps.banners?.hide().catch(() => undefined);
  });
  const offClose = deps.bus.on('overlay:close', ({ id }) => {
    if (MODALS.includes(id) && bannerScreen() && !router.stack().some((o) => MODALS.includes(o))) void deps.banners?.modalClosed().catch(() => undefined);
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

  function settingsProps(): SettingsProps {
    const s = save();
    const locales = buildLocales();
    const shop = deps.shop && isFlagOn('shop') ? deps.shop : null;
    const buy = shop?.buyState();
    return {
      settings: s.settings,
      showVibration: deps.platform.capabilities().haptics,
      version: deps.version,
      fontLicenceUrl: deps.fontLicenceUrl ?? oflUrl,
      onChange: (patch: Partial<Settings>) => {
        updateSave((sv) => ({ ...sv, settings: { ...sv.settings, ...patch } }));
        saves.touch();
        shell.applySettings();
        router.update('settings', settingsProps());
      },
      onHowToPlay: () => shell.openHowToPlay(),
      onClose: () => router.close('settings'),
      // §6.8: the Language row lists the locales this build contains (one alone needs no row).
      ...(deps.applyLocale && locales.length > 1
        ? {
            language: {
              current: s.settings.locale,
              locales,
              onPick: (id: 'auto' | LocaleId) => {
                updateSave((sv) => ({ ...sv, settings: { ...sv.settings, locale: id } }));
                saves.touch();
                deps.applyLocale?.(id);
                router.update('settings', settingsProps());
              },
            },
          }
        : {}),
      ...(shop ? { onShop: () => shell.openShop() } : {}),
      // §8.5: "Remove ads" only on FB with payments ready and No Ads not owned.
      ...(shop && buy?.kind === 'ready' && !s.purchases.noAds ? { onRemoveAds: () => shell.openShop() } : {}),
    };
  }

  function bindEventScreen(view: View<EventScreenView>, def: EventDef): void {
    eventScreen = view;
    eventShown = def;
    unbindEvent = store.select(
      (s) => [s.save, s.ui.bannerReserved, s.ui.reducedMotion] as const,
      () => {
        const v = selectEventView(store.get(), ctx(), def);
        if (v && eventScreen === view) view.update(v);
      },
      { equals: shallowEqual },
    );
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
      navGen++;
      void deps.banners?.hide().catch(() => undefined);
      deps.events?.clearEnded();
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
        // §5.5: the trophy shows only when capabilities().leaderboards.
        onTrophy: () => deps.rankHub?.open(),
        onCard: () => undefined, // Phase 3 hook
        onShop: () => shell.openShop(),
        onEvent: () => {
          const card = selectHomeView(store.get(), ctx(), c).event;
          if (!card || card.state === 'teaser') return;
          if (card.state === 'locked') router.toast(t('event.card.locked', { level: card.unlockLevel }));
          else void shell.showEvent(card.def);
        },
      });
      const view = home;
      unbindHome = store.select(
        (s) => [s.save, s.ui.bannerReserved, s.ui.reducedMotion] as const,
        () => view.update(selectHomeView(store.get(), ctx(), c)),
        { equals: shallowEqual },
      );
      // §3.2 (after the screen mounted) and §11 (the events chunk is prefetched after Home shows).
      void deps.banners?.screenShown('home').catch(() => undefined);
      const card = selectHomeView(store.get(), ctx(), c).event;
      if (card) void deps.events?.preload();
    },
    async showEvent(def) {
      const ev = def ?? deps.events?.active() ?? null;
      if (!ev) return shell.showHome();
      const view = selectEventView(store.get(), ctx(), ev);
      if (!view) return shell.showHome();
      const mine = ++navGen;
      void deps.banners?.hide().catch(() => undefined);
      const screen = await router.showEvent(view, {
        onPlay: () => {
          const v = selectEventView(store.get(), ctx(), ev);
          if (v && v.nextIndex !== null) void deps.session().start({ mode: 'event', eventId: ev.id, index: v.nextIndex });
        },
        onTopList: () => deps.rankHub?.openEventTopList(ev),
        onHome: () => shell.showHome(),
        onSettings: () => shell.openSettings(),
      });
      if (!screen) {
        if (mine === navGen) router.toast(t('toast.error'));
        return;
      }
      store.update((s) => ({ ...s, screen: 'event', game: null, session: null }));
      bindEventScreen(screen, ev);
      // The reserve may have changed while the screen was built: render once with the latest state.
      const fresh = selectEventView(store.get(), ctx(), ev);
      if (fresh) screen.update(fresh);
      void deps.banners?.screenShown('event').catch(() => undefined);
    },
    openShop() {
      deps.shop?.open();
    },
    refreshLocale() {
      const scr = router.screen();
      if (scr === 'home' && home && router.stack().length === 0) shell.showHome();
      else if (scr === 'event' && eventShown && router.stack().length === 0) void shell.showEvent(eventShown);
      else if (scr === 'home' && home) home.update(selectHomeView(store.get(), ctx(), c));
      if (router.isOpen('settings')) router.update('settings', settingsProps());
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
      offOpen();
      offClose();
      releaseHome();
      releaseEvent();
      deps.shop?.dispose();
    },
  };
  return shell;
}
