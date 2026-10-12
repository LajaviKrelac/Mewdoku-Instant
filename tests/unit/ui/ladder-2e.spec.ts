// Owner: G3 (Phase 2e)
// The worldwide daily ranking's views (spec §2.4–§2.8, §7.7, §9.4, §10.1, §10.6 #1): the bracket list (exactly
// the server's rows, my row, the pinned copy, medals WITH numbers, names as text, a11y names, the counts and
// lines from the server's rules), the post-win panel's 'bracket' state and its tap rule with an interactive
// list, the ranking sheet (list, info, records, notice), the result card's three cases and the name sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { formatNumber, setLocale, t, tn } from '../../../src/i18n';
import { NICK_WORDS_V1 } from '../../../src/shared/nick-words';
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
import { clampNum, createNicknameSheet, pickName, type NicknamePick, type NicknameSheetProps } from '../../../src/ui/overlays/nickname-sheet';
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
    // The count is the server's members, never the rows we drew.
    expect(q(list.el, '.ranking__count').textContent).toBe(n === 1 ? '1 player' : `${n} players`);
    // The pinned copy is outside the list and carries no data attributes (never counted as a row).
    const pinned = q(list.el, '.rank-row--pinned');
    expect(pinned.parentElement?.matches('ol')).toBe(false);
    expect(pinned.getAttribute('aria-hidden')).toBe('true');
    expect(pinned.hasAttribute('inert')).toBe(true);
    expect(pinned.dataset.me).toBeUndefined();
    expect(qa(list.el, '[data-me="1"]')).toHaveLength(1);
    list.destroy();
  });

  it('shows the server count even when it differs from the rows it sent (C-34: shown as sent, never trimmed or padded)', () => {
    const list = createBracketList(view({ rows: rows(3, 2), members: 4 }), { onHeart: vi.fn() });
    expect(qa(list.el, 'ol.rank-rows > li')).toHaveLength(3);
    expect(q(list.el, '.ranking__count').textContent).toBe('4 players');
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

  it('names are text (textContent) with dir="auto"; the picture is our avatar symbol', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const list = createBracketList(view({ rows: rows(2, 1, (r) => (r.rank === 2 ? { name: evil, avatarId: 11 } : {})) }), { onHeart: vi.fn() });
    const name = qa(list.el, '.rank-row__name')[1] as HTMLElement;
    expect(name.textContent).toBe(evil);
    expect(name.querySelector('img')).toBeNull();
    expect(list.el.querySelector('img')).toBeNull();
    expect(name.getAttribute('dir')).toBe('auto');
    expect(qa(list.el, 'ol .rank-row__avatar use')[1]?.getAttribute('href')).toBe('#avatar-11');
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

  it('the rewards line follows the server rules (C-5), never a literal "3"', () => {
    expect(rewardsLineText({ rewardsLine: 'places', paidPlaces: 3, minMembers: 5 })).toBe('The top 3 win hints and kitties.');
    expect(rewardsLineText({ rewardsLine: 'places', paidPlaces: 2, minMembers: 5 })).toBe('The top 2 win hints and kitties.');
    expect(rewardsLineText({ rewardsLine: 'places', paidPlaces: 1, minMembers: 5 })).toBe('First place wins hints and kitties.');
    expect(rewardsLineText({ rewardsLine: 'min', paidPlaces: 3, minMembers: 7 })).toBe('Rewards need at least 7 players in this ranking.');
    expect(rewardsLineText({ rewardsLine: 'none', paidPlaces: 3, minMembers: 5 })).toBeNull();
    const list = createBracketList(view({ rewardsLine: 'none' }), { onHeart: vi.fn() });
    expect(q(list.el, '.ranking__rewards').hidden).toBe(true);
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

  it('the sheet\'s pencil sits on my row only and opens the name sheet', () => {
    const onEditName = vi.fn();
    const list = createBracketList(view(), { onHeart: vi.fn(), onEditName });
    const pencils = qa(list.el, 'ol .rank-row__edit').filter((b) => !b.hidden);
    expect(pencils).toHaveLength(1);
    expect(pencils[0]?.closest('li')?.dataset.me).toBe('1');
    expect(pencils[0]?.getAttribute('aria-label')).toBe('Change your ranking name and picture');
    pencils[0]?.click();
    expect(onEditName).toHaveBeenCalledTimes(1);
    // The panel's list has no pencil.
    const panelList = createBracketList(view(), { onHeart: vi.fn() });
    expect(panelList.el.querySelector('.rank-row__edit')).toBeNull();
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
      expect(q(list.el, '.ranking__count').textContent).toBe(tn('ladder.players', 6, { count: formatNumber(6) }));
      expect(q(list.el, '.ranking__count').textContent).not.toMatch(/players/);
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

  it('"Leaderboard", "+2 fish · Your total: 14", and the bracket list in the DOM contract', () => {
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(panelProps());
    expect(q(panel.el, '.ranking__title').textContent).toBe('Leaderboard');
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+2 fish · Your total: 14');
    // audit B9 / A-H1: unanswered (offline), the server's total and the queued fish apart, as my row shows them
    panel.update(panelProps({ result: { kind: 'ladder', gained: 3, total: 3, waiting: 3 } }));
    expect(q(panel.el, '.ranking__sub').textContent).toBe('+3 fish · Your total: 3 · +3\u00A0waiting');
    panel.update(panelProps());
    // Worded: never forced LTR (.num) in Arabic.
    expect(q(panel.el, '.ranking__sub').classList.contains('num')).toBe(false);
    const list = q(document, '.overlay[data-overlay=ranking] .rank-list[data-kind=bracket][data-stale="0"]');
    expect(list.querySelector(':scope > ol.rank-rows')).not.toBeNull();
    expect(qa(list, 'ol.rank-rows > li.rank-row')).toHaveLength(37);
    // audit B10: the dot is drawn (aria-hidden); a screen reader hears the list separator instead of a run-on
    const meta = q(panel.el, '.ranking__meta');
    const textOf = (skip: string): string =>
      Array.from(meta.childNodes)
        .filter((n) => !(n instanceof HTMLElement && (n.matches(skip) || n.hidden)))
        .map((n) => n.textContent)
        .join('');
    // Leaderboard update: the time is seen on the stopwatch pill ("07:48:00"); the line shows the count.
    expect(textOf('.sr-only')).toBe('37 players'); // what is seen
    expect(textOf('[aria-hidden="true"]')).toBe('Ends in 7 h 48 min, 37 players'); // what is read
    expect(q(panel.el, '.lb-timer').getAttribute('aria-hidden')).toBe('true');
    expect(q(panel.el, '.lb-timer__text').textContent).toMatch(/^07:4[78]:\d\d$/);
    expect(q(panel.el, '.ranking__rewards').textContent).toBe('The top 3 win hints and kitties.');
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
    const sub = q(panel.el, '.ranking__sub');
    sub.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    sub.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 60 }));
    sub.click();
    expect(p.onContinue).not.toHaveBeenCalled();
    // A plain tap on the header continues.
    sub.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    sub.click();
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
    onEditName: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('ranking sheet (overlay `ladder`, spec §2.5)', () => {
  it('list: the bracket with the pencil on my row; hearts; the (i) button opens the info view; Back and Esc return', () => {
    const p = sheetProps();
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    expect(sheet.el.dataset.overlay).toBe('ladder');
    expect(q(sheet.el, '.ladder-sheet').dataset.view).toBe('list');
    expect(q(sheet.el, '.overlay__title').textContent).toBe('Leaderboard');
    expect(qa(sheet.el, 'ol.rank-rows > li')).toHaveLength(37);
    // Full height while the list is there (its rows scroll inside).
    expect(q(sheet.el, '.ladder-sheet').hasAttribute('data-fit')).toBe(false);
    q(sheet.el, 'li[data-me="1"] .rank-row__edit').click();
    expect(p.onEditName).toHaveBeenCalledTimes(1);
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

// ─────────────────────────────── the name sheet ───────────────────────────────

const CURRENT: NicknamePick = { adj: 2, noun: 5, num: 27, avatarId: 4 };

function nickProps(over: Partial<NicknameSheetProps> = {}): NicknameSheetProps {
  return {
    words: NICK_WORDS_V1,
    current: CURRENT,
    avatarCount: 12,
    numMin: 1,
    numMax: 99,
    state: 'idle',
    cooldownUntil: null,
    now: () => NOW,
    shuffle: vi.fn(() => ({ adj: 0, noun: 0, num: 150, avatarId: 11 })),
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

describe('name sheet (overlay `nickname`, spec §2.7)', () => {
  it('the preview, the 12 pictures as a radio group, the word pickers and the number', () => {
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    sheet.open(nickProps());
    expect(q(sheet.el, '.nickname__preview .nickname__name').textContent).toBe('Velvet Pounce 27');
    expect(q(sheet.el, '.nickname__name').getAttribute('dir')).toBe('auto');
    const group = q(sheet.el, '[role=radiogroup].nickname__avatars');
    const pics = qa(group, '[role=radio]');
    expect(pics).toHaveLength(12);
    expect(pics.map((b) => b.getAttribute('aria-checked'))).toEqual(pics.map((_, i) => String(i === 4)));
    expect(pics[0]?.getAttribute('aria-label')).toBe('Picture 1 of 12');
    expect(pics[4]?.tabIndex).toBe(0);
    expect(pics[3]?.tabIndex).toBe(-1);
    // It opens on the chosen picture (Save starts gated).
    expect(qa(sheet.el, '[data-autofocus]')).toEqual([pics[4]]);
    const adj = q<HTMLSelectElement>(sheet.el, 'select.nickname__adj');
    expect(adj.options).toHaveLength(NICK_WORDS_V1.adj.length);
    expect(adj.value).toBe('2');
    expect(q<HTMLSelectElement>(sheet.el, 'select.nickname__noun').value).toBe('5');
    const num = q<HTMLInputElement>(sheet.el, 'input.nickname__num');
    expect([num.value, num.min, num.max]).toEqual(['27', '1', '99']);
    expect(q(sheet.el, `label[for="${adj.id}"]`).textContent).toBe('First word');
    // Nothing changed yet: Save waits.
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
  });

  it('picking words, a number and a picture updates the preview; Save sends the pick', () => {
    const p = nickProps();
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    const adj = q<HTMLSelectElement>(sheet.el, 'select.nickname__adj');
    adj.value = '0';
    adj.dispatchEvent(new Event('change'));
    const num = q<HTMLInputElement>(sheet.el, 'input.nickname__num');
    num.value = '250';
    num.dispatchEvent(new Event('change'));
    expect(num.value).toBe('99');
    qa(sheet.el, '[role=radio]')[7]?.click();
    expect(q(sheet.el, '.nickname__name').textContent).toBe('Sleepy Pounce 99');
    expect(q(sheet.el, '.nickname__avatar use').getAttribute('href')).toBe('#avatar-7');
    q(sheet.el, 'button.nickname__save').click();
    expect(p.onSave).toHaveBeenCalledWith({ adj: 0, noun: 5, num: 99, avatarId: 7 });
  });

  it('Shuffle asks the app (the UI has no randomness) and clamps the number; arrows move the picture', () => {
    const p = nickProps();
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    q(sheet.el, 'button.nickname__shuffle').click();
    expect(p.shuffle).toHaveBeenCalledTimes(1);
    expect(q(sheet.el, '.nickname__name').textContent).toBe('Sleepy Whisker 99');
    const group = q(sheet.el, '.nickname__avatars');
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(qa(sheet.el, '[role=radio]')[0]?.getAttribute('aria-checked')).toBe('true');
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(qa(sheet.el, '[role=radio]')[11]?.getAttribute('aria-checked')).toBe('true');
  });

  it('offline: Save and the pickers disabled, "Connect to the internet to change your name."', () => {
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    sheet.open(nickProps({ state: 'offline' }));
    expect(q(sheet.el, '.nickname__status').textContent).toBe('Connect to the internet to change your name.');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
    expect(q<HTMLSelectElement>(sheet.el, 'select.nickname__adj').disabled).toBe(true);
    expect(q(sheet.el, 'button.nickname__shuffle').getAttribute('aria-disabled')).toBe('true');
  });

  it('rejected stays open with its line; a cooldown blocks a name change but not a picture change', () => {
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    const p = nickProps({ state: 'rejected' });
    sheet.open(p);
    expect(q(sheet.el, '.nickname__status').textContent).toBe("That name can't be used. Please pick another.");
    const cool = nickProps({ state: 'cooldown', cooldownUntil: NOW + 5 * H + 12 * 60_000 });
    sheet.update(cool);
    // The cooldown is said up front; a picture change still saves.
    expect(q(sheet.el, '.nickname__status').hidden).toBe(false);
    expect(q(sheet.el, '.nickname__status').textContent).toBe('You can change your name again in 5 h 12 min.');
    qa(sheet.el, '[role=radio]')[9]?.click();
    expect(q(sheet.el, 'button.nickname__save').hasAttribute('aria-disabled')).toBe(false);
    q(sheet.el, 'button.nickname__save').click();
    expect(cool.onSave).toHaveBeenCalledWith({ ...CURRENT, avatarId: 9 });
    const noun = q<HTMLSelectElement>(sheet.el, 'select.nickname__noun');
    noun.value = '1';
    noun.dispatchEvent(new Event('change'));
    expect(q(sheet.el, '.nickname__status').textContent).toBe('You can change your name again in 5 h 12 min.');
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-disabled')).toBe('true');
  });

  it('saving: Save busy, Cancel and Esc wait', () => {
    const p = nickProps({ state: 'saving' });
    const sheet = createNicknameSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    expect(q(sheet.el, 'button.nickname__save').getAttribute('aria-busy')).toBe('true');
    expect(sheet.dismiss()).toBe(true);
    q(sheet.el, 'button.nickname__cancel').click();
    expect(p.onClose).not.toHaveBeenCalled();
    sheet.update({ ...p, state: 'idle' });
    q(sheet.el, 'button.nickname__cancel').click();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('pure helpers: the rendered name and the number clamp', () => {
    expect(pickName(NICK_WORDS_V1, CURRENT)).toBe('Velvet Pounce 27');
    expect(pickName(NICK_WORDS_V1, { ...CURRENT, adj: 999 })).toBe('Cat 27');
    expect(clampNum('0', 1, 99, 5)).toBe(1);
    expect(clampNum('x', 1, 99, 5)).toBe(5);
    expect(clampNum('42', 1, 99, 5)).toBe(42);
  });
});
