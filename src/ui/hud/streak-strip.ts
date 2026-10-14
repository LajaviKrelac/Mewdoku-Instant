// Owner: G3 (Phase 2e)
// The daily streak's words and steps (spec §5.3, CONTRACTS §8; our own design, D-2e-12). It was a strip on Home
// under the Play button (flame, 7 paw steps, the text); since the Home layout of 2026-10-11 Home shows the pill below
// and the sentence as a toast, and the steps live on in the victory's streak row.
//   none   "Solve a puzzle to start a streak."             7 empty
//   new    "A new streak starts today."                    7 empty (a broken run; never a warning)
//   alive  "Day 3 of 7 · Solve a puzzle today for day 4."  3 done, step 4 outlined
//   done   "Day 4 of 7 · Today counts!"                    4 done, step 4 with a soft check
//          "Day 7 of 7 · Streak reward collected!"         7 done, the chest open (rewardDay)
// No fake urgency (§5.1): no countdown, no "you'll lose it", no red, no reminder. The pill is named with the whole
// sentence; the steps are decorative and carry a shape (check, fill), never colour alone (§7.7).
// Classes: .streak-steps > svg.streak-step[data-step][data-kind=empty|next|done|today] (victory-screen.ts);
//          button.streak-pill[data-state][data-today] > svg.streak-pill__flame .streak-pill__n (Home's top centre, the
//          original's streak counter); a tap opens the Daily Streak screen (UI batch 2026-10-13; it was a toast).
import { formatNumber, onLocaleChanged, t } from '../../i18n';
import { icon, type SymbolId } from '../art/sprite';
import { h, setText, type View } from '../dom';

export interface StreakStripView {
  /** none: never; new: a broken run; alive: today not counted yet; done: today counted. */
  readonly state: 'none' | 'new' | 'alive' | 'done';
  /** The day in the cycle (1 … total) of the last counted day; 0 with no run. */
  readonly day: number;
  /** dayStreak.cycleDays. */
  readonly total: number;
  /** Today counted the cycle's last day (its reward was paid with the win). */
  readonly rewardDay: boolean;
  /** The days in a row (the Home pill's number); absent: the day in the cycle. */
  readonly run?: number;
}

/** One step's look: an outline, the next one to earn, a filled paw, today's filled paw with a soft check. */
export type StreakStepKind = 'empty' | 'next' | 'done' | 'today';

/**
 * The steps of a cycle of `total` days with `done` days done; `today` marks today's step (1-based, 0 = none),
 * `next` the step to earn today (0 = none). Pure (tests).
 */
export function streakStepKinds(total: number, done: number, today: number, next: number): StreakStepKind[] {
  const out: StreakStepKind[] = [];
  const n = Math.max(1, Math.min(31, Math.floor(total)));
  for (let i = 1; i <= n; i++) out.push(i === today ? 'today' : i <= done ? 'done' : i === next ? 'next' : 'empty');
  return out;
}

/** The step art (G2, Appendix C): the paw prints and, on the cycle's last day, the chest. */
function stepSymbol(kind: StreakStepKind, last: boolean): SymbolId {
  if (last) return 'streak-step-chest';
  return kind === 'done' ? 'streak-step-done' : kind === 'today' ? 'streak-step-today' : 'streak-step-empty';
}

/** Renders the steps into `host` (cleared first); decorative (the caller names the whole row). */
export function renderStreakSteps(host: HTMLElement, kinds: readonly StreakStepKind[]): void {
  host.textContent = '';
  kinds.forEach((kind, i) => {
    const step = icon(stepSymbol(kind, i === kinds.length - 1), { class: 'streak-step' });
    step.dataset.step = String(i + 1);
    step.dataset.kind = kind;
    host.appendChild(step);
  });
}

/** What the strip shows for a view: the day line (null: none), the status sentence and the steps. */
export function streakStripModel(v: StreakStripView): { day: string | null; status: string; kinds: StreakStepKind[]; label: string } {
  const total = Math.max(1, Math.floor(v.total));
  const day = Math.max(0, Math.min(total, Math.floor(v.day)));
  if (v.state === 'none' || v.state === 'new' || day === 0) {
    const status = v.state === 'new' ? t('streak.new') : t('streak.start');
    return { day: null, status, kinds: streakStepKinds(total, 0, 0, 0), label: status };
  }
  const dayText = t('streak.day', { day: formatNumber(day), total: formatNumber(total) });
  let status: string;
  let kinds: StreakStepKind[];
  if (v.state === 'done') {
    status = v.rewardDay && day === total ? t('streak.rewardDone') : t('streak.today');
    kinds = streakStepKinds(total, day, day, 0);
  } else {
    // Alive, today not counted: the next counted day (after the cycle's last day, day 1 of a new cycle).
    const next = day >= total ? 1 : day + 1;
    status = t('streak.next', { day: formatNumber(next) });
    kinds = streakStepKinds(total, day, 0, day >= total ? 0 : next);
  }
  return { day: dayText, status, kinds, label: t('streak.a11y', { day: formatNumber(day), total: formatNumber(total), status }) };
}

export interface StreakPillCallbacks {
  /** A tap (UI batch 2026-10-13: the app opens the Daily Streak screen; it was a toast of the sentence). */
  onPress(): void;
}

/** The days in a row the Home pill shows: 0 with no live run. Pure (tests). */
export function streakPillCount(v: StreakStripView): number {
  if (v.state === 'none' || v.state === 'new') return 0;
  return Math.max(0, Math.floor(v.run ?? v.day));
}

/**
 * Home's streak pill at the top centre: our flame and the days in a row, named with the strip's sentence. UI batch
 * (2026-10-13): the flame stays faded until today counts (data-today, overlay-chunk.css), the box is 44 px tall, and a
 * tap opens the Daily Streak screen (aria-haspopup).
 */
export function createStreakPill(view: StreakStripView, cb: StreakPillCallbacks): View<StreakStripView> {
  const n = h('span', { class: 'streak-pill__n num' });
  const el = h(
    'button',
    { type: 'button', class: 'streak-pill', 'aria-haspopup': 'dialog', on: { click: () => cb.onPress() } },
    icon('icon-streak-flame', { class: 'streak-pill__flame' }),
    n,
  );
  let cur = view;
  const render = (v: StreakStripView): void => {
    cur = v;
    el.dataset.state = v.state === 'new' ? 'none' : v.state;
    el.dataset.today = v.state === 'done' ? '1' : '0';
    setText(n, formatNumber(streakPillCount(v)));
    el.setAttribute('aria-label', streakStripModel(v).label);
  };
  render(view);
  const offLocale = onLocaleChanged(() => render(cur));
  return {
    el,
    update: render,
    destroy() {
      offLocale();
      el.remove();
    },
  };
}
