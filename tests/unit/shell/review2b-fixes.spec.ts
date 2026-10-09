// Owner: U (Phase 2b review fixes). One regression test per fixed finding of the Phase 2b review in
// the screens, overlays, audio and i18n group: language switch relabels open and cached views
// (A11Y-I18N-1), the Feedback row (PAR-5), rich teaching copy (PAR-7), the board-entry cue (PAR-8),
// the shop's live confirmation (A11Y-LIVE-1), named progress bar (A11Y-NAME-1), <dl> rows
// (A11Y-DL-1), RTL arrow keys (A11Y-HUB-1), the right-to-left reward (I18N-RTL-1), the top-bar suffix
// (I18N-TEXT-2), the victory fit steps (UX-1), the Home hero fit (UX-2), the FB safe-zone marker and
// hint inset (UX-3, UX-9) and the coach card's tool-row slot (UX-14).
import { afterEach, describe, expect, it, vi } from 'vitest';
import eventsJson from '../../../src/data/events/events.json';
import { cfg } from '../../../src/app/config';
import { recipe, SFX_IDS, type ToneVoice } from '../../../src/audio/sfx';
import type { HintKind, HintStep, Unit } from '../../../src/engine/types';
import type { EventDef } from '../../../src/game/events';
import { CellState } from '../../../src/game/types';
import { setLocale, stripIsolates, t, type I18nKey } from '../../../src/i18n';
import { RLI } from '../../../src/i18n/format';
import { catalog as de } from '../../../src/i18n/locales/de';
import { createTopBar, splitTitle } from '../../../src/ui/hud/top-bar';
import { coachText, coverBadges, createCoach, placeCard, type CoachProps } from '../../../src/ui/overlays/coach';
import { createHintCard, fbTopInset, hintText, type HintCardProps } from '../../../src/ui/overlays/hint-card';
import { createHowToPlay } from '../../../src/ui/overlays/how-to-play';
import { arrowStep } from '../../../src/ui/overlays/overlay-base';
import { createRankHub, type RankHubProps } from '../../../src/ui/overlays/rank-hub';
import { renderRankList } from '../../../src/ui/overlays/ranking-panel';
import { createSettingsModal, type SettingsProps } from '../../../src/ui/overlays/settings-modal';
import { createShopSheet, type ShopProps } from '../../../src/ui/overlays/shop-sheet';
import { createVictoryScreen, fitLevel, FIT_LEVELS, rewardText, type VictoryProps } from '../../../src/ui/overlays/victory-screen';
import { createEventScreen, type EventScreenView } from '../../../src/ui/screens/event-screen';
import { createGameScreen, type GameView } from '../../../src/ui/screens/game-screen';
import { createHomeScreen, fittedMascot, MASCOT_MIN_PX, type HomeView } from '../../../src/ui/screens/home-screen';

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await setLocale('en');
  document.documentElement.removeAttribute('data-fb-safe');
  document.body.textContent = '';
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const text = (el: Element): string => stripIsolates(el.textContent ?? '').replace(/\s+/g, ' ').trim();
const lantern = (eventsJson as unknown as EventDef[])[0] as EventDef;
const DAY = 86_400_000;

// ─────────────────────────────── fixtures ───────────────────────────────

const settingsProps = (over: Partial<SettingsProps> = {}): SettingsProps => ({
  settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
  showVibration: true,
  version: '0.2.0',
  onChange: vi.fn(),
  onHowToPlay: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

const shopProps = (over: Partial<ShopProps> = {}): ShopProps => ({
  buy: { kind: 'ready', products: [{ id: 'hints_15', price: '$1.99', owned: false }] },
  busy: false,
  onBuy: vi.fn(),
  onRetry: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

const homeView = (over: Partial<HomeView> = {}): HomeView => ({
  level: 37,
  hard: true,
  continueLevel: false,
  daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 },
  hints: 5,
  kitties: 3,
  showTrophy: true,
  fbSafeZone: false,
  extraCards: [],
  period: { kind: 'week', total: 42 },
  event: null,
  bannerReserved: false,
  ...over,
});
const homeCb = () => ({ onPlay: vi.fn(), onDaily: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn(), onCard: vi.fn(), onEvent: vi.fn() });

function gameView(over: Partial<GameView> = {}): GameView {
  const n = 4;
  const cells = new Uint8Array(n * n);
  cells[1] = CellState.Cat;
  return {
    mode: 'level',
    level: 37,
    dateKey: null,
    hard: false,
    showHome: true,
    hearts: 3,
    maxHearts: 3,
    catsPlaced: 1,
    status: 'playing',
    hints: 5,
    kitties: 3,
    hintsFree: false,
    bulbEnabled: true,
    pawEnabled: true,
    inputLocked: false,
    board: {
      puzzleId: 'L37',
      n,
      regions: Uint8Array.from([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]),
      colors: Uint8Array.from([0, 1, 2, 3]),
      cells,
      regionsDone: 0,
      patterns: false,
    },
    highlight: null,
    chipHighlight: null,
    fbSafeZone: false,
    reducedMotion: false,
    event: null,
    ...over,
  };
}
const gameCb = () => ({ onTap: vi.fn(), onDoubleTap: vi.fn(), onPaint: vi.fn(), onBulb: vi.fn(), onPaw: vi.fn(), onHome: vi.fn(), onSettings: vi.fn() });

const eventView = (over: Partial<EventScreenView> = {}): EventScreenView => ({
  def: lantern,
  now: 0,
  endsAt: 3 * DAY,
  solved: 7,
  total: 21,
  track: lantern.track.map((m) => ({ ...m, reached: 7 >= m.at })),
  nextIndex: 7,
  fbSafeZone: false,
  reducedMotion: false,
  bannerReserved: false,
  ...over,
});

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 0,
    level: 37,
    nextLevel: 38,
    pointsEarned: 55,
    streak: 1,
    kept: { fish: 3, max: 3, gained: 3, total: 42, kind: 'week' },
    daily: null,
    event: null,
    buttonDelayMs: cfg.fx.winButtonDelayMs,
    reducedMotion: false,
    bannerReserved: false,
    now: () => 0,
    onPrimary: vi.fn(),
    onHome: vi.fn(),
    ...over,
  };
}

const ctxColors = { n: 4, colors: Uint8Array.from([7, 1, 2, 0]), patterns: false };
const reg = (index: number): Unit => ({ kind: 'region', index });
const col = (index: number): Unit => ({ kind: 'col', index });
const hstep = (kind: HintKind, focusUnits: Unit[]): HintStep => ({ kind, level: 2, focusUnits, focusCells: [0], effectCells: [] });

// ─────────────────────────────── A11Y-I18N-1 ───────────────────────────────

describe('a language switch relabels every view, open or cached (A11Y-I18N-1)', () => {
  it('the open Settings dialog: title, rows, segments and links, without an update() from the app', async () => {
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    s.open(settingsProps({ onShop: vi.fn() }));
    expect(text(q(s.el, '.overlay__title'))).toBe('Settings');
    await setLocale('de');
    expect(text(q(s.el, '.overlay__title'))).toBe(de['settings.title']);
    expect(text(q(s.el, '[data-setting="sound"] .settings-row__label'))).toBe(de['settings.sound']);
    expect(text(q(s.el, '.settings-row--motion .settings-row__label'))).toBe(de['settings.reduceMotion']);
    expect(text(q(s.el, '.segmented__opt[data-value="system"]'))).toBe(de['settings.reduceMotion.system']);
    expect(text(q(s.el, '.settings__shop-link .btn__label'))).toBe(de['settings.shop']);
    expect(text(q(s.el, '.settings__howto-link .btn__label'))).toBe(de['settings.howToPlay']);
    expect(q(s.el, '.overlay__close').getAttribute('aria-label')).toBe(de['common.close']);
  });

  it('a Shop opened before the switch reopens in the new language', async () => {
    const shop = createShopSheet();
    document.body.appendChild(shop.el);
    shop.open(shopProps());
    shop.close();
    await setLocale('de');
    shop.open(shopProps());
    expect(text(q(shop.el, '.overlay__title'))).toBe(de['shop.title']);
    // Phase 2c §5.2: the Buy section only.
    expect(text(q(shop.el, '.shop__section--buy .shop__heading'))).toBe(de['shop.buy']);
    expect(text(q(shop.el, '.shop__row[data-item="hints_15"] .shop__name'))).toBe(de['shop.product.hints_15.name']);
  });

  it('Home under a dialog: the tagline, the Hard badge and the top bar follow at once', async () => {
    const home = createHomeScreen(homeView(), homeCb());
    document.body.appendChild(home.el);
    await setLocale('de');
    expect(text(q(home.el, '.home__tagline'))).toBe(de['app.tagline']);
    expect(text(q(home.el, '.home__play .badge--hard'))).toBe(de['common.hard']);
    expect(text(q(home.el, '.home__play .btn__label'))).toBe(stripIsolates(t('home.play', { level: 37 })));
    expect(q(home.el, '.top-bar__btn--trophy').getAttribute('aria-label')).toBe(de['common.leaderboard']);
  });

  it('the game screen under Settings: top bar, rule chips and tools relabel; the board is untouched', async () => {
    const g = createGameScreen(gameView(), gameCb());
    document.body.appendChild(g.el);
    const board = q(g.el, '.board');
    await setLocale('de');
    expect(q(g.el, '.top-bar__btn--home').getAttribute('aria-label')).toBe(de['common.home']);
    expect(q(g.el, '.top-bar__btn--settings').getAttribute('aria-label')).toBe(de['common.settings']);
    expect(text(q(g.el, '.chip--colours .chip__text'))).toBe(de['game.chip.colours']);
    expect(q(g.el, '.tool--bulb').getAttribute('aria-label')).toBe(stripIsolates(t('game.tool.hint.a11y', { count: 5 })));
    expect(q(g.el, '.board')).toBe(board);
    // Lead (final integration): the board's and every cell's accessible name follow too, in place.
    expect(board.getAttribute('aria-label')).toBe(t('a11y.board', { n: 4 }));
    expect(board.getAttribute('aria-label')).not.toBe('Puzzle board, 4 by 4');
    const cell0 = q(g.el, '.cell[data-i="0"]');
    expect(cell0.getAttribute('aria-label')).not.toMatch(/^Row 1, column 1/);
    await setLocale('en');
    expect(board.getAttribute('aria-label')).toBe('Puzzle board, 4 by 4');
    expect(cell0.getAttribute('aria-label')).toMatch(/^Row 1, column 1, /);
  });

  it('the event screen relabels its static buttons and the track title', async () => {
    const ev = createEventScreen(eventView(), { onPlay: vi.fn(), onTopList: vi.fn(), onHome: vi.fn(), onSettings: vi.fn() });
    document.body.appendChild(ev.el);
    await setLocale('de');
    expect(text(q(ev.el, '.event__top .btn__label'))).toBe(de['event.topList']);
    expect(text(q(ev.el, '.event__home .btn__label'))).toBe(de['common.home']);
    expect(text(q(ev.el, '.event__track-title'))).toBe(de['event.track.title']);
  });
});

// ─────────────────────────────── PAR-5 ───────────────────────────────

describe('Settings → Feedback (PAR-5)', () => {
  it('is hidden by default (config support.feedbackUrl is empty) and shows a safe link when the app passes one', () => {
    expect(cfg.support.feedbackUrl).toBe('');
    expect(cfg.support.feedbackOnFbig).toBe(false);
    const s = createSettingsModal();
    s.open(settingsProps());
    const row = q<HTMLAnchorElement>(s.el, '.settings__feedback-link');
    expect(row.hidden).toBe(true);
    s.update(settingsProps({ feedbackUrl: 'https://example.org/feedback' }));
    expect(row.hidden).toBe(false);
    expect(row.getAttribute('href')).toBe('https://example.org/feedback');
    expect(row.getAttribute('target')).toBe('_blank');
    expect(row.getAttribute('rel')).toContain('noopener');
    expect(text(row)).toBe('Send feedback');
    // Before About, like the original's Settings → Feedback.
    expect(row.nextElementSibling?.classList.contains('settings__about-link')).toBe(true);
    s.update(settingsProps({ feedbackUrl: 'javascript:alert(1)' }));
    expect(row.hidden).toBe(true);
    expect(row.hasAttribute('href')).toBe(false);
  });
});

// ─────────────────────────────── PAR-7 ───────────────────────────────

describe('rule keywords and colour names styled in teaching copy (PAR-7)', () => {
  it('the hint card names the colour with a swatch in its tile colour; the words equal hintText()', () => {
    const card = createHintCard();
    document.body.appendChild(card.el);
    const props: HintCardProps = { ...ctxColors, step: hstep('confine_region_line', [reg(1), col(0)]), onApply: vi.fn(), onClose: vi.fn() };
    card.open(props);
    const p = q(card.el, '.hint-card__text');
    expect(p.textContent).toBe(hintText(props.step, props));
    const name = q(p, '.color-name');
    expect(text(name)).toBe('Apricot');
    expect(name.style.getPropertyValue('--sw')).toBe('var(--r1)');
    expect(q(name, '.color-name__sw').getAttribute('aria-hidden')).toBe('true');
  });

  it('a hint sentence that starts with a colour keeps its capital in the rich rendering', () => {
    const card = createHintCard();
    const props: HintCardProps = { ...ctxColors, step: hstep('single', [reg(0)]), onApply: vi.fn(), onClose: vi.fn() };
    card.open(props);
    expect(q(card.el, '.hint-card__text').textContent).toBe(hintText(props.step, props));
    expect(q(card.el, '.hint-card__text .color-name').textContent?.startsWith('Lavender')).toBe(true);
  });

  it('the coach prints the rule keyword in the accent class and the colour with its swatch', () => {
    vi.useFakeTimers();
    const coach = createCoach();
    document.body.appendChild(coach.el);
    const props: CoachProps = { step: 1, hand: 'double_tap', showGotIt: false, colorParam: 7, targetRects: () => [], softRects: () => [], onGotIt: vi.fn() };
    coach.open(props);
    vi.advanceTimersByTime(500);
    const p = q(coach.el, '.coach__text');
    expect(p.textContent).toBe(coachText(1, 7));
    expect(text(q(p, '.kw'))).toBe('exactly one cat');
    expect(text(q(p, '.color-name'))).toBe('Lavender');
    expect(coachText(1, 7)).not.toContain('*');
    expect(t('howto.rule.colours')).toBe('Every colour hides exactly one cat.');
  });

  it('How to play emphasises a keyword in each rule', () => {
    const howto = createHowToPlay();
    howto.open({ showSkip: false, showReplay: true, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn() });
    const rules = Array.from(howto.el.querySelectorAll('.howto-rule__text'));
    expect(rules).toHaveLength(3);
    for (const r of rules) expect(r.querySelectorAll('.kw')).toHaveLength(1);
    expect(rules[0]?.textContent).toBe(t('howto.rule.colours'));
  });
});

// ─────────────────────────────── PAR-8 ───────────────────────────────

describe('board-entry cue (PAR-8)', () => {
  it('board_in is a cue with a soft, short recipe of our own', () => {
    expect(SFX_IDS).toContain('board_in');
    const voices = recipe('board_in');
    expect(voices.length).toBeGreaterThan(1);
    for (const v of voices) {
      expect(v.peak).toBeLessThanOrEqual(0.2);
      expect(v.at + v.dur).toBeLessThanOrEqual(cfg.fx.boardEntryMs / 1000);
    }
    expect(voices.some((v) => v.kind === 'tone' && (v as ToneVoice).wave === 'sine')).toBe(true);
  });
});

// ─────────────────────────────── A11Y-LIVE-1 (Phase 2c: no swaps) ───────────────────────────────

describe('the shop has no swap to confirm any more (A11Y-LIVE-1 retired by Phase 2c §5.2)', () => {
  it('no swap buttons, no swap live region, no "Not enough fish" note', () => {
    const shop = createShopSheet();
    document.body.appendChild(shop.el);
    shop.open(shopProps());
    expect(shop.el.querySelector('.shop__swap, .shop__live, .shop__note')).toBeNull();
    // The buy states keep their own status / alert roles for screen readers.
    shop.update(shopProps({ buy: { kind: 'error' } }));
    expect(q(shop.el, '.shop__state').getAttribute('role')).toBe('alert');
    shop.update(shopProps({ buy: { kind: 'loading' } }));
    expect(q(shop.el, '.shop__state').getAttribute('role')).toBe('status');
  });
});

// ─────────────────────────────── victory: A11Y-NAME-1, I18N-RTL-1, UX-1 ───────────────────────────────

describe('victory screen review fixes', () => {
  it('the event progress bar is named by its visible "7 / 21 solved" line (A11Y-NAME-1)', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(
      victoryProps({
        variant: 'event',
        level: null,
        nextLevel: null,
        event: { nameKey: 'event.lantern.name' as I18nKey, index: 6, total: 21, solvedBefore: 6, solvedAfter: 7, reward: null, last: false },
      }),
    );
    const bar = q(v.el, '.victory__bar');
    const id = bar.getAttribute('aria-labelledby') ?? '';
    expect(id).not.toBe('');
    expect(text(q(v.el, `#${id}`))).toBe('7 / 21 solved');
  });

  it('Arabic: the reward\'s "+" resolves right to left (RLI), not after the word (I18N-RTL-1)', async () => {
    await setLocale('ar');
    const line = t('victory.eventReward', { reward: rewardText({ hints: 2 }) });
    expect(line).toContain(`${RLI}+`);
  });

  it('fitLevel picks the first compaction step that fits, else the last (UX-1)', () => {
    expect(fitLevel(() => -10)).toBe(0);
    expect(fitLevel((lv) => (lv < 2 ? 40 : 0))).toBe(2);
    expect(fitLevel(() => 500)).toBe(FIT_LEVELS);
  });

  it('a victory taller than the screen compacts its hero step by step (data-fit) until it fits (UX-1)', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    const root = q(v.el, '.victory');
    // A short phone: the content is 120 px too tall, each step saves 60 px.
    vi.spyOn(v.el, 'clientHeight', 'get').mockReturnValue(568);
    vi.spyOn(v.el, 'scrollHeight', 'get').mockImplementation(() => 688 - 60 * Number(root.dataset.fit ?? 0));
    v.open(victoryProps({ variant: 'daily', level: null, nextLevel: null, bannerReserved: true, daily: { dateKey: '2026-11-16', ms: 61_000, mistakes: 0, hints: 0, kitties: 0, nextPuzzleAt: DAY } }));
    expect(root.dataset.fit).toBe('2');
    expect(root.hasAttribute('data-banner')).toBe(true);
  });
});

// ─────────────────────────────── A11Y-DL-1 ───────────────────────────────

describe('event personal records use a <dl> for their rows (A11Y-DL-1)', () => {
  it('every dt/dd sits in a dl', () => {
    const host = document.createElement('div');
    renderRankList(
      host,
      { kind: 'records', reason: 'local', records: { board: 'event', thisMs: 400_000, n: 0, bestSizeMs: null, totalPoints: 0, levelsSolved: 0, event: { solved: 2, total: 21, totalMs: 400_000 } } },
      { onSeeTop: vi.fn() },
    );
    const dts = Array.from(host.querySelectorAll('dt, dd'));
    expect(dts.length).toBeGreaterThan(0);
    for (const el of dts) expect(el.closest('dl'), el.outerHTML).not.toBeNull();
    expect(text(q(host, '.rank-records__event'))).toContain('2 of 21');
  });
});

// ─────────────────────────────── A11Y-HUB-1 ───────────────────────────────

const hubProps = (over: Partial<RankHubProps> = {}): RankHubProps => ({
  tabs: ['period', 'daily', 'event'],
  tab: 'period',
  eventNameKey: 'event.lantern.name' as I18nKey,
  periodKind: 'week',
  list: { kind: 'loading' },
  groups: null,
  now: () => 0,
  onTab: vi.fn(),
  onSeeTop: vi.fn(),
  onListArea: vi.fn(),
  onStartGroup: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('arrow keys follow the visual order in right-to-left layouts (A11Y-HUB-1)', () => {
  it('arrowStep mirrors only the horizontal keys', () => {
    expect([arrowStep('ArrowRight', false), arrowStep('ArrowLeft', false)]).toEqual([1, -1]);
    expect([arrowStep('ArrowRight', true), arrowStep('ArrowLeft', true)]).toEqual([-1, 1]);
    expect([arrowStep('ArrowDown', true), arrowStep('ArrowUp', true), arrowStep('Home', true)]).toEqual([1, -1, 0]);
  });

  it('rankings hub in Arabic: ArrowRight moves to the tab on the right (the previous one)', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      const hub = createRankHub();
      document.body.appendChild(hub.el);
      const p = hubProps({ tab: 'daily' });
      hub.open(p);
      const tabs = Array.from(hub.el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      tabs[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(p.onTab).toHaveBeenLastCalledWith('period');
      tabs[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(p.onTab).toHaveBeenLastCalledWith('event');
    } finally {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  });

  it('Settings → Reduce motion in Arabic: ArrowRight picks the option on the right', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      const s = createSettingsModal();
      document.body.appendChild(s.el);
      const p = settingsProps({ settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'on' } });
      s.open(p);
      q(s.el, '.segmented').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(p.onChange).toHaveBeenLastCalledWith({ reduceMotion: 'system' });
    } finally {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  });
});

// ─────────────────────────────── I18N-TEXT-2 / UX-8 ───────────────────────────────

describe('the top-bar title keeps its " · N" suffix (I18N-TEXT-2, UX-8)', () => {
  it('splitTitle splits at the last " · "', () => {
    expect(splitTitle('Progulka s fonaryami · 3')).toEqual({ name: 'Progulka s fonaryami', suffix: ' · 3' });
    expect(splitTitle('Daily · Tue 6 Oct')).toEqual({ name: 'Daily', suffix: ' · Tue 6 Oct' });
    expect(splitTitle('Level 37')).toEqual({ name: 'Level 37', suffix: '' });
  });

  it('renders a shrinking name and a separate suffix; the h1 reads the whole title', () => {
    const bar = createTopBar({ title: 'Lantern Walk · 13', hard: false, showHome: true, showSettings: true, showTrophy: false, fbSafeZone: false }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    expect(q(bar.el, '.top-bar__text').textContent).toBe('Lantern Walk · 13');
    expect(q(bar.el, '.top-bar__name').textContent).toBe('Lantern Walk');
    expect(q(bar.el, '.top-bar__suffix').textContent).toBe(' · 13');
    bar.update({ title: 'Level 38', hard: false, showHome: true, showSettings: true, showTrophy: false, fbSafeZone: false });
    expect(q(bar.el, '.top-bar__suffix').hidden).toBe(true);
  });
});

// ─────────────────────────────── UX-3, UX-9 ───────────────────────────────

describe('the FB safe zone reaches the overlays (UX-3, UX-9)', () => {
  it('a top bar with fbSafeZone marks <html data-fb-safe>, which the overlay rules read', () => {
    const bar = createTopBar({ title: null, hard: false, showHome: false, showSettings: true, showTrophy: false, fbSafeZone: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    document.body.appendChild(bar.el);
    expect(document.documentElement.hasAttribute('data-fb-safe')).toBe(true);
    const web = createTopBar({ title: null, hard: false, showHome: false, showSettings: true, showTrophy: false, fbSafeZone: false }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    void web;
    expect(document.documentElement.hasAttribute('data-fb-safe')).toBe(false);
  });

  it('a top-placed hint card on FBIG counts its taller inset in the flip decision', () => {
    expect(fbTopInset(document, 0)).toBe(0);
    document.documentElement.setAttribute('data-fb-safe', '');
    expect(fbTopInset(document, 0)).toBe(cfg.layout.fbSafeZonePx - 12);
    expect(fbTopInset(document, 80)).toBe(80);
  });
});

// ─────────────────────────────── UX-2 ───────────────────────────────

describe('Home: the hero fits its space (UX-2, I18N-LAYOUT-2)', () => {
  it('fittedMascot shrinks by the overflow and gives up below the minimum', () => {
    expect(fittedMascot(180, 0)).toBe(180);
    expect(fittedMascot(180, 52)).toBe(128);
    expect(fittedMascot(120, 120 - MASCOT_MIN_PX + 1)).toBeNull();
  });

  it('shrinks the mascot until it ends above the cards, then drops the tagline', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const home = createHomeScreen(homeView(), homeCb());
    document.body.appendChild(home.el);
    const hero = q(home.el, '.home__hero');
    const box = q(home.el, '.home__mascot');
    const svg = q<SVGSVGElement & HTMLElement>(home.el, '.home__mascot > svg');
    const rect = (top: number, h: number) => ({ top, bottom: top + h, height: h, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    // The hero ends at 260; the mascot's natural size is 180 and it starts at 140 (+ 40 when the tagline shows).
    const size = (): number => (svg.style.height ? parseFloat(svg.style.height) : 180);
    const start = (): number => (home.el.hasAttribute('data-tight') ? 110 : 140);
    vi.spyOn(hero, 'getBoundingClientRect').mockImplementation(() => rect(56, 204));
    vi.spyOn(svg, 'getBoundingClientRect').mockImplementation(() => rect(start(), size()));
    vi.spyOn(box, 'getBoundingClientRect').mockImplementation(() => rect(start(), size()));
    home.update(homeView({ bannerReserved: true }));
    expect(home.el.hasAttribute('data-tight')).toBe(false);
    expect(svg.style.height).toBe('120px');
    // Less room: even the minimum does not fit with the tagline, so it goes first.
    vi.spyOn(hero, 'getBoundingClientRect').mockImplementation(() => rect(56, 130));
    home.update(homeView({ bannerReserved: true, event: null }));
    expect(home.el.getAttribute('data-tight')).toBe('1');
    expect(parseFloat(svg.style.height)).toBeGreaterThanOrEqual(MASCOT_MIN_PX);
    expect(raf).toHaveBeenCalled();
  });
});

// ─────────────────────────────── UX-14 ───────────────────────────────

describe('the coach card and the tool row (UX-14)', () => {
  const r = (top: number, bottom: number) => ({ left: 0, right: 390, top, bottom });

  it('prefers the gap between the board and the tools when the card fits there', () => {
    const board = { ...r(286, 642), weight: 3 };
    const gap = 760 - 8 - 57;
    expect(placeCard([r(400, 440)], 57, 844, [board], [gap])).toBe(gap);
    // No room in the gap (it would cover the board): the bottom slot, as before.
    expect(placeCard([r(400, 440)], 57, 568, [{ ...r(176, 464), weight: 3 }], [484 - 8 - 57])).toBe(568 - 12 - 57);
  });

  it('a card over the tools reaches above their badges, never onto the board or a target', () => {
    const tools = r(484, 552);
    expect(coverBadges(499, 57, tools, 484, 466)).toBe(480);
    expect(coverBadges(400, 57, tools, 484, 466)).toBe(400); // clear of the tools
    expect(coverBadges(499, 57, tools, 484, 482)).toBe(499); // the board ends below the new top
    expect(coverBadges(499, 57, tools, 484, 0, [r(470, 476)])).toBe(499); // a target right above
    expect(coverBadges(499, 57, null, null, 0)).toBe(499);
  });
});
