// Owner: ui-board. HUD components: top bar, pills (heart crack), rule chips, tool bar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { createPills } from '../../../src/ui/hud/pills';
import { createRuleChips } from '../../../src/ui/hud/rule-chips';
import { createToolBar } from '../../../src/ui/hud/tool-bar';
import { createTopBar, type TopBarProps } from '../../../src/ui/hud/top-bar';

afterEach(() => vi.useRealTimers());

describe('top bar', () => {
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

  it('keeps every control out of the top-left lead (FB safe zone) by DOM order', () => {
    const bar = createTopBar({ ...props, fbSafeZone: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() });
    const lead = bar.el.firstElementChild as HTMLElement;
    expect(lead.className).toBe('top-bar__lead');
    expect(lead.children).toHaveLength(0);
  });
});

describe('pills', () => {
  it('shows the cat counter and hearts with accessible labels', () => {
    const p = createPills({ catsPlaced: 3, n: 8, hearts: 2, maxHearts: 3, compact: false });
    expect(p.el.querySelector('.pill__count')?.textContent).toBe('3 / 8');
    expect(p.el.querySelector('.pill--cats')?.getAttribute('aria-label')).toBe('3 of 8 cats placed');
    expect(p.el.querySelector('.pill--hearts')?.getAttribute('aria-label')).toBe('2 of 3 hearts left');
    expect(p.el.querySelectorAll('.heart')).toHaveLength(3);
    expect(p.el.querySelectorAll('.heart[data-full]')).toHaveLength(2);
    p.update({ catsPlaced: 4, n: 8, hearts: 2, maxHearts: 3, compact: true });
    expect(p.el.hasAttribute('data-compact')).toBe(true);
    expect(p.el.querySelector('.pill--cats')?.classList.contains('pill--bump')).toBe(true);
  });

  it('cracks the lost heart on MISTAKE and pops the restored one on REVIVED', () => {
    vi.useFakeTimers();
    const p = createPills({ catsPlaced: 0, n: 8, hearts: 3, maxHearts: 3, compact: false });
    p.update({ catsPlaced: 0, n: 8, hearts: 2, maxHearts: 3, compact: false });
    p.playEvent({ type: 'MISTAKE', cell: 4, heartsLeft: 2 });
    const hearts = p.el.querySelectorAll('.heart');
    expect(hearts[2]?.querySelector('.heart__crack')).not.toBeNull();
    expect(hearts[2]?.querySelectorAll('.heart__half')).toHaveLength(2);
    vi.advanceTimersByTime(cfg.fx.heartCrackMs + 100);
    expect(hearts[2]?.querySelector('.heart__crack')).toBeNull();
    p.update({ catsPlaced: 0, n: 8, hearts: 1, maxHearts: 3, compact: false });
    p.playEvent({ type: 'REVIVED' });
    expect(hearts[0]?.classList.contains('heart--pop')).toBe(true);
    p.destroy();
  });
});

describe('rule chips', () => {
  it('uses our own wording, hides text in compact mode and highlights one chip', () => {
    const c = createRuleChips({ compact: false, highlight: null });
    const chips = c.el.querySelectorAll('.chip');
    expect(chips).toHaveLength(3);
    expect(chips[0]?.querySelector('.chip__text')?.textContent).toBe(en['game.chip.colours']);
    expect(chips[2]?.querySelector('.sr-only')?.textContent).toBe(en['game.chip.space.a11y']);
    c.update({ compact: true, highlight: 'lines' });
    expect(c.el.hasAttribute('data-compact')).toBe(true);
    expect(chips[1]?.hasAttribute('data-hl')).toBe(true);
    expect(chips[0]?.hasAttribute('data-hl')).toBe(false);
  });
});

describe('tool bar', () => {
  it('shows counts, Free in the tutorial, and disables tools', () => {
    const cb = { onBulb: vi.fn(), onPaw: vi.fn() };
    const tb = createToolBar({ hints: 5, kitties: 0, bulbEnabled: true, pawEnabled: true, hintsFree: false }, cb);
    document.body.appendChild(tb.el);
    const bulb = tb.el.querySelector('.tool--bulb') as HTMLButtonElement;
    const paw = tb.el.querySelector('.tool--paw') as HTMLButtonElement;
    expect(bulb.querySelector('.tool__badge')?.textContent).toBe('5');
    expect(bulb.getAttribute('aria-label')).toBe('Hint, 5 left');
    expect(paw.hasAttribute('data-empty')).toBe(true);
    bulb.click();
    paw.click();
    expect(cb.onBulb).toHaveBeenCalledTimes(1);
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    tb.update({ hints: 5, kitties: 1, bulbEnabled: true, pawEnabled: false, hintsFree: true });
    expect(bulb.querySelector('.tool__badge')?.textContent).toBe('Free');
    expect(paw.disabled).toBe(true);
    expect(paw.querySelector('.tool__badge')?.classList.contains('tool__badge--bump')).toBe(true);
    expect(tb.toolRect('bulb')).not.toBeNull();
    tb.destroy();
    expect(tb.el.isConnected).toBe(false);
  });
});
