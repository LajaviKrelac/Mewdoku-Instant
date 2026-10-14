// Owner: lead (2026-10-12)
// Clock-style countdown text shared by Home's daily tab (first load) and the Home ranking chip (hud/ladder-chip.ts,
// the lazy overlay chunk). Moved out of screens/home-screen.ts (which re-exports it) so the chip does not import a
// screen; no i18n: digits and colons only (callers give the element the .num class: Latin digits, read left to right).

/** A countdown as "07:48:12" (hours, minutes, seconds, zero-padded; clamps at 0). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${p2(Math.floor(total / 3600))}:${p2(Math.floor((total % 3600) / 60))}:${p2(total % 60)}`;
}
