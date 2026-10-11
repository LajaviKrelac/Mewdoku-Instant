// Owner: G4 (Phase 2e). D1's own minimal shape (CONTRACTS §4): what SqlStore needs from a database. D1's
// binding satisfies it as is (drivers/d1.ts); the node:sqlite shim implements it for dev and tests
// (drivers/node-sqlite.ts), and a Postgres driver would rewrite `?` → `$n`. `batch` is ONE atomic
// transaction (D1 has no interactive transactions): every read-modify-write is a set of guarded statements.

export type SqlValue = string | number | null;

export interface SqlRunResult {
  readonly meta: { readonly changes: number };
}

export interface SqlBatchResult {
  /** Rows of a SELECT or of a statement with RETURNING (D1 returns them per statement too). */
  readonly results?: readonly unknown[];
  readonly meta: { readonly changes: number };
}

export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<SqlRunResult>;
}

export interface SqlDb {
  prepare(sql: string): SqlStatement;
  /** One transaction: all statements or none (a failure rolls the batch back and rejects). */
  batch(stmts: SqlStatement[]): Promise<SqlBatchResult[]>;
}
