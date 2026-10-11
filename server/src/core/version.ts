// Owner: G4 (Phase 2e). MIN_CLIENT_VERSION (spec §1.4): numeric dot versions; a pre-release or build
// suffix compares as its release ("0.2.0-test" = "0.2.0"); anything unparsable counts as 0.0.0.
function parts(v: string): [number, number, number] {
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?/.exec(v.trim());
  if (!m) return [0, 0, 0];
  return [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** −1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] as number) !== (y[i] as number)) return (x[i] as number) < (y[i] as number) ? -1 : 1;
  }
  return 0;
}

export function isBelowMin(version: string, min: string): boolean {
  return compareVersions(version, min) < 0;
}
