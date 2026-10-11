// Owner: lead (Phase 2e I-4, spec §7.9's rule: "the strip and the chip move to the core lazy chunk (Home renders
// the period pill until it lands)"). Home's ranking chip and streak strip are created by factories that arrive with
// the lazy overlay chunk (app/overlay-chunk.ts calls provideHomeExtras at load, right after the first screen). Until
// then Home shows the period pill in the lead slot and keeps the strip's row reserved; a mounted Home re-renders the
// moment they land. Type-only imports: nothing of the chip or the strip is in the first load.
import type { createLadderChip } from '../hud/ladder-chip';
import type { createStreakStrip } from '../hud/streak-strip';

export interface HomeExtras {
  readonly createLadderChip: typeof createLadderChip;
  readonly createStreakStrip: typeof createStreakStrip;
}

let extras: HomeExtras | null = null;
const waiters = new Set<() => void>();

/** The chip and strip factories once the overlay chunk has loaded, else null. */
export function homeExtras(): HomeExtras | null {
  return extras;
}

/** Called once by the overlay chunk; wakes every mounted Home that is waiting. */
export function provideHomeExtras(x: HomeExtras): void {
  extras = x;
  const ready = Array.from(waiters);
  waiters.clear();
  for (const fn of ready) fn();
}

/** Runs `fn` once the factories are there (at once when they are); returns an unsubscribe. */
export function whenHomeExtras(fn: () => void): () => void {
  if (extras) {
    fn();
    return () => undefined;
  }
  waiters.add(fn);
  return () => void waiters.delete(fn);
}
