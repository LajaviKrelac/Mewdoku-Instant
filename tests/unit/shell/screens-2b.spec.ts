// Owner: B. Phase 2b screens and overlays outside the win flow: the Home fish pill and event card
// (§2.5, §4.4), the game screen's win-flow hooks and event mode (§2.2, §4.4), the event screen (§4.4),
// the shop sheet (§8.5), the group result (§5.6), the Settings Language / Shop / Remove ads rows
// (§6.8, §8.5) and the O2 swap button (§2.8).
import { afterEach, describe, expect, it, vi } from 'vitest';
import eventsJson from '../../../src/data/events/events.json';
import { cfg } from '../../../src/app/config';
import type { EventDef } from '../../../src/game/events';
import { CellState } from '../../../src/game/types';
import { createGroupResult, groupResultBody, type GroupResultProps } from '../../../src/ui/overlays/group-result';
import { createRewardedPrompt, type RewardedPromptProps } from '../../../src/ui/overlays/rewarded-prompt';
import { createSettingsModal, languageName, type SettingsProps } from '../../../src/ui/overlays/settings-modal';
import { createShopSheet, type ShopProps } from '../../../src/ui/overlays/shop-sheet';
import { createEventScreen, endsText, milestoneRewardText, type EventScreenView } from '../../../src/ui/screens/event-screen';
import { createGameScreen, gameTitle, type GameView } from '../../../src/ui/screens/game-screen';
import { createHomeScreen, eventStatusText, formatDaysHours, type HomeEventCardView, type HomeView } from '../../../src/ui/screens/home-screen';

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const lantern = (eventsJson as unknown as EventDef[])[0] as EventDef;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ─────────────────────────────── Home ───────────────────────────────

const homeView = (over: Partial<HomeView> = {}): HomeView => ({
  level: 37,
  hard: false,
  continueLevel: false,
  daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 },
  hints: 5,
  kitties: 3,
  showTrophy: false,
  fbSafeZone: false,
  extraCards: [],
  fish: 128,
  event: null,
  bannerReserved: false,
  ...over,
});
const homeCb = () => ({ onPlay: vi.fn(), onDaily: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn(), onCard: vi.fn(), onShop: vi.fn(), onEvent: vi.fn() });
const card = (state: HomeEventCardView['state'], over: Partial<HomeEventCardView> = {}): HomeEventCardView => ({
  def: lantern,
  state,
  now: 0,
  startsAt: 2 * DAY,
  endsAt: 3 * DAY + 4 * HOUR,
  solved: 7,
  total: 21,
  unlockLevel: 10,
  endsSoon: false,
  ...over,
});

describe('Home: fish pill, event card, banner (phase2b §2.5, §4.4, §3.2)', () => {
  it('puts the fish pill in the top bar after the safe zone; its "+" opens the shop', () => {
    const cb = homeCb();
    const home = createHomeScreen(homeView({ fbSafeZone: true }), cb);
    document.body.appendChild(home.el);
    const pill = q(home.el, '.top-bar .top-bar__slot .fish-pill');
    expect(q(pill, '.fish-pill__n').textContent).toBe('128');
    q(pill, '.fish-pill__plus').click();
    expect(cb.onShop).toHaveBeenCalledTimes(1);
    home.update(homeView({ fish: 1240 }));
    expect(q(pill, '.fish-pill__n').textContent).toBe('1,240');
  });

  it('active event card: above the Level button, status line, progress, a button labelled with its status', () => {
    const cb = homeCb();
    const home = createHomeScreen(homeView({ event: card('active') }), cb);
    const ev = q<HTMLButtonElement>(home.el, '.event-card');
    expect(ev.hidden).toBe(false);
    expect(ev.nextElementSibling?.classList.contains('home__play')).toBe(true);
    expect(q(ev, '.event-card__title').textContent).toBe('Lantern Walk');
    expect(q(ev, '.event-card__sub').textContent).toBe('Ends in 3 d 4 h · 7 / 21 solved');
    expect(ev.getAttribute('aria-label')).toBe('Lantern Walk. Ends in 3 d 4 h · 7 / 21 solved');
    expect(q(ev, '.event-card__fill').style.width).toBe(`${((7 / 21) * 100).toFixed(2)}%`);
    ev.click();
    expect(cb.onEvent).toHaveBeenCalledTimes(1);
    home.update(homeView({ event: card('active', { endsSoon: true }) }));
    expect(q(ev, '.event-card__sub').textContent).toBe('Ends soon! · 7 / 21 solved');
    expect(ev.hasAttribute('data-ends-soon')).toBe(true);
    home.update(homeView({ event: null }));
    expect(ev.hidden).toBe(true);
  });

  it('teaser is not tappable; locked and done have their lines', () => {
    const cb = homeCb();
    const home = createHomeScreen(homeView({ event: card('teaser') }), cb);
    const ev = q<HTMLButtonElement>(home.el, '.event-card');
    expect(q(ev, '.event-card__sub').textContent).toBe('Starts in 2 d 0 h');
    expect(ev.getAttribute('aria-disabled')).toBe('true');
    ev.click();
    expect(cb.onEvent).not.toHaveBeenCalled();
    home.update(homeView({ event: card('locked') }));
    expect(q(ev, '.event-card__sub').textContent).toBe('Opens after level 10');
    expect(ev.hasAttribute('aria-disabled')).toBe(false);
    home.update(homeView({ event: card('done') }));
    expect(q(ev, '.event-card__sub').textContent).toBe('All solved!');
    expect(eventStatusText(card('teaser', { now: 2 * DAY - 5 * HOUR }))).toBe('Starts in 5 h 0 min');
    expect(formatDaysHours(-5)).toBe('under a minute');
  });

  it("the card shows A's art once the app passes it, built again only for another event", () => {
    const art = vi.fn((def: EventDef) => {
      const el = document.createElement('div');
      el.className = `art-${def.id}`;
      return el;
    });
    const home = createHomeScreen(homeView({ event: card('active') }), homeCb());
    expect(q(home.el, '.event-card__art').children).toHaveLength(0);
    home.update(homeView({ event: card('active', { art }) }));
    home.update(homeView({ event: card('active', { art, solved: 8 }) }));
    expect(art).toHaveBeenCalledTimes(1);
    expect(art).toHaveBeenCalledWith(lantern, 'card');
    expect(home.el.querySelector(`.art-${lantern.id}`)).not.toBeNull();
  });

  it('bannerReserved sets data-banner and mirrors ads.banner.reservePx', () => {
    const home = createHomeScreen(homeView({ bannerReserved: true }), homeCb());
    expect(home.el.hasAttribute('data-banner')).toBe(true);
    expect(home.el.style.getPropertyValue('--banner-reserve')).toBe(`${cfg.ads.banner.reservePx}px`);
    home.update(homeView());
    expect(home.el.hasAttribute('data-banner')).toBe(false);
  });
});

// ─────────────────────────────── Game screen ───────────────────────────────

const N = 4;
function gameView(over: Partial<GameView> = {}): GameView {
  const cells = new Uint8Array(N * N);
  for (const i of [1, 7, 8, 14]) cells[i] = CellState.Cat;
  return {
    mode: 'level',
    level: 37,
    dateKey: null,
    hard: false,
    showHome: true,
    hearts: 3,
    maxHearts: 3,
    catsPlaced: 4,
    status: 'won',
    hints: 5,
    kitties: 3,
    hintsFree: false,
    bulbEnabled: true,
    pawEnabled: true,
    inputLocked: true,
    board: {
      puzzleId: 'L37',
      n: N,
      regions: Uint8Array.from([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]),
      colors: Uint8Array.from([0, 1, 2, 3]),
      cells,
      regionsDone: 15,
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

describe('game screen: win-flow hooks and event mode (phase2b §2.2, §4.4)', () => {
  it('fish pill hooks: hidden during play, shown and counted by the win flow', () => {
    const g = createGameScreen(gameView(), gameCb());
    document.body.appendChild(g.el);
    expect(g.fishRect()).toBeNull();
    g.showFishPill(125);
    expect(g.fishRect()).not.toBeNull();
    expect(q(g.el, '.pills .fish-pill .fish-pill__n').textContent).toBe('125');
    g.fishLabel('+3');
    expect(q(g.el, '.fish-pill__label').textContent).toBe('+3');
    g.destroy();
  });

  it('glow() lights the given cat cells of this board', async () => {
    const g = createGameScreen(gameView(), gameCb());
    document.body.appendChild(g.el);
    const h = g.glow([1, 7]);
    expect(q(g.el, '.cell[data-i="1"] .cell__glow').style.opacity).toBe(String(cfg.fx.win.glowSettleOpacity));
    expect(q(g.el, '.cell[data-i="8"] .cell__glow').style.opacity).toBe('');
    h.cancel();
    await expect(h.done).resolves.toBeUndefined();
    g.destroy();
  });

  it('showScrim() fades the scrim in once (t = 4 200)', () => {
    const g = createGameScreen(gameView(), gameCb());
    const scrim = q(g.el, '.game__scrim');
    expect(scrim.hidden).toBe(true);
    g.showScrim?.();
    expect(scrim.hidden).toBe(false);
    expect(scrim.style.getPropertyValue('--scrim-ms')).toBe(`${cfg.fx.win.scrimFadeMs}ms`);
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    g.destroy();
  });

  it('chromeLocked: Home and Gear are aria-disabled and ignore presses until the flow lets go', () => {
    const cb = gameCb();
    const g = createGameScreen(gameView({ chromeLocked: true }), cb);
    const home = q<HTMLButtonElement>(g.el, '.top-bar__btn--home');
    const gear = q<HTMLButtonElement>(g.el, '.top-bar__btn--settings');
    expect(home.getAttribute('aria-disabled')).toBe('true');
    expect(gear.getAttribute('aria-disabled')).toBe('true');
    home.click();
    gear.click();
    expect(cb.onHome).not.toHaveBeenCalled();
    expect(cb.onSettings).not.toHaveBeenCalled();
    g.update(gameView({ chromeLocked: false }));
    expect(home.hasAttribute('aria-disabled')).toBe(false);
    home.click();
    expect(cb.onHome).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('event mode: "{event} · {index + 1}" title, data-event-theme and the accessory over the cats', () => {
    const v = gameView({ mode: 'event', level: null, event: { def: lantern, index: 12 } });
    expect(gameTitle(v)).toBe('Lantern Walk · 13');
    const g = createGameScreen(v, gameCb());
    expect(q(g.el, '.top-bar__text').textContent).toBe('Lantern Walk · 13');
    expect(g.el.dataset.eventTheme).toBe(lantern.id);
    expect(Array.from(g.el.querySelectorAll('use.cell__acc')).map((u) => u.getAttribute('href'))).toEqual(Array(4).fill('#acc-lantern'));
    g.update(gameView());
    expect(g.el.dataset.eventTheme).toBeUndefined();
    expect(g.el.querySelectorAll('use.cell__acc')).toHaveLength(0);
    g.destroy();
  });
});

// ─────────────────────────────── Event screen ───────────────────────────────

const eventView = (over: Partial<EventScreenView> = {}): EventScreenView => ({
  def: lantern,
  now: 0,
  endsAt: 3 * DAY + 4 * HOUR,
  solved: 7,
  total: 21,
  track: lantern.track.map((m) => ({ ...m, reached: 7 >= m.at })),
  nextIndex: 7,
  fbSafeZone: false,
  reducedMotion: false,
  bannerReserved: false,
  ...over,
});

describe('event screen (phase2b §4.4)', () => {
  it('header, "Ends in", the milestone track, Play / Top list / Home in that tab order', () => {
    const cb = { onPlay: vi.fn(), onTopList: vi.fn(), onHome: vi.fn(), onSettings: vi.fn() };
    const s = createEventScreen(eventView(), cb);
    document.body.appendChild(s.el);
    expect(s.el.dataset.eventTheme).toBe(lantern.id);
    expect(q(s.el, '.event__name').textContent).toBe('Lantern Walk');
    expect(q(s.el, '.event__tagline').textContent).toBe('Light the way, one cat at a time.');
    expect(q(s.el, '.event__ends').textContent).toBe('Ends in 3 d 4 h');
    const nodes = Array.from(s.el.querySelectorAll<HTMLElement>('.event__node'));
    expect(nodes).toHaveLength(5);
    expect(nodes.map((n) => n.hasAttribute('data-reached'))).toEqual([true, true, false, false, false]);
    expect(nodes[0]?.getAttribute('aria-label')).toBe('3 solved: 2 hints. Reached.');
    expect(nodes[4]?.getAttribute('aria-label')).toBe('21 solved: 100 fish + 3 kitties');
    // Node spans add up to the whole rail.
    const total = nodes.reduce((a, n) => a + Number(n.style.getPropertyValue('--seg')), 0);
    expect(total).toBeCloseTo(1, 3);
    expect(q(s.el, '.event__rail-fill').style.width).toBe(`${((7 / 21) * 100).toFixed(2)}%`);
    expect(q(s.el, '.event__progress').textContent).toBe('7 / 21 solved');
    const order = Array.from(s.el.querySelectorAll<HTMLButtonElement>('.event__actions button')).map((b) => b.className.split(' ').find((c) => c.startsWith('event__')));
    expect(order).toEqual(['event__play', 'event__top', 'event__home']);
    expect(q(s.el, '.event__play').textContent).toBe('Play puzzle 8');
    q(s.el, '.event__play').click();
    q(s.el, '.event__top').click();
    q(s.el, '.event__home').click();
    q(s.el, '.top-bar__btn--settings').click();
    expect([cb.onPlay, cb.onTopList, cb.onHome, cb.onSettings].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(q<HTMLElement>(s.el, '.top-bar__btn--home').hidden).toBe(true);
    s.destroy();
    expect(s.el.isConnected).toBe(false);
  });

  it('all solved: no Play, "All solved!", Top list first; ends soon; banner reserve', () => {
    const s = createEventScreen(eventView({ solved: 21, nextIndex: null, track: lantern.track.map((m) => ({ ...m, reached: true })), endsAt: 20 * HOUR, bannerReserved: true }), {
      onPlay: vi.fn(),
      onTopList: vi.fn(),
      onHome: vi.fn(),
      onSettings: vi.fn(),
    });
    expect(q<HTMLElement>(s.el, '.event__play').hidden).toBe(true);
    expect(q(s.el, '.event__done').textContent).toBe('All solved!');
    expect(q(s.el, '.event__top').hasAttribute('data-autofocus')).toBe(true);
    expect(q(s.el, '.event__ends').textContent).toBe('Ends soon!');
    expect(q(s.el, '.event__ends').hasAttribute('data-soon')).toBe(true);
    expect(s.el.hasAttribute('data-banner')).toBe(true);
    expect(endsText(0, (cfg.events.cardEndsSoonHours + 1) * HOUR).soon).toBe(false);
    expect(milestoneRewardText({ fish: 30 })).toBe('30 fish');
  });
});

// ─────────────────────────────── Shop ───────────────────────────────

function shopProps(over: Partial<ShopProps> = {}): ShopProps {
  return {
    fish: 128,
    hintPrice: cfg.shop.hintFish,
    kittyPrice: cfg.shop.kittyFish,
    buy: { kind: 'hidden' },
    busy: false,
    onSwap: vi.fn(),
    onBuy: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('shop sheet (phase2b §8.5)', () => {
  it('web: the balance and "Swap fish" only; each swap is disabled below its price', () => {
    const shop = createShopSheet();
    document.body.appendChild(shop.el);
    const p = shopProps({ fish: 20 });
    shop.open(p);
    expect(q(shop.el, '.shop__balance .fish-pill__n').textContent).toBe('20');
    expect(q<HTMLElement>(shop.el, '.shop__section--buy').hidden).toBe(true);
    const hint = q<HTMLButtonElement>(shop.el, '.shop__row[data-item="hint"] .shop__swap');
    const kitty = q<HTMLButtonElement>(shop.el, '.shop__row[data-item="kitty"] .shop__swap');
    expect(hint.getAttribute('aria-label')).toBe('Swap 15 fish for 1 hint');
    expect(kitty.getAttribute('aria-label')).toBe('Swap 30 fish for 1 kitty');
    expect(hint.hasAttribute('aria-disabled')).toBe(false);
    expect(kitty.getAttribute('aria-disabled')).toBe('true');
    hint.click();
    kitty.click();
    expect(p.onSwap).toHaveBeenCalledTimes(1);
    expect(p.onSwap).toHaveBeenCalledWith('hint');
    expect(q<HTMLElement>(shop.el, '.shop__note').hidden).toBe(true);
    shop.update(shopProps({ fish: 14 }));
    expect(q<HTMLElement>(shop.el, '.shop__note').hidden).toBe(false);
    expect(q(shop.el, '.shop__note').textContent).toBe('Not enough fish yet.');
    // Exactly the price is enough.
    shop.update(shopProps({ fish: 30 }));
    expect(kitty.hasAttribute('aria-disabled')).toBe(false);
  });

  it('FB ready: five products with our names, the catalogue price and Buy, or "Owned" for No Ads; busy disables all', () => {
    const shop = createShopSheet();
    const p = shopProps({
      buy: {
        kind: 'ready',
        products: [
          { id: 'remove_ads', price: '$3.99', owned: true },
          { id: 'hints_15', price: '$1.99', owned: false },
          { id: 'kitties_8', price: '$1.99', owned: false },
          { id: 'fish_250', price: '$1.99', owned: false },
          { id: 'fish_900', price: '$4.99', owned: false },
        ],
      },
    });
    shop.open(p);
    const rows = Array.from(shop.el.querySelectorAll<HTMLElement>('.shop__list .shop__row'));
    expect(rows.map((r) => q(r, '.shop__name').textContent)).toEqual(['No Ads', 'Bulb Bundle', 'Kitty Basket', 'Fish Bucket', 'Fish Crate']);
    expect(q(rows[0] as HTMLElement, '.shop__owned').textContent).toBe('Owned');
    expect(rows[0]?.querySelector('.shop__buy')).toBeNull();
    const buy = q<HTMLButtonElement>(rows[4] as HTMLElement, '.shop__buy');
    expect(buy.getAttribute('aria-label')).toBe('Buy Fish Crate, $4.99');
    expect(q(buy, '.shop__cost').textContent).toBe('$4.99');
    buy.click();
    expect(p.onBuy).toHaveBeenCalledWith('fish_900');
    shop.update({ ...p, busy: true });
    for (const b of Array.from(shop.el.querySelectorAll('.shop__action'))) expect(b.getAttribute('aria-disabled')).toBe('true');
    buy.click();
    expect(p.onBuy).toHaveBeenCalledTimes(1);
  });

  it('loading, unavailable and error (with retry) states; Esc and the scrim close', () => {
    const shop = createShopSheet();
    const p = shopProps({ buy: { kind: 'loading' } });
    shop.open(p);
    expect(q(shop.el, '.shop__state').textContent).toBe('Getting the shop ready…');
    shop.update({ ...p, buy: { kind: 'unavailable' } });
    expect(q(shop.el, '.shop__state').textContent).toBe("Purchases aren't available here.");
    expect(q<HTMLElement>(shop.el, '.shop__retry').hidden).toBe(true);
    shop.update({ ...p, buy: { kind: 'error' } });
    expect(q(shop.el, '.shop__state').textContent).toBe("We couldn't finish that purchase. Please try again.");
    q(shop.el, '.shop__retry').click();
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    q(shop.el, '.overlay__scrim').click();
    expect(shop.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('arrow keys move between the actions', () => {
    const shop = createShopSheet();
    document.body.appendChild(shop.el);
    shop.open(shopProps({ fish: 100, buy: { kind: 'ready', products: [{ id: 'hints_15', price: '$1.99', owned: false }] } }));
    const actions = Array.from(shop.el.querySelectorAll<HTMLElement>('.shop__action'));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    actions[0]?.focus();
    actions[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(actions[1]);
    actions[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(actions[0]);
  });
});

// ─────────────────────────────── Group result ───────────────────────────────

describe('group result (phase2b §5.6)', () => {
  const props = (outcome: GroupResultProps['outcome'], busy = false): GroupResultProps => ({ outcome, busy, onTake: vi.fn(), onDouble: vi.fn() });

  it('participation: "finished", never "won"; Take 2 kitties or Watch a video for 4', () => {
    const d = createGroupResult();
    const p = props({ kind: 'participation', kitties: 2, kittiesWithAd: 4 });
    d.open(p);
    expect(q(d.el, '.overlay__body').textContent).toBe('Your group challenge has finished. Thanks for playing!');
    expect(d.el.textContent?.toLowerCase()).not.toContain('won');
    expect(q(d.el, '.group-result__take').textContent).toBe('Take 2 kitties');
    expect(q(d.el, '.group-result__double').textContent).toBe('Watch a video for 4 kitties');
    q(d.el, '.group-result__double').click();
    expect(p.onDouble).toHaveBeenCalledTimes(1);
    expect(d.dismiss()).toBe(true);
    expect(p.onTake).toHaveBeenCalledTimes(1);
    d.update(props({ kind: 'participation', kitties: 2, kittiesWithAd: null }));
    expect(q<HTMLElement>(d.el, '.group-result__double').hidden).toBe(true);
  });

  it('rank mode: won, or a place with fish for taking part; busy gates both', () => {
    expect(groupResultBody({ kind: 'won', kitties: 2, kittiesWithAd: 4 })).toBe('You won your group challenge!');
    const d = createGroupResult();
    const p = props({ kind: 'place', place: 3, count: 8, fish: 10 }, true);
    d.open(p);
    expect(q(d.el, '.overlay__body').textContent).toBe('You finished #3 of 8. Thanks for playing: +10 fish');
    expect(q(d.el, '.group-result__take').textContent).toBe('Take 10 fish');
    expect(q(d.el, '.group-result__take').getAttribute('aria-disabled')).toBe('true');
    expect(d.dismiss()).toBe(false);
  });
});

// ─────────────────────────────── Settings and O2 ───────────────────────────────

function settingsProps(over: Partial<SettingsProps> = {}): SettingsProps {
  return {
    settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
    showVibration: true,
    version: '0.2.0',
    onChange: vi.fn(),
    onHowToPlay: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('Settings rows (phase2b §6.8, §8.5)', () => {
  it('Language, Shop and Remove ads appear only with their props', () => {
    const s = createSettingsModal();
    s.open(settingsProps());
    expect(q<HTMLElement>(s.el, '.settings__language-link').hidden).toBe(true);
    expect(q<HTMLElement>(s.el, '.settings__shop-link').hidden).toBe(true);
    expect(q<HTMLElement>(s.el, '.settings__removeads-link').hidden).toBe(true);
    const onShop = vi.fn();
    const onRemoveAds = vi.fn();
    s.update(settingsProps({ onShop, onRemoveAds, language: { current: 'auto', locales: ['en', 'es'], onPick: vi.fn() } }));
    expect(q<HTMLElement>(s.el, '.settings__language-link').hidden).toBe(false);
    expect(q(s.el, '.settings__language-link .settings-row__value').textContent).toBe('Automatic');
    q(s.el, '.settings__shop-link').click();
    q(s.el, '.settings__removeads-link').click();
    expect(onShop).toHaveBeenCalledTimes(1);
    expect(onRemoveAds).toHaveBeenCalledTimes(1);
  });

  it('the Language view lists Automatic and the endonyms as a radio group; a pick calls onPick; Esc goes back', () => {
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    const onPick = vi.fn();
    const p = settingsProps({ language: { current: 'es', locales: ['en', 'es', 'ar'], onPick } });
    s.open(p);
    q(s.el, '.settings__language-link').click();
    expect(q(s.el, '.settings').dataset.view).toBe('language');
    const group = q(s.el, '.lang-list');
    expect(group.getAttribute('role')).toBe('radiogroup');
    const opts = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(opts.map((o) => o.textContent)).toEqual(['Automatic', 'English', 'Español', 'العربية']);
    expect(opts.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
    expect(opts[3]?.getAttribute('lang')).toBe('ar');
    expect(document.activeElement).toBe(opts[2]);
    opts[1]?.click();
    expect(onPick).toHaveBeenCalledWith('en');
    opts[2]?.click(); // the current one: nothing to do
    expect(onPick).toHaveBeenCalledTimes(1);
    opts[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(onPick).toHaveBeenLastCalledWith('ar');
    expect(s.dismiss()).toBe(true);
    expect(q(s.el, '.settings').dataset.view).toBe('main');
    expect(p.onClose).not.toHaveBeenCalled();
    expect(languageName('auto')).toBe('Automatic');
    expect(languageName('ja')).toBe('日本語');
  });
});

describe('O2 swap (phase2b §2.8)', () => {
  function prompt(over: Partial<RewardedPromptProps> = {}): RewardedPromptProps {
    return { placement: 'hint', variant: 'video', nextFreeAt: 0, now: () => 0, onAccept: vi.fn(), onDecline: vi.fn(), ...over };
  }

  it('"Swap 15 fish" sits between Watch video and Not now when the wallet covers it', () => {
    const o = createRewardedPrompt();
    const onSwap = vi.fn();
    o.open(prompt({ swap: { price: 15, balance: 128, onSwap } }));
    const visible = Array.from(o.el.querySelectorAll<HTMLButtonElement>('.overlay__actions button')).filter((b) => !b.hidden);
    expect(visible.map((b) => b.className.split(' ').find((c) => c.startsWith('rewarded__')))).toEqual(['rewarded__accept', 'rewarded__swap', 'rewarded__decline']);
    const swap = q(o.el, '.rewarded__swap');
    expect(swap.textContent).toBe('Swap 15 fish');
    expect(swap.querySelector('use')?.getAttribute('href')).toBe('#icon-fish');
    swap.click();
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('is hidden below the price and without swap props; shown in the countdown variant too', () => {
    const o = createRewardedPrompt();
    o.open(prompt({ swap: { price: 15, balance: 14, onSwap: vi.fn() } }));
    expect(q<HTMLElement>(o.el, '.rewarded__swap').hidden).toBe(true);
    o.update(prompt());
    expect(q<HTMLElement>(o.el, '.rewarded__swap').hidden).toBe(true);
    o.update(prompt({ placement: 'kitty', variant: 'countdown', nextFreeAt: 60_000, swap: { price: 30, balance: 30, onSwap: vi.fn() } }));
    expect(q<HTMLElement>(o.el, '.rewarded__swap').hidden).toBe(false);
    expect(q(o.el, '.rewarded__swap').textContent).toBe('Swap 30 fish');
    o.close();
  });
});
