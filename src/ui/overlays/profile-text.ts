// UI batch (2026-10-13): profile — the profile sheet's words that depend on data: what unlocks a look, what is wrong
// with a typed name, and the name's tidy and clipped forms (pure but for t()/tn(); lazy `ladder` chunk).
import type { LookUnlock } from '../../game/looks';
import type { NameProblem } from '../../shared/nick-text';
import { formatNumber, t, tn } from '../../i18n';

/** What unlocks a look the player may not pick yet; null: free to pick. */
export type LookLock = Exclude<LookUnlock, { readonly kind: 'free' }> | null;

/** The limits the hints name (src/shared/nick-text.ts, passed in by the app). */
export interface NameRules {
  readonly maxChars: number;
  readonly minWidth: number;
  readonly maxDigits: number;
}

/** "Reach level 25 to unlock." / "Play 7 days in a row to unlock." / "Win a ranking reward to unlock." */
export function lockText(lock: NonNullable<LookLock>): string {
  if (lock.kind === 'level') return t('nick.lock.level', { level: formatNumber(lock.level) });
  if (lock.kind === 'streak') return tn('nick.lock.streak', lock.days);
  return t('nick.lock.prize');
}

/** The hint under the name field for a shape problem. */
export function problemText(p: NameProblem, r: NameRules): string {
  if (p === 'chars') return t('nick.rule.chars');
  if (p === 'digits') return t('nick.rule.digits', { digits: formatNumber(r.maxDigits) });
  if (p === 'link') return t('nick.rule.link');
  return t('nick.rule.length', { from: formatNumber(r.minWidth), to: formatNumber(r.maxChars) });
}

/** Trimmed, inner white space as one space (what the sheet compares and saves). */
export const tidyName = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

/** The first `max` code points (a surrogate pair is never split). */
export function clipName(raw: string, max: number): string {
  const cps = [...raw];
  return cps.length > max ? cps.slice(0, max).join('') : raw;
}
