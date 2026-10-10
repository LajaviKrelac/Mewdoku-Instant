// Owner: B (Phase 2b); lead (Phase 2c I-2/I-3). Dev harness (not shipped): /dev/b-harness.html?view=<name>.
// Run `npx vite --port 5182 --strictPort` and open the index (no view) for the list.
// Options: &rm=1 (reduced motion), &fb=1 (FB safe zone), &banner=1 (banner reserve), &n=<size>,
// &kept=1|2|3 (fish kept at the win).
// Phase 2c.1 (lead, I-1): the level-points counter (`game-points` plays three scoring cats and a
// mistake), level totals on the victory fixtures, no perfect streak.
// The `win` view plays the Phase 2c §2.2 timeline the way the app's win flow drives it (glow, the
// period counter, the KEPT fish lifting off the lives pill and flying to it, "+N", scrim, ranking
// panel, victory screen), so frames can be captured at any t.
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
// 2b integration: the overlays' and the event screen's rules load with their lazy chunks in the app.
import '../src/styles/overlay-chunk.css';
// Phase 2d.1 I-4: the coach (and the rich-text styles) are their own lazy stylesheet now (coach-chunk.css).
import '../src/styles/coach-chunk.css';
// Phase 2d.1 I-4: the board's lazy motion (mouse visits, cat sequence, waves) comes with the board-mouse chunk.
import '../src/styles/board-mouse.css';
import '../src/styles/events-chunk.css';
import eventsJson from '../src/data/events/events.json';
import { cfg } from '../src/app/config';
import { panelAt } from '../src/app/win-flow';
import type { EventDef } from '../src/game/events';
import { pointsRuleFor, runTotal } from '../src/game/scoring';
import { CellState } from '../src/game/types';
import { setInert, trapFocus } from '../src/ui/a11y/focus-trap';
import { mountSprite } from '../src/ui/art/sprite';
import { mountLazyArt } from '../src/ui/art/lazy-art';
import type { OverlayView } from '../src/ui/dom';
import { ensureFxLayer, fishSizeFromRect, flyFish } from '../src/ui/fx/fish-flight';
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
mountLazyArt(); // Phase 2d.1: the symbols the lazy chunks mount (board mouse, star, shards, the tickers' art)
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
  onMouse: log('onMouse'),
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
    board: 'period',
    eventNameKey: null,
    result: { kind: 'period', gained: 3, total: 42, periodKind: 'week' },
    periodKind: 'week',
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
  records: {
    board: 'period',
    thisMs: 134_000,
    n: 8,
    bestSizeMs: 118_000,
    totalPoints: 186_624,
    levelsSolved: 37,
    event: null,
    period: { kind: 'week', total: 42, best: 57 },
  },
};

/**
 * Phase 2c.1 §3.1: a level's total for n cats with `mistakes` resets spread evenly (each run of k
 * cats in a row scores runTotal(k)); 0 mistakes is the unbroken run (8 cats: 7 296).
 */
function levelTotal(n: number, mistakes = 0): number {
  const rule = pointsRuleFor('level');
  let total = 0;
  let left = n;
  for (let runs = mistakes + 1; runs > 0; runs--) {
    const k = Math.ceil(left / runs);
    total += runTotal(k, rule);
    left -= k;
  }
  return total;
}

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 1,
    level: 37,
    nextLevel: 38,
    pointsEarned: levelTotal(8),
    kept: { fish: 3, max: 3, gained: 3, total: 42, kind: 'week' },
    daily: null,
    event: null,
    buttonDelayMs: cfg.fx.winButtonDelayMs,
    reducedMotion: reduced,
    bannerReserved: banner,
    now: () => Date.now(),
    onPrimary: log('onPrimary'),
    onHome: log('onHome'),
    ...over,
  };
}

// ─────────────────────────────── the win flow (Phase 2c §2.2) ───────────────────────────────

/** Plays Phase 2c §2.2 on timers, as the app's win flow does: t = 0 is the WON event; `kept` fish fly. */
function winFlow(level: number, opts: { kept: number; tutorial: boolean }): void {
  const b = solved(level);
  const kept = opts.tutorial ? 3 : Math.max(1, Math.min(3, Math.floor(opts.kept)));
  const pts = opts.tutorial ? null : levelTotal(b.puzzle.n, 3 - kept);
  const g = game(gameView(b, { status: 'won', inputLocked: true, fbSafeZone: fb, reducedMotion: reduced, chromeLocked: true, hearts: kept, points: pts }));
  const W = cfg.fx.win;
  const before = 39;
  const total = before + kept;
  const n = opts.tutorial ? 0 : kept; // the tutorial keeps no fish for the board and flies none (§2.5)
  const at = (ms: number, fn: () => void): void => void setTimeout(fn, ms);
  // The flow starts at a fixed 1 000 ms after load (the entry has ended by then), so a screenshot at
  // page time 1 000 + t shows the flow at t.
  const t0 = 1000 - Math.round(performance.now() - LOADED_AT);
  const cats = Array.from(b.cells.keys()).filter((i) => b.cells[i] === CellState.Cat);
  at(t0, () => {
    g.playEvent({ type: 'WON' } as never);
    if (opts.tutorial) {
      at(cfg.fx.winHappyDelayMs, () => g.glow(cats));
      at(W.replayVictoryAtMs, () => openVictory());
      return;
    }
    if (reduced) {
      at(cfg.fx.winHappyDelayMs, () => {
        g.glow(cats);
        g.showPeriodCounter(total);
        for (const s of g.lifeSlots()) g.departLife(s.slot);
        g.periodLabel(`+${kept}`);
      });
      at(W.reduced.rankingAtMs, () => openRanking());
      return;
    }
    at(cfg.fx.winHappyDelayMs, () => g.glow(cats));
    at(W.fishPillInAtMs, () => g.showPeriodCounter(before));
    at(W.fishAtMs, () => {
      const slots = g.lifeSlots().slice(0, n);
      const to = g.periodRect();
      if (!to || slots.length === 0) return;
      flyFish(
        ensureFxLayer(app),
        slots.map((s) => s.rect),
        to,
        {
          sizePx: fishSizeFromRect(slots[0]?.rect),
          startScale: 1,
          reduced: false,
          onPop: (k) => g.departLife(slots[k]?.slot ?? 0),
          onArrive: (k) => g.showPeriodCounter(before + k + 1),
        },
      );
    });
    const lastArrival = W.fishAtMs + (n - 1) * W.fishStaggerMs + W.fishHoldMs + W.fishFlightMs;
    at(lastArrival, () => g.periodLabel(`+${kept}`));
    at(panelAt(n) - W.scrimLeadMs, () => g.showScrim?.());
    at(panelAt(n), () => openRanking());
  });

  const ranking = createRankingPanel();
  const victory = createVictoryScreen();
  function openRanking(): void {
    openOverlay(
      ranking,
      rankingProps(RECORDS, {
        result: { kind: 'period', gained: kept, total, periodKind: 'week' },
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
        nextLevel: opts.tutorial ? 2 : level + 1,
        variant: opts.tutorial ? 'tutorial' : 'level',
        pointsEarned: pts,
        kept: opts.tutorial ? null : { fish: kept, max: 3, gained: kept, total, kind: 'week' },
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

function shop(buy: ShopBuyState, busy = false): void {
  home();
  openOverlay(createShopSheet(), {
    buy,
    busy,
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
  ],
};

function hub(tab: RankHubTab, list: RankingListState): void {
  home({ showTrophy: true });
  const h = createRankHub();
  const tabs: RankHubTab[] = ['period', 'daily', 'event', 'groups'];
  const props = {
    tabs,
    tab,
    eventNameKey: lantern.nameKey,
    periodKind: 'week' as const,
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
    settingsDot: false,
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
  win: () => winFlow(Number(q.get('level') ?? 37), { kept: Number(q.get('kept') ?? 3), tutorial: false }),
  'win-kept-1': () => winFlow(40, { kept: 1, tutorial: false }),
  'win-tutorial': () => winFlow(1, { kept: 3, tutorial: true }),
  // Phase 2c.1 §10.2: two scoring cats (+672, +768), a mistake (nothing on the counter), then +576.
  'game-points': () => {
    const b1 = midGame(37, 0, [0]);
    const n = b1.puzzle.n;
    const sol = (row: number): number => row * n + (b1.puzzle.solution[row] ?? 0);
    const g = game(gameView(b1, { fbSafeZone: fb, reducedMotion: reduced, points: 576 }));
    const step = (ms: number, b: ReturnType<typeof midGame>, over: Partial<GameView>, ev?: Parameters<GameScreen['playEvent']>[0]): void =>
      void setTimeout(() => {
        g.update(gameView(b, { reducedMotion: reduced, ...over }));
        if (ev) g.playEvent(ev);
      }, ms);
    step(900, midGame(37, 0, [0, 3]), { points: 1248 }, { type: 'POINTS', cell: sol(3), gained: 672, total: 1248, streak: 2 });
    step(2100, midGame(37, 0, [0, 3, 5]), { points: 2016 }, { type: 'POINTS', cell: sol(5), gained: 768, total: 2016, streak: 3 });
    step(3300, midGame(37, 1, [0, 3, 5]), { points: 2016, hearts: 2 }, { type: 'MISTAKE', cell: 5, heartsLeft: 2 } as never);
    step(4500, midGame(37, 1, [0, 3, 5, 1]), { points: 2592, hearts: 2 }, { type: 'POINTS', cell: sol(1), gained: 576, total: 2592, streak: 1 });
  },
  'fish-loss': () => {
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
    openOverlay(createRankingPanel(), rankingProps({ kind: 'mine', mine: { rank: 12, score: { kind: 'fish', fish: 42 }, count: 58_210 } }));
  },
  'ranking-score': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 42 }, count: null } }));
  },
  'ranking-seetop': () => {
    game(gameView(solved(37), { status: 'won', inputLocked: true }));
    openOverlay(createRankingPanel(), rankingProps({ kind: 'see_top', mine: { rank: 87, score: { kind: 'fish', fish: 42 }, count: null } }));
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
    const pts = levelTotal(solved(40).puzzle.n, 1); // one mistake: 2 fish kept
    game(gameView(solved(40), { status: 'won', inputLocked: true, hearts: 2, points: pts }));
    openOverlay(createVictoryScreen(), victoryProps({ level: 40, nextLevel: 41, pointsEarned: pts, kept: { fish: 2, max: 3, gained: 2, total: 41, kind: 'week' } }));
  },
  'victory-daily': () => {
    const pts = levelTotal(solved(80).puzzle.n, 1); // one mistake: 2 fish kept
    game(gameView(solved(80), { mode: 'daily', level: null, dateKey: '2026-10-06', status: 'won', inputLocked: true, hearts: 2, points: pts }));
    openOverlay(
      createVictoryScreen(),
      victoryProps({
        variant: 'daily',
        level: null,
        nextLevel: null,
        pointsEarned: pts,
        kept: { fish: 2, max: 3, gained: 2, total: 44, kind: 'week' },
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
        pointsEarned: levelTotal(solved(37).puzzle.n),
        kept: { fish: 3, max: 3, gained: 3, total: 45, kind: 'week' },
        event: { nameKey: lantern.nameKey, index: 6, total: 21, solvedBefore: 6, solvedAfter: 7, reward: { hints: 2 }, last: false },
      }),
    );
  },
  'victory-tutorial': () => {
    game(gameView(solved(1), { mode: 'tutorial', status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps({ variant: 'tutorial', level: 1, nextLevel: 2, pointsEarned: null, kept: null }));
  },
  'victory-replay': () => {
    game(gameView(solved(1), { mode: 'tutorial', status: 'won', inputLocked: true }));
    openOverlay(createVictoryScreen(), victoryProps({ variant: 'tutorial_replay', level: 1, nextLevel: null, pointsEarned: null, kept: null }));
  },
  'shop-web': () => shop({ kind: 'hidden' }),
  'shop-fb': () => shop(PRODUCTS),
  'shop-loading': () => shop({ kind: 'loading' }),
  'shop-error': () => shop({ kind: 'error' }),
  'shop-unavailable': () => shop({ kind: 'unavailable' }),
  'hub-period': () => hub('period', { kind: 'mine', mine: { rank: 12, score: { kind: 'fish', fish: 42 }, count: null } }),
  'hub-daily': () => hub('daily', { kind: 'records', reason: 'local', records: { board: 'daily', thisMs: 0, n: 9, bestSizeMs: 188_000, totalPoints: 1240, levelsSolved: 37, event: null } }),
  'hub-groups': () => hub('groups', { kind: 'loading' }),
  'group-participation': () => group({ kind: 'participation', kitties: 2, kittiesWithAd: 4 }),
  'group-place': () => group({ kind: 'place', place: 3, count: 8, hints: cfg.groups.placeHints }),
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
  'rewarded-video': () => {
    game(gameView(midGame(37), { hints: 0, inputLocked: true }));
    openOverlay(createRewardedPrompt(), {
      placement: 'hint',
      variant: 'video',
      nextFreeAt: 0,
      now: () => Date.now(),
      onAccept: log('onAccept'),
      onDecline: log('onDecline'),
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
