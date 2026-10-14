// UI batch (2026-10-13): streak — the Daily Streak screen (ui/overlays/streak-screen.ts): the reference's order with our
// art and words (title, flame faded until today counts, the run and its label, the best pill, the week row, the status,
// Continue or a back arrow), its accessible names, the gated Continue, Esc, the language switch, reduced motion and the
// banner band.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../../src/i18n';
import { createStreakScreen, streakScreenStatus, streakWeekLabel, type StreakScreenProps, type StreakWeekCell } from '../../../src/ui/overlays/streak-screen';

afterEach(async () => {
  vi.useRealTimers();
  document.body.textContent = '';
  await setLocale('en', { doc: null });
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));

/** Sun 4 Oct … Sat 10 Oct 2026; `played` days from the start, today at `today` (0-based), the gift on the last day. */
function week(played: number, today: number, paid = false): StreakWeekCell[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dateKey: `2026-10-${String(4 + i).padStart(2, '0')}`,
    played: i < played,
    today: i === today,
    gift: i === 6,
    paid: paid && i === 6,
  }));
}

function props(over: Partial<StreakScreenProps> = {}): StreakScreenProps {
  return {
    mode: 'home',
    streak: { state: 'alive', day: 2, total: 7, rewardDay: false, run: 9 },
    best: 12,
    week: week(2, 2),
    reward: null,
    buttonDelayMs: 600,
    bannerReserved: false,
    reducedMotion: false,
    onDone: vi.fn(),
    ...over,
  };
}

function mount(p: StreakScreenProps) {
  const v = createStreakScreen();
  document.body.appendChild(v.el);
  v.open(p);
  return v;
}

describe('the Daily Streak screen (UI batch 2026-10-13)', () => {
  it('from Home before today counts: the title, the faded flame, the run "9 days in a row", "Best: 12 days", the row, the status, a back arrow', () => {
    const p = props();
    const v = mount(p);
    const root = q(v.el, '.streak-screen');
    expect(v.el.dataset.overlay).toBe('streak');
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.dataset).toMatchObject({ mode: 'home', today: '0' });
    expect(q(root, '.streak-screen__title').textContent).toBe('Daily streak');
    expect(root.getAttribute('aria-labelledby')).toBe(q(root, '.streak-screen__title').id);
    expect(q(root, '.streak-screen__hero svg use').getAttribute('href')).toBe('#icon-streak-flame');
    expect(q(root, '.streak-screen__n').textContent).toBe('9');
    expect(q(root, '.streak-screen__label').textContent).toBe('days in a row');
    expect(q(root, '.streak-screen__run').textContent).toBe('9 days in a row');
    expect(q(root, '.streak-screen__best').textContent).toBe('Best: 12 days');
    expect(q(root, '.streak-screen__status').textContent).toBe('Solve a puzzle today for day 3.');
    const back = q<HTMLButtonElement>(root, '.streak-screen__back');
    expect(back.hidden).toBe(false);
    expect(back.getAttribute('aria-label')).toBe('Back');
    expect(back.hasAttribute('data-autofocus')).toBe(true);
    expect(q(root, '.streak-screen__actions').hidden).toBe(true);
    back.click();
    expect(p.onDone).toHaveBeenCalledTimes(1);
    v.destroy();
  });

  it('the week row: each date\'s weekday, played discs, today, the gift; one image named by its count and the reward day', () => {
    const v = mount(props({ week: week(3, 3) }));
    const row = q(v.el, '.streak-week');
    expect(row.getAttribute('role')).toBe('img');
    expect(row.getAttribute('aria-label')).toBe('Streak days: 3 of 7 solved. Day 7 earns a reward.');
    const days = qa(row, '.streak-week__day');
    expect(days.map((d) => q(d, '.streak-week__name').textContent)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(days.map((d) => (d.hasAttribute('data-played') ? 'x' : '.') + (d.hasAttribute('data-today') ? 'T' : '') + (d.hasAttribute('data-gift') ? 'g' : ''))).toEqual([
      'x', 'x', 'x', '.T', '.', '.', '.g',
    ]);
    expect(q(days[6] as HTMLElement, '.streak-week__gift use').getAttribute('href')).toBe('#streak-step-chest');
    expect(days[6]?.hasAttribute('data-paid')).toBe(false);
    const described = (q(v.el, '.streak-screen').getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toEqual([q(v.el, '.streak-screen__run').id, q(v.el, '.streak-screen__best').id, row.id, q(v.el, '.streak-screen__status').id]);
    v.update(props({ week: [] }));
    expect(row.hidden).toBe(true);
    expect(q(v.el, '.streak-screen').getAttribute('aria-describedby')).not.toContain(row.id);
    v.destroy();
  });

  it('after the day\'s first win: lit flame, Continue (gated for buttonDelayMs, then live), no back arrow; Esc waits for the gate', () => {
    vi.useFakeTimers();
    const p = props({ mode: 'win', streak: { state: 'done', day: 3, total: 7, rewardDay: false, run: 10 }, week: week(3, 2) });
    const v = mount(p);
    const root = q(v.el, '.streak-screen');
    expect(root.dataset).toMatchObject({ mode: 'win', today: '1' });
    expect(root.hasAttribute('data-anim')).toBe(true);
    expect(q(root, '.streak-screen__back').hidden).toBe(true);
    const cont = q<HTMLButtonElement>(root, '.streak-screen__continue');
    expect(cont.classList.contains('btn--primary')).toBe(true);
    expect(cont.textContent).toBe('Continue');
    expect(cont.hasAttribute('data-autofocus')).toBe(true);
    expect(q(root, '.streak-screen__status').textContent).toBe('Today counts!');
    expect(cont.getAttribute('aria-disabled')).toBe('true');
    cont.click();
    expect(v.dismiss()).toBe(true);
    expect(p.onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(cont.hasAttribute('aria-disabled')).toBe(false);
    cont.click();
    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(v.dismiss()).toBe(true);
    expect(p.onDone).toHaveBeenCalledTimes(2);
    v.close();
    expect(root.hasAttribute('data-anim')).toBe(false); // shown again as the leaving layer: no replay
    expect(v.dismiss()).toBe(false);
    v.destroy();
  });

  it('day 7: the reward line replaces the sentence and the chest shows open; reduced motion: no pop, no light-up', () => {
    const v = mount(props({ mode: 'win', reducedMotion: true, streak: { state: 'done', day: 7, total: 7, rewardDay: true, run: 7 }, week: week(7, 6, true), reward: { hints: 2, kitties: 2 } }));
    const root = q(v.el, '.streak-screen');
    expect(q(root, '.streak-screen__status').textContent).toBe('Streak reward: +2 hints and +2 kitties');
    expect(qa(root, '.streak-week__day')[6]?.hasAttribute('data-paid')).toBe(true);
    expect(root.hasAttribute('data-anim')).toBe(false);
    expect(root.hasAttribute('data-reduced')).toBe(true);
    v.destroy();
  });

  it('no streak yet: "0 days in a row", "Best: 0 days", the start sentence; a broken run reads calm', () => {
    const v = mount(props({ streak: { state: 'none', day: 0, total: 7, rewardDay: false, run: 0 }, best: 0, week: week(0, 0) }));
    expect(q(v.el, '.streak-screen__run').textContent).toBe('0 days in a row');
    expect(q(v.el, '.streak-screen__best').textContent).toBe('Best: 0 days');
    expect(q(v.el, '.streak-screen__status').textContent).toBe('Solve a puzzle to start a streak.');
    v.update(props({ streak: { state: 'new', day: 0, total: 7, rewardDay: false, run: 0 }, best: 1 }));
    expect(q(v.el, '.streak-screen__status').textContent).toBe('A new streak starts today.');
    expect(q(v.el, '.streak-screen__best').textContent).toBe('Best: 1 day');
    v.update(props({ streak: { state: 'done', day: 1, total: 7, rewardDay: false, run: 1 } }));
    expect(q(v.el, '.streak-screen__run').textContent).toBe('1 day in a row');
    v.destroy();
  });

  it('the banner band is reserved with data-banner; the reserve comes from config', () => {
    const v = mount(props({ bannerReserved: true }));
    const root = q(v.el, '.streak-screen');
    expect(root.hasAttribute('data-banner')).toBe(true);
    expect(root.style.getPropertyValue('--banner-reserve')).toMatch(/px$/);
    v.update(props());
    expect(root.hasAttribute('data-banner')).toBe(false);
    v.destroy();
  });

  it('a language switch relabels everything, the weekdays too (A11Y-I18N-1)', async () => {
    const v = mount(props());
    await setLocale('de', { doc: null });
    expect(q(v.el, '.streak-screen__title').textContent).toBe('Tägliche Serie');
    expect(q(v.el, '.streak-screen__label').textContent).toBe('Tage in Folge');
    expect(q(v.el, '.streak-screen__back').getAttribute('aria-label')).toBe('Zurück');
    expect(q(v.el, '.streak-week__name').textContent).toBe(new Intl.DateTimeFormat('de', { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 4)));
    expect(q(v.el, '.streak-week').getAttribute('aria-label')).toContain('2 von 7');
    v.destroy();
  });

  it('pure helpers: the status and the row\'s name', () => {
    expect(streakScreenStatus({ mode: 'home', streak: { state: 'done', day: 7, total: 7, rewardDay: true }, reward: { hints: 2 } })).toBe('Streak reward collected!');
    expect(streakScreenStatus({ mode: 'win', streak: { state: 'done', day: 7, total: 7, rewardDay: true }, reward: { hints: 0, kitties: 0 } })).toBe('Streak reward collected!');
    expect(streakWeekLabel([])).toBe('Streak days: 0 of 0 solved.');
    const two = week(1, 1).map((c, i) => ({ ...c, gift: i === 2 || i === 6 }));
    expect(streakWeekLabel(two)).toBe('Streak days: 1 of 7 solved. Day 3 earns a reward. Day 7 earns a reward.');
  });
});
