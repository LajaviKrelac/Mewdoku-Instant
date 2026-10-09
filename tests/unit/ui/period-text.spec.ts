// Owner: G2 (Phase 2c). The period copy by PeriodKind (fish-lives-spec Appendix A.2): every helper
// maps day / week / month to its own literal key, plural where the copy counts fish.
import { describe, expect, it } from 'vitest';
import type { PeriodKind } from '../../../src/app/config';
import {
  fishKeptText,
  howtoPointsText,
  periodBestLabel,
  periodPillLabel,
  periodRankTitle,
  periodResultText,
  periodTabLabel,
  periodTotalText,
} from '../../../src/ui/period-text';

const KINDS: readonly PeriodKind[] = ['day', 'week', 'month'];

describe('period copy (Appendix A.2)', () => {
  it('one key per kind for the total, the title, the tab and the best row', () => {
    expect(KINDS.map((k) => periodTotalText(k, 42))).toEqual(['Today: 42', 'This week: 42', 'This month: 42']);
    expect(KINDS.map(periodRankTitle)).toEqual(['Daily ranking', 'Weekly ranking', 'Monthly ranking']);
    expect(KINDS.map(periodTabLabel)).toEqual(['Today', 'This week', 'This month']);
    expect(KINDS.map(periodBestLabel)).toEqual(['Your best day', 'Your best week', 'Your best month']);
    expect(periodTotalText('week', 1240)).toBe('This week: 1,240');
  });

  it('the pill label and the kept-fish line are plurals on the fish', () => {
    expect(KINDS.map((k) => periodPillLabel(k, 1))).toEqual(['1 fish today', '1 fish this week', '1 fish this month']);
    expect(periodPillLabel('week', 1240)).toBe('1,240 fish this week');
    expect(fishKeptText('week', 2, 42)).toBe('You kept 2 fish. Your total this week: 42.');
    expect(fishKeptText('day', 1, 3)).toBe('You kept 1 fish. Your total today: 3.');
    expect(fishKeptText('month', 3, 1240)).toBe('You kept 3 fish. Your total this month: 1,240.');
  });

  it('the ranking subtitle: "+2 fish · This week: 42", or the total alone when nothing was added', () => {
    expect(periodResultText('week', 2, 42)).toBe('+2 fish · This week: 42');
    expect(periodResultText('week', 1, 1)).toBe('+1 fish · This week: 1');
    expect(periodResultText('day', 0, 7)).toBe('Today: 7');
  });

  it('How to play names the reset moment of each kind in UTC', () => {
    expect(howtoPointsText('day')).toContain('every day at 00:00 UTC');
    expect(howtoPointsText('week')).toContain('every Monday at 00:00 UTC');
    expect(howtoPointsText('month')).toContain('on the 1st of every month at 00:00 UTC');
  });
});
