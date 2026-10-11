// Owner: G3 (Phase 2e)
// The daily streak strip on Home (spec §5.3, CONTRACTS §8; our own design, D-2e-12): under the Play button,
// above the daily card, inside .home__actions. Our streak flame, 7 paw steps (empty, done, today-done, the
// day-7 chest) and the text. Main bundle (small; the steps and the flame are first-load art, G2).
//   none   "Solve a puzzle to start a streak."             7 empty
//   new    "A new streak starts today."                    7 empty (a broken run; never a warning)
//   alive  "Day 3 of 7 · Solve a puzzle today for day 4."  3 done, step 4 outlined
//   done   "Day 4 of 7 · Today counts!"                    4 done, step 4 with a soft check
//          "Day 7 of 7 · Streak reward collected!"         7 done, the chest open (rewardDay)
// No fake urgency (§5.1): no countdown, no "you'll lose it", no red, no reminder. One role="img" element
// named with the whole sentence; the steps are decorative and carry a shape (check, fill), never colour
// alone (§7.7). The step builder is shared with the victory's streak row (victory-screen.ts).
// Classes: .streak-strip[data-state=none|alive|done][data-day][data-today=0|1][data-broken?]
//          > svg.streak-strip__flame .streak-strip__body(.streak-strip__top(.streak-strip__day .streak-steps)
//            .streak-strip__text); .streak-steps > svg.streak-step[data-step][data-kind=empty|next|done|today]
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

export function createStreakStrip(view: StreakStripView): View<StreakStripView> {
  const dayEl = h('span', { class: 'streak-strip__day' });
  const steps = h('span', { class: 'streak-steps' });
  const text = h('p', { class: 'streak-strip__text' });
  const el = h(
    'div',
    { class: 'streak-strip', role: 'img' },
    icon('icon-streak-flame', { class: 'streak-strip__flame' }),
    h('div', { class: 'streak-strip__body' }, h('div', { class: 'streak-strip__top' }, dayEl, steps), text),
  );
  let cur = view;
  let stepsKey = '';

  const render = (v: StreakStripView): void => {
    cur = v;
    const m = streakStripModel(v);
    const total = Math.max(1, Math.floor(v.total));
    const day = Math.max(0, Math.min(total, Math.floor(v.day)));
    el.dataset.state = v.state === 'new' ? 'none' : v.state;
    el.toggleAttribute('data-broken', v.state === 'new');
    el.dataset.day = String(m.day === null ? 0 : day);
    el.dataset.today = v.state === 'done' ? '1' : '0';
    el.toggleAttribute('data-reward', v.state === 'done' && v.rewardDay);
    dayEl.hidden = m.day === null;
    setText(dayEl, m.day ?? '');
    setText(text, m.status);
    el.setAttribute('aria-label', m.label);
    const key = m.kinds.join(',');
    if (key !== stepsKey) {
      stepsKey = key;
      renderStreakSteps(steps, m.kinds);
    }
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
