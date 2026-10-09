// Owner: B. Dev harness for phase2b workstream B (not shipped): /dev/b-harness.html?view=<name>.
// Run `npx vite --port 5182 --strictPort` and open the index (no view) for the list.
// Options: &rm=1 (reduced motion), &fb=1 (FB safe zone), &banner=1 (banner reserve), &n=<size>.
// The `win` view plays the phase2b §2.2 timeline the way C's win flow drives it (glow, fish pill, three
// fish, labels, scrim, ranking panel, victory screen), so frames can be captured at any t.
// A tiny router stand-in mounts overlays above the screen, traps focus for modal ones, makes the
// screen inert and sends Esc to dismiss(). Callbacks show a toast with their name.
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
import '../src/styles/art.css';
import '../src/styles/screens.css';
import eventsJson from '../src/data/events/events.json';
import { cfg } from '../src/app/config';
import type { EventDef } from '../src/game/events';
import { CellState } from '../src/game/types';
import { setInert, trapFocus } from '../src/ui/a11y/focus-trap';
import { mountSprite } from '../src/ui/art/sprite';
import type { OverlayView } from '../src/ui/dom';
import { ensureFxLayer, fishSizePx, fishSourceRows, flyFish } from '../src/ui/fx/fish-flight';
import { applyMotion } from '../src/ui/fx/motion';
import { playScreenTransition } from '../src/ui/fx/transitions';
import { createGroupResult, type GroupResultOutcome } from '../src/ui/overlays/group-result';
import { createRankHub, type RankHubTab } from '../src/ui/overlays/rank-hub';
import { createRankingPanel, type RankingListState, type RankingPanelProps } from '../src/ui/overlays/ranking-panel';
import { createRewardedPrompt } from '../src/ui/overlays/rewarded-prompt';
import { createSettingsModal, type SettingsProps } from '../src/ui/overlays/settings-modal';
import { createShopSheet, type ShopBuyState } from '../src/ui/overlays/shop-sheet';
import { createToastLayer } from '../src/ui/overlays/toast';
import { createVictoryScreen, type VictoryProps } from '../src/ui/overlays/victory-screen';
import { createEventScreen, type EventScreenView } from '../src/ui/screens/event-screen';
import { createGameScreen, type GameScreen, type GameView } from '../src/ui/screens/game-screen';
import { createHomeScreen, type HomeEventCardView, type HomeView } from '../src/ui/screens/home-screen';
import { eventArt } from '../src/ui/art/event-art';
import { gameView, homeView, midGame, solved } from './shell-fixtures';

const LOADED_AT = performance.now();
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'index';
const reduced = q.get('rm') === '1';
const fb = q.get('fb') === '1';
const banner = q.get('banner') === '1';

mountSprite();
const app = document.getElementById('app') as HTMLElement;
applyMotion(app, reduced);
const toasts = createToastLayer();
document.body.appendChild(toasts.el);
const log = (name: string) => (): void => {
  console.info(`[b-harness] ${name}`);
  toasts.show(name, { durationMs: 1200 });
};

const EVENTS = eventsJson as unknown as EventDef[];
const lantern = EVENTS[0] as EventDef;
const NOW = Date.UTC(2026, 10, 18, 12); // inside Lantern Walk (13 → 27 Nov)
const DAY = 86_400_000;

let screenEl: HTMLElement | null = null;
let top: OverlayView<never> | null = null;
let releaseTrap: (() => void) | null = null;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && top) top.dismiss();
});

function mountScreen(el: HTMLElement): void {
  screenEl = el;
  app.appendChild(el);
}

function openOverlay<P>(ov: OverlayView<P>, props: P): void {
  app.appendChild(ov.el);
  ov.open(props);
  top = ov as unknown as OverlayView<never>;
  if (ov.modal && screenEl) {
    setInert([screenEl], true);
    releaseTrap?.();
    releaseTrap = trapFocus(ov.el, { initialFocus: ov.el.querySelector<HTMLElement>('[data-autofocus]:not([hidden])') });
  }
}

function closeOverlay<P>(ov: OverlayView<P>): void {
  ov.close();
  releaseTrap?.();
  releaseTrap = null;
  if (screenEl) setInert([screenEl], false);
}

const gameCallbacks = {
  onTap: log('onTap'),
  onDoubleTap: log('onDoubleTap'),
  onPaint: log('onPaint'),
  onBulb: log('onBulb'),
  onPaw: log('onPaw'),
  onHome: log('onHome'),
  onSettings: log('onSettings'),
};

function game(v: GameView): GameScreen {
  const g = createGameScreen(v, gameCallbacks);
  mountScreen(g.el);
  g.playEntry();
  return g;
}

const homeCallbacks = {
  onPlay: log('onPlay'),
  onDaily: log('onDaily'),
  onSettings: log('onSettings'),
  onTrophy: log('onTrophy'),
  onCard: log('onCard'),
  onShop: log('onShop'),
  onEvent: log('onEvent'),
};

function eventCard(state: HomeEventCardView['state'], over: Partial<HomeEventCardView> = {}): HomeEventCardView {
  return {
    def: lantern,
    state,
    now: NOW,
    startsAt: Date.parse(lantern.startUtc),
    endsAt: Date.parse(lantern.endUtc),
    solved: 7,
    total: 21,
    unlockLevel: 10,
    endsSoon: false,
    art: eventArt,
    ...over,
  };
}

function home(over: Partial<HomeView> = {}): void {
  mountScreen(createHomeScreen(homeView({ fbSafeZone: fb, bannerReserved: banner, ...over }), homeCallbacks).el);
}

// ─────────────────────────────── ranking / victory fixtures ───────────────────────────────

function rankingProps(list: RankingListState, over: Partial<RankingPanelProps> = {}): RankingPanelProps {
  return {
    board: 'points',
    eventNameKey: null,
    result: { kind: 'level', pointsEarned: 55, ms: 134_000 },
    list,
    tapMinMs: reduced ? cfg.fx.win.reduced.tapMinMs : cfg.rank.panelTapMinMs,
    reducedMotion: reduced,
    onContinue: log('onContinue'),
    onSeeTop: log('onSeeTop'),
    onListArea: (r) => console.info('[b-harness] onListArea', JSON.stringify(r)),
    ...over,
  };
}

const RECORDS: RankingListState = {
  kind: 'records',
  reason: 'local',
  records: { board: 'points', thisMs: 134_000, n: 8, bestSizeMs: 118_000, totalPoints: 1240, levelsSolved: 37, event: null },
};

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 1,
    level: 37,
    nextLevel: 38,
    fish: { earned: 3, total: 128 },
    bonus: null,
    pointsEarned: 55,
    daily: null,
    event: null,
    buttonDelayMs: cfg.fx.winButtonDelayMs,
    reducedMotion: reduced,
    bannerReserved: banner,
    now: () => Date.now(),
    onPrimary: log('onPrimary'),
    onHome: log('onHome'),
    onShop: log('onShop'),
    ...over,
  };
}

// ─────────────────────────────── the win flow (phase2b §2.2) ───────────────────────────────

/** Plays §2.2 on timers, as C's win flow does: t = 0 is the WON event. */
function winFlow(level: number, opts: { bonus: number; tutorial: boolean }): void {
  const b = solved(level);
  const g = game(gameView(b, { status: 'won', inputLocked: true, fbSafeZone: fb, reducedMotion: reduced, chromeLocked: true }));
  const n = b.puzzle.n;
  const W = cfg.fx.win;
  const before = 125;
  const at = (ms: number, fn: () => void): void => void setTimeout(fn, ms);
  // The flow starts at a fixed 1 000 ms after load (the entry has ended by then), so a screenshot at
  // page time 1 000 + t shows the flow at t.
  const t0 = 1000 - Math.round(performance.now() - LOADED_AT);
  const cats = Array.from(b.cells.keys()).filter((i) => b.cells[i] === CellState.Cat);
  at(t0, () => {
    g.playEvent({ type: 'WON' } as never);
    if (reduced) {
      at(cfg.fx.winHappyDelayMs, () => {
        g.glow(cats);
        g.showFishPill(before + 3 + opts.bonus);
        g.fishLabel(`+${3 + opts.bonus}`);
      });
      at(W.reduced.rankingAtMs, () => openRanking());
      return;
    }
    at(cfg.fx.winHappyDelayMs, () => g.glow(cats));
    at(W.fishPillInAtMs, () => g.showFishPill(before));
    at(W.fishAtMs, () => {
      const rows = fishSourceRows(n);
      const rects = rows.map((r) => g.cellRect(r * n + (b.puzzle.solution[r] ?? 0))).filter((x): x is DOMRect => x !== null);
      const to = g.fishRect();
      if (!to) return;
      const slot = rects[0]?.width ?? 36;
      flyFish(ensureFxLayer(app), rects, to, {
        sizePx: fishSizePx(slot),
        reduced: false,
        onArrive: (k) => g.showFishPill(before + k + 1),
      });
    });
    at(2550, () => g.fishLabel('+3'));
    if (opts.bonus > 0) {
      at(W.bonusLabelAtMs, () => {
        g.fishLabel(`+${opts.bonus}`);
        g.showFishPill(before + 3 + opts.bonus);
      });
    }
    if (opts.tutorial) {
      at(W.tutorialVictoryAtMs, () => openVictory());
      return;
    }
    at(W.scrimAtMs, () => g.showScrim?.());
    at(cfg.fx.winOverlayDelayMs, () => openRanking());
  });

  const ranking = createRankingPanel();
  const victory = createVictoryScreen();
  function openRanking(): void {
    openOverlay(
      ranking,
      rankingProps(RECORDS, {
        onContinue: () => {
          setTimeout(() => {
            closeOverlay(ranking);
            openVictory();
          }, cfg.rank.panelOutMs);
        },
      }),
    );
  }
  function openVictory(): void {
    openOverlay(
      victory,
      victoryProps({
        level,
        nextLevel: level + 1,
        fish: { earned: 3 + opts.bonus, total: before + 3 + opts.bonus },
        bonus: opts.bonus ? { kind: 'hard', count: opts.bonus } : null,
        variant: opts.tutorial ? 'tutorial' : 'level',
        pointsEarned: opts.tutorial ? null : 55,
      }),
    );
  }
}

// ─────────────────────────────── views ───────────────────────────────

function settingsProps(over: Partial<SettingsProps> = {}): SettingsProps {
  let current: 'auto' | 'en' | 'es' | 'de' | 'ar' | 'ja' = 'auto';
  const modal = settingsModal;
  const p: SettingsProps = {
    settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
    showVibration: true,
    version: '0.2.0',
    onChange: log('onChange'),
    onHowToPlay: log('onHowToPlay'),
    onClose: log('onClose'),
    language: {
      current,
      locales: ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'id', 'tr', 'pl', 'ru', 'vi', 'th', 'ja', 'ko', 'zh-Hans', 'hi', 'ar'],
      onPick: (id) => {
        current = id as typeof current;
        modal.update({ ...p, language: { ...(p.language as NonNullable<SettingsProps['language']>), current: id } });
      },
    },
    onShop: log('onShop'),
    onRemoveAds: log('onRemoveAds'),
    ...over,
  };
  return p;
}
const settingsModal = createSettingsModal();

function shop(buy: ShopBuyState, fish = 128, busy = false): void {
  home({ fish });
  openOverlay(createShopSheet(), {
    fish,
    hintPrice: cfg.shop.hintFish,
    kittyPrice: cfg.shop.kittyFish,
    buy,
    busy,
    onSwap: log('onSwap'),
    onBuy: log('onBuy'),
    onRetry: log('onRetry'),
    onClose: log('onClose'),
  });
}

const PRODUCTS: ShopBuyState = {
  kind: 'ready',
  products: [
    { id: 'remove_ads', price: '$3.99', owned: false },
    { id: 'hints_15', price: '$1.99', owned: false },
    { id: 'kitties_8', price: '$1.99', owned: false },
    { id: 'fish_250', price: '$1.99', owned: false },
    { id: 'fish_900', price: '$4.99', owned: false },
  ],
};

function hub(tab: RankHubTab, list: RankingListState): void {
  home({ showTrophy: true });
  const h = createRankHub();
  const tabs: RankHubTab[] = ['points', 'daily', 'event', 'groups'];
  const props = {
    tabs,
    tab,
    eventNameKey: lantern.nameKey,
    list,
    groups: { canStart: true, active: null, rewardMode: 'participation' as const, minWins: 3, hours: 72, kitties: 2 },
    now: () => NOW,
    onTab: (t: RankHubTab) => h.update({ ...props, tab: t }),
    onSeeTop: log('onSeeTop'),
    onListArea: log('onListArea'),
    onStartGroup: log('onStartGroup'),
    onClose: log('onClose'),
  };
  openOverlay(h, props);
}

function group(outcome: GroupResultOutcome): void {
  home();
  openOverlay(createGroupResult(), { outcome, busy: false, onTake: log('onTake'), onDouble: log('onDouble') });
}

function eventScreen(solvedCount: number, nextIndex: number | null, over: Partial<EventScreenView> = {}): void {
  const v: EventScreenView = {
    def: lantern,
    now: NOW,
    endsAt: Date.parse(lantern.endUtc),
    solved: solvedCount,
    total: 21,
    track: lantern.track.map((m) => ({ ...m, reached: solvedCount >= m.at })),
    nextIndex,
    fbSafeZone: fb,
    reducedMotion: reduced,
    bannerReserved: banner,
    ...over,
  };
  mountScreen(createEventScreen(v, { onPlay: log('onPlay'), onTopList: log('onTopList'), onHome: log('onHome'), onSettings: log('onSettings') }).el);
}

const VIEWS: Record<string, () => void> = {
  home: () => home(),
  'home-event': () => home({ event: eventCard('active') }),
  'home-event-soon': () => home({ event: eventCard('active', { endsSoon: true, endsAt: NOW + 30 * 3_600_000 }) }),
  'home-teaser': () => home({ event: eventCard('teaser', { now: Date.parse(lantern.startUtc) - 2 * DAY - 3 * 3_600_000, solved: 0 }) }),
  'home-locked': () => home({ level: 6, event: eventCard('locked', { solved: 0 }) }),
  'home-banner': () => home({ bannerReserved: true, event: eventCard('active') }),
  game: () => void game(gameView(midGame(Number(q.get('level') ?? 37)), { fbSafeZone: fb, reducedMotion: reduced })),
  'game-event': () =>
    void game(gameView(midGame(37), { mode: 'event', level: null, event: { def: lantern, index: 12 }, fbSafeZone: fb, reducedMotion: reduced })),
  win: () => winFlow(Number(q.get('level') ?? 37), { bonus: Number(q.get('bonus') ?? 0), tutorial: false }),
  'win-hard': () => winFlow(40, { bonus: 2, tutorial: false }),
  'win-tutorial': () => winFlow(1, { bonus: 0, tutorial: true }),
  'heart-break': () => {
    const b = midGame(37, 1);
    const g = game(gameView(b, { fbSafeZone: fb, reducedMotion: reduced }));
    setTimeout(() => {
      g.update(gameView(b, { hearts: 1, reducedMotion: reduced }));
      g.playEvent({ type: 'MISTAKE', cell: 5, heartsLeft: 1 } as never);
    }, 900);
  },
  'ranking-records': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps(RECORDS));
  },
  'ranking-mine': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: 58_210 } }));
  },
  'ranking-score': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'mine', mine: { rank: null, score: { kind: 'points', points: 1240 }, count: null } }));
  },
  'ranking-seetop': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'see_top', mine: { rank: 87, score: { kind: 'points', points: 1240 }, count: null } }));
  },
  'ranking-loading': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'loading' }));
  },
  'ranking-overlay': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'overlay' }));
  },
  'ranking-daily': () => {
    game(gameView(solved(80), { mode: 'daily', level: null, dateKey: '2026-10-06', status: 'won', inputLocked: true }));
    openOverlay(
      createRankingPanel(),
      rankingProps(
        { kind: 'records', reason: 'unavailable', records: { board: 'daily', thisMs: 188_000, n: 9, bestSizeMs: null, totalPoints: 1310, levelsSolved: 80, event: null } },
        { board: 'daily', result: { kind: 'daily', ms: 188_000 } },
      ),
    );
  },
  'ranking-event': () => {
    game(gameView(solved(37), { mode: 'event', level: null, event: { def: lantern, index: 12 }, status: 'won', inputLocked: true }));
    openOverlay(
      createRankingPanel(),
      rankingProps(
        { kind: 'records', reason: 'local', records: { board: 'event', thisMs: 201_000, n: 9, bestSizeMs: null, totalPoints: 1310, levelsSolved: 80, event: { solved: 13, total: 21, totalMs: 4_324_000 } } },
        { board: 'event', eventNameKey: lantern.nameKey, result: { kind: 'event', solved: 13, total: 21 } },
      ),
    );
  },
  'victory-level': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps());
  },
  'victory-hard': () => {
    game(gameView(solved(40), { status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps({ level: 40, nextLevel: 41, fish: { earned: 5, total: 1130 }, bonus: { kind: 'hard', count: 2 }, pointsEarned: 120 }));
  },
  'victory-daily': () => {
    game(gameView(solved(80), { mode: 'daily', level: null, dateKey: '2026-10-06', status: 'won', inputLocked: true }));
    openOverlay(
      createVictoryScreen(),
      victoryProps({
        variant: 'daily',
        level: null,
        nextLevel: null,
        fish: { earned: 5, total: 245 },
        bonus: { kind: 'daily', count: 2 },
        pointsEarned: 65,
        daily: { dateKey: '2026-10-06', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: Date.now() + (7 * 60 + 48) * 60_000 },
      }),
    );
  },
  'victory-event': () => {
    game(gameView(solved(37), { mode: 'event', level: null, event: { def: lantern, index: 6 }, status: 'won', inputLocked: true }));
    openOverlay(
      createVictoryScreen(),
      victoryProps({
        variant: 'event',
        level: null,
        nextLevel: null,
        fish: { earned: 3, total: 161 },
        pointsEarned: 60,
        event: { nameKey: lantern.nameKey, index: 6, total: 21, solvedBefore: 6, solvedAfter: 7, reward: { fish: 30 }, last: false },
      }),
    );
  },
  'victory-tutorial': () => {
    game(gameView(solved(1), { mode: 'tutorial', status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps({ variant: 'tutorial', level: 1, nextLevel: 2, fish: { earned: 3, total: 3 }, pointsEarned: null }));
  },
  'victory-replay': () => {
    game(gameView(solved(1), { mode: 'tutorial', status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps({ variant: 'tutorial_replay', level: 1, nextLevel: null, fish: null, pointsEarned: null }));
  },
  'shop-web': () => shop({ kind: 'hidden' }),
  'shop-fb': () => shop(PRODUCTS, 1240),
  'shop-loading': () => shop({ kind: 'loading' }, 40),
  'shop-error': () => shop({ kind: 'error' }, 22),
  'shop-poor': () => shop({ kind: 'unavailable' }, 9),
  'hub-points': () => hub('points', { kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: null } }),
  'hub-daily': () => hub('daily', { kind: 'records', reason: 'local', records: { board: 'daily', thisMs: 0, n: 9, bestSizeMs: 188_000, totalPoints: 1240, levelsSolved: 37, event: null } }),
  'hub-groups': () => hub('groups', { kind: 'loading' }),
  'group-participation': () => group({ kind: 'participation', kitties: 2, kittiesWithAd: 4 }),
  'group-place': () => group({ kind: 'place', place: 3, count: 8, fish: 10 }),
  'event-screen': () => eventScreen(7, 7),
  'event-screen-soon': () => eventScreen(16, 16, { endsAt: NOW + 20 * 3_600_000 }),
  'event-screen-done': () => eventScreen(21, null),
  settings: () => {
    home();
    openOverlay(settingsModal, settingsProps());
  },
  'settings-language': () => {
    home();
    openOverlay(settingsModal, settingsProps());
    settingsModal.el.querySelector<HTMLElement>('.settings__language-link')?.click();
  },
  'rewarded-swap': () => {
    game(gameView(midGame(37), { hints: 0, inputLocked: true }));
    openOverlay(createRewardedPrompt(), {
      placement: 'hint',
      variant: 'video',
      nextFreeAt: 0,
      now: () => Date.now(),
      onAccept: log('onAccept'),
      onDecline: log('onDecline'),
      swap: { price: cfg.shop.hintFish, balance: 128, onSwap: log('onSwap') },
    });
  },
  'transition-to-game': () => {
    home();
    const from = screenEl as HTMLElement;
    setTimeout(() => {
      const g = createGameScreen(gameView(midGame(37), { reducedMotion: reduced }), gameCallbacks);
      app.appendChild(g.el);
      screenEl = g.el;
      g.playEntry();
      void playScreenTransition(from, g.el, 'to_game', reduced).then(() => from.remove());
    }, 600);
  },
  'transition-from-game': () => {
    const g = game(gameView(midGame(37), { reducedMotion: reduced }));
    setTimeout(() => {
      const h = createHomeScreen(homeView(), homeCallbacks);
      app.appendChild(h.el);
      void playScreenTransition(g.el, h.el, 'from_game', reduced).then(() => g.el.remove());
    }, 900);
  },
};

function index(): void {
  const list = document.createElement('ul');
  list.style.cssText = 'padding:24px 32px;font:16px/1.8 system-ui;overflow:auto;height:100%;margin:0';
  for (const name of Object.keys(VIEWS)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `?view=${name}`;
    a.textContent = name;
    li.appendChild(a);
    list.appendChild(li);
  }
  app.appendChild(list);
}

(VIEWS[view] ?? index)();
document.documentElement.dataset.ready = 'true';
