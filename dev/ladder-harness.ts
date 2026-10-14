// Owner: lead (Phase 2e I-1; adopted from G3's capture harness, requests-G3 R14). Dev harness (not shipped):
// /dev/ladder-harness.html?view=<name>&lang=<id>&rm=1. Run `npx vite --port 5182 --strictPort` and open the index
// (no view) for the list. Renders the Phase 2e surfaces (spec §2.4–§2.8, §4.1, §5.3, §6.1, §9.4) from fixtures: the
// `fixture-*` views map the server's golden contract fixtures (server/test/contract/fixtures/bracket.*.json, the
// same files the client and server tests parse) to the bracket list exactly as the app does (no row added, removed
// or re-ranked, H-3); the other views use hand-written rows for states the fixtures do not cover (37 rows, stale,
// records). Names come only from our word lists (nick-words), never a real player.
import '../src/i18n/en-lazy'; // Phase 2e I-4: the harness shows lazy views without their chunk barrels
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
import '../src/styles/art.css';
import '../src/styles/screens.css';
import '../src/styles/i18n.css';
import '../src/styles/overlay-chunk.css';
import '../src/styles/coach-chunk.css';
import '../src/styles/board-mouse.css';
import '../src/styles/ladder-chunk.css';
import { cfg } from '../src/app/config';
import { setLocale } from '../src/i18n/index';
import { NAME_MAX_CHARS, NAME_MAX_DIGITS, NAME_MIN_WIDTH, nameProblem, normalizeName } from '../src/shared/nick-text';
import { setInert, trapFocus } from '../src/ui/a11y/focus-trap';
import { mountLadderArt } from '../src/ui/art/ladder-art';
import { mountLazyArt } from '../src/ui/art/lazy-art';
import { mountSprite } from '../src/ui/art/sprite';
import { mountStreakArt } from '../src/ui/art/streak-art';
import { createLadderChip } from '../src/ui/hud/ladder-chip';
import { createStreakPill } from '../src/ui/hud/streak-strip';
import { provideHomeExtras } from '../src/ui/screens/home-extras';
import type { OverlayView } from '../src/ui/dom';
import { applyMotion } from '../src/ui/fx/motion';
import type { LadderChipView } from '../src/ui/hud/ladder-chip';
import type { StreakStripView } from '../src/ui/hud/streak-strip';
import { createBracketList } from '../src/ui/overlays/bracket-list';
import { createHowToPlay } from '../src/ui/overlays/how-to-play';
import { createLadderResult, type LadderResultProps } from '../src/ui/overlays/ladder-result';
import { createLadderSession } from '../src/ui/overlays/ladder-session';
import { createLadderSheet, type LadderRulesView, type LadderSheetProps } from '../src/ui/overlays/ladder-sheet';
import { createNicknameSheet, type NicknameSheetProps } from '../src/ui/overlays/nickname-sheet';
import {
  createRankingPanel,
  type BracketListView,
  type BracketRowView,
  type PersonalRecordsView,
  type RankingListState,
  type RankingPanelProps,
} from '../src/ui/overlays/ranking-panel';
import { createRewardedPrompt, type O2BuyView, type RewardedPromptProps } from '../src/ui/overlays/rewarded-prompt';
import { createSettingsModal, type SettingsLadderRows, type SettingsProps } from '../src/ui/overlays/settings-modal';
import { createToastLayer } from '../src/ui/overlays/toast';
import { createVictoryScreen, type VictoryProps } from '../src/ui/overlays/victory-screen';
import { createGameScreen, type GameView } from '../src/ui/screens/game-screen';
import { createHomeScreen, type HomeView } from '../src/ui/screens/home-screen';
import { gameView, homeView, midGame, solved } from './shell-fixtures';
import type { BracketView } from '../src/shared/rank-api';
import { parseBracketView } from '../src/shared/rank-api-parse';
// The server's golden contract fixtures (G4; the client and server tests parse the same files).
import fxOpen from '../server/test/contract/fixtures/bracket.open.json';
import fxFull from '../server/test/contract/fixtures/bracket.full.json';
import fxAlone from '../server/test/contract/fixtures/bracket.alone.json';
import fxEnded from '../server/test/contract/fixtures/bracket.ended.json';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'index';
const lang = q.get('lang') ?? 'en';
const reduced = q.get('rm') === '1';

const NOW = Date.now();
const H = 3_600_000;
const NAMES = [
  'Sleepy Whisker 27',
  'Velvet Paws 3',
  'Cozy Biscuit 41',
  'Misty Pebble 9',
  'Brave Noodle 12',
  'Golden Muffin 64',
  'Dreamy Clover 5',
  'Plucky Toffee 88',
  'Starry Comet 17',
  'Mellow Bean 33',
  'Jolly Waffle 2',
  'Snowy Tuft 71',
];

mountSprite();
// Phase 2e I-4: in the app these come with the lazy overlay chunk (app/overlay-chunk.ts).
mountStreakArt();
provideHomeExtras({ createLadderChip, createStreakPill });
mountLazyArt();
mountLadderArt();
const app = document.getElementById('app') as HTMLElement;
applyMotion(app, reduced);
const toasts = createToastLayer();
document.body.appendChild(toasts.el);
const log = (name: string) => (..._a: unknown[]): void => {
  console.info(`[ladder-harness] ${name}`);
  toasts.show(name, { durationMs: 1200 });
};

let screenEl: HTMLElement | null = null;
let top: OverlayView<never> | null = null;
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
    trapFocus(ov.el, { initialFocus: ov.el.querySelector<HTMLElement>('[data-autofocus]:not([hidden])') });
  }
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

function game(v: GameView): void {
  const g = createGameScreen(v, gameCallbacks);
  mountScreen(g.el);
  g.playEntry();
}
const wonBoard = (): void => game(gameView(solved(37), { status: 'won', inputLocked: true, reducedMotion: reduced }));

const homeCallbacks = {
  onPlay: log('onPlay'),
  onDaily: log('onDaily'),
  onSettings: log('onSettings'),
  onCard: log('onCard'),
  onEvent: log('onEvent'),
  onLadder: log('onLadder'),
};

// ─────────────────────────────── ranking fixtures ───────────────────────────────

const ACTIVITY_AGO = [20_000, 50_000, 4 * 60_000, 11 * 60_000, 47 * 60_000, 3 * H];

/** `n` rows, best first; my row at rank `me` (0 = none). Points fall with the rank; some ties. */
function rows(n: number, me = 5, over: (r: BracketRowView) => Partial<BracketRowView> = () => ({})): BracketRowView[] {
  return Array.from({ length: n }, (_, i) => {
    const r: BracketRowView = {
      rank: i + 1,
      slot: (i * 7) % 53,
      name: NAMES[i % NAMES.length] ?? `Cat ${i}`,
      avatarId: (i * 5) % 12,
      points: Math.max(1, 31 - Math.floor(i * 0.8)),
      hearts: [3, 0, 1, 0, 2, 0, 0, 1][i % 8] ?? 0,
      me: i + 1 === me,
      likedByMe: i === 1,
      heartEnabled: i + 1 !== me,
      // Leaderboard update: a spread of activity ("Playing now", "Online now", "4m ago" … "3h ago").
      seenAt: Date.now() - (ACTIVITY_AGO[i % ACTIVITY_AGO.length] ?? 0),
      playing: i % ACTIVITY_AGO.length === 0,
      ...(i + 1 === me ? { name: 'Velvet Pounce 27', avatarId: 4 } : {}),
    };
    return { ...r, ...over(r) };
  });
}

/** UI batch (leaderboard): the server's default rules.places (server/src/core/config.ts), the chests' rewards. */
const PLACE_REWARDS: BracketListView['rewards'] = [
  { place: 1, hints: 3, kitties: 3 },
  { place: 2, hints: 2, kitties: 2 },
  { place: 3, hints: 1, kitties: 1 },
];

function bracket(over: Partial<BracketListView> = {}): BracketListView {
  const rs = over.rows ?? rows(37);
  return {
    bracketId: 'mgk0b7q1z4a8',
    rows: rs,
    members: rs.length,
    endsAt: NOW + 7 * H + 48 * 60_000,
    final: false,
    rewardsLine: 'places',
    paidPlaces: 3,
    minMembers: 5,
    rewards: PLACE_REWARDS,
    heartsNew: 0,
    waiting: 0,
    stale: null,
    firstLineName: null,
    panelRows: cfg.ladder.panelRows,
    hearts: true,
    now: () => Date.now(),
    ...over,
  };
}

/**
 * A contract fixture's bracket as the app shows it: the shared parser first (a bad row would be dropped, never
 * repaired), then the rows in the server's order with its ranks and count (as ladder-flow's listView maps them).
 */
function fromFixture(fx: { response: { body: unknown } }, over: Partial<BracketListView> = {}): BracketListView {
  const v = parseBracketView(fx.response.body) as BracketView;
  if (!v || v.bracketId === null) throw new Error('fixture is not a bracket view');
  return bracket({
    bracketId: v.bracketId,
    rows: v.rows.map((r) => ({
      rank: r.rank,
      slot: r.slot,
      name: r.nickname,
      avatarId: r.avatarId,
      points: r.points,
      hearts: r.hearts,
      me: r.me,
      likedByMe: r.likedByMe,
      heartEnabled: !r.likedByMe,
      seenAt: r.seenAt === null ? null : Date.now() - (v.serverTime - r.seenAt),
      playing: r.playing,
      // UI batch (profile): the fixtures' frames and backgrounds
      frameId: r.frameId,
      backgroundId: r.backgroundId,
    })),
    members: v.members,
    // Shown against the harness's clock: the same distance to the end as in the fixture.
    endsAt: v.endsAt === null ? null : NOW + (v.endsAt - v.serverTime),
    final: v.final,
    rewardsLine: v.members < 5 ? 'min' : 'places',
    heartsNew: v.heartsNew,
    ...over,
  });
}

const RULES: LadderRulesView = { periodMode: 'rolling', maxMembers: 50, minMembers: 5, doubleByVideo: true, heartsEnabled: true, paidPlaces: 3, durationMs: 24 * H };

const RECORDS: PersonalRecordsView = {
  board: 'period',
  thisMs: 61_000,
  n: 8,
  bestSizeMs: 50_000,
  totalPoints: 5120,
  levelsSolved: 64,
  event: null,
  period: { kind: 'week', total: 42, best: 57 },
};

function panelProps(list: RankingListState, over: Partial<RankingPanelProps> = {}): RankingPanelProps {
  return {
    board: 'period',
    eventNameKey: null,
    result: { kind: 'ladder', gained: 2, total: 14 },
    list,
    tapMinMs: cfg.rank.panelTapMinMs,
    reducedMotion: reduced,
    onContinue: log('onContinue'),
    onSeeTop: log('onSeeTop'),
    onListArea: log('onListArea'),
    onHeart: log('onHeart'),
    onInfo: log('onInfo'),
    bracketList: createBracketList,
    ...over,
  };
}

function panel(list: RankingListState, over: Partial<RankingPanelProps> = {}): void {
  wonBoard();
  openOverlay(createRankingPanel(), panelProps(list, over));
}

function sheetProps(over: Partial<LadderSheetProps> = {}): LadderSheetProps {
  return {
    view: 'list',
    list: bracket(),
    records: RECORDS,
    rules: RULES,
    infoOnly: false,
    reducedMotion: reduced,
    onHeart: log('onHeart'),
    onClose: log('onClose'),
    streakBest: 9,
    ...over,
  };
}

function sheet(over: Partial<LadderSheetProps> = {}): void {
  home();
  openOverlay(createLadderSheet(), sheetProps(over));
}

/** Leaderboard update: the "New ranking" card (a bracket the sign-in just joined: 23:59:54 left). */
function session(): void {
  home();
  openOverlay(createLadderSession(), { endsAt: Date.now() + 24 * H - 6000, now: () => Date.now(), avatarId: 4, reducedMotion: reduced, onClose: log('onClose') });
}

function result(over: Partial<LadderResultProps> = {}): void {
  home();
  openOverlay(createLadderResult(), {
    case: 'paid',
    place: 2,
    members: 37,
    reward: { hints: 1, kitties: 1 },
    canDouble: true,
    paidPlaces: 3,
    busy: false,
    onCollect: log('onCollect'),
    onDouble: log('onDouble'),
    onClose: log('onClose'),
    ...over,
  });
}

/** UI batch (profile): a newer player's locks (ids 0–2 free, the rest by level, streak or a ranking reward; game/looks.ts). */
const LOCKS: NicknameSheetProps['frames'] = [null, null, null, { kind: 'level', level: 25 }, { kind: 'streak', days: 7 }, { kind: 'level', level: 100 }, { kind: 'prize' }, { kind: 'level', level: 300 }];

function nick(over: Partial<NicknameSheetProps> = {}): void {
  home();
  openOverlay(createNicknameSheet(), {
    current: { name: 'Velvet Pounce 27', avatarId: 4, frameId: 0, backgroundId: 0 },
    avatarCount: 12,
    frames: LOCKS,
    backgrounds: LOCKS,
    nameEditable: true,
    nameRules: { maxChars: NAME_MAX_CHARS, minWidth: NAME_MIN_WIDTH, maxDigits: NAME_MAX_DIGITS },
    checkName: (raw) => nameProblem(normalizeName(raw)),
    state: 'idle',
    cooldownUntil: null,
    now: () => Date.now(),
    onSave: log('onSave'),
    onClose: log('onClose'),
    ...over,
  });
  // ?tab=frame|bg opens that tab (screenshots)
  const tab = q.get('tab');
  if (tab) (document.querySelector(`.nickname__tab[data-tab="${tab}"]`) as HTMLElement | null)?.click();
}

// ─────────────────────────────── Home / O2 / Settings / victory ───────────────────────────────

const CHIP: LadderChipView = { state: 'bracket', rank: 5, members: 37, points: 14, endsAt: NOW + 7 * H + 48 * 60_000, now: () => Date.now() };
const STRIP: StreakStripView = { state: 'alive', day: 3, total: 7, rewardDay: false };

function home(over: Partial<HomeView> = {}): void {
  mountScreen(
    createHomeScreen(
      homeView({ daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 21 }, ladder: CHIP, streak: STRIP, ...over }),
      homeCallbacks,
    ).el,
  );
}

const PACK: O2BuyView = { productId: 'hints_15', kind: 'pack', items: 15, price: q.get('price') ?? '$1.99', state: 'ready' };
const NOADS: O2BuyView = { productId: 'remove_ads', kind: 'no_ads', items: 0, price: '$3.99', state: 'ready' };

function o2(over: Partial<RewardedPromptProps> = {}): void {
  game(gameView(midGame(37), { hints: 0, inputLocked: true, reducedMotion: reduced }));
  openOverlay(createRewardedPrompt(), {
    placement: 'hint',
    variant: 'video',
    nextFreeAt: 0,
    now: () => Date.now(),
    onAccept: log('onAccept'),
    onDecline: log('onDecline'),
    buy: [PACK, NOADS],
    onBuy: log('onBuy'),
    ...over,
  });
}

function settings(ladder: Partial<SettingsLadderRows> = {}, confirm = false): void {
  home();
  const modal = createSettingsModal();
  const p: SettingsProps = {
    settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
    showVibration: true,
    version: '0.2.0',
    onChange: log('onChange'),
    onHowToPlay: log('onHowToPlay'),
    onClose: log('onClose'),
    onShop: log('onShop'),
    ladder: {
      name: 'Velvet Pounce 27',
      code: '7KQ2-M9XD',
      listed: true,
      showListed: true,
      online: true,
      onName: log('onName'),
      onListed: log('onListed'),
      onDelete: log('onDelete'),
      ...ladder,
    },
  };
  openOverlay(modal, p);
  if (confirm) modal.el.querySelector<HTMLElement>('.settings__ladder-delete')?.click();
}

function victory(over: Partial<VictoryProps> = {}): void {
  wonBoard();
  openOverlay(createVictoryScreen(), {
    variant: 'level',
    praise: 1,
    level: 37,
    nextLevel: 38,
    pointsEarned: 7296,
    kept: { fish: 2, max: 3 },
    daily: null,
    event: null,
    buttonDelayMs: cfg.fx.winButtonDelayMs,
    reducedMotion: reduced,
    bannerReserved: false,
    now: () => Date.now(),
    onPrimary: log('onPrimary'),
    streak: { day: 4, total: 7, reward: null },
    dailyReward: null,
    // UI batch (victory): the praise and statistic lines (app/victory-lines.ts picks them in the game).
    lines: [{ id: 'noHelp' }, { id: 'statLevel', pct: 65 }],
    ...over,
  });
}

const VIEWS: Record<string, () => void> = {
  // the server's contract fixtures (bracket.open / full / alone / ended), rows exactly as sent (H-3)
  'fixture-open': () => panel({ kind: 'bracket', view: fromFixture(fxOpen) }, { result: { kind: 'ladder', gained: 3, total: 16 } }),
  'fixture-full': () => panel({ kind: 'bracket', view: fromFixture(fxFull) }),
  'fixture-alone': () => panel({ kind: 'bracket', view: fromFixture(fxAlone) }, { result: { kind: 'ladder', gained: 3, total: 3 } }),
  'fixture-sheet-full': () => sheet({ list: fromFixture(fxFull) }),
  'fixture-sheet-ended': () => sheet({ list: fromFixture(fxEnded) }),
  // post-win panel (spec §2.4)
  'panel-bracket': () => panel({ kind: 'bracket', view: bracket() }),
  // Leaderboard update: the rank-up (my row from #12 with 24 fish to #5 with 28; from #4 to the top).
  'panel-climb': () => panel({ kind: 'bracket', view: bracket() }, { result: { kind: 'ladder', gained: 3, total: 28 }, climbFrom: { bracketId: 'mgk0b7q1z4a8', rank: 12, points: 24 } }),
  'panel-climb-top': () =>
    panel(
      { kind: 'bracket', view: bracket({ rows: rows(37, 1, (r) => (r.me ? { points: 34 } : {})) }) },
      { result: { kind: 'ladder', gained: 3, total: 34 }, climbFrom: { bracketId: 'mgk0b7q1z4a8', rank: 4, points: 31 } },
    ),
  'panel-climb-new': () => panel({ kind: 'bracket', view: bracket() }, { result: { kind: 'ladder', gained: 3, total: 28 }, climbFrom: { bracketId: null, rank: null, points: 0 } }),
  'panel-alone': () => panel({ kind: 'bracket', view: bracket({ rows: rows(1, 1), members: 1, rewardsLine: 'min' }) }, { result: { kind: 'ladder', gained: 3, total: 3 } }),
  'panel-small': () => panel({ kind: 'bracket', view: bracket({ rows: rows(3, 2), members: 3, rewardsLine: 'min' }) }),
  'panel-stale': () =>
    // audit B9 / A-H1: the header carries the server's total (my row's 28) and the queued fish apart, as my row does
    panel({ kind: 'bracket', view: bracket({ stale: { at: NOW - 11 * 60_000 }, waiting: 2 }) }, { result: { kind: 'ladder', gained: 2, total: 28, waiting: 2 } }),
  'panel-records': () => panel({ kind: 'records', records: RECORDS, reason: 'unavailable' }),
  // audit B7: the longest names the word lists make; the number keeps to its word ("Dumpling 99"), never alone
  'panel-long-names': () =>
    panel({
      kind: 'bracket',
      view: bracket({
        rows: rows(8, 5, (r) => (r.me ? {} : { name: `${['Cheerful', 'Friendly', 'Curious', 'Sparkly'][r.rank % 4]} ${['Dumpling', 'Snowball', 'Cinnamon', 'Whisker'][r.rank % 4]} ${99 - r.rank}` })),
        members: 8,
      }),
    }),
  'panel-loading': () => panel({ kind: 'bracket', view: bracket() }, { bracketList: undefined }),
  // UI batch (leaderboard): a chest's reward tooltip (row 3's chest; the podium's 1st in the sheet). Only a chest
  // that is drawn (≤ 340 px wide the rows have none).
  'panel-tip': () => {
    panel({ kind: 'bracket', view: bracket() });
    setTimeout(() => {
      const chest = document.querySelector<HTMLElement>('li.rank-row[data-rank="3"] .rank-row__gift');
      if (chest && chest.getClientRects().length > 0) chest.click();
    }, 700);
  },
  // the ranking sheet (spec §2.5)
  'sheet-list': () => sheet(),
  // No bracket now: the join line under the title (the (i) keeps its slot, so the title stays centred).
  'sheet-join': () => sheet({ list: null }),
  'sheet-hearts': () => sheet({ list: bracket({ heartsNew: 3, firstLineName: 'Velvet Pounce 27' }) }),
  'sheet-final': () => sheet({ list: bracket({ final: true, endsAt: NOW - 60_000 }) }),
  'sheet-info': () => sheet({ view: 'info' }),
  'sheet-info-only': () => sheet({ view: 'info', infoOnly: true, list: null }),
  'sheet-records': () => sheet({ view: 'records', list: null, recordsReason: 'opted_out' }),
  // My row far down (#30): scroll up and it waits at the list's bottom edge, down and it waits at the top.
  'sheet-me-30': () => sheet({ list: bracket({ rows: rows(37, 30) }) }),
  'sheet-tip': () => {
    sheet();
    setTimeout(() => document.querySelector<HTMLElement>('.lb-pod[data-place="1"] .lb-pod__gift')?.click(), 700);
  },
  // the result card (spec §2.6)
  session: () => session(),
  'result-paid': () => result(),
  'result-paid-no-video': () => result({ canDouble: false, place: 1, reward: { hints: 2, kitties: 1 } }),
  'result-too-few': () => result({ case: 'too_few', place: 1, members: 3, reward: null, canDouble: false }),
  'result-none': () => result({ case: 'none', place: 14, reward: null, canDouble: false }),
  'result-busy': () => result({ busy: true }),
  // the name sheet (spec §2.7)
  nick: () => nick(),
  'nick-cooldown': () => nick({ state: 'cooldown', cooldownUntil: NOW + 5 * H + 12 * 60_000 }),
  'nick-offline': () => nick({ state: 'offline' }),
  // UI batch (profile): a worn frame and background, a name refused by the server, typed names switched off,
  // a server without frames and backgrounds
  'nick-looks': () => nick({ current: { name: 'Captain Purr', avatarId: 7, frameId: 5, backgroundId: 6 }, frames: LOCKS.map(() => null), backgrounds: LOCKS.map(() => null) }),
  'nick-rejected': () => nick({ state: 'rejected' }),
  'nick-invalid': () => nick({ state: 'invalid' }),
  'nick-fixed': () => nick({ nameEditable: false }),
  'nick-old-server': () => nick({ frames: [], backgrounds: [] }),
  'home-looks': () => home({ avatarId: 7, frameId: 5, backgroundId: 6 }),
  // Home (spec §2.5, §5.3, §6.1)
  home: () => home(),
  'home-join': () => home({ ladder: { state: 'join' } as LadderChipView, streak: { state: 'new', day: 0, total: 7, rewardDay: false } }),
  'home-day7': () => home({ streak: { state: 'done', day: 7, total: 7, rewardDay: true } }),
  'home-done': () => home({ streak: { state: 'done', day: 4, total: 7, rewardDay: false } }),
  'home-locked': () => home({ level: 12, daily: { state: 'locked', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 21 }, ladder: { state: 'off' } as LadderChipView, streak: { state: 'none', day: 0, total: 7, rewardDay: false } }),
  // O2 with Buy rows (spec §4.1)
  'o2-buy': () => o2(),
  'o2-buy-owned': () => o2({ buy: [PACK] }),
  'o2-buy-busy': () => o2({ buy: [{ ...PACK, state: 'busy' }, NOADS] }),
  'o2-kitty': () => o2({ placement: 'kitty', buy: [{ productId: 'kitties_8', kind: 'pack', items: 8, price: '$1.99', state: 'ready' }, NOADS] }),
  // Settings (spec §2.8)
  settings: () => settings(),
  'settings-offline': () => settings({ online: false, listed: false }),
  'settings-delete': () => settings({}, true),
  // victory (spec §5.3, §6.1)
  'victory-streak': () => victory(),
  'victory-day7': () => victory({ streak: { day: 7, total: 7, reward: { hints: 2, kitties: 2 } } }),
  // UI batch (victory): the kept-fish row is the fish alone (no total, no "+3 waiting"), online or not
  'victory-offline': () => victory({ kept: { fish: 2, max: 3 } }),
  // UI batch (victory): a flawless Hard level with a new best time (the two best lines), and one with no line at all
  'victory-lines': () =>
    victory({ level: 60, nextLevel: 61, kept: { fish: 3, max: 3 }, streak: null, lines: [{ id: 'flawless' }, { id: 'best', ms: 151_000, n: 9 }] }),
  'victory-no-lines': () => victory({ streak: null, lines: [] }),
  // audit B1: the tallest victory (the daily on a streak's day 7); &banner=1 reserves the banner band (fit step 4 at 320 × 568)
  'victory-daily-day7': () =>
    victory({
      variant: 'daily',
      level: null,
      nextLevel: 38,
      kept: { fish: 3, max: 3 },
      daily: { dateKey: '2026-10-10', ms: 188_000, mistakes: 0, hints: 0, kitties: 0, nextPuzzleAt: NOW + 9 * H },
      streak: { day: 7, total: 7, reward: { hints: 2, kitties: 2 } },
      bannerReserved: q.get('banner') === '1',
      lines: [{ id: 'statFaster', pct: 70 }, { id: 'flawless' }],
    } as Partial<VictoryProps>),
  'victory-daily': () =>
    victory({
      variant: 'daily',
      level: null,
      nextLevel: 38,
      kept: { fish: 3, max: 3 },
      daily: { dateKey: '2026-10-10', ms: 188_000, mistakes: 0, hints: 0, kitties: 0, nextPuzzleAt: NOW + 9 * H },
      dailyReward: { hints: 1, kitties: 0 },
      streak: { day: 2, total: 7, reward: null },
      lines: [{ id: 'statTop', pct: 15 }, { id: 'dailies', count: 12 }],
    } as Partial<VictoryProps>),
  // how to play (spec §2.3, §5)
  howto: () => {
    home();
    openOverlay(createHowToPlay(), { showSkip: false, showReplay: true, onSkip: log('onSkip'), onReplay: log('onReplay'), onClose: log('onClose'), ladder: true, streakDays: 7 } as never);
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

void (async () => {
  if (lang !== 'en') await setLocale(lang, { override: lang } as never).catch((e: unknown) => console.error(e));
  (VIEWS[view] ?? index)();
  await document.fonts?.ready;
  setTimeout(() => {
    document.documentElement.dataset.ready = 'true';
  }, 900);
})();
