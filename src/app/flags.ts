// Owner: app
// Feature flags (02 §22 Phase 3 hook): ship hidden features dark. All off in Phase 2.

export type FlagId = 'autoX' | 'undo' | 'forgivingMistakes' | 'darkTheme';

export const DEFAULT_FLAGS: Readonly<Record<FlagId, boolean>> = Object.freeze({
  autoX: false,
  undo: false,
  forgivingMistakes: false,
  darkTheme: false,
});

export function isFlagOn(id: FlagId): boolean {
  throw new Error('not implemented: isFlagOn');
}

/** Dev/e2e overrides (e.g. from `?flags=undo,autoX`). */
export function setFlagOverrides(overrides: Partial<Record<FlagId, boolean>>): void {
  throw new Error('not implemented: setFlagOverrides');
}

/** Parses `?flags=a,b` into overrides; unknown names are ignored. */
export function parseFlagParam(search: string): Partial<Record<FlagId, boolean>> {
  throw new Error('not implemented: parseFlagParam');
}
