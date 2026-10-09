// Owner: B. The pills row (cat counter, hearts and the heart break; phase2b adds the fish pill).
// phase2b F0 split: moved from hud.spec.ts (A). B adds the §2.13 cases (heart-break phases, the
// in-game fish pill hidden during play and counting up per arrival).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createPills } from '../../../src/ui/hud/pills';

afterEach(() => vi.useRealTimers());

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
