// Owner: G4 (Phase 2e). Name moderation (spec §1.8): skeletons and the blocklist check. PURE.
import { BLOCKLIST } from '../moderation/blocklist';

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** Lowercase; 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s; non-letters stripped; repeated letters collapsed. */
export function skeleton(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFKC').toLowerCase()) {
    const c = LEET[ch] ?? ch;
    if (!/\p{L}/u.test(c)) continue;
    if (out.endsWith(c)) continue;
    out += c;
  }
  return out;
}

/** The words of a name (split on anything that is not a letter, a digit or a leet sign). */
function words(s: string): string[] {
  return s
    .split(/[^\p{L}\p{N}@$]+/u)
    .map(skeleton)
    .filter((w) => w.length > 0);
}

export interface Blocklist {
  readonly strong: readonly string[];
  readonly ambiguous: readonly string[];
}

/** Pre-skeletonised once per isolate. */
function prepared(list: Blocklist): { strong: string[]; ambiguous: Set<string> } {
  return { strong: list.strong.map(skeleton).filter((x) => x.length >= 3), ambiguous: new Set(list.ambiguous.map(skeleton).filter((x) => x.length > 0)) };
}

const DEFAULT = prepared(BLOCKLIST);

/** The first blocked term the text contains (strong: anywhere in the skeleton; ambiguous: a whole word), or null. */
export function blockedTerm(text: string, list: Blocklist | null = null): string | null {
  const p = list === null ? DEFAULT : prepared(list);
  const whole = skeleton(text);
  for (const t of p.strong) if (whole.includes(t)) return t;
  for (const w of words(text)) if (p.ambiguous.has(w)) return w;
  return null;
}

export function isBlocked(text: string, list: Blocklist | null = null): boolean {
  return blockedTerm(text, list) !== null;
}
