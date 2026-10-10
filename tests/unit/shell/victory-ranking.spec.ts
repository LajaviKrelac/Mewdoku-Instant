// Owner: B (Phase 2b); G2 (Phase 2c). The ranking panel, the rankings hub and the victory screen
// (phase2b §2.4, §2.5, §5.5, §2.13): gating times; Enter, Space and Esc continue; focus; variants; no
// list rows without provider data; the three FB list modes (placed overlay, "See top players", no
// overlay) and "Your score" when there is no rank; the hub tabs. Phase 2c (fish-lives-spec §2.6, §2.7,
// §4.6, §4.7): the period board ("Weekly ranking", "+2 fish · This week: 42", scores in fish, the
// personal period records), the hub's "This week" tab, and the victory's kept-fish row (no fish pill,
// no "+", no bonus chip). Phase 2c.1 (§10.3, §4.6): the victory's first row is the level's points total
// ("7,296 points"), there is no "Perfect ×N" chip, and the period records show Total points instead of
// the perfect streak (a stale `streak` prop is ignored).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { I18nKey } from '../../../src/i18n';
import { createRankHub, tabLabel, type RankHubProps } from '../../../src/ui/overlays/rank-hub';
import {
  announcement,
  createRankingPanel,
  formatRankScore,
  periodRecordRows,
  rankTitle,
  resultText,
  type PersonalRecordsView,
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

// Phase 2c (I-3): the generic fixture is the period board (the 2b paw-points board is gone).
function rankingProps(list: RankingListState, over: Partial<RankingPanelProps> = {}): RankingPanelProps {
  return {
    board: 'period',
    eventNameKey: null,
    result: { kind: 'period', gained: 2, total: 42, periodKind: 'week' },
    periodKind: 'week',
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
  // A stale 2c `streak` (deleted from PersonalRecordsView at 2c.1 I-3) rides along through a cast: it is ignored.
  records: {
    board: 'period',
    thisMs: 134_000,
    n: 8,
    bestSizeMs: 118_000,
    totalPoints: 1240,
    levelsSolved: 37,
    event: null,
    period: { kind: 'week', total: 42, best: 57 },
    streak: { current: 4, best: 9 },
  } as PersonalRecordsView,
};
/** The daily board's records card (2b rows; shown only in the hub's "Today" tab with rank.dailyBoard). */
const DAILY_RECORDS: RankingListState = {
  kind: 'records',
  reason: 'local',
  records: { board: 'daily', thisMs: 134_000, n: 8, bestSizeMs: 118_000, totalPoints: 1240, levelsSolved: 37, event: null },
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
    expect(q(panel.el, `#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe('Weekly ranking');
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+2 fish · This week: 42');
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
    expect(rows).toEqual(['This week42 fish', 'Your best week57 fish', 'Total points1,240', 'Levels solved37']);
    expect(q(panel.el, '.rank-list__note').textContent).toBe("Rankings with other players aren't available in this version. Here are your own records.");
    expect(panel.el.querySelector('.rank-mine')).toBeNull();
    panel.update(rankingProps({ ...RECORDS, reason: 'unavailable' } as RankingListState));
    expect(q(panel.el, '.rank-list__note').textContent).toBe("Rankings couldn't load right now.");
    // The daily board's card (hub "Today" tab, rank.dailyBoard): this puzzle, best on the size, solved, total points.
    const daily = openPanel(rankingProps(DAILY_RECORDS, { board: 'daily', result: { kind: 'daily', ms: 134_000 } }));
    expect(Array.from(daily.el.querySelectorAll('.rank-records__row')).map((r) => r.textContent)).toEqual([
      'This puzzle2:14',
      'Your best 8×81:58',
      'Levels solved37',
      'Total points1,240',
    ]);
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
    const p = rankingProps({ kind: 'see_top', mine: { rank: 87, score: { kind: 'fish', fish: 1240 }, count: null } });
    const panel = openPanel(p);
    expect(q(panel.el, '.rank-mine__rank').textContent).toBe('Your rank: #87');
    expect(q(panel.el, '.rank-mine__score').textContent).toBe('Your score: 1,240 fish');
    expect(panel.el.querySelector('.rank-mine__count')).toBeNull();
    const seeTop = q<HTMLButtonElement>(panel.el, '.rank-list__seetop');
    expect(seeTop.textContent).toContain('See top players');
    seeTop.click();
    expect(p.onSeeTop).toHaveBeenCalledTimes(1);
    expect(p.onContinue).not.toHaveBeenCalled();
  });

  it('FB, no overlay views: my line only; "Your score" when there is no rank; the count only when given', () => {
    const panel = openPanel(rankingProps({ kind: 'mine', mine: { rank: 1234, score: { kind: 'fish', fish: 1240 }, count: 58_210 } }));
    expect(q(panel.el, '.rank-mine__rank').textContent).toBe('Your rank: #1,234');
    expect(q(panel.el, '.rank-mine__count').textContent).toBe('58,210 players');
    expect(panel.el.querySelector('.rank-list__seetop')).toBeNull();
    panel.update(rankingProps({ kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 1240 }, count: null } }));
    expect(panel.el.querySelector('.rank-mine__rank')).toBeNull();
    expect(q(panel.el, '.rank-mine__score').textContent).toBe('Your score: 1,240 fish');
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
    expect(resultText({ kind: 'daily', ms: 61_000 })).toBe('Solved in 1:01');
  });

  it('the live region reads the rank and this period\'s fish a moment after open', () => {
    vi.useFakeTimers();
    const panel = openPanel(rankingProps({ kind: 'mine', mine: { rank: 1234, score: null, count: null } }));
    const live = q(panel.el, '[role="status"]');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    vi.advanceTimersByTime(cfg.rank.panelPopMs);
    expect(live.textContent).toBe('Your rank: #1,234. 42 fish.');
    expect(announcement({ list: RECORDS, result: { kind: 'daily', ms: 188_000 } })).toBe('Solved in 3:08.');
  });
});

// ─────────────────────────────── Phase 2c: the period board ───────────────────────────────

const PERIOD_RECORDS: PersonalRecordsView = {
  board: 'period',
  thisMs: 134_000,
  n: 8,
  bestSizeMs: null,
  totalPoints: 4210,
  levelsSolved: 37,
  event: null,
  period: { kind: 'week', total: 42, best: 57 },
};
/** The same records with a stale 2c `streak` (deleted at 2c.1 I-3), handed in through a cast: ignored. */
const STALE_PERIOD_RECORDS = { ...PERIOD_RECORDS, streak: { current: 4, best: 9 } } as PersonalRecordsView;
const periodPanel = (list: RankingListState, gained = 2, total = 42): RankingPanelProps =>
  rankingProps(list, { board: 'period', periodKind: 'week', result: { kind: 'period', gained, total, periodKind: 'week' } });

describe('ranking panel, the period board (Phase 2c §2.6, §4.6)', () => {
  it('"Weekly ranking", "+2 fish · This week: 42"; "This week: 42" alone when the win added nothing', () => {
    const panel = openPanel(periodPanel({ kind: 'records', reason: 'local', records: PERIOD_RECORDS }));
    expect(q(panel.el, '.ranking__title').textContent).toBe('Weekly ranking');
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+2 fish · This week: 42');
    panel.update(periodPanel({ kind: 'records', reason: 'local', records: PERIOD_RECORDS }, 0, 42));
    expect(q(panel.el, '.ranking__sub').textContent).toBe('This week: 42');
    panel.update(periodPanel({ kind: 'records', reason: 'local', records: PERIOD_RECORDS }, 1, 1));
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+1 fish · This week: 1');
    expect(rankTitle('period', null, 'day')).toBe('Daily ranking');
    expect(rankTitle('period', null, 'month')).toBe('Monthly ranking');
    expect(resultText({ kind: 'period', gained: 3, total: 9, periodKind: 'month' })).toBe('+3 fish · This month: 9');
  });

  it('web / no provider: This week · Your best week · Total points · Levels solved (2c.1, D24), and the honest line', () => {
    const panel = openPanel(periodPanel({ kind: 'records', reason: 'local', records: STALE_PERIOD_RECORDS }));
    const rows = Array.from(panel.el.querySelectorAll('.rank-records__row')).map((r) => [q(r, 'dt').textContent, q(r, 'dd').textContent]);
    expect(rows).toEqual([
      ['This week', '42 fish'],
      ['Your best week', '57 fish'],
      ['Total points', '4,210'],
      ['Levels solved', '37'],
    ]);
    // The retired perfect streak is never shown, even when a stale prop carries one.
    expect(panel.el.textContent).not.toMatch(/streak/i);
    expect(q(panel.el, '.rank-list__note').textContent).toBe("Rankings with other players aren't available in this version. Here are your own records.");
    // No row for another player, ever; the best row hides while 0; Total points shows 0 too.
    expect(periodRecordRows({ ...PERIOD_RECORDS, period: { kind: 'week', total: 0, best: 0 }, totalPoints: 0 })).toEqual([
      ['This week', '0 fish'],
      ['Total points', '0'],
      ['Levels solved', '37'],
    ]);
    expect(periodRecordRows({ ...PERIOD_RECORDS, period: { kind: 'day', total: 3, best: 5 } }).slice(0, 2)).toEqual([
      ['Today', '3 fish'],
      ['Your best day', '5 fish'],
    ]);
  });

  it('FB: "Your rank: #12" and "Your score: 42 fish"; the live region says "Your rank: #12. 42 fish."', () => {
    vi.useFakeTimers();
    const panel = openPanel(periodPanel({ kind: 'mine', mine: { rank: 12, score: { kind: 'fish', fish: 42 }, count: null } }));
    expect(q(panel.el, '.rank-mine__rank').textContent).toBe('Your rank: #12');
    expect(q(panel.el, '.rank-mine__score').textContent).toBe('Your score: 42 fish');
    vi.advanceTimersByTime(cfg.rank.panelPopMs);
    expect(q(panel.el, '[role="status"]').textContent).toBe('Your rank: #12. 42 fish.');
    // NEZP: no rank, only my score; it is not repeated.
    expect(announcement({ list: { kind: 'mine', mine: { rank: null, score: { kind: 'fish', fish: 42 }, count: null } }, result: { kind: 'period', gained: 2, total: 42, periodKind: 'week' } })).toBe('Your score: 42 fish.');
    expect(announcement({ list: { kind: 'loading' }, result: { kind: 'period', gained: 2, total: 42, periodKind: 'week' } })).toBe('+2 fish · This week: 42.');
    expect(formatRankScore({ kind: 'fish', fish: 1 })).toBe('1 fish');
    expect(formatRankScore({ kind: 'fish', fish: 1240 })).toBe('1,240 fish');
  });
});

// ─────────────────────────────── rankings hub ───────────────────────────────

function hubProps(over: Partial<RankHubProps> = {}): RankHubProps {
  return {
    tabs: ['period', 'daily', 'event', 'groups'],
    tab: 'period',
    eventNameKey: 'event.lantern.name' as I18nKey,
    periodKind: 'week',
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
    // Phase 2c §4.7: "This week" (the period board) first; no "Paw points".
    expect(tabs.map((t) => t.textContent)).toEqual(['This week', 'Today', 'Event', 'Groups']);
    expect(tabLabel('period', null, 'month')).toBe('This month');
    // The 2b 'points' tab is gone (I-3); the period tab follows the kind.
    expect(tabLabel('period', null, 'week')).toBe('This week');
    expect(rankTitle('period', null, 'day')).toBe('Daily ranking');
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
    expect(q(hub.el, '.rank-hub__heading').textContent).toBe('Weekly ranking');
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
    pointsEarned: 7296,
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

function openVictory(p: VictoryProps) {
  const v = createVictoryScreen();
  document.body.appendChild(v.el);
  v.open(p);
  return v;
}

const fishes = (root: ParentNode): string[] =>
  Array.from(root.querySelectorAll('.victory__kept .victory__fish')).map((f) => f.querySelector('use')?.getAttribute('href') ?? '');

describe('victory screen (§2.5; Phase 2c §2.7; 2c.1 §10.3)', () => {
  it('level: praise, "Level 37 complete", "7,296 points", the kept fish, and "Level 38" after 600 ms', () => {
    vi.useFakeTimers();
    // A stale 2c `streak` (deleted from VictoryProps at 2c.1 I-3) handed in through a cast is ignored.
    const p = { ...victoryProps(), streak: 4 } as VictoryProps;
    const v = openVictory(p);
    expect(q(v.el, '.victory__praise').textContent).toBe('Clever cat!');
    expect(q(v.el, '.victory__sub').textContent).toBe('Level 37 complete');
    // Row 1 (2c.1): the level's points total in a white pill with icon-points; its name is the visible text.
    const points = q(v.el, '.victory__points');
    expect(points.hidden).toBe(false);
    expect(points.textContent).toBe('7,296 points');
    expect(points.hasAttribute('role')).toBe(false);
    expect(points.querySelector('.victory__points-icon use')?.getAttribute('href')).toBe('#icon-points');
    expect(points.querySelector('.victory__points-icon')?.getAttribute('aria-hidden')).toBe('true');
    // Row 2: the lives of this attempt, all kept; "+3"; "This week: 42".
    const kept = q(v.el, '.victory__kept');
    expect(kept.dataset.count).toBe('3');
    expect(fishes(v.el)).toEqual(['#icon-fish', '#icon-fish', '#icon-fish']);
    expect(q(v.el, '.victory__plus').textContent).toBe('+3');
    expect(q(v.el, '.victory__period').textContent).toBe('This week: 42');
    expect(kept.getAttribute('role')).toBe('img');
    expect(kept.getAttribute('aria-label')).toBe('You kept 3 fish. Your total this week: 42.');
    // The points row comes first, then the kept fish (§10.3).
    expect(Array.from(q(v.el, '.victory__reward').children).map((c) => c.className.split(' ')[0])).toEqual(['victory__points', 'victory__kept']);
    // Gone in 2c: the fish pill at the top, its "+", the bonus chip; in 2c.1 the "Perfect ×N" chip and the chips row.
    expect(v.el.querySelector('.victory__top, .fish-pill, .fish-pill__plus, .victory__chip--bonus, .victory__total')).toBeNull();
    expect(v.el.querySelector('.victory__streak, .victory__score, .victory__chip')).toBeNull();
    expect(v.el.textContent).not.toMatch(/Perfect|×/);
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
    expect(v.dismiss()).toBe(false);
    const dialog = q(v.el, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The description reads the result, the level's points, then the fish kept, in the order shown.
    const ids = (dialog.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.className.split(' ')[0])).toEqual(['victory__sub', 'victory__points', 'victory__kept']);
  });

  it('a win with a mistake: the lost fish show empty, "+2", the total as it is; one fish after a revive', () => {
    const v = openVictory(victoryProps({ pointsEarned: 7104, kept: { fish: 2, max: 3, gained: 2, total: 41, kind: 'week' } }));
    expect(q(v.el, '.victory__kept').dataset.count).toBe('2');
    expect(fishes(v.el)).toEqual(['#icon-fish', '#icon-fish', '#icon-fish-empty']);
    expect(Array.from(v.el.querySelectorAll('.victory__fish')).map((f) => f.hasAttribute('data-kept'))).toEqual([true, true, false]);
    expect(q(v.el, '.victory__plus').textContent).toBe('+2');
    expect(q(v.el, '.victory__points').textContent).toBe('7,104 points');
    v.update(victoryProps({ pointsEarned: 576, kept: { fish: 1, max: 3, gained: 1, total: 12, kind: 'week' } }));
    expect(q(v.el, '.victory__points').textContent).toBe('576 points');
    expect(fishes(v.el)).toEqual(['#icon-fish', '#icon-fish-empty', '#icon-fish-empty']);
    expect(q(v.el, '.victory__kept').getAttribute('aria-label')).toBe('You kept 1 fish. Your total this week: 12.');
    // Five lives (an event rule), a monthly period.
    v.update(victoryProps({ kept: { fish: 4, max: 5, gained: 4, total: 9, kind: 'month' } }));
    expect(fishes(v.el)).toHaveLength(5);
    expect(q(v.el, '.victory__period').textContent).toBe('This month: 9');
  });

  it('no kept row when the win added no leaderboard points; banner reserve and the rays variable', () => {
    const v = openVictory(victoryProps({ kept: null, pointsEarned: 0, bannerReserved: true }));
    expect(q<HTMLElement>(v.el, '.victory__kept').hidden).toBe(true);
    expect(q<HTMLElement>(v.el, '.victory__points').hidden).toBe(true);
    expect(q<HTMLElement>(v.el, '.victory__reward').hidden).toBe(true);
    // A win that does not count still shows the total the player watched grow (§10.3), without fish.
    v.update(victoryProps({ kept: null, pointsEarned: 2016, bannerReserved: true }));
    expect(q<HTMLElement>(v.el, '.victory__points').hidden).toBe(false);
    expect(q(v.el, '.victory__points').textContent).toBe('2,016 points');
    expect(q<HTMLElement>(v.el, '.victory__reward').hidden).toBe(false);
    expect((q(v.el, '[role="dialog"]').getAttribute('aria-describedby') ?? '').split(' ')).toHaveLength(2);
    // null hides it too; one point reads singular.
    v.update(victoryProps({ kept: null, pointsEarned: null, bannerReserved: true }));
    expect(q<HTMLElement>(v.el, '.victory__points').hidden).toBe(true);
    v.update(victoryProps({ kept: null, pointsEarned: 1, bannerReserved: true }));
    expect(q(v.el, '.victory__points').textContent).toBe('1 point');
    // A kept row with nothing gained is hidden too (G = 0).
    v.update(victoryProps({ kept: { fish: 3, max: 3, gained: 0, total: 42, kind: 'week' }, bannerReserved: true }));
    expect(q<HTMLElement>(v.el, '.victory__kept').hidden).toBe(true);
    const root = q(v.el, '.victory');
    expect(root.hasAttribute('data-banner')).toBe(true);
    expect(root.style.getPropertyValue('--rays-ms')).toBe(`${cfg.fx.victoryRaysTurnMs}ms`);
    expect(root.style.getPropertyValue('--banner-reserve')).toBe(`${cfg.ads.banner.reservePx}px`);
  });

  it("tutorial: \"You're ready!\" and \"Play Level 2\", no Home, no reward block; replay: \"Home\"", () => {
    const t = openVictory(victoryProps({ variant: 'tutorial', level: 1, nextLevel: 2, pointsEarned: null, kept: null }));
    expect(q(t.el, '.victory__praise').textContent).toBe("You're ready!");
    expect(q(t.el, '.victory__primary').textContent).toBe('Play Level 2');
    expect(q<HTMLElement>(t.el, '.victory__home').hidden).toBe(true);
    expect(q<HTMLElement>(t.el, '.victory__reward').hidden).toBe(true);
    // Even if the app hands in a row, the tutorial shows none (§2.5: not scored).
    const r = openVictory(victoryProps({ variant: 'tutorial_replay', level: 1, nextLevel: null, pointsEarned: 50 }));
    expect(q<HTMLElement>(r.el, '.victory__reward').hidden).toBe(true);
    expect(q<HTMLElement>(r.el, '.victory__points').hidden).toBe(true);
    expect(q(r.el, '.victory__primary').textContent).toBe('Home');
  });

  it('daily: time, mistakes and hints, the countdown above the reward block, and "Done"', () => {
    vi.useFakeTimers();
    let now = 0;
    const v = openVictory(
      victoryProps({
        variant: 'daily',
        level: null,
        nextLevel: null,
        pointsEarned: 3264,
        kept: { fish: 3, max: 3, gained: 3, total: 45, kind: 'week' },
        daily: { dateKey: '2026-10-06', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: 61_000 },
        now: () => now,
      }),
    );
    expect(q(v.el, '.victory__sub').textContent).toBe('Daily puzzle · Tue 6 Oct');
    expect(q(v.el, '.victory__time').textContent).toBe('Solved in 4:12');
    expect(q(v.el, '.victory__stats').textContent).toBe('Mistakes 1 · Hints 0');
    expect(q(v.el, '.victory__next').textContent).toBe('Next puzzle in 1 min');
    expect(q(v.el, '.victory__points').textContent).toBe('3,264 points');
    // The daily's own lines come first, then the reward block.
    const col = Array.from(q(v.el, '.victory__col').children).map((c) => c.className.split(' ')[0]);
    expect(col.indexOf('victory__daily')).toBeLessThan(col.indexOf('victory__reward'));
    expect(q(v.el, '.victory__primary').textContent).toBe('Done');
    expect(q<HTMLElement>(v.el, '.victory__home').hidden).toBe(true);
    now = 62_000;
    vi.advanceTimersByTime(1000);
    expect(q(v.el, '.victory__next').textContent).toBe('A new puzzle is ready');
    v.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('event: progress bar from the old to the new value, the milestone line (hints, kitties), then the reward block', () => {
    vi.useFakeTimers();
    const v = openVictory(
      victoryProps({
        variant: 'event',
        level: null,
        nextLevel: null,
        event: { nameKey: 'event.lantern.name' as I18nKey, index: 6, total: 21, solvedBefore: 6, solvedAfter: 7, reward: { hints: 2 }, last: false },
      }),
    );
    expect(q(v.el, '.victory__sub').textContent).toBe('Lantern Walk · 7');
    const bar = q(v.el, '.victory__bar');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    vi.advanceTimersByTime(cfg.fx.overlayFadeMs);
    expect(bar.getAttribute('aria-valuenow')).toBe('7');
    expect(q(v.el, '.victory__bar-fill').style.width).toBe(`${((7 / 21) * 100).toFixed(2)}%`);
    expect(q(v.el, '.victory__milestone').textContent).toBe('Event reward: +2 hints');
    const col = Array.from(q(v.el, '.victory__col').children).map((c) => c.className.split(' ')[0]);
    expect(col.indexOf('victory__event')).toBeLessThan(col.indexOf('victory__reward'));
    expect(q(v.el, '.victory__primary').textContent).toBe('Play puzzle 8');
    expect(primaryLabel({ variant: 'event', nextLevel: null, event: { nameKey: 'event.lantern.name' as I18nKey, index: 20, total: 21, solvedBefore: 20, solvedAfter: 21, reward: null, last: true } })).toBe('Back to event');
    expect(rewardText({ hints: 3, kitties: 5 })).toBe('+3 hints and +5 kitties');
    expect(rewardText({ hints: 1 })).toBe('+1 hint');
    // A stray 2b fish milestone (Reward.fish was deleted at I-3) is never shown.
    expect(rewardText({ fish: 100, kitties: 3 } as Parameters<typeof rewardText>[0])).toBe('+3 kitties');
  });
});
