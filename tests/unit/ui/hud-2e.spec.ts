// Owner: G3 (Phase 2e)
// The main-bundle and overlay-chunk parts of Phase 2e (spec §2.3, §2.5, §2.7, §4.1, §4.6, §5.3, §6.1, §9.4,
// §10.1): the Home ranking chip and its four states, the streak strip and its states, Home's lead slot and
// strip placement, the victory's streak row and daily reward line, O2's Buy rows in their four states (and
// the countdown variant with Buy), the Settings ranking rows with the delete confirmation, How to play's
// ranking and streak notes, and the in-game counter's 'ladder' name.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createLadderChip, ladderChipLabel, type LadderChipView } from '../../../src/ui/hud/ladder-chip';
import { createPills, type PillsProps } from '../../../src/ui/hud/pills';
import { createStreakStrip, streakStepKinds, streakStripModel, type StreakStripView } from '../../../src/ui/hud/streak-strip';
import { createHowToPlay, type HowToPlayProps } from '../../../src/ui/overlays/how-to-play';
import { buyA11y, buyLabel, createRewardedPrompt, type O2BuyView, type RewardedPromptProps } from '../../../src/ui/overlays/rewarded-prompt';
import { createSettingsModal, type SettingsLadderRows, type SettingsProps } from '../../../src/ui/overlays/settings-modal';
import { createVictoryScreen, type VictoryProps } from '../../../src/ui/overlays/victory-screen';
import { periodPillLabel, periodResultText, periodTotalText, fishKeptText } from '../../../src/ui/period-text';
import { createHomeScreen, type HomeView } from '../../../src/ui/screens/home-screen';

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const H = 3_600_000;

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const href = (el: Element | null | undefined): string | null => el?.querySelector('use')?.getAttribute('href') ?? null;

// ─────────────────────────────── the chip ───────────────────────────────

const BRACKET: LadderChipView = { state: 'bracket', rank: 5, members: 37, points: 14, endsAt: NOW + 7 * H + 48 * 60_000, now: () => NOW };

describe('Home ranking chip (spec §2.5 table, §9.4)', () => {
  it('in a bracket: trophy "#5" · fish "14", named with the server rank, count and the countdown', () => {
    const onPress = vi.fn();
    const chip = createLadderChip(BRACKET, { onPress });
    expect(chip.el.tagName).toBe('BUTTON');
    expect(chip.el.dataset.state).toBe('bracket');
    expect(q(chip.el, '.ladder-chip__rank').textContent).toBe('#5');
    expect(q(chip.el, '.ladder-chip__points').textContent).toBe('14');
    expect(href(q(chip.el, '.ladder-chip__points'))).toBe('#icon-fish');
    expect(chip.el.getAttribute('aria-label')).toBe('Daily ranking: #5 of 37, 14 fish. Ends in 7 h 48 min.');
    chip.el.click();
    expect(onPress).toHaveBeenCalledTimes(1);
    chip.destroy();
  });

  it('join, off, records and a rank the server did not give', () => {
    const chip = createLadderChip({ state: 'join' }, { onPress: vi.fn() });
    expect(q(chip.el, '.ladder-chip__rank').textContent).toBe('Join');
    expect(q(chip.el, '.ladder-chip__points').hidden).toBe(true);
    expect(chip.el.getAttribute('aria-label')).toBe('Daily ranking: solve a puzzle to join.');
    chip.update({ state: 'off' });
    expect(chip.el.dataset.state).toBe('off');
    expect(q(chip.el, '.ladder-chip__rank').hidden).toBe(true);
    expect(chip.el.getAttribute('aria-label')).toBe('Daily ranking: off.');
    chip.update({ state: 'records', period: { kind: 'week', total: 42 } });
    expect(q(chip.el, '.ladder-chip__points').textContent).toBe('42');
    expect(q(chip.el, '.ladder-chip__points').hasAttribute('data-plain')).toBe(true);
    expect(chip.el.getAttribute('aria-label')).toBe('42 fish this week');
    chip.update({ ...BRACKET, rank: null });
    expect(q(chip.el, '.ladder-chip__rank').hidden).toBe(true);
    expect(chip.el.getAttribute('aria-label')).toBe('Daily ranking: 14 fish');
    chip.destroy();
  });

  it('the name refreshes its countdown once a minute (never a live region)', () => {
    vi.useFakeTimers();
    let now = NOW;
    const chip = createLadderChip({ ...BRACKET, endsAt: NOW + 2 * H, now: () => now }, { onPress: vi.fn() });
    expect(ladderChipLabel({ ...BRACKET, endsAt: NOW + 2 * H, now: () => now })).toContain('Ends in 2 h 0 min');
    now += 60_000;
    vi.advanceTimersByTime(60_000);
    expect(chip.el.getAttribute('aria-label')).toContain('Ends in 1 h 59 min');
    expect(chip.el.hasAttribute('aria-live')).toBe(false);
    chip.destroy();
  });
});

// ─────────────────────────────── the streak strip ───────────────────────────────

const strip = (v: StreakStripView): ReturnType<typeof createStreakStrip> => createStreakStrip(v);

describe('streak strip (spec §5.3 table): calm, no urgency', () => {
  it('none and new: 7 empty steps and the neutral line', () => {
    const s = strip({ state: 'none', day: 0, total: 7, rewardDay: false });
    expect(s.el.getAttribute('role')).toBe('img');
    expect(s.el.dataset.state).toBe('none');
    expect(s.el.dataset.day).toBe('0');
    expect(s.el.dataset.today).toBe('0');
    expect(q(s.el, '.streak-strip__text').textContent).toBe('Solve a puzzle to start a streak.');
    expect(q(s.el, '.streak-strip__day').hidden).toBe(true);
    expect(qa(s.el, '.streak-step').map((e) => e.dataset.kind)).toEqual(Array(7).fill('empty'));
    expect(qa(s.el, '.streak-step')[6]?.querySelector('use')?.getAttribute('href')).toBe('#streak-step-chest');
    s.update({ state: 'new', day: 0, total: 7, rewardDay: false });
    expect(s.el.dataset.state).toBe('none');
    expect(s.el.hasAttribute('data-broken')).toBe(true);
    expect(s.el.getAttribute('aria-label')).toBe('A new streak starts today.');
    expect(s.el.textContent).not.toMatch(/lose|hurry|last chance|!/i);
  });

  it('alive: "Day 3 of 7 · Solve a puzzle today for day 4." with 3 done and step 4 outlined', () => {
    const s = strip({ state: 'alive', day: 3, total: 7, rewardDay: false });
    expect(s.el.dataset.state).toBe('alive');
    expect(s.el.dataset.day).toBe('3');
    expect(q(s.el, '.streak-strip__day').textContent).toBe('Day 3 of 7');
    expect(q(s.el, '.streak-strip__text').textContent).toBe('Solve a puzzle today for day 4.');
    expect(s.el.getAttribute('aria-label')).toBe('Streak: day 3 of 7. Solve a puzzle today for day 4.');
    expect(qa(s.el, '.streak-step').map((e) => e.dataset.kind)).toEqual(['done', 'done', 'done', 'next', 'empty', 'empty', 'empty']);
    const uses = qa(s.el, '.streak-step').map((e) => e.querySelector('use')?.getAttribute('href'));
    expect(uses).toEqual(['#streak-step-done', '#streak-step-done', '#streak-step-done', '#streak-step-empty', '#streak-step-empty', '#streak-step-empty', '#streak-step-chest']);
  });

  it('done: "Today counts!" with today\'s soft check; day 7 "Streak reward collected!" and the chest open', () => {
    const s = strip({ state: 'done', day: 4, total: 7, rewardDay: false });
    expect(s.el.dataset.today).toBe('1');
    expect(q(s.el, '.streak-strip__text').textContent).toBe('Today counts!');
    expect(qa(s.el, '.streak-step').map((e) => e.dataset.kind)).toEqual(['done', 'done', 'done', 'today', 'empty', 'empty', 'empty']);
    expect(qa(s.el, '.streak-step')[3]?.querySelector('use')?.getAttribute('href')).toBe('#streak-step-today');
    s.update({ state: 'done', day: 7, total: 7, rewardDay: true });
    expect(q(s.el, '.streak-strip__text').textContent).toBe('Streak reward collected!');
    expect(s.el.hasAttribute('data-reward')).toBe(true);
    expect(s.el.getAttribute('aria-label')).toBe('Streak: day 7 of 7. Streak reward collected!');
  });

  it('alive after a full cycle: day 7 shown, the next counted day is day 1 of a new cycle', () => {
    expect(streakStripModel({ state: 'alive', day: 7, total: 7, rewardDay: false }).status).toBe('Solve a puzzle today for day 1.');
    expect(streakStepKinds(7, 7, 0, 0)).toEqual(Array(7).fill('done'));
    // The cycle length comes from dayStreak.cycleDays, never a literal 7.
    expect(streakStripModel({ state: 'alive', day: 2, total: 5, rewardDay: false }).label).toBe('Streak: day 2 of 5. Solve a puzzle today for day 3.');
  });
});

// ─────────────────────────────── Home ───────────────────────────────

const homeView = (over: Partial<HomeView> = {}): HomeView => ({
  level: 37,
  hard: false,
  continueLevel: false,
  daily: { state: 'locked', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 21 },
  hints: 5,
  kitties: 3,
  showTrophy: false,
  fbSafeZone: false,
  extraCards: [],
  period: { kind: 'week', total: 42 },
  event: null,
  bannerReserved: false,
  settingsDot: false,
  ...over,
});
const homeCb = () => ({ onPlay: vi.fn(), onDaily: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn(), onCard: vi.fn(), onEvent: vi.fn(), onLadder: vi.fn() });

describe('Home: the chip in the lead slot, the strip under Play, the daily unlock copy (spec §2.5, §5.3, §6.1)', () => {
  it('without HomeView.ladder: today\'s period pill; with it: the chip (the pill hidden) that opens the sheet', () => {
    const cb = homeCb();
    const home = createHomeScreen(homeView(), cb);
    document.body.appendChild(home.el);
    expect(q(home.el, '.top-bar .top-bar__slot .period-pill').hidden).toBe(false);
    expect(home.el.querySelector('.ladder-chip')).toBeNull();
    home.update(homeView({ ladder: BRACKET }));
    const chip = q(home.el, '.top-bar .top-bar__slot button.ladder-chip[data-state="bracket"]');
    expect(q(home.el, '.period-pill').hidden).toBe(true);
    chip.click();
    expect(cb.onLadder).toHaveBeenCalledTimes(1);
    home.update(homeView());
    expect(chip.hidden).toBe(true);
    expect(q(home.el, '.period-pill').hidden).toBe(false);
    home.destroy();
  });

  it('the streak strip sits right after Play, before the daily card; null hides it', () => {
    const home = createHomeScreen(homeView({ streak: { state: 'alive', day: 3, total: 7, rewardDay: false } }), homeCb());
    document.body.appendChild(home.el);
    const strip = q(home.el, '.home__play').nextElementSibling;
    expect(strip?.classList.contains('streak-strip')).toBe(true);
    expect(strip?.nextElementSibling?.classList.contains('daily-card')).toBe(true);
    expect(home.el.hasAttribute('data-streak')).toBe(true);
    home.update(homeView({ streak: null }));
    expect(q(home.el, '.streak-strip').hidden).toBe(true);
    expect(home.el.hasAttribute('data-streak')).toBe(false);
    home.destroy();
  });

  it('the daily card says "Unlocks after level 21" from the unlock level the app passes (D-2e-13)', () => {
    const home = createHomeScreen(homeView(), homeCb());
    expect(q(home.el, '.daily-card__sub').textContent).toBe('Unlocks after level 21');
    home.destroy();
  });
});

// ─────────────────────────────── victory ───────────────────────────────

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 0,
    level: 37,
    nextLevel: 38,
    pointsEarned: 7296,
    kept: { fish: 2, max: 3, gained: 2, total: 14, kind: 'ladder' },
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

describe('victory: the streak row, the daily reward line and the ranking total (spec §5.3, §6.1, §2.3)', () => {
  it('the day\'s first counted win: "Streak: day 4 of 7", today\'s step fills in, in the dialog description', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(victoryProps({ streak: { day: 4, total: 7, reward: null } }));
    const row = q(v.el, '.victory__streak');
    expect(row.hidden).toBe(false);
    expect(row.dataset.day).toBe('4');
    expect(q(row, '.victory__streak-text').textContent).toBe('Streak: day 4 of 7');
    expect(qa(row, '.streak-step').map((e) => e.dataset.kind)).toEqual(['done', 'done', 'done', 'today', 'empty', 'empty', 'empty']);
    expect(row.hasAttribute('data-fill')).toBe(true);
    expect(q(row, '.victory__streak-reward').hidden).toBe(true);
    expect(q(v.el, '.victory').getAttribute('aria-describedby')).toContain(row.id);
  });

  it('day 7: "Streak reward: +2 hints and +2 kitties"; reduced motion: no fill animation', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(victoryProps({ reducedMotion: true, streak: { day: 7, total: 7, reward: { hints: 2, kitties: 2 } } }));
    expect(q(v.el, '.victory__streak-reward').textContent).toBe('Streak reward: +2 hints and +2 kitties');
    expect(q(v.el, '.victory__streak').hasAttribute('data-fill')).toBe(false);
  });

  it('no row on a second win the same day (null), on the tutorial, or from a stale numeric prop', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(victoryProps({ streak: null }));
    expect(q(v.el, '.victory__streak').hidden).toBe(true);
    v.update(victoryProps({ variant: 'tutorial', level: 1, nextLevel: 2, streak: { day: 1, total: 7, reward: null } }));
    expect(q(v.el, '.victory__streak').hidden).toBe(true);
  });

  it('the daily reward line only when the reward is not zero', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(victoryProps({ dailyReward: { hints: 1, kitties: 0 } }));
    expect(q(v.el, '.victory__daily-reward').textContent).toBe('Daily reward: +1 hint');
    expect(q(v.el, '.victory__daily-reward').hidden).toBe(false);
    v.update(victoryProps({ dailyReward: { hints: 0, kitties: 0 } }));
    expect(q(v.el, '.victory__daily-reward').hidden).toBe(true);
  });

  it('the kept-fish row in ranking mode: "Your total: 14", never "this week"', () => {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(victoryProps());
    expect(q(v.el, '.victory__period').textContent).toBe('Your total: 14');
    expect(q(v.el, '.victory__kept').getAttribute('aria-label')).toBe('You kept 2 fish. Your ranking total: 14.');
    expect(periodTotalText('ladder', 14)).toBe('Your total: 14');
    expect(periodPillLabel('ladder', 1)).toBe('1 fish in the daily ranking');
    expect(periodResultText('ladder', 2, 14)).toBe('+2 fish · Your total: 14');
    expect(fishKeptText('ladder', 1, 9)).toBe('You kept 1 fish. Your ranking total: 9.');
  });
});

describe('the in-game counter in ranking mode (spec §2.3)', () => {
  it('showPeriodCounter(total, "ladder") names it "14 fish in the daily ranking"', () => {
    const base: PillsProps = { catsPlaced: 0, n: 8, hearts: 3, maxHearts: 3, colors: [0, 1, 2, 3, 4, 5, 6, 7], regionsDone: 0, boardId: 'L0', ringId: 'L0' };
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showPeriodCounter(14, 'ladder');
    expect(q(p.el, '.period-pill').getAttribute('aria-label')).toBe('14 fish in the daily ranking');
    p.destroy();
  });
});

// ─────────────────────────────── O2 ───────────────────────────────

const PACK: O2BuyView = { productId: 'hints_15', kind: 'pack', items: 15, price: '$1.99', state: 'ready' };
const NOADS: O2BuyView = { productId: 'remove_ads', kind: 'no_ads', items: 0, price: '$3.99', state: 'ready' };

function o2(over: Partial<RewardedPromptProps> = {}): RewardedPromptProps {
  return { placement: 'hint', variant: 'video', nextFreeAt: 0, now: () => 0, onAccept: vi.fn(), onDecline: vi.fn(), buy: [PACK, NOADS], onBuy: vi.fn(), ...over };
}

describe('O2 with Buy rows (spec §4.1, §4.6, §9.4)', () => {
  it('ready: the video first, then "Buy 15 hints · $1.99", then "Buy No Ads · $3.99" with its plain line', () => {
    const p = o2();
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(p);
    expect(q(card.el, '.overlay__body').textContent).toBe('Watch a short video for 1 hint, or buy a Bulb Bundle.');
    const rows = qa(card.el, '.overlay[data-overlay=rewarded] button.rewarded__buy, button.rewarded__buy');
    expect(rows.map((b) => b.dataset.product)).toEqual(['hints_15', 'remove_ads']);
    expect(rows.map((b) => b.dataset.state)).toEqual(['ready', 'ready']);
    expect(rows.map((b) => q(b, '.btn__label').textContent)).toEqual(['Buy 15 hints · $1.99', 'Buy No Ads · $3.99']);
    for (const b of rows) expect(q(b, '.btn__label').textContent).toMatch(/^Buy /);
    expect(rows[0]?.getAttribute('aria-label')).toBe('Buy Bulb Bundle, 15 hints, $1.99');
    expect(rows[1]?.getAttribute('aria-label')).toBe('Buy No Ads, $3.99. Removes banners and full-screen ads. Videos for helpers stay.');
    expect(href(rows[0])).toBe('#icon-bulb');
    expect(rows[1]?.nextElementSibling?.classList.contains('rewarded__buy-note')).toBe(true);
    expect(rows[1]?.nextElementSibling?.textContent).toBe('Removes banners and full-screen ads. Videos for helpers stay.');
    // The order of the card: Watch video, the rows, Not now; the video keeps the first focus.
    expect(q(card.el, '.rewarded__accept').hasAttribute('data-autofocus')).toBe(true);
    rows[0]?.click();
    expect(p.onBuy).toHaveBeenCalledWith('hints_15');
  });

  it('loading: "…" for the price, aria-busy, named "Getting the price…", not pressable', () => {
    const p = o2({ buy: [{ ...PACK, price: null, state: 'loading' }] });
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(p);
    const b = q(card.el, 'button.rewarded__buy');
    expect(b.dataset.state).toBe('loading');
    expect(q(b, '.btn__label').textContent).toBe('Buy 15 hints · …');
    expect(b.getAttribute('aria-busy')).toBe('');
    expect(b.getAttribute('aria-label')).toBe('Getting the price…');
    b.click();
    expect(p.onBuy).not.toHaveBeenCalled();
    expect(buyLabel({ ...NOADS, price: null, state: 'loading' })).toBe('Buy No Ads · …');
    expect(buyA11y({ ...NOADS, price: null, state: 'loading' })).toBe('Getting the price…');
  });

  it('busy: every button disabled, the tapped Buy aria-busy, Esc waits; back to ready → focus returns to it', () => {
    const p = o2();
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(p);
    const first = q<HTMLButtonElement>(card.el, 'button.rewarded__buy');
    first.click();
    card.update({ ...p, buy: [{ ...PACK, state: 'busy' }, { ...NOADS, state: 'disabled' }] });
    expect(q(card.el, 'button.rewarded__buy')).toBe(first);
    expect(first.dataset.state).toBe('busy');
    expect(first.getAttribute('aria-busy')).toBe('');
    for (const b of qa(card.el, 'button')) if (!b.hidden && !b.classList.contains('overlay__close')) expect(b.getAttribute('aria-disabled'), b.className).toBe('true');
    expect(card.dismiss()).toBe(true);
    expect(p.onDecline).not.toHaveBeenCalled();
    q(card.el, '.rewarded__accept').click();
    expect(p.onAccept).not.toHaveBeenCalled();
    // Even if the app left another row 'ready', one purchase at a time: it is gated and its press ignored.
    card.update({ ...p, buy: [{ ...PACK, state: 'busy' }, NOADS] });
    const noAds = q(card.el, 'button.rewarded__buy[data-product="remove_ads"]');
    expect(noAds.getAttribute('aria-disabled')).toBe('true');
    noAds.click();
    expect(p.onBuy).toHaveBeenCalledTimes(1);
    // Cancelled in FB's dialog: the rows are ready again and the focus is back on the Buy that was tapped.
    (document.activeElement as HTMLElement | null)?.blur();
    card.update(p);
    expect(document.activeElement).toBe(first);
    expect(q(card.el, '.rewarded__accept').hasAttribute('aria-disabled')).toBe(false);
  });

  it('No Ads owned (the app leaves it out): one row; only No Ads offered: today\'s body (no "buy a Bulb Bundle")', () => {
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(o2({ buy: [PACK] }));
    expect(qa(card.el, 'button.rewarded__buy')).toHaveLength(1);
    expect(card.el.querySelector('.rewarded__buy-note')).toBeNull();
    card.update(o2({ buy: [NOADS] }));
    expect(q(card.el, '.overlay__body').textContent).toBe('Watch a short video for 1 hint?');
    card.update(o2({ placement: 'kitty', buy: [{ ...PACK, productId: 'kitties_8', items: 8 }, NOADS] }));
    expect(q(card.el, '.overlay__body').textContent).toBe('Watch a short video for 1 kitty, or buy a Kitty Basket.');
    expect(q(card.el, 'button.rewarded__buy .btn__label').textContent).toBe('Buy 8 kitties · $1.99');
    expect(href(q(card.el, 'button.rewarded__buy'))).toBe('#icon-paw');
  });

  it('the mouse never has a row; no rows = today\'s card', () => {
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(o2({ placement: 'mouse' }));
    expect(card.el.querySelector('button.rewarded__buy')).toBeNull();
    card.update(o2({ buy: [] }));
    expect(q(card.el, '.rewarded__buys').hidden).toBe(true);
    expect(q(card.el, '.overlay__body').textContent).toBe('Watch a short video for 1 hint?');
  });

  it('the countdown variant keeps OK and adds the rows; the free variant keeps Take it', () => {
    const card = createRewardedPrompt();
    document.body.appendChild(card.el);
    card.open(o2({ variant: 'countdown', nextFreeAt: 90_000 }));
    expect(q(card.el, '.overlay__body').textContent).toBe('Next free hint in 1:30');
    expect(q(card.el, '.rewarded__ok').hidden).toBe(false);
    expect(qa(card.el, 'button.rewarded__buy')).toHaveLength(2);
    card.update(o2({ variant: 'free' }));
    expect(q(card.el, '.overlay__body').textContent).toBe("Here's a free hint.");
    expect(q(card.el, '.rewarded__accept .btn__label').textContent).toBe('Take it');
    expect(qa(card.el, 'button.rewarded__buy')).toHaveLength(2);
  });
});

// ─────────────────────────────── Settings ───────────────────────────────

function settingsProps(ladder?: Partial<SettingsLadderRows>): SettingsProps {
  return {
    settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
    showVibration: true,
    version: '0.2.0',
    onChange: vi.fn(),
    onHowToPlay: vi.fn(),
    onClose: vi.fn(),
    onShop: vi.fn(),
    ...(ladder
      ? {
          ladder: {
            name: 'Velvet Pounce 27',
            code: '7KQ2-M9XD',
            listed: true,
            showListed: true,
            online: true,
            onName: vi.fn(),
            onListed: vi.fn(),
            onDelete: vi.fn(),
            ...ladder,
          },
        }
      : {}),
  };
}

describe('Settings: the "Worldwide ranking" rows (spec §2.7, §9.4)', () => {
  it('absent without SettingsProps.ladder (web-prod, no server)', () => {
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    s.open(settingsProps());
    expect(q(s.el, '.settings__ladder').hidden).toBe(true);
  });

  it('the name, the switch, Delete and the player code; the switch flips "Show me in rankings"', () => {
    const p = settingsProps({});
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    s.open(p);
    const group = q(s.el, '.settings__ladder');
    expect(group.hidden).toBe(false);
    expect(q(group, '.settings__group-title').textContent).toBe('Worldwide ranking');
    const name = q(group, 'button.settings__ladder-name');
    expect(q(name, '.btn__label').textContent).toBe('Ranking name');
    expect(q(name, '.settings__ladder-value').textContent).toBe('Velvet Pounce 27');
    expect(q(name, '.settings__ladder-value').getAttribute('dir')).toBe('auto');
    name.click();
    expect(p.ladder?.onName).toHaveBeenCalledTimes(1);
    const sw = q(group, 'button.switch.settings__ladder-listed');
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(q(s.el, `label[for="${sw.id}"]`).textContent).toBe('Show me in rankings');
    sw.click();
    expect(p.ladder?.onListed).toHaveBeenCalledWith(false);
    expect(q(group, '.settings__ladder-code').textContent).toBe('Player code 7KQ2-M9XD');
    expect(q(group, '.settings__ladder-offline').hidden).toBe(true);
    // Shop stays in Settings (spec §4.1).
    expect(q(s.el, '.settings__shop-link').hidden).toBe(false);
  });

  it('Delete asks first ("… Your game progress stays."); Delete deletes once, Cancel and Esc go back', () => {
    const p = settingsProps({});
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    s.open(p);
    q(s.el, 'button.settings__ladder-delete').click();
    expect(q(s.el, '.settings').dataset.view).toBe('confirm');
    expect(q(s.el, '.settings__confirm-text').textContent).toBe('Delete your ranking name, picture and results from our server? Your game progress stays.');
    q(s.el, '.settings__confirm-cancel').click();
    expect(q(s.el, '.settings').dataset.view).toBe('main');
    expect(p.ladder?.onDelete).not.toHaveBeenCalled();
    q(s.el, 'button.settings__ladder-delete').click();
    expect(s.dismiss()).toBe(true);
    expect(q(s.el, '.settings').dataset.view).toBe('main');
    q(s.el, 'button.settings__ladder-delete').click();
    q(s.el, '.settings__confirm-delete').click();
    expect(p.ladder?.onDelete).toHaveBeenCalledTimes(1);
    expect(q(s.el, '.settings').dataset.view).toBe('main');
  });

  it('offline: the switch and Delete disabled with the line; opt-out not allowed hides the switch; no code hides the line', () => {
    const p = settingsProps({ online: false, code: null });
    const s = createSettingsModal();
    document.body.appendChild(s.el);
    s.open(p);
    const sw = q(s.el, 'button.settings__ladder-listed');
    expect(sw.getAttribute('aria-disabled')).toBe('true');
    expect(q(s.el, 'button.settings__ladder-delete').getAttribute('aria-disabled')).toBe('true');
    expect(q(s.el, '.settings__ladder-offline').textContent).toBe('Connect to the internet to change this.');
    sw.click();
    q(s.el, 'button.settings__ladder-delete').click();
    expect(p.ladder?.onListed).not.toHaveBeenCalled();
    expect(q(s.el, '.settings').dataset.view).toBe('main');
    expect(q(s.el, '.settings__ladder-code').hidden).toBe(true);
    s.update(settingsProps({ showListed: false }));
    expect(q(s.el, '.settings__ladder-listed-row').hidden).toBe(true);
  });
});

// ─────────────────────────────── How to play ───────────────────────────────

function howto(over: Partial<HowToPlayProps> = {}): HowToPlayProps {
  return { showSkip: false, showReplay: true, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn(), ...over };
}

describe('How to play: the ranking note and the streak note (Appendix A howto.ladder, howto.streak)', () => {
  it('with the ranking the fish note names the daily ranking; with the streak a note follows the level points', () => {
    const v = createHowToPlay();
    document.body.appendChild(v.el);
    v.open(howto({ ladder: true, streakDays: 7 }));
    expect(q(v.el, '.howto__points').textContent).toBe('The fish you keep when you solve a puzzle count for the daily ranking.');
    const streak = q(v.el, '.howto__streak');
    expect(streak.previousElementSibling?.classList.contains('howto__level-points')).toBe(true);
    expect(streak.textContent).toBe(
      'Solve at least one puzzle a day to build a streak. Every 7 days in a row earn a reward of hints and kitties. If you miss a day, the streak starts again from day 1.',
    );
    v.update(howto());
    expect(v.el.querySelector('.howto__streak')).toBeNull();
    expect(q(v.el, '.howto__points').textContent).not.toMatch(/daily ranking/);
  });
});
