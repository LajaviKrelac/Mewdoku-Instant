// Owner: G3 (Phase 2e)
// The worldwide daily ranking's views (spec §2.4–§2.8, §7.7, §9.4, §10.1, §10.6 #1): the bracket list (exactly
// the server's rows, my row, medals WITH numbers, names as text, a11y names, the lines from the server's rules),
// the post-win panel's 'bracket' state and its tap rule with an interactive list, the ranking sheet (list, info,
// records, notice), the result card's three cases and the profile sheet. UI batch (2026-10-13): no visible player
// count, no pinned copy (my row is sticky), no "top 3" line, no pencil, the panel's subtitle hidden over the list.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { setLocale, t } from '../../../src/i18n';
import {
  countdownText,
  createBracketList,
  displayName,
  heartLabel,
  nextTickMs,
  rewardsLineText,
  rowLabel,
  visibleRows,
} from '../../../src/ui/overlays/bracket-list';
import { createLadderResult, grantText, resultLine, type LadderResultProps } from '../../../src/ui/overlays/ladder-result';
import { createLadderSheet, infoLines, sheetRecordRows, type LadderRulesView, type LadderSheetProps } from '../../../src/ui/overlays/ladder-sheet';
import { createNicknameSheet, type NicknameSheetProps, type ProfilePick } from '../../../src/ui/overlays/nickname-sheet';
import { clipName, tidyName } from '../../../src/ui/overlays/profile-text';
import { NAME_MAX_CHARS, NAME_MAX_DIGITS, NAME_MIN_WIDTH, nameProblem, normalizeName } from '../../../src/shared/nick-text';
import {
  announcement,
  createRankingPanel,
  recordsNote,
  type BracketListView,
  type BracketRowView,
  type PersonalRecordsView,
  type RankingPanelProps,
} from '../../../src/ui/overlays/ranking-panel';

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const H = 3_600_000;
const NAMES = ['Sleepy Whisker 27', 'Velvet Paws 3', 'Cozy Biscuit 41', 'Misty Pebble 9', 'Brave Noodle 12'];

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

/** `n` rows, best first; my row at `me` (1-based rank, 0 = not a member). Points fall with the rank. */
function rows(n: number, me = 5, over: (r: BracketRowView) => Partial<BracketRowView> = () => ({})): BracketRowView[] {
  return Array.from({ length: n }, (_, i) => {
    const r: BracketRowView = {
      rank: i + 1,
      slot: (i * 7) % 53,
      name: NAMES[i % NAMES.length] ?? `Cat ${i}`,
      avatarId: i % 12,
      points: Math.max(1, 40 - i),
      hearts: i % 4,
      me: i + 1 === me,
      likedByMe: false,
      heartEnabled: true,
      seenAt: null,
      playing: false,
    };
    return { ...r, ...over(r) };
  });
}

function view(over: Partial<BracketListView> = {}): BracketListView {
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
    heartsNew: 0,
    waiting: 0,
    stale: null,
    firstLineName: null,
    panelRows: 0,
    hearts: true,
    now: () => NOW,
    ...over,
  };
}

const RULES: LadderRulesView = { periodMode: 'rolling', maxMembers: 50, minMembers: 5, doubleByVideo: true, heartsEnabled: true, paidPlaces: 3 };

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

// ─────────────────────────────── the list ───────────────────────────────

describe('bracket list: exactly the server rows (H-3, §10.6 #1)', () => {
  it.each([1, 37, 50])('%i rows → exactly that many list items, in the server order, with the server ranks', (n) => {
    const v = view({ rows: rows(n, Math.min(5, n)) });
    const list = createBracketList(v, { onHeart: vi.fn() });
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items).toHaveLength(n);
    expect(items.map((li) => li.dataset.rank)).toEqual(v.rows.map((r) => String(r.rank)));
    expect(items.map((li) => li.dataset.slot)).toEqual(v.rows.map((r) => String(r.slot)));
    // The server's names, character for character, except the one no-break space before the number (audit B7).
    expect(items.map((li) => q(li, '.rank-row__name').textContent?.replace(/\u00A0/gu, ' '))).toEqual(v.rows.map((r) => r.name));
    expect(items.map((li) => q(li, '.rank-row__name').textContent)).toEqual(v.rows.map((r) => displayName(r.name)));
    // UI batch: no visible player count, and no pinned copy: my row is the one real row (sticky in CSS).
    expect(list.el.querySelector('.ranking__count, .rank-row--pinned')).toBeNull();
    expect(list.el.textContent).not.toMatch(/\d\s*players?\b/);
    expect(qa(list.el, '[data-me="1"]')).toHaveLength(1);
    expect(q(list.el, '[data-me="1"]').parentElement?.matches('ol.rank-rows')).toBe(true);
    list.destroy();
  });

  it('a server count that differs from the rows it sent (C-34): the rows as sent; the count only in the announcement', () => {
    const v = view({ rows: rows(3, 2), members: 4 });
    const list = createBracketList(v, { onHeart: vi.fn() });
    expect(qa(list.el, 'ol.rank-rows > li')).toHaveLength(3);
    expect(list.el.textContent).not.toMatch(/players?/);
    expect(announcement({ list: { kind: 'bracket', view: v }, result: { kind: 'ladder', gained: 1, total: 39 } })).toContain('#2 of 4');
  });

  it('alone: my row and "You\'re the only player in this ranking." (C-4: no promise that others join)', () => {
    const list = createBracketList(view({ rows: rows(1, 1) }), { onHeart: vi.fn() });
    expect(qa(list.el, 'ol.rank-rows > li')).toHaveLength(1);
    expect(q(list.el, '.ranking__alone').hidden).toBe(false);
    expect(q(list.el, '.ranking__alone').textContent).toBe("You're the only player in this ranking.");
    // The card hugs the one row (no empty white below it).
    expect(q(list.el, 'ol.rank-rows').hasAttribute('data-single')).toBe(true);
    expect(list.el.textContent).not.toMatch(/join as|more players/i);
    // Two players: no alone line.
    list.update(view({ rows: rows(2, 1) }));
    expect(q(list.el, '.ranking__alone').hidden).toBe(true);
  });

  it('places 1–3 carry a medal AND their number; 4 and below the number only (never colour alone)', () => {
    const list = createBracketList(view({ rows: rows(5) }), { onHeart: vi.fn() });
    const items = qa(list.el, 'ol.rank-rows > li');
    for (const [i, li] of items.entries()) {
      const medal = li.querySelector<HTMLElement>('.rank-row__medal');
      expect(q(li, '.rank-row__num').textContent).toBe(String(i + 1));
      if (i < 3) {
        expect(medal?.hidden).toBe(false);
        expect(medal?.querySelector('use')?.getAttribute('href')).toBe(`#medal-${i + 1}`);
      } else expect(medal?.hidden).toBe(true);
    }
  });

  it('names are text (textContent) with dir="auto"; the picture is our avatar symbol with its frame and background', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const list = createBracketList(view({ rows: rows(2, 1, (r) => (r.rank === 2 ? { name: evil, avatarId: 11, frameId: 3, backgroundId: 2 } : {})) }), { onHeart: vi.fn() });
    const name = qa(list.el, '.rank-row__name')[1] as HTMLElement;
    expect(name.textContent).toBe(evil);
    expect(name.querySelector('img')).toBeNull();
    expect(list.el.querySelector('img')).toBeNull();
    expect(name.getAttribute('dir')).toBe('auto');
    const art = qa(list.el, 'ol .rank-row__avatar');
    expect(qa(art[1] as HTMLElement, 'use').map((u) => u.getAttribute('href'))).toEqual(['#bg-2', '#avatar-11', '#frame-3']);
    // UI batch (profile): a row without them is the plain avatar
    expect(qa(art[0] as HTMLElement, 'use').map((u) => u.getAttribute('href'))).toHaveLength(1);
  });

  it('UI batch (profile): the podium draws the frame and background too; my place keeps a mark that is not only a colour', () => {
    const list = createBracketList(view({ rows: rows(6, 2, (r) => (r.rank === 2 ? { frameId: 5, backgroundId: 3 } : {})) }), { onHeart: vi.fn() });
    const second = q(list.el, '.lb-pod[data-place="2"]');
    expect(second.dataset.mine).toBe('1');
    expect(qa(q(second, '.lb-pod__frame'), 'use').map((u) => u.getAttribute('href'))).toEqual(['#bg-3', `#avatar-${rows(6, 2)[1]?.avatarId}`, '#frame-5']);
    expect(q(list.el, '.lb-pod[data-place="1"]').dataset.mine).toBe('0');
  });

  it('my row: highlighted, the "You" tag, the waiting chip, and its listitem name', () => {
    const list = createBracketList(view({ waiting: 2 }), { onHeart: vi.fn() });
    const mine = q(list.el, 'ol > li[data-me="1"]');
    expect(mine.dataset.rank).toBe('5');
    expect(q(mine, '.rank-row__you').textContent).toBe('You');
    expect(q(mine, '.rank-row__waiting').textContent).toBe('+2 waiting');
    // audit B11: the waiting chip is in my row's name too (its visible words)
    expect(mine.getAttribute('aria-label')).toBe('#5, Brave Noodle 12, you, 36 fish, 0 hearts, +2 waiting');
    const other = q(list.el, 'ol > li[data-rank="2"]');
    expect(other.getAttribute('aria-label')).toBe('#2, Velvet Paws 3, 39 fish, 1 heart');
    expect(q(other, '.rank-row__you').hidden).toBe(true);
    expect(q(other, '.rank-row__waiting').hidden).toBe(true);
    // The rows are not tab stops; the visible parts are hidden from screen readers (the label says it all).
    expect(mine.hasAttribute('tabindex')).toBe(false);
    expect(q(mine, '.rank-row__name').getAttribute('aria-hidden')).toBe('true');
    expect(q(mine, '.rank-row__tags').getAttribute('aria-hidden')).toBe('true');
    expect(q(mine, '.rank-row__place').getAttribute('aria-hidden')).toBe('true');
    expect(q(mine, '.rank-row__points').getAttribute('aria-hidden')).toBe('true');
    expect(q(list.el, 'ol.rank-rows').getAttribute('role')).toBe('list');
  });

  it('hearts: a button per row with aria-pressed and its name; a tap sends once until the next update', () => {
    const onHeart = vi.fn();
    const v = view({ rows: rows(5, 5, (r) => (r.rank === 3 ? { likedByMe: true, heartEnabled: false, hearts: 2 } : r.rank === 4 ? { heartEnabled: false } : {})) });
    const list = createBracketList(v, { onHeart });
    const hearts = qa(list.el, 'ol button.rank-row__heart') as HTMLButtonElement[];
    expect(hearts).toHaveLength(5);
    expect(hearts[1]?.getAttribute('aria-label')).toBe('Give a heart to Velvet Paws 3, 1 heart');
    expect(hearts[4]?.getAttribute('aria-label')).toBe('Give yourself a heart, 0 hearts');
    // Given: pressed, still focusable (aria-disabled), filled heart.
    expect(hearts[2]?.getAttribute('aria-pressed')).toBe('true');
    expect(hearts[2]?.getAttribute('aria-disabled')).toBe('true');
    expect(hearts[2]?.disabled).toBe(false);
    expect(hearts[2]?.querySelector('use')?.getAttribute('href')).toBe('#icon-heart-fill');
    // Not allowed (cap, offline): disabled.
    expect(hearts[3]?.disabled).toBe(true);
    hearts[1]?.click();
    hearts[1]?.click();
    expect(onHeart).toHaveBeenCalledTimes(1);
    expect(onHeart).toHaveBeenCalledWith(v.rows[1]?.slot);
    expect(hearts[1]?.getAttribute('aria-busy')).toBe('true');
    hearts[2]?.click();
    expect(onHeart).toHaveBeenCalledTimes(1);
    // The app's optimistic update re-renders the row: pressed, count +1, the same button (focus kept).
    list.update({ ...v, rows: v.rows.map((r) => (r.rank === 2 ? { ...r, likedByMe: true, heartEnabled: false, hearts: 2 } : r)) });
    const again = qa(list.el, 'ol button.rank-row__heart')[1];
    expect(again).toBe(hearts[1]);
    expect(again?.getAttribute('aria-pressed')).toBe('true');
    expect(again?.hasAttribute('aria-busy')).toBe(false);
    expect(q(again as HTMLElement, '.rank-row__hearts').textContent).toBe('2');
  });

  it('hearts off (rules.hearts.enabled false): no heart buttons and no hearts in the row names', () => {
    const list = createBracketList(view({ hearts: false }), { onHeart: vi.fn() });
    for (const b of qa(list.el, 'ol .rank-row__heart')) expect(b.hidden).toBe(true);
    expect(q(list.el, 'ol > li[data-me="1"]').getAttribute('aria-label')).toBe('#5, Brave Noodle 12, you, 36 fish');
  });

  it('the rewards line: only the minimum (C-5, the server rule); UI batch: no "The top 3 win …" line', () => {
    expect(rewardsLineText({ rewardsLine: 'places', minMembers: 5 })).toBeNull();
    expect(rewardsLineText({ rewardsLine: 'min', minMembers: 7 })).toBe('Rewards need at least 7 players in this ranking.');
    expect(rewardsLineText({ rewardsLine: 'none', minMembers: 5 })).toBeNull();
    for (const rewardsLine of ['none', 'places'] as const) {
      const list = createBracketList(view({ rewardsLine }), { onHeart: vi.fn() });
      expect(q(list.el, '.ranking__rewards').hidden).toBe(true);
      expect(list.el.textContent).not.toMatch(/win hints/);
      list.destroy();
    }
  });

  it('the countdown: hours and minutes, "less than a minute", "Final results"; refreshed, never a live region', () => {
    expect(countdownText(NOW + 7 * H + 48 * 60_000, NOW, false)).toBe('Ends in 7 h 48 min');
    expect(countdownText(NOW + 59_000, NOW, false)).toBe('Ends in less than a minute');
    expect(countdownText(NOW, NOW, false)).toBe('Final results');
    expect(countdownText(NOW + H, NOW, true)).toBe('Final results');
    expect(countdownText(null, NOW, false)).toBeNull();
    expect(nextTickMs(NOW + 90_000, NOW, 60_000)).toBe(30_001);
    expect(nextTickMs(NOW + 30_000, NOW, 60_000)).toBe(30_001);
    expect(nextTickMs(NOW - 1, NOW)).toBeNull();
    vi.useFakeTimers();
    let now = NOW;
    const list = createBracketList(view({ endsAt: NOW + 61_000, now: () => now }), { onHeart: vi.fn() });
    const cd = q(list.el, '.ranking__countdown');
    expect(cd.textContent).toBe('Ends in 1 min');
    expect(cd.closest('[aria-live]')).toBeNull();
    now += 2000;
    vi.advanceTimersByTime(2000);
    expect(cd.textContent).toBe('Ends in less than a minute');
    now += 60_000;
    vi.advanceTimersByTime(60_000);
    expect(cd.textContent).toBe('Final results');
    list.destroy();
  });

  it('stale (a cached bracket while offline): "Last updated hh:mm" + the honest offline line; data-stale', () => {
    const list = createBracketList(view({ stale: { at: NOW - 3 * H } }), { onHeart: vi.fn() });
    expect(list.el.dataset.stale).toBe('1');
    expect(q(list.el, '.ranking__stale').textContent).toMatch(/^Last updated \d{1,2}:\d{2}/);
    expect(q(list.el, '.ranking__offline').textContent).toBe("You're offline. We'll try to send your fish when you're back online.");
    expect(list.el.textContent).not.toMatch(/will be (sent|counted)/i);
    list.update(view());
    expect(list.el.dataset.stale).toBe('0');
    expect(q(list.el, '.ranking__stale').hidden).toBe(true);
  });

  it('hearts received and the first-time line', () => {
    const list = createBracketList(view({ heartsNew: 3, firstLineName: 'Brave Noodle 12' }), { onHeart: vi.fn() });
    expect(q(list.el, '.ranking__hearts-new').textContent).toBe('+3 hearts from other players');
    expect(q(list.el, '.ranking__first').textContent).toBe('This is you in the ranking: Brave Noodle 12. You can change your name and picture in Settings.');
    list.update(view({ heartsNew: 1 }));
    expect(q(list.el, '.ranking__hearts-new').textContent).toBe('+1 heart from another player');
    expect(q(list.el, '.ranking__first').hidden).toBe(true);
  });

  it('ladder.panelRows > 0: a contiguous window of the server rows around mine (never reordered or invented)', () => {
    const all = rows(50, 20);
    const w = visibleRows(all, 5);
    expect(w.map((r) => r.rank)).toEqual([18, 19, 20, 21, 22]);
    expect(visibleRows(rows(50, 2), 5).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(visibleRows(rows(50, 50), 5).map((r) => r.rank)).toEqual([46, 47, 48, 49, 50]);
    expect(visibleRows(all, 0)).toBe(all);
    const list = createBracketList(view({ rows: all, panelRows: 5 }), { onHeart: vi.fn() });
    expect(qa(list.el, 'ol > li').map((li) => li.dataset.rank)).toEqual(['18', '19', '20', '21', '22']);
  });

  it('UI batch: no pencil on my row (the name sheet opens from Settings and the Home picture)', () => {
    const list = createBracketList(view(), { onHeart: vi.fn() });
    expect(list.el.querySelector('.rank-row__edit')).toBeNull();
    // My row's one button is its heart (rows are not tab stops; my row is not a paid place here).
    expect(qa(q(list.el, 'li[data-me="1"]'), 'button:not([hidden])').map((b) => b.className)).toEqual(['rank-row__heart']);
    list.destroy();
  });

  it('row and heart labels (pure helpers)', () => {
    const r = rows(5)[4] as BracketRowView;
    expect(rowLabel(r, true)).toBe('#5, Brave Noodle 12, you, 36 fish, 0 hearts');
    expect(rowLabel({ ...r, me: false, hearts: 1 }, true)).toBe('#5, Brave Noodle 12, 36 fish, 1 heart');
    // audit B11: my row's waiting fish; never on another player's row
    expect(rowLabel(r, true, 3)).toBe('#5, Brave Noodle 12, you, 36 fish, 0 hearts, +3 waiting');
    expect(rowLabel(r, false, 3)).toBe('#5, Brave Noodle 12, you, 36 fish, +3 waiting');
    expect(rowLabel({ ...r, me: false }, true, 3)).toBe('#5, Brave Noodle 12, 36 fish, 0 hearts');
    // audit B7: the number keeps to the word before it (display only)
    expect(displayName('Cheerful Dumpling 99')).toBe('Cheerful Dumpling\u00A099');
    expect(displayName('Velvet Pounce 7')).toBe('Velvet Pounce\u00A07');
    expect(displayName('<b>x</b>')).toBe('<b>x</b>');
    expect(heartLabel({ ...r, me: false, hearts: 1 })).toBe('Give a heart to Brave Noodle 12, 1 heart');
  });

  it('RTL (Arabic): the copy follows the language, the names stay our English words, isolated with dir="auto"', async () => {
    const list = createBracketList(view({ rows: rows(6, 2), waiting: 2 }), { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    try {
      expect(await setLocale('ar')).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
      const items = qa(list.el, 'ol.rank-rows > li.rank-row');
      // The names are never translated (glossary) and each is bidi-isolated (spec §2.4, C-31).
      expect(items.map((li) => q(li, '.rank-row__name').textContent)).toEqual(NAMES.concat(NAMES[0] as string).slice(0, 6).map(displayName));
      for (const li of items) expect(q(li, '.rank-row__name').getAttribute('dir')).toBe('auto');
      // The lines and the a11y names re-render in Arabic on the locale change (A11Y-I18N-1), still the server's numbers.
      expect(q(list.el, '.ranking__countdown').textContent).toBe(countdownText(NOW + 7 * H + 48 * 60_000, NOW, false));
      expect(q(list.el, '.ranking__countdown').textContent).not.toMatch(/Ends in/);
      const mine = q(list.el, '.rank-row[data-me="1"]');
      expect(mine.getAttribute('aria-label')).toContain('Velvet Paws 3');
      expect(mine.getAttribute('aria-label')).not.toMatch(/\byou\b|fish|hearts?/);
      expect(q(mine, '.rank-row__you').textContent).toBe(t('ladder.you'));
      expect(q(mine, '.rank-row__waiting').textContent).not.toMatch(/waiting/);
    } finally {
      await setLocale('en');
      list.destroy();
    }
  });
});

// ─────────────────────────────── the post-win panel ───────────────────────────────

function panelProps(over: Partial<RankingPanelProps> = {}): RankingPanelProps {
  return {
    board: 'period',
    eventNameKey: null,
    result: { kind: 'ladder', gained: 2, total: 14 },
    list: { kind: 'bracket', view: view() },
    tapMinMs: cfg.rank.panelTapMinMs,
    reducedMotion: false,
    onContinue: vi.fn(),
    onSeeTop: vi.fn(),
    onListArea: vi.fn(),
    onHeart: vi.fn(),
    onInfo: vi.fn(),
    bracketList: createBracketList,
    ...over,
  };
}

describe('ranking panel: the bracket state (spec §2.4, §9.4)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('"Leaderboard", the stopwatch right under it, and the bracket list in the DOM contract', () => {
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(panelProps());
    expect(q(panel.el, '.ranking__title').textContent).toBe('Leaderboard');
    // UI batch (user: remove "+1 fish · Your total: 16"): hidden over the list, still the dialog's description.
    const sub = q(panel.el, '.ranking__sub');
    expect(sub.hidden).toBe(true);
    expect(sub.textContent).toBe('+2 fish · Your total: 14');
    expect(q(panel.el, '[role=dialog]').getAttribute('aria-describedby')).toBe(sub.id);
    // audit B9 / A-H1: unanswered (offline), the server's total and the queued fish apart, as my row shows them
    panel.update(panelProps({ result: { kind: 'ladder', gained: 3, total: 3, waiting: 3 } }));
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+3 fish · Your total: 3 · +3\u00A0waiting');
    // The skeleton while the win is sent: hidden too; the records card keeps it (the only total it shows).
    panel.update(panelProps({ list: { kind: 'loading' } }));
    expect(q(panel.el, '.ranking__sub').hidden).toBe(true);
    panel.update(panelProps({ list: { kind: 'records', records: RECORDS, reason: 'unavailable' } }));
    expect(q(panel.el, '.ranking__sub').hidden).toBe(false);
    panel.update(panelProps());
    // Worded: never forced LTR (.num) in Arabic.
    expect(q(panel.el, '.ranking__sub').classList.contains('num')).toBe(false);
    const list = q(document, '.overlay[data-overlay=ranking] .rank-list[data-kind=bracket][data-stale="0"]');
    expect(list.querySelector(':scope > ol.rank-rows')).not.toBeNull();
    expect(qa(list, 'ol.rank-rows > li.rank-row')).toHaveLength(37);
    // The stopwatch is the list's first child (right under the title); the worded countdown is for screen readers
    // only and no player count shows (UI batch).
    expect(list.firstElementChild?.classList.contains('lb-timer')).toBe(true);
    const meta = q(panel.el, '.ranking__meta');
    expect(meta.classList.contains('sr-only')).toBe(true);
    expect(meta.textContent).toBe('Ends in 7 h 48 min');
    expect(panel.el.querySelector('.ranking__count')).toBeNull();
    expect(q(panel.el, '.lb-timer').getAttribute('aria-hidden')).toBe('true');
    expect(q(panel.el, '.lb-timer__text').textContent).toMatch(/^07:4[78]:\d\d$/);
    expect(q(panel.el, '.ranking__rewards').hidden).toBe(true);
    expect(q(panel.el, 'button.ranking__info').hidden).toBe(false);
    expect(q(panel.el, 'button.ranking__info').getAttribute('aria-label')).toBe('How it works');
    // The footer button keeps the first focus (rows are not tab stops).
    expect(q(panel.el, '.ranking__tap').hasAttribute('data-autofocus')).toBe(true);
  });

  it('without the ladder chunk yet: the static skeleton (no fake rows), then the list on update', () => {
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    const p = panelProps({ bracketList: undefined });
    panel.open(p);
    expect(panel.el.querySelector('.rank-row')).toBeNull();
    expect(q(panel.el, '.rank-list').dataset.kind).toBe('loading');
    expect(panel.el.querySelector('.rank-list__skeleton')).not.toBeNull();
    // The (i) glyph and the sheet come with the chunk: no blank disc meanwhile.
    expect(q(panel.el, 'button.ranking__info').hidden).toBe(true);
    panel.update({ ...p, bracketList: createBracketList });
    expect(qa(panel.el, 'ol.rank-rows > li')).toHaveLength(37);
    expect(q(panel.el, 'button.ranking__info').hidden).toBe(false);
    expect(q(panel.el, 'ol.rank-rows').hasAttribute('data-single')).toBe(false);
    // Back to records (e.g. the cache ended): the plain list area returns.
    panel.update({ ...p, list: { kind: 'records', records: RECORDS, reason: 'unavailable' } });
    expect(panel.el.querySelector('.rank-rows')).toBeNull();
    expect(q(panel.el, '.rank-list__note').textContent).toBe("The ranking couldn't load right now. Here are your own records.");
  });

  it('taps: a heart, the (i) button, a tap or a drag in the list never continue; a tap elsewhere does', () => {
    const p = panelProps();
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(p);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs + 10);
    const heart = qa(panel.el, 'ol button.rank-row__heart')[1] as HTMLButtonElement;
    heart.click();
    expect(p.onHeart).toHaveBeenCalledTimes(1);
    q(panel.el, 'button.ranking__info').click();
    expect(p.onInfo).toHaveBeenCalledTimes(1);
    q(panel.el, 'ol > li[data-rank="3"]').click();
    expect(p.onContinue).not.toHaveBeenCalled();
    // A drag that ends outside the list is still not a tap.
    const title = q(panel.el, '.ranking__title');
    title.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    title.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 60 }));
    title.click();
    expect(p.onContinue).not.toHaveBeenCalled();
    // A plain tap on the header continues.
    title.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    title.click();
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('Enter on the footer and Esc continue as today', () => {
    const p = panelProps();
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(p);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs + 10);
    expect(panel.dismiss()).toBe(true);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('announces my rank politely once: "You are #5 of 37 in the daily ranking."', () => {
    const p = panelProps();
    expect(announcement(p)).toBe('You are #5 of 37 in the daily ranking. +2 fish · Your total: 14.');
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(p);
    vi.advanceTimersByTime(cfg.rank.panelPopMs + 5);
    const live = q(panel.el, '[role=status]');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('You are #5 of 37 in the daily ranking. +2 fish · Your total: 14.');
  });

  it('records notes: local, unavailable (ranking vs 2b boards), opted out, paused (spec §2.9)', () => {
    expect(recordsNote('local', true)).toBe("Rankings with other players aren't available in this version. Here are your own records.");
    expect(recordsNote('unavailable', true)).toBe("The ranking couldn't load right now. Here are your own records.");
    expect(recordsNote('unavailable', false)).toBe("Rankings couldn't load right now.");
    expect(recordsNote('opted_out', true)).toBe("You've turned rankings off in Settings. Here are your own records.");
    expect(recordsNote('paused', true)).toBe('Your ranking is paused. Here are your own records.');
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(panelProps({ list: { kind: 'records', records: RECORDS, reason: 'paused' } }));
    expect(q(panel.el, '.rank-list').dataset.kind).toBe('records');
    expect(q(panel.el, '.rank-list__note').textContent).toBe('Your ranking is paused. Here are your own records.');
    // audit B4: the records state is titled as the sheet titles it
    expect(q(panel.el, '.ranking__title').textContent).toBe('Your records');
    expect(q(panel.el, 'button.ranking__info').hidden).toBe(true);
  });
});

// ─────────────────────────────── the sheet ───────────────────────────────

function sheetProps(over: Partial<LadderSheetProps> = {}): LadderSheetProps {
  return {
    view: 'list',
    list: view(),
    records: null,
    rules: RULES,
    infoOnly: false,
    reducedMotion: false,
    onHeart: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('ranking sheet (overlay `ladder`, spec §2.5)', () => {
  it('list: (i) · "Leaderboard" · ×, no pencil; hearts; the (i) button opens the info view; Back and Esc return', () => {
    const p = sheetProps();
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    expect(sheet.el.dataset.overlay).toBe('ladder');
    expect(q(sheet.el, '.ladder-sheet').dataset.view).toBe('list');
    expect(q(sheet.el, '.overlay__title').textContent).toBe('Leaderboard');
    // UI batch: the (i) at the start, the title between it and × (truly centred); Back takes the start in the info view.
    const head = Array.from(q(sheet.el, '.overlay__head').children) as HTMLElement[];
    expect(head.map((c) => ['overlay__back', 'ladder-sheet__info', 'overlay__title', 'overlay__close'].find((k) => c.classList.contains(k)))).toEqual([
      'overlay__back',
      'ladder-sheet__info',
      'overlay__title',
      'overlay__close',
    ]);
    expect(head.filter((c) => !c.hidden).map((c) => c.tagName)).toEqual(['BUTTON', 'H2', 'BUTTON']);
    expect(qa(sheet.el, 'ol.rank-rows > li')).toHaveLength(37);
    // Full height while the list is there (its rows scroll inside).
    expect(q(sheet.el, '.ladder-sheet').hasAttribute('data-fit')).toBe(false);
    expect(sheet.el.querySelector('.rank-row__edit')).toBeNull();
    qa(sheet.el, 'ol button.rank-row__heart')[0]?.click();
    expect(p.onHeart).toHaveBeenCalledWith(p.list?.rows[0]?.slot);
    q(sheet.el, '.ladder-sheet__info').click();
    expect(q(sheet.el, '.ladder-sheet').dataset.view).toBe('info');
    expect(q(sheet.el, '.overlay__title').textContent).toBe('How it works');
    expect(q(sheet.el, '.overlay__back').hidden).toBe(false);
    expect(sheet.dismiss()).toBe(true);
    expect(q(sheet.el, '.ladder-sheet').dataset.view).toBe('list');
    expect(p.onClose).not.toHaveBeenCalled();
    expect(sheet.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('no bracket now: "Solve a puzzle to join the daily ranking." and no (i) on the list', () => {
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(sheetProps({ list: null }));
    expect(q(sheet.el, '.ladder-sheet__join').hidden).toBe(false);
    expect(q(sheet.el, '.ladder-sheet__join').textContent).toBe('Solve a puzzle to join the daily ranking.');
    expect(sheet.el.querySelector('.rank-row')).toBeNull();
  });

  it('info: every count from the server rules (C-5); ×2 and hearts only when on; never the Facebook name', () => {
    const texts = (r: LadderRulesView | null): string[] => infoLines(r).map((l) => l.text);
    const on = texts(RULES);
    expect(on).toEqual([
      'Every puzzle you solve adds the fish you kept, up to 3, to your total.',
      'A ranking lasts 24 hours and holds up to 50 players. When it ends, you join a new one the next time you open the game.',
      'When a ranking ends, the top 3 win hints and kitties if at least 5 players took part.',
      'You can watch a video to double your reward.',
      'Tap a heart to cheer on a player. Hearts are just for fun.',
      'Other players see your ranking name and picture, never your Facebook name or photo.',
      'Players in your ranking see when you were last active and whether you are playing a puzzle.',
      'You can turn rankings off or delete your ranking data in Settings.',
    ]);
    const off = texts({ ...RULES, periodMode: 'utc_day', maxMembers: 40, paidPlaces: 1, minMembers: 8, doubleByVideo: false, heartsEnabled: false });
    expect(off).toContain('A new ranking starts every day at midnight UTC and holds up to 40 players.');
    expect(off).toContain('When a ranking ends, first place wins hints and kitties if at least 8 players took part.');
    expect(off.join(' ')).not.toMatch(/video|heart/i);
    expect(texts(null)).toHaveLength(4);
    expect(texts({ ...RULES, durationMs: 12 * H })[1]).toBe(
      'A ranking lasts 12 hours and holds up to 50 players. When it ends, you join a new one the next time you open the game.',
    );
  });

  it('records: the records card with the streak\'s best run and the honest note', () => {
    expect(sheetRecordRows(RECORDS, 9)).toEqual([
      ['This week', '42 fish'],
      ['Your best week', '57 fish'],
      ['Total points', '5,120'],
      ['Levels solved', '64'],
      ['Best streak', '9 days'],
    ]);
    expect(sheetRecordRows(RECORDS, 0).map((r) => r[0])).not.toContain('Best streak');
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(sheetProps({ view: 'records', list: null, records: RECORDS, recordsReason: 'opted_out', streakBest: 1 }));
    expect(q(sheet.el, '.overlay__title').textContent).toBe('Your records');
    // No list to reach: the sheet fits its content.
    expect(q(sheet.el, '.ladder-sheet').hasAttribute('data-fit')).toBe(true);
    expect(qa(sheet.el, '.rank-records__row')).toHaveLength(5);
    expect(q(sheet.el, '.rank-records__row:last-child').textContent).toBe('Best streak1 day');
    expect(q(sheet.el, '.ladder-sheet__records-box .rank-list__note').textContent).toBe("You've turned rankings off in Settings. Here are your own records.");
  });

  it('notice mode (ladder.noticeFirst): the info view as a dialog with OK only', () => {
    const p = sheetProps({ view: 'info', infoOnly: true });
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    expect(q(sheet.el, '.ladder-sheet').hasAttribute('data-info-only')).toBe(true);
    expect(q(sheet.el, '.overlay__close').hidden).toBe(true);
    expect(q(sheet.el, '.overlay__back').hidden).toBe(true);
    const ok = q(sheet.el, '.ladder-sheet__ok');
    expect(ok.parentElement?.hidden).toBe(false);
    expect(ok.hasAttribute('data-autofocus')).toBe(true);
    ok.click();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────── the result card ───────────────────────────────

function resultProps(over: Partial<LadderResultProps> = {}): LadderResultProps {
  return {
    case: 'paid',
    place: 2,
    members: 37,
    reward: { hints: 1, kitties: 1 },
    canDouble: true,
    paidPlaces: 3,
    busy: false,
    onCollect: vi.fn(),
    onDouble: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('result card (overlay `ladder_result`, spec §2.6)', () => {
  it('paid: the place, the reward, ▶ Collect ×2 (primary) and Collect', () => {
    const p = resultProps();
    const card = createLadderResult();
    document.body.appendChild(card.el);
    card.open(p);
    expect(card.el.dataset.case).toBe('paid');
    expect(q(card.el, '.overlay__title').textContent).toBe('Ranking results');
    expect(q(card.el, '.ladder-result__place').textContent).toBe('You finished #2 of 37.');
    expect(q(card.el, '.ladder-result__line').textContent).toBe('Your reward: +1 hint and +1 kitty');
    const dbl = q<HTMLButtonElement>(card.el, 'button.ladder-result__double');
    const col = q<HTMLButtonElement>(card.el, 'button.ladder-result__collect');
    expect(dbl.hidden).toBe(false);
    expect(dbl.textContent).toBe('Collect ×2');
    // audit B12, B13: the name is the visible label; the video is said in words under it (its description)
    expect(dbl.hasAttribute('aria-label')).toBe(false);
    const note = q(card.el, '.ladder-result__double-note');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('You can watch a video to double your reward.');
    expect(dbl.getAttribute('aria-describedby')).toBe(note.id);
    expect(dbl.nextElementSibling).toBe(note);
    expect(dbl.querySelector('use')?.getAttribute('href')).toBe('#icon-play-video');
    expect(dbl.hasAttribute('data-autofocus')).toBe(true);
    expect(col.classList.contains('btn--secondary')).toBe(true);
    expect(q(card.el, '.ladder-result__ok').hidden).toBe(true);
    dbl.click();
    col.click();
    expect(p.onDouble).toHaveBeenCalledTimes(1);
    expect(p.onCollect).toHaveBeenCalledTimes(1);
  });

  it('no ×2 without rewarded videos (no free ×2): Collect alone, as the primary', () => {
    const card = createLadderResult();
    document.body.appendChild(card.el);
    card.open(resultProps({ canDouble: false, place: 1, reward: { hints: 2, kitties: 2 } }));
    expect(q(card.el, '.ladder-result__double').hidden).toBe(true);
    expect(q(card.el, '.ladder-result__double-note').hidden).toBe(true); // no video, no video line
    const col = q(card.el, '.ladder-result__collect');
    expect(col.classList.contains('btn--primary')).toBe(true);
    expect(col.hasAttribute('data-autofocus')).toBe(true);
    expect(q(card.el, '.ladder-result__line').textContent).toBe('Your reward: +2 hints and +2 kitties');
  });

  it('too few players and a place without a reward: one honest line and OK', () => {
    expect(resultLine({ case: 'too_few', reward: null, paidPlaces: 3 })).toBe('Not enough players took part for rewards this time.');
    expect(resultLine({ case: 'none', reward: null, paidPlaces: 3 })).toBe('Thanks for playing! The top 3 win hints and kitties.');
    expect(resultLine({ case: 'none', reward: null, paidPlaces: 1 })).toBe('Thanks for playing! First place wins hints and kitties.');
    expect(grantText({ hints: 1 })).toBe('+1 hint');
    const p = resultProps({ case: 'too_few', place: 1, members: 3, reward: null });
    const card = createLadderResult();
    document.body.appendChild(card.el);
    card.open(p);
    expect(q(card.el, '.ladder-result__place').textContent).toBe('You finished #1 of 3.');
    expect(q(card.el, '.ladder-result__double').hidden).toBe(true);
    expect(q(card.el, '.ladder-result__collect').hidden).toBe(true);
    q(card.el, '.ladder-result__ok').click();
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(q(card.el, '.ladder-result__art use').getAttribute('href')).toBe('#medal-1');
    card.update({ ...p, case: 'none', place: 12, members: 37 });
    expect(q(card.el, '.ladder-result__place').textContent).toBe('You finished #12 of 37.');
    expect(q(card.el, '.ladder-result__art use').getAttribute('href')).toBe('#icon-trophy');
  });

  it('busy: every button disabled; Esc waits; otherwise Esc is "later" and a scrim tap does nothing', () => {
    const p = resultProps({ busy: true });
    const card = createLadderResult();
    document.body.appendChild(card.el);
    card.open(p);
    for (const b of qa(card.el, 'button')) expect(b.getAttribute('aria-disabled'), b.className).toBe('true');
    q(card.el, '.ladder-result__collect').click();
    expect(p.onCollect).not.toHaveBeenCalled();
    expect(card.dismiss()).toBe(true);
    expect(p.onClose).not.toHaveBeenCalled();
    card.update({ ...p, busy: false });
    q(card.el, '.overlay__scrim').click();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(card.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────── the profile sheet (UI batch: a typed name, the picture, a frame, a background) ───────────────────────────────

const CURRENT: ProfilePick = { name: 'Velvet Pounce 27', avatarId: 4, frameId: 0, backgroundId: 0 };
const LOCKS: NicknameSheetProps['frames'] = [null, null, null, { kind: 'level', level: 25 }, { kind: 'streak', days: 7 }, { kind: 'level', level: 100 }, { kind: 'prize' }, { kind: 'level', level: 300 }];

function nickProps(over: Partial<NicknameSheetProps> = {}): NicknameSheetProps {
  return {
    current: CURRENT,
    avatarCount: 12,
    frames: LOCKS,
    backgrounds: LOCKS,
    nameEditable: true,
    nameRules: { maxChars: NAME_MAX_CHARS, minWidth: NAME_MIN_WIDTH, maxDigits: NAME_MAX_DIGITS },
    checkName: (raw) => nameProblem(normalizeName(raw)),
    state: 'idle',
    cooldownUntil: null,
    now: () => NOW,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

function openNick(over: Partial<NicknameSheetProps> = {}): { sheet: ReturnType<typeof createNicknameSheet>; p: NicknameSheetProps } {
  const p = nickProps(over);
  const sheet = createNicknameSheet();
  document.body.appendChild(sheet.el);
  sheet.open(p);
  return { sheet, p };
}

const type = (el: HTMLElement, value: string): void => {
  const input = q<HTMLInputElement>(el, 'input.nickname__input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const hrefs = (el: Element): (string | null)[] => qa(el, 'use').map((u) => u.getAttribute('href'));

describe('profile sheet (overlay `nickname`, spec §2.7; UI batch)', () => {
  it('my picture and my name in a labelled text field (16 px, dir=auto, never the first focus); Picture · Frame · Background tabs', () => {
    const { sheet } = openNick();
    const input = q<HTMLInputElement>(sheet.el, 'input.nickname__input');
    expect(input.value).toBe('Velvet Pounce 27');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('enterkeyhint')).toBe('done');
    expect(q(sheet.el, `label[for="${input.id}"]`).textContent).toBe('Name');
    expect(q(sheet.el, 'h2.overlay__title').textContent).toBe('Your profile');
    expect(hrefs(q(sheet.el, '.nickname__avatar'))).toEqual(['#avatar-4']);
    const tabs = qa(sheet.el, '[role=tablist] [role=tab]');
    expect(tabs.map((b) => b.textContent)).toEqual(['Picture', 'Frame', 'Background']);
    expect(tabs.map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    const pics = qa(sheet.el, '[role=radiogroup].nickname__avatars [role=radio]');
    expect(pics).toHaveLength(12);
    expect(pics.map((b) => b.getAttribute('aria-checked'))).toEqual(pics.map((_, i) => String(i === 4)));
    expect(pics[0]?.getAttribute('aria-label')).toBe('Picture 1 of 12');
    expect(q(sheet.el, '.nickname__avatars').getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    expect(q(sheet.el, '.nickname__frames').hidden).toBe(true);
    // It opens on the chosen picture, never on the text field (a keyboard would cover the dialog).
    expect(qa(sheet.el, '[data-autofocus]')).toEqual([pics[4]]);
    // Nothing changed yet: Save waits.
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
  });

  it('typing a name: clipped at 16 code points, a hint for a bad shape (and Save waits), Enter saves a good one', () => {
    const { sheet, p } = openNick();
    const input = q<HTMLInputElement>(sheet.el, 'input.nickname__input');
    type(sheet.el, 'Ko');
    expect(q(sheet.el, '.nickname__hint').textContent).toBe('Use 3 to 16 letters or numbers.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
    type(sheet.el, 'cat@home');
    expect(q(sheet.el, '.nickname__hint').textContent).toBe('No web addresses or @ names, please.');
    type(sheet.el, 'Cat!');
    expect(q(sheet.el, '.nickname__hint').textContent).toBe('Use letters, numbers, spaces and . _ - only.');
    type(sheet.el, 'Cat12345');
    expect(q(sheet.el, '.nickname__hint').textContent).toBe('Use 4 digits at most.');
    type(sheet.el, '');
    type(sheet.el, '😺'.repeat(20));
    expect([...input.value]).toHaveLength(16); // code points, a pair never split
    type(sheet.el, '  Captain   Purr ');
    expect(q(sheet.el, '.nickname__hint').hidden).toBe(true);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(p.onSave).toHaveBeenCalledWith({ ...CURRENT, name: 'Captain Purr' });
  });

  it('review fix (F5): an IME composition is never saved by its confirming Enter nor clipped mid-way', () => {
    const { sheet, p } = openNick();
    const input = q<HTMLInputElement>(sheet.el, 'input.nickname__input');
    type(sheet.el, '猫好');
    // Chrome / Firefox: the Enter that confirms a conversion has isComposing; WebKit (Safari, iOS webview): keyCode 229.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    const webkit = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(webkit, 'keyCode', { value: 229 });
    input.dispatchEvent(webkit);
    expect(p.onSave).not.toHaveBeenCalled();
    // Romaji past the limit while composing: left alone (a clip would abort the composition) …
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'a'.repeat(14) + 'nekoga';
    input.dispatchEvent(new InputEvent('input', { isComposing: true }));
    expect(input.value).toBe('a'.repeat(14) + 'nekoga');
    // … and clipped once the composition ends.
    input.value = 'a'.repeat(14) + '猫が好き';
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect([...input.value]).toHaveLength(16);
    // a plain Enter still saves
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(p.onSave).toHaveBeenCalledWith({ ...CURRENT, name: 'a'.repeat(14) + '猫が' });
  });

  it('frames and backgrounds: each shown on my picture; a locked one shows a lock and says what unlocks it, never picked', () => {
    const { sheet, p } = openNick();
    q(sheet.el, '[role=tab][data-tab="frame"]').click();
    expect(q(sheet.el, '.nickname__frames').hidden).toBe(false);
    expect(q(sheet.el, '.nickname__avatars').hidden).toBe(true);
    const frames = qa(sheet.el, '.nickname__frames [role=radio]');
    expect(frames).toHaveLength(8);
    expect(hrefs(frames[2] as HTMLElement)).toEqual(['#avatar-4', '#frame-2']);
    expect(frames[0]?.getAttribute('aria-label')).toBe('Frame 1 of 8');
    expect(frames[3]?.getAttribute('aria-disabled')).toBe('true');
    expect(frames[3]?.hasAttribute('data-locked')).toBe(true);
    expect(frames[3]?.querySelector('.nickname__lock')).not.toBeNull();
    expect(frames[3]?.getAttribute('aria-label')).toBe('Frame 4 of 8, locked. Reach level 25 to unlock.');
    frames[3]?.click();
    expect(frames[3]?.getAttribute('aria-checked')).toBe('false');
    expect(q(sheet.el, '.nickname__unlock').textContent).toBe('Reach level 25 to unlock.');
    frames[4]?.click();
    expect(q(sheet.el, '.nickname__unlock').textContent).toBe('Play 7 days in a row to unlock.');
    frames[6]?.click();
    expect(q(sheet.el, '.nickname__unlock').textContent).toBe('Win a ranking reward to unlock.');
    frames[2]?.click();
    expect(q(sheet.el, '.nickname__unlock').hidden).toBe(true);
    expect(hrefs(q(sheet.el, '.nickname__avatar'))).toEqual(['#avatar-4', '#frame-2']);
    q(sheet.el, '[role=tab][data-tab="bg"]').click();
    const bgs = qa(sheet.el, '.nickname__bgs [role=radio]');
    expect(hrefs(bgs[1] as HTMLElement)).toEqual(['#bg-1', '#avatar-4', '#frame-2']); // with the frame just picked
    bgs[1]?.click();
    // the pictures redraw with the new frame and background
    q(sheet.el, '[role=tab][data-tab="avatar"]').click();
    expect(hrefs(qa(sheet.el, '.nickname__avatars [role=radio]')[7] as HTMLElement)).toEqual(['#bg-1', '#avatar-7', '#frame-2']);
    q(sheet.el, 'button.nickname__save').click();
    expect(p.onSave).toHaveBeenCalledWith({ ...CURRENT, frameId: 2, backgroundId: 1 });
  });

  it('arrows: the tabs move and select (RTL-aware via arrowStep); in a grid they move to a locked look without picking it', () => {
    const { sheet } = openNick();
    const tabs = q(sheet.el, '[role=tablist]');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(q(sheet.el, '[role=tab][data-tab="frame"]').getAttribute('aria-selected')).toBe('true');
    const grid = q(sheet.el, '.nickname__frames');
    const frames = qa(grid, '[role=radio]');
    (frames[2] as HTMLElement).focus();
    frames[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(frames[3]);
    expect(frames[3]?.getAttribute('aria-checked')).toBe('false');
    expect(q(sheet.el, '.nickname__unlock').textContent).toBe('Reach level 25 to unlock.');
    frames[3]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(frames[2]?.getAttribute('aria-checked')).toBe('true');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(q(sheet.el, '[role=tab][data-tab="bg"]').getAttribute('aria-selected')).toBe('true');
  });

  it('a server without frames and backgrounds: only the Picture tab; typed names off: the name is read-only, the picture saves', () => {
    const { sheet } = openNick({ frames: [], backgrounds: [], nameEditable: false });
    const tabs = qa(sheet.el, '[role=tab]');
    expect(tabs.map((b) => b.hidden)).toEqual([false, true, true]);
    const input = q<HTMLInputElement>(sheet.el, 'input.nickname__input');
    expect(input.readOnly).toBe(true);
    expect(q(sheet.el, '.nickname__hint').textContent).toBe("Names can't be changed right now. Your picture still saves.");
    qa(sheet.el, '.nickname__avatars [role=radio]')[2]?.click();
    expect(q(sheet.el, 'button.nickname__save').hasAttribute('aria-disabled')).toBe(false);
  });

  it('offline: Save and the controls disabled, "Connect to the internet to change your name."', () => {
    const { sheet } = openNick({ state: 'offline' });
    expect(q(sheet.el, '.nickname__status').textContent).toBe('Connect to the internet to change your name.');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
    expect(q<HTMLInputElement>(sheet.el, 'input.nickname__input').disabled).toBe(true);
    expect(q<HTMLButtonElement>(sheet.el, '.nickname__avatars [role=radio]').disabled).toBe(true);
  });

  it('the server\'s verdicts: a blocked name and a refused shape say different things; the sheet stays', () => {
    const { sheet } = openNick({ state: 'rejected' });
    expect(q(sheet.el, '.nickname__status').textContent).toBe("That name can't be used. Please pick another.");
    sheet.update(nickProps({ state: 'invalid' }));
    expect(q(sheet.el, '.nickname__status').textContent).toBe("That name doesn't fit the rules. Try another one.");
  });

  it('a cooldown is said up front and blocks a name change but not a picture, frame or background', () => {
    const { sheet, p } = openNick({ state: 'cooldown', cooldownUntil: NOW + 5 * H + 12 * 60_000 });
    expect(q(sheet.el, '.nickname__status').hidden).toBe(false);
    expect(q(sheet.el, '.nickname__status').textContent).toBe('You can change your name again in 5 h 12 min.');
    qa(sheet.el, '.nickname__avatars [role=radio]')[9]?.click();
    expect(q(sheet.el, 'button.nickname__save').hasAttribute('aria-disabled')).toBe(false);
    q(sheet.el, 'button.nickname__save').click();
    expect(p.onSave).toHaveBeenCalledWith({ ...CURRENT, avatarId: 9 });
    type(sheet.el, 'Captain Purr');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
  });

  it('saving: Save busy, Cancel and Esc wait', () => {
    const { sheet, p } = openNick({ state: 'saving' });
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-busy')).toBe('true');
    expect(sheet.dismiss()).toBe(true);
    q(sheet.el, 'button.nickname__cancel').click();
    expect(p.onClose).not.toHaveBeenCalled();
    sheet.update({ ...p, state: 'idle' });
    q(sheet.el, 'button.nickname__cancel').click();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('a generated name longer than the limit is never chopped: it may only shrink, and saves once it fits', () => {
    const long = 'Mischievous Whisker 99'; // 22 characters, from the word lists
    const { sheet, p } = openNick({ current: { ...CURRENT, name: long } });
    const input = q<HTMLInputElement>(sheet.el, 'input.nickname__input');
    expect(input.value).toBe(long);
    type(sheet.el, `${long}!`);
    expect(input.value).toBe(long); // it cannot grow
    type(sheet.el, 'Mischievous Whisker');
    expect(q(sheet.el, '.nickname__hint').textContent).toBe('Use 3 to 16 letters or numbers.');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
    type(sheet.el, 'Whisker 99');
    q(sheet.el, 'button.nickname__save').click();
    expect(p.onSave).toHaveBeenCalledWith({ ...CURRENT, name: 'Whisker 99' });
  });

  it('pure helpers: the tidy name and the code-point clip', () => {
    expect(tidyName('  Captain \n Purr ')).toBe('Captain Purr');
    expect(clipName('abcdef', 4)).toBe('abcd');
    expect(clipName('😺😺😺', 2)).toBe('😺😺');
    expect(clipName('abc', 16)).toBe('abc');
  });
});
