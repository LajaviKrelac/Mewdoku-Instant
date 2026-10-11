// Owner: G3 (Phase 2e)
// The bracket list (spec §2.4, §2.8, §7.7, §9.4; CONTRACTS §8): MY BRACKET of the worldwide daily ranking,
// shared by the post-win panel (overlay `ranking`, which receives this factory from the lazy `ladder`
// chunk) and the ranking sheet (overlay `ladder`). Lazy `ladder` chunk only.
//
// Honesty (H-1 … H-3, H-8): the rows are EXACTLY the server's rows, in its order, with its ranks; the count
// is the server's `members`; a bracket that is not full shows exactly its members, alone shows my row and
// "You're the only player in this ranking so far."; nothing here ever adds, pads, trims or re-ranks a row
// (ladder.panelRows > 0 shows a contiguous window of the server's rows around mine, never a made-up one).
// Names are rendered with textContent and dir="auto" (bidi-isolated in RTL rows), the same English words
// in every locale. Queued fish show on my row as "+2 waiting"; my rank stays the server's last one.
//
// Layout (top to bottom): "Ends in 7 h 48 min · 37 players" (countdown never announced), the rewards line,
// "Last updated 14:02" + the offline line (a cached bracket), the alone line, the scroll list of rows (my
// row highlighted with a "You" tag; places 1–3 carry our medal AND their number), the pinned copy of my row
// (aria-hidden, shown while my row is scrolled out of view), "+3 hearts from other players", and once the
// first-time line "This is you in the ranking: …".
// A11y (§7.7): the list is role="list"; each row is a listitem named "#5, Brave Noodle 12, you, 14 fish,
// 2 hearts"; the rows are not tab stops, only their heart buttons (and, in the sheet, my row's pencil) are;
// a heart is "Give a heart to Velvet Paws 3, 1 heart" with aria-pressed. Reduced motion: no heart pop.
//
// Classes: .rank-list.rank-list--bracket[data-kind=bracket][data-stale=0|1]
//          > .ranking__meta(.ranking__countdown .ranking__count) .ranking__rewards .ranking__stale .ranking__offline
//            .ranking__alone ol.rank-rows[role=list] > li.rank-row[data-rank][data-me=0|1][data-slot]
//              > .rank-row__place(.rank-row__medal? .rank-row__num) .rank-row__avatar .rank-row__who(.rank-row__name
//                .rank-row__line(.rank-row__tags(.rank-row__you .rank-row__waiting) button.rank-row__edit?)) .rank-row__points(.rank-row__pts)
//                button.rank-row__heart[aria-pressed] > .rank-row__hearts
//            .rank-row.rank-row--pinned[aria-hidden=true] .ranking__hearts-new .ranking__first
import { cfg } from '../../app/config';
import { formatDuration, formatNumber, getLocale, onLocaleChanged, t, tn } from '../../i18n';
import { avatarSymbol, HEART_POP, HEART_POP_MS, mountLadderArt } from '../art/ladder-art';
import { icon } from '../art/sprite';
import { h, setText } from '../dom';
import '../../styles/ladder-chunk.css';
import type { BracketListCallbacks, BracketListHandle, BracketListView, BracketRowView } from './ranking-panel';

/** "Ends in 7 h 48 min" / "Ends in less than a minute" / "Final results" (spec §2.4 Countdown). */
export function countdownText(endsAt: number | null, now: number, final: boolean): string | null {
  if (final) return t('ladder.ended');
  if (endsAt === null) return null;
  const left = endsAt - now;
  if (left <= 0) return t('ladder.ended');
  if (left < 60_000) return t('ladder.endsSoon');
  return t('ladder.endsIn', { time: formatDuration(left) });
}

/** The delay to the next countdown change: at most ladder.countdownTickMs, and on the minute edges. */
export function nextTickMs(endsAt: number | null, now: number, tickMs: number = cfg.ladder.countdownTickMs): number | null {
  if (endsAt === null) return null;
  const left = endsAt - now;
  if (left <= 0) return null;
  const toEdge = left > 60_000 ? ((left - 60_000) % 60_000) + 1 : left + 1;
  return Math.max(250, Math.min(tickMs, toEdge));
}

/** "14:02": a clock time in the active locale, Latin digits (the stale line). */
export function timeOfDay(ms: number): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** The rewards line (spec §2.4, C-5): the counts come from the server's rules, never a literal. */
export function rewardsLineText(v: Pick<BracketListView, 'rewardsLine' | 'paidPlaces' | 'minMembers'>): string | null {
  if (v.rewardsLine === 'places' && v.paidPlaces > 0) return tn('ladder.rewards.line', v.paidPlaces, { count: formatNumber(v.paidPlaces) });
  if (v.rewardsLine === 'min' && v.minMembers > 0) return t('ladder.rewards.min', { count: formatNumber(v.minMembers) });
  return null;
}

const heartsText = (n: number): string => tn('ladder.hearts', n, { count: formatNumber(n) });
const fishText = (n: number): string => tn('fish.count', n, { count: formatNumber(n) });

/** A row's listitem name: "#5, Brave Noodle 12, you, 14 fish, 2 hearts" (spec §7.7). */
export function rowLabel(r: BracketRowView, hearts: boolean): string {
  const p = { rank: formatNumber(r.rank), name: r.name, fish: fishText(r.points), hearts: hearts ? heartsText(r.hearts) : '' };
  const s = r.me ? t('ladder.row.me.a11y', p) : t('ladder.row.a11y', p);
  return hearts ? s : s.replace(/[,،、]\s*$/u, '');
}

/** A heart button's name: "Give a heart to Velvet Paws 3, 1 heart" / "Give yourself a heart, 2 hearts". */
export function heartLabel(r: BracketRowView): string {
  const hearts = heartsText(r.hearts);
  return r.me ? t('ladder.heart.self.a11y', { hearts }) : t('ladder.heart.give.a11y', { name: r.name, hearts });
}

/**
 * The rows to list: every row (panelRows 0), else a contiguous window of `panelRows` server rows that holds
 * mine (or the first ones without me). Never reorders, never invents (H-3).
 */
export function visibleRows(rows: readonly BracketRowView[], panelRows: number): readonly BracketRowView[] {
  const n = Math.floor(panelRows);
  if (!(n > 0) || rows.length <= n) return rows;
  const mine = rows.findIndex((r) => r.me);
  if (mine < 0) return rows.slice(0, n);
  const start = Math.max(0, Math.min(rows.length - n, mine - Math.floor((n - 1) / 2)));
  return rows.slice(start, start + n);
}

interface RowParts {
  readonly el: HTMLElement;
  update(r: BracketRowView, v: BracketListView): void;
}

/**
 * One row's DOM. `interactive` false builds the pinned copy: a div (outside the list), no buttons, no data
 * attributes (so `ol.rank-rows > li.rank-row` and `[data-me="1"]` count the server's rows only), aria-hidden
 * and inert. `cb.onEditName` adds the pencil to my row (the sheet).
 */
function buildRow(cb: BracketListCallbacks, interactive: boolean): RowParts {
  const num = h('span', { class: 'rank-row__num num' });
  const medalHost = h('span', { class: 'rank-row__medal' });
  const place = h('span', { class: 'rank-row__place', 'aria-hidden': 'true' }, medalHost, num);
  const avatar = h('span', { class: 'rank-row__avatar', 'aria-hidden': 'true' });
  // The row's text is aria-hidden (the row's aria-label reads it once); my row's pencil sits on the tag line
  // after "You", so the name keeps the row's full width (a 40-character name would not fit next to it).
  const name = h('span', { class: 'rank-row__name', dir: 'auto', 'aria-hidden': 'true' });
  const you = h('span', { class: 'rank-row__you' });
  const waiting = h('span', { class: 'rank-row__waiting' });
  const tags = h('span', { class: 'rank-row__tags', 'aria-hidden': 'true' }, you, waiting);
  const line = h('span', { class: 'rank-row__line' }, tags);
  const who = h('span', { class: 'rank-row__who' }, name, line);
  const pts = h('span', { class: 'rank-row__pts num' });
  const points = h('span', { class: 'rank-row__points', 'aria-hidden': 'true' }, icon('icon-fish', { class: 'rank-row__fish' }), pts);
  const heartCount = h('span', { class: 'rank-row__hearts num' });
  const heartIcon = h('span', { class: 'rank-row__heart-icon' });
  const heart = interactive
    ? h('button', { type: 'button', class: 'rank-row__heart', 'aria-pressed': 'false' }, heartIcon, heartCount)
    : h('span', { class: 'rank-row__heart' }, heartIcon, heartCount);
  const el: HTMLElement = interactive ? h('li', { class: 'rank-row' }, place, avatar, who) : h('div', { class: 'rank-row rank-row--pinned' }, place, avatar, who);
  let edit: HTMLButtonElement | null = null;
  if (interactive && cb.onEditName) {
    edit = h(
      'button',
      { type: 'button', class: 'rank-row__edit', 'aria-label': t('nick.edit.a11y'), hidden: true, on: { click: () => cb.onEditName?.() } },
      icon('icon-pencil', { class: 'rank-row__edit-icon' }),
    );
    line.appendChild(edit);
  }
  el.append(points, heart);
  if (!interactive) {
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
  }

  let cur: BracketRowView | null = null;
  let sent = false;
  let avatarId = -1;
  let medal = 0;
  let liked: boolean | null = null;
  if (interactive) {
    heart.addEventListener('click', () => {
      if (!cur || !cur.heartEnabled || sent) return;
      sent = true;
      heart.setAttribute('aria-busy', 'true');
      cb.onHeart(cur.slot);
    });
  }

  return {
    el,
    update(r, v) {
      const changedLike = liked !== null && !liked && r.likedByMe;
      cur = r;
      sent = false;
      heart.removeAttribute('aria-busy');
      if (interactive) {
        el.dataset.rank = String(r.rank);
        el.dataset.me = r.me ? '1' : '0';
        el.dataset.slot = String(r.slot);
        el.setAttribute('aria-label', rowLabel(r, v.hearts));
      }
      const m = r.rank >= 1 && r.rank <= 3 ? r.rank : 0;
      if (m !== medal) {
        medal = m;
        medalHost.textContent = '';
        if (m) medalHost.appendChild(icon(`medal-${m as 1 | 2 | 3}`, { class: 'rank-row__medal-art' }));
      }
      medalHost.hidden = m === 0;
      place.toggleAttribute('data-medal', m !== 0);
      setText(num, formatNumber(r.rank));
      if (r.avatarId !== avatarId) {
        avatarId = r.avatarId;
        avatar.textContent = '';
        avatar.appendChild(icon(avatarSymbol(r.avatarId), { class: 'rank-row__avatar-art' }));
      }
      // textContent only (XSS; spec §1.8, §10.5 #7).
      if (name.textContent !== r.name) name.textContent = r.name;
      you.hidden = !r.me;
      setText(you, t('ladder.you'));
      const wait = r.me && v.waiting > 0 ? v.waiting : 0;
      waiting.hidden = wait === 0;
      if (wait) setText(waiting, t('ladder.waiting', { count: formatNumber(wait) }));
      tags.hidden = you.hidden && waiting.hidden;
      line.hidden = tags.hidden;
      setText(pts, formatNumber(r.points));
      heart.hidden = !v.hearts;
      if (r.likedByMe !== liked) {
        liked = r.likedByMe;
        heartIcon.textContent = '';
        heartIcon.appendChild(icon(r.likedByMe ? 'icon-heart-fill' : 'icon-heart-line', { class: 'rank-row__heart-art' }));
      }
      setText(heartCount, formatNumber(r.hearts));
      if (interactive) {
        heart.setAttribute('aria-pressed', String(r.likedByMe));
        heart.setAttribute('aria-label', heartLabel(r));
        // A pressed heart stays focusable and reads "pressed"; a heart that cannot be given is disabled.
        if (r.heartEnabled) {
          heart.removeAttribute('aria-disabled');
          (heart as HTMLButtonElement).disabled = false;
        } else if (r.likedByMe) {
          heart.setAttribute('aria-disabled', 'true');
          (heart as HTMLButtonElement).disabled = false;
        } else {
          heart.removeAttribute('aria-disabled');
          (heart as HTMLButtonElement).disabled = true;
        }
        // The like pop (G2's HEART_POP), none with reduced motion (§7.7).
        const art = heartIcon.firstElementChild as (Element & { animate?: Element['animate'] }) | null;
        if (changedLike && art && typeof art.animate === 'function' && !el.closest('[data-reduced], [data-motion="reduced"]')) {
          try {
            art.animate(HEART_POP as Keyframe[], { duration: HEART_POP_MS, easing: 'ease-out' });
          } catch {
            // decorative
          }
        }
      }
      if (edit) {
        edit.hidden = !r.me;
        edit.setAttribute('aria-label', t('nick.edit.a11y'));
      }
    },
  };
}

export function createBracketList(view: BracketListView, cb: BracketListCallbacks): BracketListHandle {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  const countdown = h('span', { class: 'ranking__countdown' });
  const sep = h('span', { class: 'ranking__sep', 'aria-hidden': 'true' }, ' · ');
  const count = h('span', { class: 'ranking__count' });
  const meta = h('p', { class: 'ranking__meta' }, countdown, sep, count);
  const rewards = h('p', { class: 'ranking__rewards' });
  const stale = h('p', { class: 'ranking__stale' });
  const offline = h('p', { class: 'ranking__offline' });
  const alone = h('p', { class: 'ranking__alone' });
  const ol = h('ol', { class: 'rank-rows', role: 'list' });
  const pinned = buildRow(cb, false);
  pinned.el.hidden = true;
  const heartsNew = h('p', { class: 'ranking__hearts-new' });
  const first = h('p', { class: 'ranking__first' });
  const el = h(
    'div',
    { class: 'rank-list rank-list--bracket', dataset: { kind: 'bracket' } },
    meta,
    rewards,
    stale,
    offline,
    alone,
    ol,
    pinned.el,
    heartsNew,
    first,
  );

  let cur = view;
  const rows = new Map<number, RowParts>();
  let order = '';
  let tick: ReturnType<typeof setTimeout> | null = null;

  const myRow = (): HTMLElement | null => ol.querySelector<HTMLElement>('.rank-row[data-me="1"]');

  /** The pinned copy shows while my row is (partly) out of the list's visible area. */
  const updatePinned = (): void => {
    const mine = myRow();
    const meRow = cur.rows.find((r) => r.me);
    if (!mine || !meRow || ol.scrollHeight <= ol.clientHeight + 1) {
      pinned.el.hidden = true;
      return;
    }
    const top = mine.offsetTop - ol.scrollTop;
    const out = top < 0 || top + mine.offsetHeight > ol.clientHeight + 1;
    pinned.el.hidden = !out;
    if (out) pinned.update(meRow, cur);
  };
  ol.addEventListener('scroll', updatePinned, { passive: true });

  const renderCountdown = (): void => {
    if (tick !== null) clearTimeout(tick);
    tick = null;
    const now = cur.now();
    const text = countdownText(cur.endsAt, now, cur.final);
    countdown.hidden = text === null;
    sep.hidden = text === null;
    setText(countdown, text ?? '');
    const next = cur.final ? null : nextTickMs(cur.endsAt, now);
    if (next !== null) tick = setTimeout(renderCountdown, next);
  };

  const render = (v: BracketListView): void => {
    cur = v;
    el.dataset.stale = v.stale ? '1' : '0';
    setText(count, tn('ladder.players', v.members, { count: formatNumber(v.members) }));
    const rw = rewardsLineText(v);
    rewards.hidden = rw === null;
    setText(rewards, rw ?? '');
    stale.hidden = !v.stale;
    offline.hidden = !v.stale;
    if (v.stale) {
      setText(stale, t('ladder.stale', { time: timeOfDay(v.stale.at) }));
      setText(offline, t('ladder.offline'));
    }
    // Alone: exactly my row (H-2; C-4: no promise that others will join).
    const isAlone = v.members === 1 && v.rows.length === 1 && v.rows[0]?.me === true;
    alone.hidden = !isAlone;
    if (isAlone) setText(alone, t('ladder.alone'));

    const shown = visibleRows(v.rows, v.panelRows);
    // One row: the card hugs it (no empty white below); two or more keep the card's two-row minimum.
    ol.toggleAttribute('data-single', shown.length < 2);
    const keys = shown.map((r) => r.slot).join(',');
    const seen = new Set<number>();
    for (const r of shown) {
      seen.add(r.slot);
      let row = rows.get(r.slot);
      if (!row) {
        row = buildRow(cb, true);
        rows.set(r.slot, row);
      }
      row.update(r, v);
    }
    for (const [slot, row] of rows) {
      if (!seen.has(slot)) {
        row.el.remove();
        rows.delete(slot);
      }
    }
    if (keys !== order) {
      order = keys;
      // Re-append in the server's order (moves only; focus on a heart survives in modern engines).
      for (const r of shown) {
        const row = rows.get(r.slot);
        if (row) ol.appendChild(row.el);
      }
    }
    heartsNew.hidden = !(v.heartsNew > 0);
    if (v.heartsNew > 0) setText(heartsNew, tn('ladder.heart.received', v.heartsNew, { count: formatNumber(v.heartsNew) }));
    first.hidden = v.firstLineName === null;
    if (v.firstLineName !== null) setText(first, t('nick.first.line', { name: v.firstLineName }));
    renderCountdown();
    updatePinned();
  };
  render(view);
  const offLocale = onLocaleChanged(() => render(cur));

  return {
    el,
    update: render,
    centerMe() {
      const mine = myRow();
      if (mine && ol.scrollHeight > ol.clientHeight) {
        ol.scrollTop = Math.max(0, mine.offsetTop - (ol.clientHeight - mine.offsetHeight) / 2);
      }
      updatePinned();
    },
    destroy() {
      if (tick !== null) clearTimeout(tick);
      tick = null;
      offLocale();
      ol.removeEventListener('scroll', updatePinned);
      el.remove();
    },
  };
}
