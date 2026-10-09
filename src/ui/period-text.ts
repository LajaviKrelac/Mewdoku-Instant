// Owner: G2 (Phase 2c)
// The period copy of fish-lives-spec Appendix A.2 by PeriodKind ('day' | 'week' | 'month'): each
// helper maps the kind to its literal key with a switch (keys are typed literals, never a template
// string), so the i18n type checker sees every key and placeholder. Shared by the pills, Home, the
// victory screen, the ranking panel, the rankings hub and How to play; G1 may use them too.
import type { PeriodKind } from '../app/config';
import { formatNumber, t, tn } from '../i18n';

/** "This week: 42" (period.total.<kind>). */
export function periodTotalText(kind: PeriodKind, total: number): string {
  const n = formatNumber(total);
  switch (kind) {
    case 'day':
      return t('period.total.day', { total: n });
    case 'month':
      return t('period.total.month', { total: n });
    case 'week':
      return t('period.total.week', { total: n });
  }
}

/** "42 fish this week" (period.pill.<kind>, plural): the Home and in-game period pill's label. */
export function periodPillLabel(kind: PeriodKind, count: number): string {
  const p = { count: formatNumber(count) };
  switch (kind) {
    case 'day':
      return tn('period.pill.day', count, p);
    case 'month':
      return tn('period.pill.month', count, p);
    case 'week':
      return tn('period.pill.week', count, p);
  }
}

/** "Weekly ranking" (rank.title.period.<kind>). */
export function periodRankTitle(kind: PeriodKind): string {
  switch (kind) {
    case 'day':
      return t('rank.title.period.day');
    case 'month':
      return t('rank.title.period.month');
    case 'week':
      return t('rank.title.period.week');
  }
}

/** "This week" (rank.tab.period.<kind>): the hub tab and the records row label. */
export function periodTabLabel(kind: PeriodKind): string {
  switch (kind) {
    case 'day':
      return t('rank.tab.period.day');
    case 'month':
      return t('rank.tab.period.month');
    case 'week':
      return t('rank.tab.period.week');
  }
}

/** "Your best week" (rank.records.best.<kind>). */
export function periodBestLabel(kind: PeriodKind): string {
  switch (kind) {
    case 'day':
      return t('rank.records.best.day');
    case 'month':
      return t('rank.records.best.month');
    case 'week':
      return t('rank.records.best.week');
  }
}

/** "You kept 2 fish. Your total this week: 42." (a11y.fishKept.<kind>, plural on the fish kept). */
export function fishKeptText(kind: PeriodKind, kept: number, total: number): string {
  const p = { count: formatNumber(kept), total: formatNumber(total) };
  switch (kind) {
    case 'day':
      return tn('a11y.fishKept.day', kept, p);
    case 'month':
      return tn('a11y.fishKept.month', kept, p);
    case 'week':
      return tn('a11y.fishKept.week', kept, p);
  }
}

/** The How to play points note (howto.points.<kind>). */
export function howtoPointsText(kind: PeriodKind): string {
  switch (kind) {
    case 'day':
      return t('howto.points.day');
    case 'month':
      return t('howto.points.month');
    case 'week':
      return t('howto.points.week');
  }
}

/** "+2 fish · This week: 42" when the win added fish, else "This week: 42" (§2.6 subtitle). */
export function periodResultText(kind: PeriodKind, gained: number, total: number): string {
  const totalText = periodTotalText(kind, total);
  if (gained <= 0) return totalText;
  return tn('rank.sub.period', gained, { count: formatNumber(gained), total: totalText });
}
