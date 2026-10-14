// UI batch (2026-10-13): leaderboard — the paid places' chests and the reward tooltip a tap on one opens
// User: "Make 3 chests different (the better place, the better rewards visually and content-wise)" and "Tapping on
// chests shows tooltip above the chest with rewards that chest contains". Shared by the bracket list's rows and
// podium (the post-win panel and the ranking sheet). Lazy `ladder` chunk only.
// Honesty (H-4, C-5): a chest shows only on a row the server could pay — the rewards line names the places (enough
// players), the server's rules pay that place something, and the row has fish (a 0-fish member is never paid) — and
// every amount is the server's rules.places, never ours. The words describe the place ("Reward for #1: 3 hints and
// 3 kitties"), never "your reward"; amounts are frozen by the server when the ranking ends.
// The tooltip: one element in the list's root (never clipped by the scrolling rows), above the chest (below it when
// there is no room), with the place's medal and the helpers' own art (the bulb, the kitty) and "×3". It closes on a
// second tap, a tap elsewhere, focus leaving its chest, a scroll, a re-render, the rank-up and Esc (the overlays ask
// closeTip() first). It never takes a tap itself (pointer-events: none): it can sit over the row above's heart.
// A11y: a row's chest is a button named by the reward (its row's name ends with it too); the podium is aria-hidden,
// so its chests are pointer-only. Reduced motion: no pop (ladder-chunk.css).
// Classes: .lb-tip[role=tooltip][data-below?] > .lb-tip__medal(.lb-tip__medal-art .lb-tip__num)
//          .lb-tip__items[aria-hidden](.lb-tip__item(.lb-tip__art .lb-tip__count))×1–2 .sr-only
import { formatNumber, joinList, t, tn } from '../../i18n';
import { icon, type RewardChestSymbol } from '../art/sprite';
import { h, setText } from '../dom';
import type { BracketListView, PlaceRewardView } from './ranking-panel';

/** The reward a place's chest holds, or null when the server would not pay that row (see the header). */
export function prizeFor(rank: number, points: number, v: Pick<BracketListView, 'rewardsLine' | 'rewards'>): PlaceRewardView | null {
  if (v.rewardsLine !== 'places' || !(points > 0)) return null;
  const p = v.rewards?.find((r) => r.place === rank);
  return p && p.hints + p.kitties > 0 ? p : null;
}

/** "Reward for #1: 3 hints and 3 kitties" (a row chest's name; its row's name ends with it). */
export function prizeText(p: PlaceRewardView): string {
  const parts: string[] = [];
  if (p.hints > 0) parts.push(tn('event.reward.hints', p.hints, { count: formatNumber(p.hints) }));
  if (p.kitties > 0) parts.push(tn('event.reward.kitties', p.kitties, { count: formatNumber(p.kitties) }));
  return t('ladder.chest.a11y', { rank: formatNumber(p.place), reward: joinList(parts) });
}

export const chestSymbol = (place: 1 | 2 | 3): RewardChestSymbol => `reward-chest-${place}`;

export interface PrizeTip {
  readonly el: HTMLElement;
  /** Opens the tip for `p` over `anchor` (the chest's art); the same anchor again closes it. */
  toggle(anchor: Element, p: PlaceRewardView): void;
  /** Closes it; true when it was open. */
  close(): boolean;
  /** True when this press (a pointerdown) closed it: the post-win panel then does not continue on its click. */
  closedBy(ev: Event): boolean;
  destroy(): void;
}

/** The gap between the tip's arrow and the chest, and the tip's margin from the list's sides (CSS px). */
const GAP = 8;
const SIDE = 4;
let seq = 0;

/** The one tooltip of a bracket list, absolutely placed inside `root` (which is position: relative). */
export function createPrizeTip(root: HTMLElement): PrizeTip {
  const medal = h('span', { class: 'lb-tip__medal' });
  const items = h('span', { class: 'lb-tip__items', 'aria-hidden': 'true' });
  const sr = h('span', { class: 'sr-only' });
  const el = h('div', { class: 'lb-tip', role: 'tooltip', id: `lb-tip-${++seq}`, hidden: true }, medal, items, sr);
  const doc = root.ownerDocument;
  let anchor: Element | null = null;
  /** The press that last closed the tip (the panel asks, so that press only dismisses it, as Esc does). */
  let closedOn: Event | null = null;

  const button = (): Element | null => anchor?.closest('button') ?? null;
  // A press anywhere but its own chest closes it (that chest's click toggles it). Review F1: the tip takes no taps
  // (pointer-events: none), so a press on the heart or chest under it closes it and still reaches them.
  const onDown = (ev: Event): void => {
    const target = ev.target as Node | null;
    if (target && anchor?.parentElement?.contains(target)) return;
    closedOn = ev;
    close();
  };

  // A keyboard user tabbing away from the chest leaves its tip behind: it closes with the chest's focus.
  const onBlur = (): void => void close();

  function close(): boolean {
    if (!anchor) return false;
    const b = button();
    b?.setAttribute('aria-expanded', 'false');
    b?.removeEventListener('blur', onBlur);
    anchor = null;
    el.hidden = true;
    doc.removeEventListener('pointerdown', onDown, true);
    return true;
  }

  const fill = (p: PlaceRewardView): void => {
    medal.textContent = '';
    medal.append(icon(`medal-${p.place}`, { class: 'lb-tip__medal-art' }), h('span', { class: 'lb-tip__num num' }, formatNumber(p.place)));
    items.textContent = '';
    const item = (art: 'tool-bulb' | 'tool-kitty', n: number): void => {
      if (n > 0) items.append(h('span', { class: 'lb-tip__item' }, icon(art, { class: 'lb-tip__art' }), h('span', { class: 'lb-tip__count num' }, t('ladder.chest.count', { count: formatNumber(n) }))));
    };
    item('tool-bulb', p.hints);
    item('tool-kitty', p.kitties);
    setText(sr, prizeText(p));
  };

  /** Above the chest, centred on it and kept inside the list's width; below it when the top has no room. */
  const place = (a: Element): void => {
    const r = root.getBoundingClientRect();
    const box = a.getBoundingClientRect();
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    const cx = box.left + box.width / 2 - r.left;
    const left = Math.max(SIDE, Math.min(r.width - w - SIDE, cx - w / 2));
    const below = box.top - ht - GAP < 0;
    el.toggleAttribute('data-below', below);
    el.style.left = `${left.toFixed(1)}px`;
    el.style.top = `${(below ? box.bottom - r.top + GAP : box.top - r.top - ht - GAP).toFixed(1)}px`;
    el.style.setProperty('--tip-x', `${(cx - left).toFixed(1)}px`);
  };

  return {
    el,
    toggle(a, p) {
      if (anchor === a) {
        close();
        return;
      }
      close();
      fill(p);
      el.hidden = false;
      anchor = a;
      const b = button();
      b?.setAttribute('aria-expanded', 'true');
      b?.addEventListener('blur', onBlur);
      place(a);
      doc.addEventListener('pointerdown', onDown, true);
    },
    close,
    closedBy: (ev) => ev === closedOn,
    destroy() {
      close();
      closedOn = null;
    },
  };
}
