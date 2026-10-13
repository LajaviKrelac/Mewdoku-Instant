// Leaderboard update (the podium leaderboard): the status pills from the server's seenAt / playing, the stopwatch
// pill, the podium (only the places the server has, never a placeholder), the reward chests on paid places only,
// the rank-up (playClimb: no row, rank or number changes; reduced motion lands at once), the panel's bubble and the
// "New ranking" card.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { clockText, createBracketList, rowLabel, statusOf } from '../../../src/ui/overlays/bracket-list';
import { createLadderSession } from '../../../src/ui/overlays/ladder-session';
import { createRankingPanel, type BracketListView, type BracketRowView, type RankingPanelProps } from '../../../src/ui/overlays/ranking-panel';

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const MIN = 60_000;
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

function rows(n: number, me: number, over: (r: BracketRowView) => Partial<BracketRowView> = () => ({})): BracketRowView[] {
  return Array.from({ length: n }, (_, i) => {
    const r: BracketRowView = {
      rank: i + 1,
      slot: i,
      name: `Cat ${i + 1}`,
      avatarId: i % 12,
      points: 40 - i,
      hearts: 0,
      me: i + 1 === me,
      likedByMe: false,
      heartEnabled: true,
      seenAt: NOW - i * 7 * MIN,
      playing: i === 1,
    };
    return { ...r, ...over(r) };
  });
}

function view(over: Partial<BracketListView> = {}): BracketListView {
  const rs = over.rows ?? rows(12, 5);
  return {
    bracketId: 'mgk0b7q1z4a8',
    rows: rs,
    members: rs.length,
    endsAt: NOW + 23 * H + 48 * MIN + 55_000,
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

describe('status pills (the server seenAt / playing)', () => {
  const row = (seenAt: number | null, playing = false, me = false) => ({ seenAt, playing, me });

  it('"Playing now" / "Online now" within presence.nowMs, then whole minutes, hours and days', () => {
    expect(statusOf(row(NOW - 20_000, true), NOW)).toEqual({ kind: 'playing', text: 'Playing now' });
    expect(statusOf(row(NOW - 20_000), NOW)).toEqual({ kind: 'online', text: 'Online now' });
    expect(statusOf(row(NOW - cfg.ladder.presence.nowMs + 1, true), NOW)?.kind).toBe('playing');
    // A stale "playing" ages like any other activity.
    expect(statusOf(row(NOW - 4 * MIN - 59_000, true), NOW)).toEqual({ kind: 'away', text: '4m ago' });
    expect(statusOf(row(NOW - 59 * MIN), NOW)?.text).toBe('59m ago');
    expect(statusOf(row(NOW - 3 * H - 5 * MIN), NOW)?.text).toBe('3h ago');
    expect(statusOf(row(NOW - 30 * H), NOW)?.text).toBe('1d ago');
    // A seenAt a moment in the future (clock drift) is "now", never negative.
    expect(statusOf(row(NOW + 5000), NOW)?.kind).toBe('online');
  });

  it('no seenAt, no pill; my own row reads "Online now" (I am looking at it)', () => {
    expect(statusOf(row(null, true), NOW)).toBeNull();
    expect(statusOf(row(NOW - 3 * H, true, true), NOW)).toEqual({ kind: 'online', text: 'Online now' });
  });

  it('rows carry the pill and say it in their name; rows without seenAt carry none', () => {
    const list = createBracketList(view({ rows: rows(4, 3, (r) => (r.rank === 4 ? { seenAt: null } : r.rank === 2 ? { seenAt: NOW - 30_000 } : {})) }), { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items.map((li) => (li.querySelector<HTMLElement>('.lb-status:not([hidden])')?.textContent ?? null))).toEqual(['Online now', 'Playing now', 'Online now', null]);
    expect(items[1]?.getAttribute('aria-label')).toBe('#2, Cat 2, 39 fish, 0 hearts, Playing now');
    expect(items[3]?.getAttribute('aria-label')).toBe('#4, Cat 4, 37 fish, 0 hearts');
    expect(rowLabel(rows(1, 0)[0] as BracketRowView, false, 0, '4m ago')).toBe('#1, Cat 1, 40 fish, 4m ago');
    list.destroy();
  });
});

describe('the stopwatch pill and the podium', () => {
  it('"23:48:55" on a decorative pill; "Final results" once final', () => {
    expect(clockText(23 * H + 48 * MIN + 55_400)).toBe('23:48:55');
    expect(clockText(-5)).toBe('00:00:00');
    const list = createBracketList(view(), { onHeart: vi.fn() });
    expect(q(list.el, '.lb-timer').getAttribute('aria-hidden')).toBe('true');
    expect(q(list.el, '.lb-timer__text').textContent).toBe('23:48:55');
    list.update(view({ final: true }));
    expect(q(list.el, '.lb-timer__text').textContent).toBe('Final results');
    list.destroy();
  });

  it('the first three server rows, 2nd · 1st · 3rd, aria-hidden; mine marked without data-me', () => {
    const list = createBracketList(view({ rows: rows(12, 2) }), { onHeart: vi.fn() });
    const podium = q(list.el, '.lb-podium');
    expect(podium.getAttribute('aria-hidden')).toBe('true');
    const pods = qa(podium, '.lb-pod');
    expect(pods.map((p) => p.dataset.place)).toEqual(['2', '1', '3']);
    expect(pods.map((p) => q(p, '.lb-pod__name').textContent)).toEqual(['Cat 2', 'Cat 1', 'Cat 3']);
    expect(pods.map((p) => q(p, '.lb-pod__pts').textContent)).toEqual(['39', '40', '38']);
    expect(pods.map((p) => p.dataset.mine)).toEqual(['1', '0', '0']);
    // `[data-me="1"]` still counts the server's rows only.
    expect(qa(list.el, '[data-me="1"]')).toHaveLength(1);
    list.destroy();
  });

  it('never a placeholder: two rows show two places, none shows no podium', () => {
    const list = createBracketList(view({ rows: rows(2, 1) }), { onHeart: vi.fn() });
    expect(qa(list.el, '.lb-pod').filter((p) => !p.hidden).map((p) => p.dataset.place)).toEqual(['2', '1']);
    list.update(view({ rows: [], members: 0 }));
    expect(q(list.el, '.lb-podium').hidden).toBe(true);
    list.destroy();
  });

  it('reward chests on the paid places only, and only while the rewards line names them', () => {
    const list = createBracketList(view(), { onHeart: vi.fn() });
    const chests = (): string[] => qa(list.el, 'li.rank-row').filter((li) => !q(li, '.rank-row__gift').hidden).map((li) => li.dataset.rank as string);
    expect(chests()).toEqual(['1', '2', '3']);
    expect(qa(list.el, '.lb-pod__gift').filter((g) => !g.hidden)).toHaveLength(3);
    list.update(view({ rewardsLine: 'min' }));
    expect(chests()).toEqual([]);
    expect(qa(list.el, '.lb-pod__gift').filter((g) => !g.hidden)).toHaveLength(0);
    list.destroy();
  });
});

describe('the rank-up (playClimb)', () => {
  it('reduced motion: resolves at once with the climb, nothing moved, the server numbers shown', async () => {
    const v = view();
    const list = createBracketList(v, { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const r = await list.playClimb?.({ rank: 9, points: 30 }, true);
    expect(r).toEqual({ fromRank: 9, toRank: 5, climbed: true });
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items.map((li) => li.dataset.rank)).toEqual(v.rows.map((r2) => String(r2.rank)));
    expect(items.every((li) => li.style.transform === '')).toBe(true);
    expect(q(items[4] as HTMLElement, '.rank-row__pts').textContent).toBe('36');
    list.destroy();
  });

  it('a newcomer (no place before) climbed; the same place or lower did not', async () => {
    const list = createBracketList(view(), { onHeart: vi.fn() });
    expect(await list.playClimb?.({ rank: null, points: 0 }, true)).toEqual({ fromRank: null, toRank: 5, climbed: true });
    expect(await list.playClimb?.({ rank: 5, points: 33 }, true)).toEqual({ fromRank: 5, toRank: 5, climbed: false });
    expect(await list.playClimb?.({ rank: 3, points: 33 }, true)).toEqual({ fromRank: 3, toRank: 5, climbed: false });
    list.destroy();
  });

  it('animated: lands on the server rows with the server numbers and no transform left', async () => {
    const v = view();
    const list = createBracketList(v, { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const r = await list.playClimb?.({ rank: 11, points: 30 }, false);
    expect(r?.climbed).toBe(true);
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items.map((li) => q(li, '.rank-row__num').textContent)).toEqual(v.rows.map((r2) => String(r2.rank)));
    expect(items.every((li) => li.style.transform === '' && !li.classList.contains('is-climbing'))).toBe(true);
    expect(q(items[4] as HTMLElement, '.rank-row__pts').textContent).toBe('36');
    expect(list.el.hasAttribute('data-climbing')).toBe(false);
    list.destroy();
  });

  it('the panel plays it once on a fresh list and shows the bubble; a cached list never climbs', async () => {
    const play = vi.fn(() => Promise.resolve({ fromRank: 9, toRank: 5, climbed: true }));
    const factory = (v: BracketListView) => {
      const h = createBracketList(v, { onHeart: vi.fn() });
      return { ...h, el: h.el, playClimb: play };
    };
    const props = (over: Partial<RankingPanelProps> = {}): RankingPanelProps => ({
      board: 'period',
      eventNameKey: null,
      result: { kind: 'ladder', gained: 3, total: 36 },
      list: { kind: 'bracket', view: view() },
      tapMinMs: 0,
      reducedMotion: true,
      onContinue: vi.fn(),
      onSeeTop: vi.fn(),
      onListArea: vi.fn(),
      onHeart: vi.fn(),
      onInfo: vi.fn(),
      bracketList: factory,
      climbFrom: { bracketId: 'mgk0b7q1z4a8', rank: 9, points: 33 },
      ...over,
    });
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(props());
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(play).toHaveBeenCalledWith({ rank: 9, points: 33 }, true);
    await vi.waitFor(() => expect(q(panel.el, '.ranking__bubble').hidden).toBe(false));
    expect(q(panel.el, '.ranking__bubble').textContent).toBe('Nice! You climbed to #5!');
    panel.update(props());
    await new Promise((r) => setTimeout(r, 50));
    expect(play).toHaveBeenCalledTimes(1);
    panel.close();

    // Another bracket than the one before the win: from below the list with 0 fish.
    const play2 = vi.fn(() => Promise.resolve({ fromRank: null, toRank: 1, climbed: true }));
    const p2 = createRankingPanel();
    document.body.appendChild(p2.el);
    p2.open(props({ bracketList: (v) => ({ ...createBracketList(v, { onHeart: vi.fn() }), playClimb: play2 }), climbFrom: { bracketId: 'otherbracket1', rank: 2, points: 9 } }));
    await vi.waitFor(() => expect(play2).toHaveBeenCalledWith({ rank: null, points: 0 }, true));
    await vi.waitFor(() => expect(q(p2.el, '.ranking__bubble').textContent).toBe("Wonderful! You're in first place!"));
    p2.close();

    // A cached (stale) list does not hold this win yet: no climb, no bubble.
    const play3 = vi.fn(() => Promise.resolve({ fromRank: 9, toRank: 5, climbed: true }));
    const p3 = createRankingPanel();
    document.body.appendChild(p3.el);
    p3.open(props({ list: { kind: 'bracket', view: view({ stale: { at: NOW - MIN, offline: false } }) }, bracketList: (v) => ({ ...createBracketList(v, { onHeart: vi.fn() }), playClimb: play3 }) }));
    await new Promise((r) => setTimeout(r, 80));
    expect(play3).not.toHaveBeenCalled();
    expect(q(p3.el, '.ranking__bubble').hidden).toBe(true);
    // … and when the fresh answer comes in, it plays once.
    p3.update(props({ bracketList: (v) => ({ ...createBracketList(v, { onHeart: vi.fn() }), playClimb: play3 }) }));
    await vi.waitFor(() => expect(play3).toHaveBeenCalledTimes(1));
  });
});

// 2026-10-13 (merge with the computer rivals): the server's computer players are rows like any other (slots ≥ 9000,
// a name and a picture, no player key on the wire, an activity from their script): the podium, the pills, the
// rank-up and the bubble treat them as they treat real rows, never labelled one by one.
describe('with computer players (slots ≥ 9000; merge 2026-10-13)', () => {
  const NAMES = ['Bright Willow 60', 'Quiet Nutmeg 31', 'Sunny Biscuit 7', 'Misty Pounce 12', 'Brave Noodle 44'];
  /** 30 rows: computer players everywhere but my auto-joined row (slot 0), ranked `myRank` with `myPoints`. */
  function rivalRows(myRank: number, myPoints: number): BracketRowView[] {
    let rival = 0;
    return Array.from({ length: 30 }, (_, i) => {
      const me = i + 1 === myRank;
      const k = me ? -1 : rival++;
      return {
        rank: i + 1,
        slot: me ? 0 : 9000 + ((k * 7) % 30),
        name: me ? 'Velvet Pounce 27' : `${NAMES[k % NAMES.length] as string}${k >= NAMES.length ? ` ${k}` : ''}`,
        avatarId: me ? 4 : k % 12,
        points: me ? myPoints : Math.max(1, 31 - i),
        hearts: k === 0 ? 2 : 0,
        me,
        likedByMe: false,
        heartEnabled: true,
        seenAt: me ? NOW : NOW - (k % 4 === 0 ? 40_000 : (k + 3) * 5 * MIN),
        playing: !me && k % 4 === 0,
      };
    });
  }

  it('the podium and the list show the computer players\' names, pictures and pills; mine alone is marked', () => {
    const list = createBracketList(view({ rows: rivalRows(30, 0), members: 30 }), { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const pods = qa(q(list.el, '.lb-podium'), '.lb-pod');
    // displayName keeps the number with its word (a no-break space), as for every row.
    expect(pods.map((p) => q(p, '.lb-pod__name').textContent?.replace(/\u00a0/gu, ' '))).toEqual(['Quiet Nutmeg 31', 'Bright Willow 60', 'Sunny Biscuit 7']);
    expect(pods.map((p) => p.dataset.mine)).toEqual(['0', '0', '0']);
    expect(pods.every((p) => p.querySelector('.lb-pod__frame svg, .lb-pod__frame use') !== null)).toBe(true);
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items).toHaveLength(30);
    expect(items.slice(0, 29).every((li) => Number(li.dataset.slot) >= 9000)).toBe(true);
    expect(items.map((li) => li.dataset.me).filter((m) => m === '1')).toHaveLength(1);
    expect(items[29]?.dataset.slot).toBe('0');
    // The scripted activity reads like a real row's: "Playing now" while playing and seen within nowMs, else its age.
    const pill = (li: HTMLElement | undefined): string | null => li?.querySelector<HTMLElement>('.lb-status:not([hidden])')?.textContent ?? null;
    expect(pill(items[0])).toBe('Playing now');
    expect(pill(items[1])).toBe('20m ago');
    expect(pill(items[29])).toBe('Online now');
    expect(items[0]?.getAttribute('aria-label')).toBe('#1, Bright Willow 60, 31 fish, 2 hearts, Playing now');
    list.destroy();
  });

  it('the rank-up from my auto-joined last place (0 fish) past computer rows lands on the server rows; the panel says the place', async () => {
    const after = view({ rows: rivalRows(2, 33), members: 30 });
    const list = createBracketList(after, { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const r = await list.playClimb?.({ rank: 30, points: 0 }, false);
    expect(r).toEqual({ fromRank: 30, toRank: 2, climbed: true });
    const items = qa(list.el, 'ol.rank-rows > li.rank-row');
    expect(items.map((li) => q(li, '.rank-row__num').textContent)).toEqual(after.rows.map((x) => String(x.rank)));
    expect(items.map((li) => li.dataset.slot)).toEqual(after.rows.map((x) => String(x.slot)));
    expect(items.every((li) => li.style.transform === '')).toBe(true);
    expect(q(items[1] as HTMLElement, '.rank-row__pts').textContent).toBe('33');
    expect(qa(q(list.el, '.lb-podium'), '.lb-pod').map((p) => p.dataset.mine)).toEqual(['1', '0', '0']);
    list.destroy();

    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open({
      board: 'period',
      eventNameKey: null,
      result: { kind: 'ladder', gained: 33, total: 33 },
      list: { kind: 'bracket', view: after },
      tapMinMs: 0,
      reducedMotion: true,
      onContinue: vi.fn(),
      onSeeTop: vi.fn(),
      onListArea: vi.fn(),
      onHeart: vi.fn(),
      onInfo: vi.fn(),
      bracketList: (v) => createBracketList(v, { onHeart: vi.fn() }),
      climbFrom: { bracketId: 'mgk0b7q1z4a8', rank: 30, points: 0 },
    });
    await vi.waitFor(() => expect(q(panel.el, '.ranking__bubble').hidden).toBe(false));
    expect(q(panel.el, '.ranking__bubble').textContent).toBe('Nice! You climbed to #2!');
    panel.close();
  });
});

describe('the "New ranking" card (overlay ladder_session)', () => {
  it('title, the bracket countdown, the line and Got it; Got it, × and Esc close it', () => {
    const onClose = vi.fn();
    const card = createLadderSession();
    document.body.appendChild(card.el);
    card.open({ endsAt: Date.now() + 24 * H - 6000, now: () => Date.now(), avatarId: 4, reducedMotion: true, onClose });
    expect(card.el.dataset.overlay).toBe('ladder_session');
    expect(q(card.el, '.overlay__title').textContent).toBe('New ranking');
    expect(q(card.el, '.lb-timer__text').textContent).toMatch(/^23:59:5\d$/);
    expect(q(card.el, '.ladder-session__body').textContent).toContain('climb the ranking');
    expect(q(card.el, '.ladder-session__ok').textContent).toContain('Got it');
    expect(q(card.el, '.ladder-session__ok').hasAttribute('data-autofocus')).toBe(true);
    q<HTMLButtonElement>(card.el, '.ladder-session__ok').click();
    q<HTMLButtonElement>(card.el, '.overlay__close').click();
    expect(card.dismiss()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
    card.close();
    card.destroy();
  });
});
