// Owner: A. HUD components A owns: top bar (with the phase2b lead slot), rule chips, tool bar.
// phase2b F0 split: the pills cases moved to pills.spec.ts (B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../src/i18n/en';
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

  it('phase2b §2.5: the optional lead slot sits right after the safe zone, before the title', () => {
    const pill = document.createElement('span');
    const bar = createTopBar({ ...props, title: null, fbSafeZone: true }, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() }, { lead: pill });
    const [lead, slot, title] = Array.from(bar.el.children) as HTMLElement[];
    expect(lead?.className).toBe('top-bar__lead');
    expect(lead?.children).toHaveLength(0);
    expect(slot?.className).toBe('top-bar__slot');
    expect(slot?.firstElementChild).toBe(pill);
    expect(title?.className).toBe('top-bar__title');
    // Without the slot the bar is unchanged.
    expect(createTopBar(props, { onHome: vi.fn(), onSettings: vi.fn(), onTrophy: vi.fn() }).el.querySelector('.top-bar__slot')).toBeNull();
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
