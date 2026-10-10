// Owner: lead (Phase 2d.1 audit fix A-4)
// An independent reference of the kitty's rule (helpers-spec §2.3, D-2d1-2), written from the rule's words and
// NOT from src/workers/hint-chunk.ts, so a regression in the shipped picker cannot move the expectation with it.
// A cell is a candidate when it is not a cat, not Wrong, and not attacked by any cat on the board (same row,
// column or region, or touching, diagonals included). The kitty places the solution cell of the cat-less region
// with the fewest candidates; ties go to the region whose solution cell comes first in reading order.
// Used by tests/unit/workers/kitty-pick.spec.ts and the e2e (tests/e2e/smoke.spec.ts, test 24).

/** The engine's cell states the rule reads (src/engine/types CellState: 2 Cat, 3 Wrong, 4 Given). */
const CAT = 2;
const WRONG = 3;
const GIVEN = 4;

export interface KittyBoard {
  readonly n: number;
  readonly regions: ArrayLike<number>;
  /** solution[row] = the cat's column. */
  readonly solution: ArrayLike<number>;
}

export function kittyReference(p: KittyBoard, cells: ArrayLike<number>): number {
  const n = p.n;
  const isCat = (v: number | undefined): boolean => v === CAT || v === GIVEN;
  const cats: number[] = [];
  for (let i = 0; i < n * n; i++) if (isCat(cells[i])) cats.push(i);
  const attacked = (i: number): boolean =>
    cats.some((c) => {
      const [r1, c1, r2, c2] = [Math.floor(i / n), i % n, Math.floor(c / n), c % n];
      return r1 === r2 || c1 === c2 || p.regions[i] === p.regions[c] || (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1);
    });
  const count = new Map<number, number>();
  const done = new Set(cats.map((c) => p.regions[c]));
  for (let i = 0; i < n * n; i++) {
    const g = p.regions[i] as number;
    if (done.has(g) || isCat(cells[i]) || cells[i] === WRONG || attacked(i)) continue;
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = Infinity;
  for (let r = 0; r < n; r++) {
    const cell = r * n + (p.solution[r] as number);
    const g = p.regions[cell] as number;
    if (done.has(g)) continue;
    const c = count.get(g) ?? 0;
    if (c < bestCount) {
      best = cell;
      bestCount = c;
    }
  }
  if (best < 0) throw new Error('no cat-less region');
  return best;
}
