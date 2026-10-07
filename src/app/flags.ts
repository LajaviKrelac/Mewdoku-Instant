// Owner: app
// Feature flags (02 §22 Phase 3 hook): ship hidden features dark. All off in Phase 2.

export type FlagId = 'autoX' | 'undo' | 'forgivingMistakes' | 'darkTheme';

export const DEFAULT_FLAGS: Readonly<Record<FlagId, boolean>> = Object.freeze({
  autoX: false,
  undo: false,
  forgivingMistakes: false,
  darkTheme: false,
});

const FLAG_IDS = Object.keys(DEFAULT_FLAGS) as FlagId[];

let overrides: Partial<Record<FlagId, boolean>> = {};

function isFlagId(name: string): name is FlagId {
  return (FLAG_IDS as string[]).indexOf(name) >= 0;
}

export function isFlagOn(id: FlagId): boolean {
  const o = overrides[id];
  return o === undefined ? DEFAULT_FLAGS[id] : o;
}

/** Dev/e2e overrides (e.g. from `?flags=undo,autoX`). Replaces earlier overrides; {} resets. */
export function setFlagOverrides(next: Partial<Record<FlagId, boolean>>): void {
  const clean: Partial<Record<FlagId, boolean>> = {};
  for (const [k, v] of Object.entries(next)) {
    if (isFlagId(k) && typeof v === 'boolean') clean[k] = v;
  }
  overrides = clean;
}

/**
 * Parses `?flags=a,b` into overrides; unknown names are ignored. A leading `-` turns a flag off
 * (`?flags=-autoX`). Accepts a full query string with or without the leading `?`.
 */
export function parseFlagParam(search: string): Partial<Record<FlagId, boolean>> {
  const out: Partial<Record<FlagId, boolean>> = {};
  const query = search.charAt(0) === '?' ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== 'flags' || eq < 0) continue;
    let value: string;
    try {
      value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    } catch {
      continue;
    }
    for (const raw of value.split(',')) {
      const name = raw.trim();
      const off = name.charAt(0) === '-';
      const id = off ? name.slice(1) : name;
      if (isFlagId(id)) out[id] = !off;
    }
  }
  return out;
}
