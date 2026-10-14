// Owner: G3 (Phase 2e); leaderboard update (the podium, the activity pills, the rank-up)
// The bracket list (spec §2.4, §2.8, §7.7, §9.4; CONTRACTS §8): MY BRACKET of the worldwide daily ranking,
// shared by the post-win panel (overlay `ranking`, which receives this factory from the lazy `ladder`
// chunk) and the ranking sheet (overlay `ladder`). Lazy `ladder` chunk only.
//
// Honesty (H-1 … H-3, H-8): the rows are EXACTLY the server's rows, in its order, with its ranks; the count
// is the server's `members`; a bracket that is not full shows exactly its members, alone shows my row and
// "You're the only player in this ranking." (audit B14: no "so far"); nothing here ever adds, pads, trims or re-ranks a row
// (ladder.panelRows > 0 shows a contiguous window of the server's rows around mine, never a made-up one).
// Names are rendered with textContent and dir="auto" (bidi-isolated in RTL rows), the same English words
// in every locale. Queued fish show on my row as "+2 waiting"; my rank stays the server's last one.
//
// Leaderboard update (user: "it looks like this", the reference's leaderboard): above the list, the countdown as a
// stopwatch pill ("23:48:55", ticking each second; the worded "Ends in 7 h 48 min" stays for screen readers) and a
// podium of the first three rows (2nd, 1st, 3rd from the inline start; only the places that exist, never a
// placeholder): each a framed picture on a gold, periwinkle or apricot step with our medal, the name, the fish and,
// for a paid place, our reward chest. Every row (podium and list) carries its status pill: "Online now" or "Playing
// now" while the server saw that player within ladder.presence.nowMs, else "4m ago" / "3h ago" / "1d ago"; no pill
// without the server's seenAt. The podium is aria-hidden (the list below reads every row, status included).
// The rank-up (playClimb, the post-win panel): my fish count up, then my row rides up to its new place while the
// rows it passes step down and the list follows it; a podium place of mine pops in with confetti. It animates
// between the server's two answers only (my place before the win, as the server last said, and now).
//
// Layout (top to bottom): the stopwatch pill (the countdown words are for screen readers only), the podium, the
// minimum line ("Rewards need at least 5 players …", only while too few play), "Last updated 14:02" + the offline
// line (a cached bracket), the alone line, the scroll list of rows (my row highlighted with a "You" tag; places 1–3
// carry our medal AND their number), "+3 hearts from other players", and once the first-time line "This is you in
// the ranking: …".
// UI batch (2026-10-13; user: the list "cleaned up"): no player count and no "The top 3 win …" line; the paid places
// show three different chests (bracket-prize.ts: gold, silver, bronze; a tap shows their reward above them); my own
// row is the real row made sticky inside the scrolling list, so it stays at the edge it leaves by (scrolled up to see
// the top, it waits at the bottom; scrolled down, at the top); the pinned copy is gone.
// A11y (§7.7): the list is role="list"; each row is a listitem named "#5, Brave Noodle 12, you, 14 fish,
// 2 hearts, Online now" (my row adds ", +2 waiting" while fish wait, audit B11; a paid place adds ", Reward for #1:
// 3 hints and 3 kitties"); the rows are not tab stops, only their heart buttons and the chests of the paid places
// are; a heart is "Give a heart to Velvet Paws 3, 1 heart" with aria-pressed. Reduced motion: no heart pop, no
// climb, no confetti and no tooltip pop (the final places at once).
//
// Classes: .rank-list.rank-list--bracket[data-kind=bracket][data-stale=0|1][data-climbing?][data-measuring?]
//          > .lb-timer(.lb-timer__icon .lb-timer__text)
//            .ranking__meta.sr-only(.ranking__countdown)
//            .lb-podium[aria-hidden] > .lb-pod[data-place=1|2|3][data-mine=0|1] > (.lb-pod__frame .lb-pod__step(.lb-pod__medal
//              .lb-pod__num) .lb-pod__name .lb-pod__fish(.lb-pod__pts) .lb-pod__gift[data-place]? .lb-status) .lb-confetti?
//            .ranking__rewards .ranking__stale .ranking__offline .ranking__alone
//            ol.rank-rows[role=list] > li.rank-row[data-rank][data-me=0|1][data-slot]
//              > .rank-row__place(.rank-row__medal? .rank-row__num) .rank-row__avatar .rank-row__who(.rank-row__name
//                .rank-row__line(.rank-row__tags(.rank-row__you .rank-row__waiting) .lb-status))
//                .rank-row__points(.rank-row__pts) button.rank-row__gift[data-place][aria-expanded]?
//                button.rank-row__heart[aria-pressed] > .rank-row__hearts
//            .ranking__hearts-new .ranking__first .lb-tip (bracket-prize.ts)
//          .lb-status[data-status=online|playing|away]
import { cfg } from '../../app/config';
import { formatDuration, formatNumber, getLocale, onLocaleChanged, t, tn } from '../../i18n';
import { avatarSymbol, HEART_POP, HEART_POP_MS, mountLadderArt } from '../art/ladder-art';
import { icon } from '../art/sprite';
import { h, setText } from '../dom';
import '../../styles/ladder-chunk.css';
import { chestSymbol, createPrizeTip, prizeFor, prizeText } from './bracket-prize';
import type { BracketListCallbacks, BracketListHandle, BracketListView, BracketRowView, ClimbResult, PlaceRewardView } from './ranking-panel';

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

/** Leaderboard update: the stopwatch pill's "23:48:55" (hours, minutes, seconds, zero-padded; clamps at 0; Latin digits). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${p2(Math.floor(total / 3600))}:${p2(Math.floor((total % 3600) / 60))}:${p2(total % 60)}`;
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

/**
 * The rewards line (spec §2.4, C-5; the count is the server's rule, never a literal). UI batch (user: "remove 'the
 * top 3 win hints and kitties.'"): only the minimum line is left, which says why no chest shows.
 */
export function rewardsLineText(v: Pick<BracketListView, 'rewardsLine' | 'minMembers'>): string | null {
  return v.rewardsLine === 'min' && v.minMembers > 0 ? t('ladder.rewards.min', { count: formatNumber(v.minMembers) }) : null;
}

export type StatusKind = 'online' | 'playing' | 'away';

/**
 * Leaderboard update: a row's status pill from the server's seenAt and playing (device clock), or null without
 * seenAt. Seen within `nowMs`: "Playing now" / "Online now"; else "4m ago", "3h ago", "1d ago" (whole units, down).
 * My own row is "Online now" (I am looking at it) unless the server says I am playing.
 */
export function statusOf(r: Pick<BracketRowView, 'seenAt' | 'playing' | 'me'>, now: number, nowMs: number = cfg.ladder.presence.nowMs): { kind: StatusKind; text: string } | null {
  if (r.seenAt === null) return null;
  const age = Math.max(0, now - r.seenAt);
  if (r.me || age < nowMs) return r.playing && !r.me ? { kind: 'playing', text: t('ladder.status.playing') } : { kind: 'online', text: t('ladder.status.online') };
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return { kind: 'away', text: t('ladder.status.minutes', { count: formatNumber(Math.max(1, minutes)) }) };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { kind: 'away', text: t('ladder.status.hours', { count: formatNumber(hours) }) };
  return { kind: 'away', text: t('ladder.status.days', { count: formatNumber(Math.floor(hours / 24)) }) };
}

const heartsText = (n: number): string => tn('ladder.hearts', n, { count: formatNumber(n) });
const fishText = (n: number): string => tn('fish.count', n, { count: formatNumber(n) });

/**
 * A row's listitem name: "#5, Brave Noodle 12, you, 14 fish, 2 hearts" (spec §7.7). Audit B11: my row with fish
 * waiting to be sent ends with the chip's own words ("…, 2 hearts, +3 waiting"), so a screen reader hears them too.
 * Leaderboard update: the row's status ("Online now", "4m ago") ends it when there is one. UI batch: a paid place's
 * reward ("Reward for #1: 3 hints and 3 kitties") comes last, so it is heard where the chest is too small to show.
 */
export function rowLabel(r: BracketRowView, hearts: boolean, waiting = 0, status: string | null = null, prize: string | null = null): string {
  const p = { rank: formatNumber(r.rank), name: r.name, fish: fishText(r.points), hearts: hearts ? heartsText(r.hearts) : '' };
  const s = r.me ? t('ladder.row.me.a11y', p) : t('ladder.row.a11y', p);
  let label = hearts ? s : s.replace(/[,،、]\s*$/u, '');
  if (r.me && waiting > 0) label = `${label}${t('list.separator')}${t('ladder.waiting', { count: formatNumber(waiting) })}`;
  for (const extra of [status, prize]) if (extra) label = `${label}${t('list.separator')}${extra}`;
  return label;
}

/**
 * The name as shown (audit B7): the number stays with the word before it ("Cheerful" / "Dumpling 99", never a
 * lone "99" on its own line at 320 px). Display only: the text is the server's, with one no-break space.
 */
export function displayName(name: string): string {
  return name.replace(/ (\d+)$/u, ' $1');
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

/** A chest's tap: the list opens (or closes) its one tooltip over the chest's art. */
type OnChest = (art: Element, p: PlaceRewardView) => void;

/** One status pill (shared by the rows and the podium); hidden without a status. */
function statusPill(): { el: HTMLElement; set(s: { kind: StatusKind; text: string } | null): void } {
  const el = h('span', { class: 'lb-status' });
  return {
    el,
    set(s) {
      el.hidden = s === null;
      if (!s) return;
      el.dataset.status = s.kind;
      setText(el, s.text);
    },
  };
}

interface RowParts {
  readonly el: HTMLElement;
  update(r: BracketRowView, v: BracketListView): void;
  /** The fish shown on the row (the rank-up's count). */
  setPoints(n: number): void;
  /** The place number shown (the rank-up: a row shows its place before the win until it is passed). */
  setRank(n: number): void;
}

/**
 * One row's DOM (a listitem of the server's rows). UI batch: a paid place's chest is a button that opens its reward
 * tooltip (`onChest`); the sheet's pencil is gone (the name sheet opens from Settings and the Home picture).
 */
function buildRow(cb: BracketListCallbacks, onChest: OnChest): RowParts {
  const num = h('span', { class: 'rank-row__num num' });
  const medalHost = h('span', { class: 'rank-row__medal' });
  const place = h('span', { class: 'rank-row__place', 'aria-hidden': 'true' }, medalHost, num);
  const avatar = h('span', { class: 'rank-row__avatar', 'aria-hidden': 'true' });
  // The row's text is aria-hidden (the row's aria-label reads it once).
  const name = h('span', { class: 'rank-row__name', dir: 'auto', 'aria-hidden': 'true' });
  const you = h('span', { class: 'rank-row__you' });
  const waiting = h('span', { class: 'rank-row__waiting' });
  const tags = h('span', { class: 'rank-row__tags', 'aria-hidden': 'true' }, you, waiting);
  const status = statusPill();
  status.el.setAttribute('aria-hidden', 'true');
  const line = h('span', { class: 'rank-row__line' }, tags, status.el);
  const who = h('span', { class: 'rank-row__who' }, name, line);
  const pts = h('span', { class: 'rank-row__pts num' });
  const points = h('span', { class: 'rank-row__points', 'aria-hidden': 'true' }, icon('icon-fish', { class: 'rank-row__fish' }), pts);
  // The chest of a paid place (hidden otherwise): its tooltip shows the place's reward; named by it.
  const gift = h('button', { type: 'button', class: 'rank-row__gift', 'aria-expanded': 'false', hidden: true });
  const heartCount = h('span', { class: 'rank-row__hearts num' });
  const heartIcon = h('span', { class: 'rank-row__heart-icon' });
  const heart = h('button', { type: 'button', class: 'rank-row__heart', 'aria-pressed': 'false' }, heartIcon, heartCount);
  const el: HTMLElement = h('li', { class: 'rank-row' }, place, avatar, who, points, gift, heart);

  let cur: BracketRowView | null = null;
  let curView: BracketListView | null = null;
  let sent = false;
  let avatarId = -1;
  let medal = 0;
  let liked: boolean | null = null;
  let prize: PlaceRewardView | null = null;
  /** The place shown: the number, our medal for 1–3 (never colour alone) and the chest of a paid place. */
  const showPlace = (rank: number): void => {
    const m = rank >= 1 && rank <= 3 ? rank : 0;
    if (m !== medal) {
      medal = m;
      medalHost.textContent = '';
      if (m) medalHost.appendChild(icon(`medal-${m as 1 | 2 | 3}`, { class: 'rank-row__medal-art' }));
    }
    medalHost.hidden = m === 0;
    place.toggleAttribute('data-medal', m !== 0);
    setText(num, formatNumber(rank));
    // Every frame of the rank-up for the rows passed: the chest's art changes only with its place.
    const p = cur && curView ? prizeFor(rank, cur.points, curView) : null;
    gift.hidden = p === null;
    if (p && p.place !== prize?.place) {
      gift.textContent = '';
      gift.appendChild(icon(chestSymbol(p.place), { class: 'rank-row__gift-art' }));
      gift.dataset.place = String(p.place);
    }
    prize = p;
  };
  heart.addEventListener('click', () => {
    if (!cur || !cur.heartEnabled || sent) return;
    sent = true;
    heart.setAttribute('aria-busy', 'true');
    cb.onHeart(cur.slot);
  });
  gift.addEventListener('click', () => {
    const art = gift.firstElementChild;
    if (prize && art) onChest(art, prize);
  });

  return {
    el,
    setPoints(n) {
      setText(pts, formatNumber(n));
    },
    setRank(n) {
      showPlace(n);
    },
    update(r, v) {
      const changedLike = liked !== null && !liked && r.likedByMe;
      cur = r;
      curView = v;
      sent = false;
      heart.removeAttribute('aria-busy');
      const st = statusOf(r, v.now());
      status.set(st);
      el.dataset.rank = String(r.rank);
      el.dataset.me = r.me ? '1' : '0';
      el.dataset.slot = String(r.slot);
      const won = prizeFor(r.rank, r.points, v);
      const wonText = won ? prizeText(won) : null;
      el.setAttribute('aria-label', rowLabel(r, v.hearts, r.me ? v.waiting : 0, st?.text ?? null, wonText));
      if (wonText) gift.setAttribute('aria-label', wonText);
      showPlace(r.rank);
      if (r.avatarId !== avatarId) {
        avatarId = r.avatarId;
        avatar.textContent = '';
        avatar.appendChild(icon(avatarSymbol(r.avatarId), { class: 'rank-row__avatar-art' }));
      }
      // textContent only (XSS; spec §1.8, §10.5 #7).
      const shownName = displayName(r.name);
      if (name.textContent !== shownName) name.textContent = shownName;
      you.hidden = !r.me;
      setText(you, t('ladder.you'));
      const wait = r.me && v.waiting > 0 ? v.waiting : 0;
      waiting.hidden = wait === 0;
      if (wait) setText(waiting, t('ladder.waiting', { count: formatNumber(wait) }));
      tags.hidden = you.hidden && waiting.hidden;
      setText(pts, formatNumber(r.points));
      heart.hidden = !v.hearts;
      if (r.likedByMe !== liked) {
        liked = r.likedByMe;
        heartIcon.textContent = '';
        heartIcon.appendChild(icon(r.likedByMe ? 'icon-heart-fill' : 'icon-heart-line', { class: 'rank-row__heart-art' }));
      }
      setText(heartCount, formatNumber(r.hearts));
      heart.setAttribute('aria-pressed', String(r.likedByMe));
      heart.setAttribute('aria-label', heartLabel(r));
      // A pressed heart stays focusable and reads "pressed"; a heart that cannot be given is disabled.
      if (r.heartEnabled) {
        heart.removeAttribute('aria-disabled');
        heart.disabled = false;
      } else if (r.likedByMe) {
        heart.setAttribute('aria-disabled', 'true');
        heart.disabled = false;
      } else {
        heart.removeAttribute('aria-disabled');
        heart.disabled = true;
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
    },
  };
}

interface PodParts {
  readonly el: HTMLElement;
  update(r: BracketRowView | null, v: BracketListView): void;
  setPoints(n: number): void;
}

/**
 * One podium place (decorative: the list reads the same row). Hidden while the server has no row at that place.
 * UI batch: its chest opens the reward tooltip on a tap (pointer only: the podium is aria-hidden; the row's chest
 * is the button).
 */
function buildPod(place: 1 | 2 | 3, onChest: OnChest): PodParts {
  const frame = h('span', { class: 'lb-pod__frame' });
  const num = h('span', { class: 'lb-pod__num num' }, String(place));
  const medal = h('span', { class: 'lb-pod__medal' }, icon(`medal-${place}`, { class: 'lb-pod__medal-art' }), num);
  const name = h('span', { class: 'lb-pod__name', dir: 'auto' });
  const pts = h('span', { class: 'lb-pod__pts num' });
  const fish = h('span', { class: 'lb-pod__fish' }, icon('icon-fish', { class: 'lb-pod__fish-art' }), pts);
  const art = icon(chestSymbol(place), { class: 'lb-pod__gift-art' });
  const gift = h('span', { class: 'lb-pod__gift', dataset: { place: String(place) } }, art);
  let prize: PlaceRewardView | null = null;
  gift.addEventListener('click', () => {
    if (prize) onChest(art, prize);
  });
  const status = statusPill();
  const step = h('span', { class: 'lb-pod__step' }, medal, name, fish, gift, status.el);
  const el = h('div', { class: 'lb-pod', dataset: { place: String(place) } }, frame, step);
  let avatarId = -1;
  return {
    el,
    setPoints(n) {
      setText(pts, formatNumber(n));
    },
    update(r, v) {
      el.hidden = r === null;
      if (!r) return;
      // data-mine, never data-me: `[data-me="1"]` counts the server's rows only.
      el.dataset.mine = r.me ? '1' : '0';
      if (r.avatarId !== avatarId) {
        avatarId = r.avatarId;
        frame.textContent = '';
        frame.appendChild(icon(avatarSymbol(r.avatarId), { class: 'lb-pod__avatar' }));
      }
      const shown = displayName(r.name);
      if (name.textContent !== shown) name.textContent = shown;
      setText(pts, formatNumber(r.points));
      prize = prizeFor(r.rank, r.points, v);
      gift.hidden = prize === null;
      status.set(statusOf(r, v.now()));
    },
  };
}

/** Confetti pieces for a new podium place of mine (decorative; region colours; CSS animates them). */
function confetti(host: HTMLElement): void {
  const box = h('span', { class: 'lb-confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 18; i++) {
    const piece = h('i', { class: 'lb-confetti__bit' });
    piece.style.setProperty('--x', `${(i * 37) % 100}%`);
    piece.style.setProperty('--d', `${(i % 6) * 70}ms`);
    piece.style.setProperty('--c', `var(--r${i % 12})`);
    piece.style.setProperty('--r', `${(i * 53) % 360}deg`);
    box.appendChild(piece);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 2400);
}

const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function createBracketList(view: BracketListView, cb: BracketListCallbacks): BracketListHandle {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  const timerText = h('span', { class: 'lb-timer__text num' });
  const timer = h('div', { class: 'lb-timer', 'aria-hidden': 'true' }, icon('icon-stopwatch', { class: 'lb-timer__icon' }), timerText);
  // The worded countdown is for screen readers (the stopwatch pill shows it); never announced as it changes.
  // UI batch (user: "remove number of players on the leaderboard"): the visible count is gone.
  const countdown = h('span', { class: 'ranking__countdown' });
  const meta = h('p', { class: 'ranking__meta sr-only' }, countdown);
  const onChest: OnChest = (art, p) => tip.toggle(art, p);
  const pods = { 1: buildPod(1, onChest), 2: buildPod(2, onChest), 3: buildPod(3, onChest) } as const;
  const podium = h('div', { class: 'lb-podium', 'aria-hidden': 'true' }, pods[2].el, pods[1].el, pods[3].el);
  const rewards = h('p', { class: 'ranking__rewards' });
  const stale = h('p', { class: 'ranking__stale' });
  const offline = h('p', { class: 'ranking__offline' });
  const alone = h('p', { class: 'ranking__alone' });
  const ol = h('ol', { class: 'rank-rows', role: 'list' });
  const heartsNew = h('p', { class: 'ranking__hearts-new' });
  const first = h('p', { class: 'ranking__first' });
  const el = h(
    'div',
    { class: 'rank-list rank-list--bracket', dataset: { kind: 'bracket' } },
    timer,
    meta,
    podium,
    rewards,
    stale,
    offline,
    alone,
    ol,
    heartsNew,
    first,
  );
  const tip = createPrizeTip(el);
  el.appendChild(tip.el);

  let cur = view;
  const rows = new Map<number, RowParts>();
  let order = '';
  let tick: ReturnType<typeof setTimeout> | null = null;
  let clockTick: ReturnType<typeof setTimeout> | null = null;
  let statusTick: ReturnType<typeof setInterval> | null = null;
  let climbing = false;
  let climbRaf = 0;
  let destroyed = false;

  const myRow = (): HTMLElement | null => ol.querySelector<HTMLElement>('.rank-row[data-me="1"]');
  // UI batch: my row is sticky in CSS (no copy); a scroll closes a chest's tooltip (it would float off its chest).
  const closeTip = (): void => void tip.close();
  ol.addEventListener('scroll', closeTip, { passive: true });

  const renderCountdown = (): void => {
    if (tick !== null) clearTimeout(tick);
    tick = null;
    const now = cur.now();
    const text = countdownText(cur.endsAt, now, cur.final);
    countdown.hidden = text === null;
    setText(countdown, text ?? '');
    const next = cur.final ? null : nextTickMs(cur.endsAt, now);
    if (next !== null) tick = setTimeout(renderCountdown, next);
  };

  /** The stopwatch pill: hh:mm:ss once a second on the second's edge; "Final results" once ended. */
  const renderClock = (): void => {
    if (clockTick !== null) clearTimeout(clockTick);
    clockTick = null;
    if (destroyed) return;
    const left = cur.endsAt === null ? null : cur.endsAt - cur.now();
    timer.hidden = cur.endsAt === null && !cur.final;
    const ended = cur.final || (left !== null && left <= 0);
    timer.toggleAttribute('data-ended', ended);
    setText(timerText, ended ? t('ladder.ended') : clockText(left ?? 0));
    if (!ended && left !== null) clockTick = setTimeout(renderClock, (left % 1000) + 20);
  };

  const renderPodium = (v: BracketListView): void => {
    // The podium shows the first three server rows (never a placeholder for a missing place).
    for (const place of [1, 2, 3] as const) pods[place].update(v.rows.find((r) => r.rank === place) ?? null, v);
    podium.hidden = v.rows.length === 0;
    podium.dataset.count = String(Math.min(3, v.rows.filter((r) => r.rank <= 3).length));
  };

  const render = (v: BracketListView): void => {
    cur = v;
    tip.close();
    el.dataset.stale = v.stale ? '1' : '0';
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
    renderPodium(v);

    const shown = visibleRows(v.rows, v.panelRows);
    // One row: the card hugs it (no empty white below); two or more keep the card's two-row minimum.
    ol.toggleAttribute('data-single', shown.length < 2);
    const keys = shown.map((r) => r.slot).join(',');
    const seen = new Set<number>();
    for (const r of shown) {
      seen.add(r.slot);
      let row = rows.get(r.slot);
      if (!row) {
        row = buildRow(cb, onChest);
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
    renderClock();
  };
  render(view);
  const offLocale = onLocaleChanged(() => render(cur));
  // The status pills age ("Online now" → "4m ago") while the list is open.
  statusTick = setInterval(() => {
    if (!climbing) render(cur);
  }, 30_000);

  const centerOn = (top: number, height: number): number => Math.max(0, Math.min(ol.scrollHeight - ol.clientHeight, top - (ol.clientHeight - height) / 2));

  /** The rank-up (see the header). Pure presentation between two server answers; resolves when done. */
  const playClimb = (from: { readonly rank: number | null; readonly points: number }, reducedMotion: boolean): Promise<ClimbResult> => {
    const me = cur.rows.find((r) => r.me);
    const shown = visibleRows(cur.rows, cur.panelRows);
    const toIdx = me ? shown.findIndex((r) => r.me) : -1;
    if (!me || toIdx < 0) return Promise.resolve({ fromRank: from.rank, toRank: me?.rank ?? 0, climbed: false });
    const toRank = me.rank;
    const climbed = from.rank === null || from.rank > toRank;
    const mineRow = rows.get(me.slot);
    const win = el.ownerDocument.defaultView;
    const pod = toRank <= 3 ? pods[toRank as 1 | 2 | 3] : null;
    const result: ClimbResult = { fromRank: from.rank, toRank, climbed };
    if (reducedMotion || !mineRow || !win?.requestAnimationFrame) return Promise.resolve(result);
    // Where my row starts: its old place in this list (as the server last said), or just below the last row.
    const fromIdx = Math.min(shown.length - 1, from.rank === null ? shown.length - 1 : toIdx + Math.max(0, from.rank - toRank));
    // UI batch: climbing first (my row leaves its sticky place for the ride), so the rows are measured in the flow.
    climbing = true;
    tip.close();
    el.toggleAttribute('data-climbing', true);
    mineRow.el.classList.add('is-climbing');
    const rowEls = shown.map((r) => rows.get(r.slot)?.el ?? null);
    const tops = rowEls.map((e) => (e ? e.offsetTop : 0));
    const step = shown.length > 1 ? Math.max(40, (tops[tops.length - 1]! - tops[0]!) / (shown.length - 1)) : mineRow.el.offsetHeight;
    const extra = from.rank === null ? 1 : 0; // a newcomer starts one row below the list
    const span = fromIdx - toIdx + extra;
    const myTop = mineRow.el.offsetTop;
    const myH = mineRow.el.offsetHeight;
    const passed = rowEls.slice(toIdx + 1, fromIdx + 1);
    // Start: my row at its old place, the rows I pass one place higher (where they were), my old fish.
    const lastRank = shown[shown.length - 1]?.rank ?? toRank;
    const passedRows = shown.slice(toIdx + 1, fromIdx + 1).map((r) => ({ rank: r.rank, parts: rows.get(r.slot) }));
    const place = (y: number): void => {
      mineRow.el.style.transform = `translateY(${((y - toIdx) * step).toFixed(1)}px) scale(1.04)`;
      // The numbers follow the places as they are passed (never past the list's last place).
      mineRow.setRank(Math.min(lastRank, toRank + Math.round(y - toIdx)));
      passed.forEach((e, k) => {
        if (!e) return;
        const i = toIdx + 1 + k;
        const off = Math.max(0, Math.min(1, y - (i - 1)));
        e.style.transform = off > 0 ? `translateY(${(-off * step).toFixed(1)}px)` : '';
        const pr = passedRows[k];
        pr?.parts?.setRank(off > 0.5 ? pr.rank - 1 : pr.rank);
      });
      ol.scrollTop = centerOn(myTop + (y - toIdx) * step, myH);
    };
    const yStart = toIdx + span;
    place(yStart);
    mineRow.setPoints(from.points);
    if (pod) pod.setPoints(from.points);
    if (pod && climbed) pod.el.classList.add('is-waiting');
    const COUNT_MS = 650;
    const CLIMB_MS = Math.min(1600, 520 + span * 110);
    return new Promise<ClimbResult>((resolve) => {
      const t0 = win.performance?.now?.() ?? Date.now();
      const done = (): void => {
        climbRaf = 0;
        mineRow.el.style.transform = '';
        mineRow.el.classList.remove('is-climbing');
        for (const e of passed) if (e) e.style.transform = '';
        climbing = false;
        el.removeAttribute('data-climbing');
        if (!destroyed) {
          render(cur);
          centerAfter();
          if (pod && climbed) {
            pod.el.classList.remove('is-waiting');
            pod.el.classList.add('is-popping');
            confetti(podium);
            setTimeout(() => pod.el.classList.remove('is-popping'), 900);
          } else if (!climbed) {
            mineRow.el.classList.add('is-pulsing');
            setTimeout(() => mineRow.el.classList.remove('is-pulsing'), 700);
          }
        }
        resolve(result);
      };
      const frame = (): void => {
        if (destroyed) return done();
        const now = win.performance?.now?.() ?? Date.now();
        const e = now - t0;
        // 1) the fish count up on my row (and my podium place), 2) the ride up.
        const c = Math.min(1, e / COUNT_MS);
        const pts = Math.round(from.points + (me.points - from.points) * easeInOut(c));
        mineRow.setPoints(pts);
        if (pod) pod.setPoints(pts);
        const k = Math.max(0, Math.min(1, (e - COUNT_MS) / CLIMB_MS));
        place(yStart - span * easeInOut(k));
        if (k >= 1) return done();
        climbRaf = win.requestAnimationFrame(frame);
      };
      climbRaf = win.requestAnimationFrame(frame);
    });
  };

  const centerAfter = (): void => {
    const mine = myRow();
    if (!mine || ol.scrollHeight <= ol.clientHeight) return;
    // A stuck row's offsetTop is where it is drawn: measure its place in the flow (not sticky while measuring).
    el.toggleAttribute('data-measuring', true);
    const top = mine.offsetTop;
    el.removeAttribute('data-measuring');
    ol.scrollTop = centerOn(top, mine.offsetHeight);
  };

  return {
    el,
    update(v) {
      // A refresh during the rank-up waits for its end (the climb renders the newest view when it lands).
      if (climbing) cur = v;
      else render(v);
    },
    centerMe() {
      if (!climbing) centerAfter();
    },
    playClimb,
    closeTip: () => tip.close(),
    destroy() {
      destroyed = true;
      if (tick !== null) clearTimeout(tick);
      if (clockTick !== null) clearTimeout(clockTick);
      if (statusTick !== null) clearInterval(statusTick);
      if (climbRaf) el.ownerDocument.defaultView?.cancelAnimationFrame(climbRaf);
      tick = null;
      offLocale();
      ol.removeEventListener('scroll', closeTip);
      tip.destroy();
      el.remove();
    },
  };
}
