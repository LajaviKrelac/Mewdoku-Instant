// UI batch (2026-10-13): leaderboard — the three place chests, their reward tooltip and my sticky row
// The chests show only on rows the server could pay (the places line, a rule that pays the place, fish on the row)
// with the server's own amounts (C-5); each place has its own chest (size and ornaments, not colour alone); a tap
// opens one tooltip above it (the medal, the bulb and kitty art, "×3"), which closes on a second tap, a press
// elsewhere, a scroll, a re-render, the rank-up and Esc (the overlays ask the list first). My row is the real row,
// sticky in CSS; the centring and the rank-up measure it in the flow (data-measuring / data-climbing first).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { CHEST_COLORS, PALETTE, TOKENS } from '../../../src/ui/art/palette';
import { MEDAL_COLORS } from '../../../src/ui/art/palette-2e';
import { ladderArtSymbols } from '../../../src/ui/art/ladder-art';
import { spriteMarkup } from '../../../src/ui/art/sprite';
import { createBracketList } from '../../../src/ui/overlays/bracket-list';
import { prizeFor, prizeText } from '../../../src/ui/overlays/bracket-prize';
import { createLadderSheet, type LadderSheetProps } from '../../../src/ui/overlays/ladder-sheet';
import { createRankingPanel, type BracketListView, type BracketRowView, type PlaceRewardView, type RankingPanelProps } from '../../../src/ui/overlays/ranking-panel';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const REWARDS: readonly PlaceRewardView[] = [
  { place: 1, hints: 3, kitties: 3 },
  { place: 2, hints: 2, kitties: 2 },
  { place: 3, hints: 1, kitties: 1 },
];

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
      slot: i + 10,
      name: `Cat ${i + 1}`,
      avatarId: i % 12,
      points: 30 - i,
      hearts: 0,
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
  const rs = over.rows ?? rows(12, 6);
  return {
    bracketId: 'mgk0b7q1z4a8',
    rows: rs,
    members: rs.length,
    endsAt: NOW + 5 * 3_600_000,
    final: false,
    rewardsLine: 'places',
    paidPlaces: 3,
    minMembers: 5,
    rewards: REWARDS,
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

const chestOf = (list: { el: HTMLElement }, rank: number): HTMLButtonElement => q<HTMLButtonElement>(list.el, `li.rank-row[data-rank="${rank}"] .rank-row__gift`);
const tipOf = (list: { el: HTMLElement }): HTMLElement => q(list.el, '.lb-tip');

describe('which rows hold a chest (H-4, C-5)', () => {
  it('prizeFor: the places line, a rule paying that place, and fish on the row', () => {
    const v = view();
    expect(prizeFor(1, 30, v)).toEqual({ place: 1, hints: 3, kitties: 3 });
    expect(prizeFor(3, 1, v)?.place).toBe(3);
    expect(prizeFor(4, 30, v)).toBeNull(); // no rule for 4th
    expect(prizeFor(1, 0, v)).toBeNull(); // a 0-fish member is never paid (auto-join)
    expect(prizeFor(1, 30, { ...v, rewardsLine: 'min' })).toBeNull(); // too few players
    expect(prizeFor(1, 30, { ...v, rewardsLine: 'none' })).toBeNull();
    expect(prizeFor(1, 30, { rewardsLine: 'places' })).toBeNull(); // no rules, no amounts
    expect(prizeFor(2, 30, { ...v, rewards: [{ place: 2, hints: 0, kitties: 0 }] })).toBeNull(); // pays nothing
  });

  it('prizeText names the place and the server amounts, never "your" reward', () => {
    expect(prizeText({ place: 1, hints: 3, kitties: 3 })).toBe('Reward for #1: 3 hints and 3 kitties');
    expect(prizeText({ place: 3, hints: 1, kitties: 1 })).toBe('Reward for #3: 1 hint and 1 kitty');
    expect(prizeText({ place: 3, hints: 1, kitties: 0 })).toBe('Reward for #3: 1 hint');
    expect(prizeText({ place: 2, hints: 0, kitties: 2 })).toBe('Reward for #2: 2 kitties');
    expect(prizeText({ place: 1, hints: 3, kitties: 3 })).not.toMatch(/\byour\b/i);
  });

  it('rows 1–3 get their own chest button, named by the reward (also at the end of the row name); a 0-fish top row none', () => {
    const list = createBracketList(view({ rows: rows(12, 6, (r) => (r.rank === 3 ? { points: 0 } : {})) }), { onHeart: vi.fn() });
    const shown = qa(list.el, 'li.rank-row').filter((li) => !q(li, '.rank-row__gift').hidden);
    expect(shown.map((li) => li.dataset.rank)).toEqual(['1', '2']);
    for (const rank of [1, 2]) {
      const chest = chestOf(list, rank);
      expect(chest.tagName).toBe('BUTTON');
      expect(chest.dataset.place).toBe(String(rank));
      expect(chest.querySelector('use')?.getAttribute('href')).toBe(`#reward-chest-${rank}`);
      expect(chest.getAttribute('aria-expanded')).toBe('false');
      const text = prizeText(REWARDS[rank - 1] as PlaceRewardView);
      expect(chest.getAttribute('aria-label')).toBe(text);
      expect(q(list.el, `li.rank-row[data-rank="${rank}"]`).getAttribute('aria-label')).toBe(`#${rank}, Cat ${rank}, ${30 - rank + 1} fish, 0 hearts, ${text}`);
    }
    expect(q(list.el, 'li.rank-row[data-rank="3"]').getAttribute('aria-label')).not.toMatch(/Reward/);
    // The podium's chests: the place's own art, pointer only (the podium is aria-hidden).
    const pods = qa(list.el, '.lb-pod__gift');
    expect(pods.map((g) => [g.dataset.place, g.hidden, g.querySelector('use')?.getAttribute('href')])).toEqual([
      ['2', false, '#reward-chest-2'],
      ['1', false, '#reward-chest-1'],
      ['3', true, '#reward-chest-3'],
    ]);
    expect(pods.every((g) => g.tagName === 'SPAN' && !g.hasAttribute('tabindex'))).toBe(true);
    list.destroy();
  });
});

describe('the reward tooltip', () => {
  it('a tap opens it over the chest (the medal, the bulb and kitty ×N, the words for screen readers); a second tap closes it', () => {
    const list = createBracketList(view(), { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const tip = tipOf(list);
    expect(tip.hidden).toBe(true);
    expect(tip.parentElement).toBe(list.el); // in the list's root, never clipped by the scrolling rows
    expect(tip.getAttribute('role')).toBe('tooltip');
    chestOf(list, 1).click();
    expect(tip.hidden).toBe(false);
    expect(chestOf(list, 1).getAttribute('aria-expanded')).toBe('true');
    expect(q(tip, '.lb-tip__medal use').getAttribute('href')).toBe('#medal-1');
    expect(q(tip, '.lb-tip__num').textContent).toBe('1');
    expect(qa(tip, '.lb-tip__item').map((i) => [i.querySelector('use')?.getAttribute('href'), i.textContent])).toEqual([
      ['#tool-bulb', '×3'],
      ['#tool-kitty', '×3'],
    ]);
    expect(q(tip, '.lb-tip__items').getAttribute('aria-hidden')).toBe('true');
    expect(q(tip, '.sr-only').textContent).toBe('Reward for #1: 3 hints and 3 kitties');
    chestOf(list, 1).click();
    expect(tip.hidden).toBe(true);
    expect(chestOf(list, 1).getAttribute('aria-expanded')).toBe('false');
    list.destroy();
  });

  it('another chest moves it; a press elsewhere, a scroll, an update and closeTip() close it', () => {
    const list = createBracketList(view(), { onHeart: vi.fn() });
    document.body.appendChild(list.el);
    const tip = tipOf(list);
    chestOf(list, 1).click();
    chestOf(list, 3).click();
    expect(chestOf(list, 1).getAttribute('aria-expanded')).toBe('false');
    expect(chestOf(list, 3).getAttribute('aria-expanded')).toBe('true');
    expect(qa(tip, '.lb-tip__count').map((c) => c.textContent)).toEqual(['×1', '×1']);
    // A press inside the tip keeps it; anywhere else closes it.
    tip.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(tip.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(tip.hidden).toBe(true);
    // The podium's chest opens it too.
    q(list.el, '.lb-pod[data-place="2"] .lb-pod__gift').click();
    expect(tip.hidden).toBe(false);
    q(list.el, 'ol.rank-rows').dispatchEvent(new Event('scroll'));
    expect(tip.hidden).toBe(true);
    chestOf(list, 2).click();
    list.update(view());
    expect(tip.hidden).toBe(true);
    chestOf(list, 2).click();
    expect(list.closeTip?.()).toBe(true);
    expect(list.closeTip?.()).toBe(false);
    // A keyboard user tabbing on from the chest: its tip closes with the chest's focus.
    chestOf(list, 1).focus();
    chestOf(list, 1).click();
    expect(tip.hidden).toBe(false);
    q<HTMLButtonElement>(list.el, 'li.rank-row[data-rank="1"] .rank-row__heart').focus();
    expect(tip.hidden).toBe(true);
    expect(chestOf(list, 1).getAttribute('aria-expanded')).toBe('false');
    list.destroy();
  });

  it('a place that pays only hints shows only the bulb', () => {
    const list = createBracketList(view({ rewards: [{ place: 1, hints: 2, kitties: 0 }] }), { onHeart: vi.fn() });
    chestOf(list, 1).click();
    expect(qa(tipOf(list), '.lb-tip__item use').map((u) => u.getAttribute('href'))).toEqual(['#tool-bulb']);
    list.destroy();
  });

  it('the post-win panel: a chest tap never continues; Esc closes the tip first, then continues', () => {
    vi.useFakeTimers();
    const p: RankingPanelProps = {
      board: 'period',
      eventNameKey: null,
      result: { kind: 'ladder', gained: 3, total: 25 },
      list: { kind: 'bracket', view: view() },
      tapMinMs: cfg.rank.panelTapMinMs,
      reducedMotion: true,
      onContinue: vi.fn(),
      onSeeTop: vi.fn(),
      onListArea: vi.fn(),
      onHeart: vi.fn(),
      onInfo: vi.fn(),
      bracketList: createBracketList,
    };
    const panel = createRankingPanel();
    document.body.appendChild(panel.el);
    panel.open(p);
    vi.advanceTimersByTime(cfg.rank.panelTapMinMs + 10);
    q(panel.el, 'li.rank-row[data-rank="2"] .rank-row__gift').click();
    expect(q(panel.el, '.lb-tip').hidden).toBe(false);
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(panel.dismiss()).toBe(true);
    expect(q(panel.el, '.lb-tip').hidden).toBe(true);
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(panel.dismiss()).toBe(true);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('the ranking sheet: Esc closes the tip first, then the sheet', () => {
    const p: LadderSheetProps = { view: 'list', list: view(), records: null, rules: null, infoOnly: false, reducedMotion: true, onHeart: vi.fn(), onClose: vi.fn() };
    const sheet = createLadderSheet();
    document.body.appendChild(sheet.el);
    sheet.open(p);
    q(sheet.el, '.lb-pod[data-place="1"] .lb-pod__gift').click();
    expect(q(sheet.el, '.lb-tip').hidden).toBe(false);
    expect(sheet.dismiss()).toBe(true);
    expect(q(sheet.el, '.lb-tip').hidden).toBe(true);
    expect(p.onClose).not.toHaveBeenCalled();
    expect(sheet.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('my sticky row (user: it stays at the edge it leaves by)', () => {
  it('one real row, no copy; centring and the rank-up read its place in the flow, never while it sticks', async () => {
    const seen: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.dataset.me === '1') {
          const root = this.closest('.rank-list');
          seen.push(root?.hasAttribute('data-measuring') ? 'measuring' : root?.hasAttribute('data-climbing') ? 'climbing' : 'sticky');
        }
        return 60 * (Number(this.dataset.rank ?? 1) - 1);
      },
    });
    try {
      const list = createBracketList(view({ rows: rows(30, 20) }), { onHeart: vi.fn() });
      document.body.appendChild(list.el);
      const ol = q(list.el, 'ol.rank-rows');
      Object.defineProperty(ol, 'scrollHeight', { configurable: true, value: 1800 });
      Object.defineProperty(ol, 'clientHeight', { configurable: true, value: 300 });
      expect(list.el.querySelector('.rank-row--pinned')).toBeNull();
      list.centerMe();
      expect(seen).toEqual(['measuring']);
      expect(list.el.hasAttribute('data-measuring')).toBe(false);
      expect(ol.scrollTop).toBeGreaterThan(0);
      seen.length = 0;
      chestOf(list, 1).click();
      const r = await list.playClimb?.({ rank: 25, points: 5 }, false);
      expect(r?.climbed).toBe(true);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen).not.toContain('sticky');
      expect(tipOf(list).hidden).toBe(true); // the rank-up closed it
      expect(list.el.hasAttribute('data-climbing')).toBe(false);
      list.destroy();
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetTop', desc);
    }
  });

  it('the stylesheet: my row sticks at both edges above the others; climbing and measuring make it relative', () => {
    const css = readFileSync(resolve(ROOT, 'src/styles/ladder-chunk.css'), 'utf8');
    const rule = /\.rank-rows > \.rank-row\[data-me='1'\] \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position: sticky;/);
    expect(rule).toMatch(/top: -4px;/);
    expect(rule).toMatch(/bottom: -4px;/);
    expect(rule).toMatch(/z-index: 3;/);
    expect(css).toMatch(/\.rank-list\[data-climbing\] \.rank-rows > \.rank-row\[data-me='1'\],\s*\.rank-list\[data-measuring\] \.rank-rows > \.rank-row\[data-me='1'\] \{\s*position: relative;/);
    expect(css).not.toMatch(/rank-row--pinned|rank-row__edit|ranking__count/);
  });
});

describe('the three chests (ladder-art.ts; ours, from written words)', () => {
  const symbolOf = (id: string): string => new RegExp(`<symbol id="${id}" viewBox="0 0 48 48">[\\s\\S]*?</symbol>`).exec(ladderArtSymbols())?.[0] ?? '';
  const allowed = new Set(
    ['#fff', ...Object.values(TOKENS), ...Object.values(CHEST_COLORS), ...PALETTE, ...MEDAL_COLORS.flatMap((m) => Object.values(m))]
      .filter((v) => v.startsWith('#'))
      .map((v) => v.toLowerCase()),
  );

  it('three square symbols, lazy (never in the first-load sprite), registered colours only, no text', () => {
    for (const p of [1, 2, 3]) {
      const s = symbolOf(`reward-chest-${p}`);
      expect(s, `reward-chest-${p}`).not.toBe('');
      expect(s).not.toMatch(/<text|<image|https?:|<script|on\w+=/);
      for (const hex of s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(allowed.has(hex.toLowerCase()), `${p} ${hex}`).toBe(true);
      expect(spriteMarkup()).not.toContain(`id="reward-chest-${p}"`);
    }
  });

  it('they differ by size and ornaments, not colour alone: 1st full size with a jewelled crown band, 2nd silver with corner caps, 3rd small and plain', () => {
    const [one, two, three] = [1, 2, 3].map((p) => symbolOf(`reward-chest-${p}`)) as [string, string, string];
    const scale = (s: string): number => Number(/<g transform="matrix\(([\d.]+) 0 0/.exec(s)?.[1]);
    expect([scale(one), scale(two), scale(three)]).toEqual([1, 0.86, 0.72]);
    // 1st: the crown band and its three gems, and sparkles; gold trim.
    expect(one).toContain(`fill="${TOKENS.danger}"`);
    expect(one).toContain(`fill="${PALETTE[6]}"`);
    expect(one).toContain(`fill="${PALETTE[5]}"`);
    expect(one).toMatch(/M15\.6 18\.6v-3l2\.8-4\.2/);
    // 2nd: silver straps and caps, the fish lock; no crown.
    expect(two).toContain(`fill="${MEDAL_COLORS[1]?.face}"`);
    expect(two).not.toContain(`fill="${TOKENS.danger}"`);
    expect(two).toContain('<ellipse cx="23.2"');
    // 3rd: bronze straps, a round lock plate, no caps.
    expect(three).toContain(`fill="${MEDAL_COLORS[2]?.face}"`);
    expect(three).not.toContain('M6 34.4v3.8');
    expect(three).not.toContain('<ellipse cx="23.2"');
    expect(new Set([one, two, three]).size).toBe(3);
    // The result card's chest is unchanged (wood, gold straps, the fish lock).
    expect(symbolOf('reward-chest')).toContain(`fill="${TOKENS.gold}"`);
  });
});
