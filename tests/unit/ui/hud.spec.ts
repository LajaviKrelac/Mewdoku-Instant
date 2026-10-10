// Owner: A (Phase 2b); G3 (Phase 2d). HUD components: Home's top bar (with the phase2b lead slot and the
// Phase 2d settings dot), the game bar (look-spec §1.4, §1.13: back · Level / Score · gear; the fit
// steps; Phase 2d.1 §2.5: the Score waits for its star and counts up, the 2d roll as the fallback), the rule cards (§1.7) and the helper
// row (§1.11, §1.12: kitty · bulb · mouse, the count / Free / video / muted-0 badges, the pulse, the
// hidden mouse). phase2b F0 split: the pills cases live in pills.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { GameEvent } from '../../../src/game/types';
import { en } from '../../../src/i18n/en';
import { barValue, countValue, createGameBar, type GameBarProps } from '../../../src/ui/hud/game-bar';
import { createRuleChips } from '../../../src/ui/hud/rule-chips';
import { createToolBar, type ToolBarProps } from '../../../src/ui/hud/tool-bar';
import { createTopBar, splitTitle, type TopBarProps } from '../../../src/ui/hud/top-bar';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

const uses = (el: Element | null | undefined): string[] => Array.from(el?.querySelectorAll('use') ?? []).map((u) => u.getAttribute('href') ?? '');

describe('top bar (Home, event screen)', () => {
  const props: TopBarProps = { title: 'Level 37', hard: false, showHome: true, showSettings: true, showTrophy: false, fbSafeZone: false };

  it('renders the title, Hard badge and the right-hand buttons', () => {
    const cb = { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() };
    const bar = createTopBar(props, cb);
    const text = bar.el.querySelector('.top-bar__text');
    const badge = bar.el.querySelector<HTMLElement>('.badge--hard');
    expect(text?.textContent).toBe('Level 37');
    expect(badge?.hidden).toBe(true);
    const btn = (n: string): HTMLButtonElement => bar.el.querySelector(`.top-bar__btn--${n}`) as HTMLButtonElement;
    expect(btn('trophy').hidden).toBe(true);
    btn('home').click();
    btn('settings').click();
    expect(cb.onHome).toHaveBeenCalledTimes(1);
    expect(cb.onSettings).toHaveBeenCalledTimes(1);
    expect(btn('home').getAttribute('aria-label')).toBe('Home');
    bar.update({ ...props, hard: true, showHome: false, showTrophy: true, fbSafeZone: true });
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe('Hard');
    expect(btn('home').hidden).toBe(true);
    expect(btn('trophy').hidden).toBe(false);
    expect(bar.el.hasAttribute('data-fb-safe')).toBe(true);
    bar.update({ ...props, title: null });
    expect(bar.el.querySelector<HTMLElement>('.top-bar__title')?.hidden).toBe(true);
    bar.destroy();
  });

  it('Phase 2d §1.15: the red dot on the gear while settingsDot, and the gear\'s name says so', () => {
    const bar = createTopBar({ ...props, settingsDot: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    const gear = bar.el.querySelector('.top-bar__btn--settings') as HTMLElement;
    const dot = gear.querySelector('.top-bar__dot');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(gear.getAttribute('aria-label')).toBe(en['common.settings.new']);
    bar.update({ ...props, settingsDot: false });
    expect(gear.querySelector('.top-bar__dot')).toBeNull();
    expect(gear.getAttribute('aria-label')).toBe('Settings');
    // Absent (a harness from before 2d) = no dot.
    expect(createTopBar(props, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() }).el.querySelector('.top-bar__dot')).toBeNull();
  });

  it('keeps every control out of the top-left lead (FB safe zone) by DOM order', () => {
    const bar = createTopBar({ ...props, fbSafeZone: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    const lead = bar.el.firstElementChild as HTMLElement;
    expect(lead.className).toBe('top-bar__lead');
    expect(lead.children).toHaveLength(0);
  });

  it('phase2b §2.5: the optional lead slot sits right after the safe zone, before the title', () => {
    const pill = document.createElement('span');
    const bar = createTopBar({ ...props, title: null, fbSafeZone: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() }, { lead: pill });
    const [lead, slot, title] = Array.from(bar.el.children) as HTMLElement[];
    expect(lead?.className).toBe('top-bar__lead');
    expect(lead?.children).toHaveLength(0);
    expect(slot?.className).toBe('top-bar__slot');
    expect(slot?.firstElementChild).toBe(pill);
    expect(title?.className).toBe('top-bar__title');
    expect(createTopBar(props, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() }).el.querySelector('.top-bar__slot')).toBeNull();
  });
});

// ─────────────────────────── the game bar (look-spec §1.4, §1.13) ───────────────────────────

const barProps: GameBarProps = { title: 'Level 96', hard: false, showBack: true, fbSafeZone: false, settingsDot: false, points: 0, final: false, reducedMotion: false, starPoints: false };
const pts = (gained: number, total: number, streak = 1): GameEvent => ({ type: 'POINTS', cell: 0, gained, total, streak });
const nums = (el: HTMLElement): string[] => Array.from(el.querySelectorAll('.points-pill__n')).map((e) => e.textContent ?? '');

describe('the game bar: back · Level / Score · gear (§1.4)', () => {
  it('splits the title into the Level column\'s label and value; the h1 carries the whole title', () => {
    const bar = createGameBar(barProps, { onBack: vi.fn(), onSettings: vi.fn() });
    const h1 = bar.el.querySelector('h1.top-bar__text') as HTMLElement;
    expect(bar.el.classList.contains('top-bar--game')).toBe(true);
    expect(h1.getAttribute('aria-label')).toBe('Level 96');
    expect(h1.querySelector('.top-bar__name')?.textContent).toBe('Level');
    expect(h1.querySelector('.top-bar__suffix')?.textContent).toBe('96');
    expect(h1.querySelector<HTMLElement>('.badge--hard')?.hidden).toBe(true);
    bar.update({ ...barProps, title: 'Daily · Tue 6 Oct', hard: true });
    expect(h1.querySelector('.top-bar__name')?.textContent).toBe('Daily');
    expect(h1.querySelector('.top-bar__suffix')?.textContent).toBe('Tue 6 Oct');
    expect(h1.querySelector<HTMLElement>('.badge--hard')?.hidden).toBe(false);
    expect(h1.getAttribute('aria-label')).toBe('Daily · Tue 6 Oct');
    bar.update({ ...barProps, title: 'Lantern Walk · 13' });
    expect(h1.querySelector('.top-bar__name')?.textContent).toBe('Lantern Walk');
    expect(h1.querySelector('.top-bar__suffix')?.textContent).toBe('13');
    // A title with no split point (zh "第96关") shows whole as the value, with no label.
    bar.update({ ...barProps, title: '第96关' });
    expect(h1.querySelector<HTMLElement>('.top-bar__name')?.hidden).toBe(true);
    expect(h1.querySelector('.top-bar__suffix')?.textContent).toBe('第96关');
    expect(barValue(splitTitle('Level 310').suffix)).toBe('310');
    expect(barValue(' · 13')).toBe('13');
    bar.destroy();
  });

  it('back (Back, does what Home did) at the inline start, the gear at the end; the dot and its name; the safe zone', () => {
    const cb = { onBack: vi.fn(), onSettings: vi.fn() };
    const bar = createGameBar({ ...barProps, settingsDot: true, fbSafeZone: true }, cb);
    const [back, mid, gear] = Array.from(bar.el.children) as HTMLElement[];
    expect(back?.classList.contains('top-bar__btn--back')).toBe(true);
    expect(back?.classList.contains('top-bar__btn--home')).toBe(true); // the chrome lock's class (§4.6)
    expect(back?.getAttribute('aria-label')).toBe('Back');
    expect(uses(back)).toEqual(['#icon-back']);
    expect(mid?.className).toBe('top-bar__mid');
    expect(gear?.classList.contains('top-bar__btn--settings')).toBe(true);
    expect(uses(gear)).toEqual(['#icon-gear']);
    expect(gear?.querySelector('.top-bar__dot')).not.toBeNull();
    expect(gear?.getAttribute('aria-label')).toBe('Settings, something new');
    expect(bar.el.hasAttribute('data-fb-safe')).toBe(true);
    expect(document.documentElement.hasAttribute('data-fb-safe')).toBe(true);
    back?.click();
    gear?.click();
    expect(cb.onBack).toHaveBeenCalledTimes(1);
    expect(cb.onSettings).toHaveBeenCalledTimes(1);
    // The tutorial: no back disc (its place stays empty; the columns do not move).
    bar.update({ ...barProps, showBack: false });
    expect(back?.hidden).toBe(true);
    expect(gear?.querySelector('.top-bar__dot')).toBeNull();
    expect(document.documentElement.hasAttribute('data-fb-safe')).toBe(false);
    // Tab order (§1.18): back, then gear; the columns are not focusable.
    expect(mid?.querySelector('button, [tabindex]')).toBeNull();
    bar.destroy();
  });

  it('the Score column: "Score" over the level points, an image "Level points: N", hidden for null (tutorial), final at the win', () => {
    const bar = createGameBar(barProps, { onBack: vi.fn(), onSettings: vi.fn() });
    const score = bar.el.querySelector('.points-pill') as HTMLElement;
    expect(score.parentElement?.className).toBe('top-bar__mid');
    expect(score.querySelector('.points-pill__name')?.textContent).toBe('Score');
    expect(score.querySelector('.points-pill__icon')).toBeNull(); // no icon (§1.13)
    expect(nums(score)).toEqual(['0']);
    expect(score.getAttribute('role')).toBe('img');
    expect(score.getAttribute('aria-label')).toBe('Level points: 0');
    expect(score.hasAttribute('aria-live')).toBe(false);
    expect(score.hasAttribute('tabindex')).toBe(false);
    bar.update({ ...barProps, points: 2016 });
    expect(nums(score)).toEqual(['2,016']);
    expect(score.getAttribute('aria-label')).toBe('Level points: 2,016');
    expect(score.hasAttribute('data-final')).toBe(false);
    bar.update({ ...barProps, points: 7296, final: true });
    expect(score.hasAttribute('data-final')).toBe(true);
    bar.update({ ...barProps, points: null });
    expect(score.hidden).toBe(true);
    expect(score.hasAttribute('data-final')).toBe(false);
    bar.playEvent(pts(576, 576));
    expect(score.querySelector('.points-pill__chip')).toBeNull();
    bar.destroy();
  });

  it('2d.1 fallback (the fx chunk not loaded): POINTS rolls from total − gained to total; no chip (D-2d1-4)', () => {
    vi.useFakeTimers();
    const P = cfg.fx.levelPoints;
    const bar = createGameBar(barProps, { onBack: vi.fn(), onSettings: vi.fn() });
    document.body.appendChild(bar.el);
    const score = bar.el.querySelector('.points-pill') as HTMLElement;
    // Props first (the session updates the store before it plays the events): the roll still starts at total − gained.
    bar.update({ ...barProps, points: 576 });
    bar.playEvent(pts(576, 576));
    expect(score.querySelector('.points-pill__n.is-out')?.textContent).toBe('0');
    expect(score.querySelector('.points-pill__n.is-in')?.textContent).toBe('576');
    expect(score.querySelector('.points-pill__chip, .points-pill__label')).toBeNull();
    vi.advanceTimersByTime(P.rollMs);
    expect(nums(score)).toEqual(['576']);
    bar.playEvent({ type: 'MISTAKE', cell: 1, heartsLeft: 2 });
    expect(nums(score)).toEqual(['576']);
    bar.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('2d.1 §2.5: the star mode and the count-up', () => {
    /** A manual rAF clock: frame(ts) runs the queued callbacks at ts (performance.now() reads ts too); at(ts) moves the clock. */
    let clock = 0;
    const at = (ts: number): void => {
      clock = ts;
    };
    const rafClock = () => {
      clock = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
      let q: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        q.push(cb);
        return q.length;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
        q = [];
      });
      return (ts: number): void => {
        clock = ts;
        const run = q;
        q = [];
        for (const cb of run) cb(ts);
      };
    };

    it('countValue is round(from + (to − from)(1 − (1 − u)²)): for 0 → 576 at 60 fps exactly the measured frames', () => {
      const measured = [0, 54, 104, 153, 199, 242, 282, 320, 355, 388, 418, 445, 470, 492, 512, 529, 543, 555, 564, 571, 575, 576];
      expect(measured.map((_, k) => countValue(0, 576, (k * 350) / 21, 350))).toEqual(measured);
      expect(countValue(576, 1248, 0, 350)).toBe(576);
      expect(countValue(576, 1248, 9999, 350)).toBe(1248);
      expect(countValue(0, 10, 50, 0)).toBe(10);
    });

    it('a higher total waits for its star; the name takes it at once; countTo counts every frame, no bump, [data-counting]', () => {
      const frame = rafClock();
      const bar = createGameBar({ ...barProps, starPoints: true }, { onBack: vi.fn(), onSettings: vi.fn() });
      document.body.appendChild(bar.el);
      const score = bar.el.querySelector('.points-pill') as HTMLElement;
      const n = (): HTMLElement => score.querySelector('.points-pill__n') as HTMLElement;
      bar.update({ ...barProps, starPoints: true, points: 576 });
      expect(nums(score)).toEqual(['0']);
      expect(score.getAttribute('aria-label')).toBe('Level points: 576');
      // The star lands at 1000: that frame shows 0, the next one (1016.7) 54 — never a frame late.
      at(1000);
      bar.countTo(576);
      expect(n().hasAttribute('data-counting')).toBe(true);
      const seen: string[] = [nums(score)[0] ?? ''];
      for (let k = 1; k <= 21; k++) {
        frame(1000 + (k * 350) / 21);
        seen.push(nums(score)[0] ?? '');
      }
      expect(seen.slice(0, 4)).toEqual(['0', '54', '104', '153']);
      expect(seen[seen.length - 1]).toBe('576');
      expect(n().hasAttribute('data-counting')).toBe(false);
      expect(score.classList.contains('points-pill--bump')).toBe(false);
      expect(score.querySelector('.is-in, .is-out')).toBeNull();
      // The props catching up change nothing; countTo never lowers the number.
      bar.update({ ...barProps, starPoints: true, points: 576 });
      bar.countTo(100);
      expect(nums(score)).toEqual(['576']);
      bar.destroy();
    });

    it('a landing during a count-up restarts it from the number on screen; a lower total (Retry) shows at once and ends it', () => {
      const frame = rafClock();
      const bar = createGameBar({ ...barProps, starPoints: true }, { onBack: vi.fn(), onSettings: vi.fn() });
      const score = bar.el.querySelector('.points-pill') as HTMLElement;
      bar.update({ ...barProps, starPoints: true, points: 1248 });
      bar.countTo(576);
      frame(0);
      frame(175); // u = 0.5: 576 × 0.75 = 432
      expect(nums(score)).toEqual(['432']);
      at(200);
      bar.countTo(1248);
      frame(200);
      expect(nums(score)).toEqual(['432']);
      frame(550);
      expect(nums(score)).toEqual(['1,248']);
      bar.countTo(2016);
      frame(600);
      bar.update({ ...barProps, starPoints: true, points: 0 });
      expect(nums(score)).toEqual(['0']);
      expect((score.querySelector('.points-pill__n') as HTMLElement).hasAttribute('data-counting')).toBe(false);
      frame(2000);
      expect(nums(score)).toEqual(['0']);
      bar.destroy();
    });

    it('without the star (starPoints off, reduced motion) the number follows the props; syncPoints and scoreRect', () => {
      const bar = createGameBar({ ...barProps, points: 0 }, { onBack: vi.fn(), onSettings: vi.fn() });
      const score = bar.el.querySelector('.points-pill') as HTMLElement;
      bar.update({ ...barProps, points: 576 });
      expect(nums(score)).toEqual(['576']);
      bar.update({ ...barProps, points: 1248, starPoints: true });
      expect(nums(score)).toEqual(['576']);
      bar.syncPoints();
      expect(nums(score)).toEqual(['1,248']);
      expect(bar.scoreRect()).toBeNull(); // detached
      document.body.appendChild(bar.el);
      expect(bar.scoreRect()).not.toBeNull();
      bar.update({ ...barProps, points: null });
      expect(bar.scoreRect()).toBeNull();
      bar.destroy();
    });
  });

  it('critic C5: the values step to data-fit 1, then 2, when the pair is wider than the span between the discs', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const bar = createGameBar(barProps, { onBack: vi.fn(), onSettings: vi.fn() });
    const mid = bar.el.querySelector('.top-bar__mid') as HTMLElement;
    let span = 300;
    Object.defineProperty(mid, 'clientWidth', { get: () => span, configurable: true });
    // Each column needs 102 at rest, 180 / 160 / 140 for its value by fit step.
    const valueW: Record<string, number> = { none: 180, '1': 160, '2': 140 };
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(102);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      // The Level column's value line; the Score's (also a .top-bar__val) stays narrow.
      return this.classList.contains('top-bar__val') && this.parentElement?.tagName === 'H1' ? (valueW[bar.el.dataset.fit ?? 'none'] ?? 0) : 50;
    });
    document.body.appendChild(bar.el);
    bar.fit();
    // 180 + 102 = 282 fits in 300.
    expect(bar.el.hasAttribute('data-fit')).toBe(false);
    span = 270;
    bar.fit();
    expect(bar.el.dataset.fit).toBe('1');
    span = 200;
    bar.update({ ...barProps, title: 'Daily · Tue 6 Oct' });
    expect(bar.el.dataset.fit).toBe('2');
    bar.destroy();
  });
});

// ─────────────────────────── the rule cards (§1.7) ───────────────────────────

describe('rule cards', () => {
  it('our own wording next to G2\'s diagram; text hidden in compact; one card highlighted', () => {
    const c = createRuleChips({ compact: false, highlight: null });
    const chips = c.el.querySelectorAll('.chip');
    expect(chips).toHaveLength(3);
    expect(Array.from(chips).map((li) => li.className)).toEqual(['chip chip--colours', 'chip chip--lines', 'chip chip--space']);
    for (const li of Array.from(chips)) {
      const art = li.firstElementChild as SVGElement;
      expect(art.tagName.toLowerCase()).toBe('svg');
      expect(art.classList.contains('chip__art')).toBe(true);
      expect(art.getAttribute('aria-hidden')).toBe('true');
    }
    expect(chips[0]?.querySelector('.chip__text')?.textContent).toBe(en['game.chip.colours']);
    expect(chips[0]?.querySelector('.chip__text')?.getAttribute('aria-hidden')).toBe('true');
    expect(chips[0]?.getAttribute('title')).toBe(en['game.chip.colours.a11y']);
    expect(chips[2]?.querySelector('.sr-only')?.textContent).toBe(en['game.chip.space.a11y']);
    // No 2b chip icons any more.
    expect(c.el.querySelector('use[href^="#icon-rule-"]')).toBeNull();
    c.update({ compact: true, highlight: 'lines' });
    expect(c.el.hasAttribute('data-compact')).toBe(true);
    expect(chips[1]?.hasAttribute('data-hl')).toBe(true);
    expect(chips[0]?.hasAttribute('data-hl')).toBe(false);
    c.destroy();
  });
});

// ─────────────────────────── the helper row (§1.11, §1.12) ───────────────────────────

const tools: ToolBarProps = { hints: 2, kitties: 2, bulbEnabled: true, pawEnabled: true, hintsFree: false, mouse: { shown: true, enabled: true }, videoRefill: true, pulse: null, busy: false };
const badgeOf = (tb: { el: HTMLElement }, k: string): HTMLElement => tb.el.querySelector(`.tool--${k} .tool__badge`) as HTMLElement;
const kindOf = (b: HTMLElement): string => (b.hidden ? 'none' : ['count', 'free', 'video'].find((k) => b.classList.contains(`tool__badge--${k}`)) ?? '?');

describe('tool row: kitty · bulb · mouse', () => {
  it('three discs in order with the helpers\' art, the count badges, and the callbacks', () => {
    const cb = { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() };
    const tb = createToolBar(tools, cb);
    document.body.appendChild(tb.el);
    const btns = Array.from(tb.el.children) as HTMLButtonElement[];
    expect(btns.map((b) => b.className)).toEqual(['tool tool--paw', 'tool tool--bulb', 'tool tool--mouse']);
    expect(btns.map((b) => uses(b.querySelector('.tool__disc'))[0])).toEqual(['#tool-kitty', '#tool-bulb', '#tool-mouse']);
    for (const b of btns) expect(b.querySelector('.tool__disc > svg.tool__icon')).not.toBeNull();
    expect(badgeOf(tb, 'paw').textContent).toBe('2');
    expect(kindOf(badgeOf(tb, 'paw'))).toBe('count');
    expect(kindOf(badgeOf(tb, 'bulb'))).toBe('count');
    // The badge is the disc's sibling: it never scales with the pulse.
    expect(badgeOf(tb, 'paw').parentElement?.classList.contains('tool')).toBe(true);
    expect(btns[0]?.getAttribute('aria-label')).toBe('Kitty, 2 left');
    expect(btns[1]?.getAttribute('aria-label')).toBe('Hint, 2 left');
    expect(btns[2]?.getAttribute('aria-label')).toBe(`Mouse: crosses out ${cfg.mouse.cells} tiles that have no cat`);
    for (const b of btns) b.click();
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    expect(cb.onBulb).toHaveBeenCalledTimes(1);
    expect(cb.onMouse).toHaveBeenCalledTimes(1);
    expect(tb.toolRect('mouse')).not.toBeNull();
    tb.destroy();
  });

  it('badges: the count; "Free" on the tutorial bulb; at 0 the video badge when a video can refill, else a muted 0; the mouse: video or none', () => {
    const tb = createToolBar(tools, { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() });
    expect(kindOf(badgeOf(tb, 'mouse'))).toBe('video');
    expect(uses(badgeOf(tb, 'mouse'))).toEqual(['#icon-play']);
    tb.update({ ...tools, kitties: 0, hints: 0 });
    expect(kindOf(badgeOf(tb, 'paw'))).toBe('video');
    expect(kindOf(badgeOf(tb, 'bulb'))).toBe('video');
    expect(tb.el.querySelector('.tool--paw')?.getAttribute('aria-label')).toBe('Kitty: watch a video for more');
    expect(tb.el.querySelector('.tool--bulb')?.getAttribute('aria-label')).toBe('Hint: watch a video for more');
    // The web: no rewarded video. A muted 0; the mouse has no badge.
    tb.update({ ...tools, kitties: 0, hints: 0, videoRefill: false });
    expect(kindOf(badgeOf(tb, 'paw'))).toBe('count');
    expect(badgeOf(tb, 'paw').textContent).toBe('0');
    expect(tb.el.querySelector('.tool--paw')?.hasAttribute('data-empty')).toBe(true);
    expect(tb.el.querySelector('.tool--paw')?.getAttribute('aria-label')).toBe('Kitty, 0 left');
    expect(kindOf(badgeOf(tb, 'mouse'))).toBe('none');
    // The tutorial bulb.
    tb.update({ ...tools, hintsFree: true, hints: 0 });
    expect(kindOf(badgeOf(tb, 'bulb'))).toBe('free');
    expect(badgeOf(tb, 'bulb').textContent).toBe('Free');
    expect(tb.el.querySelector('.tool--bulb')?.hasAttribute('data-free')).toBe(true);
    expect(tb.el.querySelector('.tool--bulb')?.getAttribute('aria-label')).toBe('Hint, Free');
    // Growth (critic C7): a long count is text, never cut (CSS min-width + padding).
    tb.update({ ...tools, hints: 100 });
    expect(badgeOf(tb, 'bulb').textContent).toBe('100');
  });

  it('a stock increase bumps its badge (2b), a re-render with the same props does not', () => {
    const tb = createToolBar(tools, { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() });
    tb.update({ ...tools, kitties: 3 });
    expect(badgeOf(tb, 'paw').classList.contains('tool__badge--bump')).toBe(true);
    expect(badgeOf(tb, 'bulb').classList.contains('tool__badge--bump')).toBe(false);
  });

  it('[data-pulse] follows GameView.pulse on an enabled helper only; never on the mouse', () => {
    const tb = createToolBar(tools, { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() });
    const pulsing = (): string[] => Array.from(tb.el.querySelectorAll('.tool[data-pulse]')).map((b) => b.className);
    expect(pulsing()).toEqual([]);
    tb.update({ ...tools, pulse: 'paw' });
    expect(pulsing()).toEqual(['tool tool--paw']);
    tb.update({ ...tools, pulse: 'bulb' });
    expect(pulsing()).toEqual(['tool tool--bulb']);
    tb.update({ ...tools, pulse: 'bulb', bulbEnabled: false });
    expect(pulsing()).toEqual([]);
    expect((tb.el.querySelector('.tool--bulb') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a mouse that is not shown keeps its slot: data-off, inert, hidden from screen readers, out of the Tab order', () => {
    const cb = { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() };
    const tb = createToolBar({ ...tools, mouse: { shown: false, enabled: false } }, cb);
    document.body.appendChild(tb.el);
    const mouse = tb.el.querySelector('.tool--mouse') as HTMLButtonElement;
    expect(tb.el.children).toHaveLength(3);
    expect(mouse.hasAttribute('data-off')).toBe(true);
    expect(mouse.hasAttribute('inert')).toBe(true);
    expect(mouse.getAttribute('aria-hidden')).toBe('true');
    expect(mouse.tabIndex).toBe(-1);
    expect(mouse.disabled).toBe(true);
    expect(tb.toolRect('mouse')).toBeNull();
    // Shown but not enabled (no candidate cell): a disabled button.
    tb.update({ ...tools, mouse: { shown: true, enabled: false } });
    expect(mouse.hasAttribute('data-off')).toBe(false);
    expect(mouse.hasAttribute('inert')).toBe(false);
    expect(mouse.hasAttribute('aria-hidden')).toBe(false);
    expect(mouse.hasAttribute('tabindex')).toBe(false);
    expect(mouse.disabled).toBe(true);
    tb.update(tools);
    expect(mouse.disabled).toBe(false);
  });

  it('2d.1 §4.5, §1.2: a pointer release springs back (.tool--spring), a key press does not; [data-busy] while a helper runs', () => {
    const cb = { onBulb: vi.fn(), onPaw: vi.fn(), onMouse: vi.fn() };
    const tb = createToolBar(tools, cb);
    const paw = tb.el.querySelector('.tool--paw') as HTMLButtonElement;
    paw.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(paw.classList.contains('tool--spring')).toBe(true);
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    const end = new Event('animationend') as Event & { animationName: string };
    Object.defineProperty(end, 'animationName', { value: 'tool-spring' });
    paw.dispatchEvent(end);
    expect(paw.classList.contains('tool--spring')).toBe(false);
    paw.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); // Enter / Space
    expect(paw.classList.contains('tool--spring')).toBe(false);
    expect(cb.onPaw).toHaveBeenCalledTimes(2);
    expect(tb.el.hasAttribute('data-busy')).toBe(false);
    tb.update({ ...tools, busy: true, pawEnabled: false });
    expect(tb.el.hasAttribute('data-busy')).toBe(true);
    tb.update({ ...tools, busy: false });
    expect(tb.el.hasAttribute('data-busy')).toBe(false);
    tb.destroy();
  });
});
