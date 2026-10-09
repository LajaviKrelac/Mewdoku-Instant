// Owner: B. The ranking panel, the rankings hub and the victory screen (phase2b §2.4, §2.5, §5.5,
// §2.13): gating times; Enter, Space and Esc continue; focus; variants; no list rows without
// provider data; the three FB list modes (placed overlay, "See top players", no overlay) and "Your
// score" when there is no rank; the hub tabs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { I18nKey } from '../../../src/i18n';
import { createRankHub, type RankHubProps } from '../../../src/ui/overlays/rank-hub';
import {
  announcement,
  createRankingPanel,
  resultText,
  type RankingListState,
  type RankingPanelProps,
} from '../../../src/ui/overlays/ranking-panel';
import { createVictoryScreen, primaryLabel, rewardText, type VictoryProps } from '../../../src/ui/overlays/victory-screen';

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

function rankingProps(list: RankingListState, over: Partial<RankingPanelProps> = {}): RankingPanelProps {
  return {
    board: 'points',
    eventNameKey: null,
    result: { kind: 'level', pointsEarned: 55, ms: 134_000 },
    list,
    tapMinMs: cfg.rank.panelTapMinMs,
    reducedMotion: false,
    onContinue: vi.fn(),
    onSeeTop: vi.fn(),
    onListArea: vi.fn(),
    ...over,
  };
}

const RECORDS: RankingListState = {
  kind: 'records',
  reason: 'local',
  records: { board: 'points', thisMs: 134_000, n: 8, bestSizeMs: 118_000, totalPoints: 1240, levelsSolved: 37, event: null },
};

function openPanel(p: RankingPanelProps) {
  const panel = createRankingPanel();
  document.body.appendChild(panel.el);
  panel.open(p);
  return panel;
}

describe('ranking panel (§2.4)', () => {
  it('is a dialog labelled by the orange title, with this win as the subtitle and the tap footer inside', () => {
    const panel = openPanel(rankingProps(RECORDS));
    const dialog = q(panel.el, '[role="dialog"]');
    expect(q(panel.el, `#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe('Paw points');
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+55 points · 2:14');
    expect(dialog.contains(q(panel.el, '.ranking__tap'))).toBe(true);
    expect(q(panel.el, '.ranking__tap').textContent).toBe('Tap to keep going');
    expect(q(panel.el, '.ranking__tap').hasAttribute('data-autofocus')).toBe(true);
    expect(panel.modal).toBe(true);
  });

  it('ignores taps, Enter, Space and Esc before rank.panelTapMinMs; continues once after it', () => {
    vi.useFakeTimers();
    const p = rankingProps(RECORDS);
    const panel = openPanel(p);
    const tap = q<HTMLButtonElement>(panel.el, '.ranking__tap');
    expect(tap.getAttribute('aria-disabled')).toBe('true');
    q(panel.el, '.overlay__scrim').click();
    tap.click();
    panel.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panel.dismiss()).toBe(false);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs - 1);
    q(panel.el, '.ranking__card').click();
    expect(p.onContinue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(tap.hasAttribute('aria-disabled')).toBe(false);
    expect(panel.el.classList.contains('is-ready')).toBe(true);
    q(panel.el, '.ranking__card').click();
    expect(p.onContinue).toHaveBeenCalledTimes(1);
    expect(panel.el.classList.contains('is-leaving')).toBe(true);
    // Only once.
    tap.click();
    expect(panel.dismiss()).toBe(false);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Enter', (panel: { el: HTMLElement }) => q(panel.el, '[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))],
    ['Space', (panel: { el: HTMLElement }) => q(panel.el, '[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))],
    ['Esc', (panel: { dismiss(): boolean }) => expect(panel.dismiss()).toBe(true)],
    ['the footer button', (panel: { el: HTMLElement }) => q(panel.el, '.ranking__tap').click()],
  ])('continues with %s after the gate', (_name, act) => {
    vi.useFakeTimers();
    const p = rankingProps(RECORDS, { tapMinMs: cfg.fx.win.reduced.tapMinMs, reducedMotion: true });
    const panel = openPanel(p);
    vi.advanceTimersByTime(cfg.fx.win.reduced.tapMinMs);
    act(panel as never);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('the gate restarts on every open', () => {
    vi.useFakeTimers();
    const p = rankingProps(RECORDS);
    const panel = openPanel(p);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs);
    panel.close();
    panel.open(p);
    expect(panel.dismiss()).toBe(false);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs);
    expect(panel.dismiss()).toBe(true);
  });

  it('web / no provider: the personal records card and the honest line, never another player', () => {
    const panel = openPanel(rankingProps(RECORDS));
    const rows = Array.from(panel.el.querySelectorAll('.rank-records__row')).map((r) => r.textContent);
    expect(rows).toEqual(['This level2:14', 'Your best 8×81:58', 'Levels solved37', 'Total points1,240']);
    expect(q(panel.el, '.rank-list__note').textContent).toBe("Rankings with other players aren't available in this version. Here are your own records.");
    expect(panel.el.querySelector('.rank-mine')).toBeNull();
    panel.update(rankingProps({ ...RECORDS, reason: 'unavailable' }));
    expect(q(panel.el, '.rank-list__note').textContent).toBe("Rankings couldn't load right now.");
  });

  it('loading: static skeleton bars with no fake text or numbers', () => {
    const panel = openPanel(rankingProps({ kind: 'loading' }));
    const skel = q(panel.el, '.rank-list__skeleton');
    expect(skel.getAttribute('aria-hidden')).toBe('true');
    expect(skel.textContent).toBe('');
    expect(q(panel.el, '.rank-list__note').textContent).toBe('Fetching the rankings…');
  });

  it('FB, overlay placed in a rect: an empty list area whose rect goes to onListArea', async () => {
    const p = rankingProps({ kind: 'overlay' });
    const panel = openPanel(p);
    const list = q(panel.el, '.rank-list');
    expect(list.dataset.kind).toBe('overlay');
    expect(list.children).toHaveLength(0);
    // Two animation frames later (laid out).
    await vi.waitFor(() => expect(p.onListArea).toHaveBeenCalledTimes(1), { timeout: 2000 });
    panel.update(p);
    await new Promise((r) => setTimeout(r, 150));
    expect(p.onListArea).toHaveBeenCalledTimes(1);
  });

  it('FB, overlay not placeable: my line plus "See top players"', () => {
    const p = rankingProps({ kind: 'see_top', mine: { rank: 87, score: { kind: 'points', points: 1240 }, count: null } });
    const panel = openPanel(p);
    expect(q(panel.el, '.rank-mine__rank').textContent).toBe('Your rank: #87');
    expect(q(panel.el, '.rank-mine__score').textContent).toBe('Your score: 1,240 points');
    expect(panel.el.querySelector('.rank-mine__count')).toBeNull();
    const seeTop = q<HTMLButtonElement>(panel.el, '.rank-list__seetop');
    expect(seeTop.textContent).toContain('See top players');
    seeTop.click();
    expect(p.onSeeTop).toHaveBeenCalledTimes(1);
    expect(p.onContinue).not.toHaveBeenCalled();
  });

  it('FB, no overlay views: my line only; "Your score" when there is no rank; the count only when given', () => {
    const panel = openPanel(rankingProps({ kind: 'mine', mine: { rank: 1234, score: { kind: 'points', points: 1240 }, count: 58_210 } }));
    expect(q(panel.el, '.rank-mine__rank').textContent).toBe('Your rank: #1,234');
    expect(q(panel.el, '.rank-mine__count').textContent).toBe('58,210 players');
    expect(panel.el.querySelector('.rank-list__seetop')).toBeNull();
    panel.update(rankingProps({ kind: 'mine', mine: { rank: null, score: { kind: 'points', points: 1240 }, count: null } }));
    expect(panel.el.querySelector('.rank-mine__rank')).toBeNull();
    expect(q(panel.el, '.rank-mine__score').textContent).toBe('Your score: 1,240 points');
    panel.update(rankingProps({ kind: 'mine', mine: { rank: null, score: null, count: null } }));
    expect(q(panel.el, '.rank-list__note').textContent).toBe('No one has posted a score here yet.');
  });

  it('never renders more rows than the data it was given (no fabricated rows)', () => {
    const states: RankingListState[] = [
      { kind: 'loading' },
      { kind: 'overlay' },
      { kind: 'see_top', mine: { rank: null, score: null, count: null } },
      { kind: 'mine', mine: { rank: 5, score: null, count: null } },
      RECORDS,
    ];
    for (const s of states) {
      const panel = openPanel(rankingProps(s));
      // No element in our list ever holds another player's name, photo or rank row.
      expect(panel.el.querySelectorAll('.rank-row, img, [data-player]')).toHaveLength(0);
      expect(panel.el.querySelectorAll('.rank-mine').length).toBeLessThanOrEqual(1);
      panel.destroy();
    }
  });

  it('daily and event boards: their titles and subtitles', () => {
    const daily = openPanel(rankingProps(RECORDS, { board: 'daily', result: { kind: 'daily', ms: 188_000 } }));
    expect(q(daily.el, '.ranking__title').textContent).toBe("Today's fastest");
    expect(q(daily.el, '.ranking__sub').textContent).toBe('Solved in 3:08');
    const ev = openPanel(
      rankingProps(
        { kind: 'records', reason: 'local', records: { board: 'event', thisMs: 201_000, n: 9, bestSizeMs: null, totalPoints: 1, levelsSolved: 1, event: { solved: 13, total: 21, totalMs: 4_324_000 } } },
        { board: 'event', eventNameKey: 'event.lantern.name' as I18nKey, result: { kind: 'event', solved: 13, total: 21 } },
      ),
    );
    expect(q(ev.el, '.ranking__title').textContent).toBe('Lantern Walk: top players');
    expect(q(ev.el, '.ranking__sub').textContent).toBe('13 / 21 solved');
    expect(q(ev.el, '.rank-records__event').textContent).toBe('Your results: 13 of 21, total 1:12:04');
    expect(resultText({ kind: 'level', pointsEarned: 1200, ms: 61_000 })).toBe('+1,200 points · 1:01');
  });

  it('the live region reads the rank and the points a moment after open', () => {
    vi.useFakeTimers();
    const panel = openPanel(rankingProps({ kind: 'mine', mine: { rank: 1234, score: null, count: null } }));
    const live = q(panel.el, '[role="status"]');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    vi.advanceTimersByTime(cfg.rank.panelPopMs);
    expect(live.textContent).toBe('Your rank: #1,234. 55 points.');
    expect(announcement({ list: RECORDS, result: { kind: 'daily', ms: 188_000 } })).toBe('Solved in 3:08.');
  });
});

// ─────────────────────────────── rankings hub ───────────────────────────────

function hubProps(over: Partial<RankHubProps> = {}): RankHubProps {
  return {
    tabs: ['points', 'daily', 'event', 'groups'],
    tab: 'points',
    eventNameKey: 'event.lantern.name' as I18nKey,
    list: { kind: 'mine', mine: { rank: 3, score: null, count: null } },
    groups: { canStart: true, active: null, rewardMode: 'participation', minWins: 3, hours: 72, kitties: 2 },
    now: () => 0,
    onTab: vi.fn(),
    onSeeTop: vi.fn(),
    onListArea: vi.fn(),
    onStartGroup: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('rankings hub (§5.5)', () => {
  it('shows the tabs as a tablist with the selected one; a tab press asks the app', () => {
    const hub = createRankHub();
    document.body.appendChild(hub.el);
    const p = hubProps();
    hub.open(p);
    const tabs = Array.from(hub.el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Paw points', 'Today', 'Event', 'Groups']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(q(hub.el, '[role="tablist"]')).toBeTruthy();
    expect(q(hub.el, '[role="tabpanel"]').getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    tabs[2]?.click();
    expect(p.onTab).toHaveBeenCalledWith('event');
    // Arrow keys move along the tabs (and select them).
    tabs[0]?.focus();
    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(p.onTab).toHaveBeenLastCalledWith('groups');
    expect(document.activeElement).toBe(tabs[3]);
  });

  it('each list tab renders the same list states as the panel; the Event tab is headed by the event', () => {
    const hub = createRankHub();
    document.body.appendChild(hub.el);
    hub.open(hubProps());
    expect(q(hub.el, '.rank-hub__heading').textContent).toBe('Paw points');
    expect(q(hub.el, '.rank-mine__rank').textContent).toBe('Your rank: #3');
    hub.update(hubProps({ tab: 'event', list: RECORDS }));
    expect(q(hub.el, '.rank-hub__heading').textContent).toBe('Lantern Walk: top players');
    expect(hub.el.querySelectorAll('.rank-records__row').length).toBeGreaterThan(0);
    expect(hub.el.querySelector('.rank-mine')).toBeNull();
  });

  it('the Groups tab explains the challenge and offers to start one; Esc closes', () => {
    const hub = createRankHub();
    document.body.appendChild(hub.el);
    const p = hubProps({ tab: 'groups' });
    hub.open(p);
    expect(q<HTMLElement>(hub.el, '.rank-list').hidden).toBe(true);
    expect(q(hub.el, '.rank-groups__body').textContent).toBe('Win 3 puzzles in this challenge within 72 hours to earn 2 kitties.');
    q(hub.el, '.rank-groups__start').click();
    expect(p.onStartGroup).toHaveBeenCalledTimes(1);
    const p2 = hubProps({ tab: 'groups', now: () => 0, groups: { canStart: false, active: { endsAt: 2 * 86_400_000 + 3 * 3_600_000, wins: 2 }, rewardMode: 'participation', minWins: 3, hours: 72, kitties: 2 } });
    hub.update(p2);
    expect(q<HTMLElement>(hub.el, '.rank-groups__start').hidden).toBe(true);
    expect(q(hub.el, '.rank-groups__active').textContent).toBe('Ends in 2 d 3 h · 2 / 3 wins');
    expect(hub.dismiss()).toBe(true);
    expect(p2.onClose).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────── victory screen ───────────────────────────────

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 0,
    level: 37,
    nextLevel: 38,
    fish: { earned: 3, total: 128 },
    bonus: null,
    pointsEarned: 55,
    daily: null,
    event: null,
    buttonDelayMs: cfg.fx.winButtonDelayMs,
    reducedMotion: false,
    bannerReserved: false,
    now: () => 0,
    onPrimary: vi.fn(),
    onHome: vi.fn(),
    onShop: vi.fn(),
    ...over,
  };
}

function openVictory(p: VictoryProps) {
  const v = createVictoryScreen();
  document.body.appendChild(v.el);
  v.open(p);
  return v;
}

describe('victory screen (§2.5)', () => {
  it('level: praise, "Level 37 complete", the reward row, and the wide orange "Level 38" enabled after 600 ms', () => {
    vi.useFakeTimers();
    const p = victoryProps();
    const v = openVictory(p);
    expect(q(v.el, '.victory__praise').textContent).toBe('Clever cat!');
    expect(q(v.el, '.victory__sub').textContent).toBe('Level 37 complete');
    expect(v.el.querySelectorAll('.victory__fish')).toHaveLength(3);
    expect(q(v.el, '.victory__plus').textContent).toBe('+3');
    expect(q(v.el, '.victory__total').textContent).toBe('128 fish');
    expect(q(v.el, '.victory__reward').getAttribute('aria-label')).toBe('You caught 3 fish. You have 128.');
    expect(q(v.el, '.victory__chip--points').textContent).toBe('+55 points');
    expect(q<HTMLElement>(v.el, '.victory__chip--bonus').hidden).toBe(true);
    const primary = q<HTMLButtonElement>(v.el, '.victory__primary');
    expect(primary.classList.contains('btn--primary')).toBe(true);
    expect(primary.classList.contains('btn--lg')).toBe(true);
    expect(primary.textContent).toBe('Level 38');
    expect(primary.hasAttribute('data-autofocus')).toBe(true);
    expect(primary.getAttribute('aria-disabled')).toBe('true');
    primary.click();
    expect(p.onPrimary).not.toHaveBeenCalled();
    vi.advanceTimersByTime(cfg.fx.winButtonDelayMs);
    primary.click();
    expect(p.onPrimary).toHaveBeenCalledTimes(1);
    q(v.el, '.victory__home').click();
    expect(p.onHome).toHaveBeenCalledTimes(1);
    // The fish pill with "+" opens the shop.
    q(v.el, '.victory__top .fish-pill__plus').click();
    expect(p.onShop).toHaveBeenCalledTimes(1);
    expect(v.dismiss()).toBe(false);
    const dialog = q(v.el, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The description reads the result, the fish and the points (§7 screen reader).
    const ids = (dialog.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.className.split(' ')[0])).toEqual(['victory__sub', 'victory__reward', 'victory__chips']);
  });

  it('hard bonus chip, banner reserve and the rays variable', () => {
    const v = openVictory(victoryProps({ fish: { earned: 5, total: 1130 }, bonus: { kind: 'hard', count: 2 }, bannerReserved: true }));
    expect(q(v.el, '.victory__chip--bonus').textContent).toBe('Hard level bonus +2');
    expect(q(v.el, '.victory__plus').textContent).toBe('+5');
    const root = q(v.el, '.victory');
    expect(root.hasAttribute('data-banner')).toBe(true);
    expect(root.style.getPropertyValue('--rays-ms')).toBe(`${cfg.fx.victoryRaysTurnMs}ms`);
    expect(root.style.getPropertyValue('--banner-reserve')).toBe(`${cfg.ads.banner.reservePx}px`);
  });

  it("tutorial: \"You're ready!\" and \"Play Level 2\", no Home; replay: no fish and \"Home\"", () => {
    const t = openVictory(victoryProps({ variant: 'tutorial', level: 1, nextLevel: 2, pointsEarned: null }));
    expect(q(t.el, '.victory__praise').textContent).toBe("You're ready!");
    expect(q(t.el, '.victory__primary').textContent).toBe('Play Level 2');
    expect(q<HTMLElement>(t.el, '.victory__home').hidden).toBe(true);
    expect(q<HTMLElement>(t.el, '.victory__chips').hidden).toBe(true);
    const r = openVictory(victoryProps({ variant: 'tutorial_replay', level: 1, nextLevel: null, fish: null, pointsEarned: null }));
    expect(q<HTMLElement>(r.el, '.victory__reward').hidden).toBe(true);
    expect(q<HTMLElement>(r.el, '.victory__top').hidden).toBe(true);
    expect(q(r.el, '.victory__primary').textContent).toBe('Home');
  });

  it('daily: time, mistakes and hints, the countdown, the daily bonus and "Done"', () => {
    vi.useFakeTimers();
    let now = 0;
    const v = openVictory(
      victoryProps({
        variant: 'daily',
        level: null,
        nextLevel: null,
        bonus: { kind: 'daily', count: 2 },
        fish: { earned: 5, total: 245 },
        daily: { dateKey: '2026-10-06', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: 61_000 },
        now: () => now,
      }),
    );
    expect(q(v.el, '.victory__sub').textContent).toBe('Daily puzzle · Tue 6 Oct');
    expect(q(v.el, '.victory__time').textContent).toBe('Solved in 4:12');
    expect(q(v.el, '.victory__stats').textContent).toBe('Mistakes 1 · Hints 0');
    expect(q(v.el, '.victory__next').textContent).toBe('Next puzzle in 1 min');
    expect(q(v.el, '.victory__chip--bonus').textContent).toBe('Daily bonus +2');
    expect(q(v.el, '.victory__primary').textContent).toBe('Done');
    expect(q<HTMLElement>(v.el, '.victory__home').hidden).toBe(true);
    now = 62_000;
    vi.advanceTimersByTime(1000);
    expect(q(v.el, '.victory__next').textContent).toBe('A new puzzle is ready');
    v.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('event: progress bar from the old to the new value, the milestone line, "Play puzzle 8" or "Back to event"', () => {
    vi.useFakeTimers();
    const v = openVictory(
      victoryProps({
        variant: 'event',
        level: null,
        nextLevel: null,
        event: { nameKey: 'event.lantern.name' as I18nKey, index: 6, total: 21, solvedBefore: 6, solvedAfter: 7, reward: { fish: 30 }, last: false },
      }),
    );
    expect(q(v.el, '.victory__sub').textContent).toBe('Lantern Walk · 7');
    const bar = q(v.el, '.victory__bar');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    vi.advanceTimersByTime(cfg.fx.overlayFadeMs);
    expect(bar.getAttribute('aria-valuenow')).toBe('7');
    expect(q(v.el, '.victory__bar-fill').style.width).toBe(`${((7 / 21) * 100).toFixed(2)}%`);
    expect(q(v.el, '.victory__milestone').textContent).toBe('Event reward: +30 fish');
    expect(q(v.el, '.victory__primary').textContent).toBe('Play puzzle 8');
    expect(primaryLabel({ variant: 'event', nextLevel: null, event: { nameKey: 'event.lantern.name' as I18nKey, index: 20, total: 21, solvedBefore: 20, solvedAfter: 21, reward: null, last: true } })).toBe('Back to event');
    expect(rewardText({ fish: 100, kitties: 3 })).toBe('+100 fish and +3 kitties');
    expect(rewardText({ hints: 1 })).toBe('+1 hint');
  });
});
