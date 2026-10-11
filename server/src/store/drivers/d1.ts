// Owner: G4 (Phase 2e). The production driver: Cloudflare D1's binding already has SqlDb's shape (prepare /
// bind / first / all / run, and batch = one atomic transaction with per-statement results and
// meta.changes), so this only narrows the type. Kept as a module so a later wrapper (timing, retries on
// D1's transient errors) has one place to live.
import type { SqlDb } from '../sql-db';

/** The parts of D1Database we use (structural: the real binding passes, a test double can too). */
export interface D1Like {
  prepare(sql: string): unknown;
  batch(statements: unknown[]): Promise<unknown[]>;
}

export function d1Db(binding: D1Like): SqlDb {
  return binding as unknown as SqlDb;
}
