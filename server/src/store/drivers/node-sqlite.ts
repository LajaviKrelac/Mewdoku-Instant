// Owner: G4 (Phase 2e). The Node driver (dev server and tests; spec §1.2): node:sqlite's DatabaseSync behind
// D1's shape, so the tests run the SQL D1 runs. `batch` runs inside BEGIN … COMMIT (ROLLBACK and rethrow on
// any error, as D1 rolls a failed batch back) and returns per-statement rows and `meta.changes` like D1.
// Every call yields to the event loop first, so concurrent requests interleave statement by statement (as
// they do on D1) while a batch stays atomic. Node ≥ 22.13 (node:sqlite without a flag; it prints an
// ExperimentalWarning once). NEVER imported by the Worker (tsconfig.json excludes this file).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SqlBatchResult, SqlDb, SqlRunResult, SqlStatement, SqlValue } from '../sql-db';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

class NodeStatement implements SqlStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly values: readonly SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): SqlStatement {
    return new NodeStatement(this.db, this.sql, values);
  }

  /** Runs now (synchronously): the rows (empty for a write without RETURNING) and the change count. */
  execNow(): { results: unknown[]; changes: number } {
    const rows = this.db.prepare(this.sql).all(...this.values) as unknown[];
    const changes = Number((this.db.prepare('SELECT changes() AS c').get() as { c: number }).c);
    return { results: rows.map((r) => ({ ...(r as object) })), changes };
  }

  async first<T>(): Promise<T | null> {
    await tick();
    const rows = this.execNow().results;
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    await tick();
    return { results: this.execNow().results as T[] };
  }

  async run(): Promise<SqlRunResult> {
    await tick();
    return { meta: { changes: this.execNow().changes } };
  }
}

export class NodeSqliteDb implements SqlDb {
  readonly raw: DatabaseSync;

  constructor(path = ':memory:') {
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA foreign_keys = ON;');
    if (path !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL;');
  }

  prepare(sql: string): SqlStatement {
    return new NodeStatement(this.raw, sql);
  }

  async batch(stmts: SqlStatement[]): Promise<SqlBatchResult[]> {
    await tick();
    const out: SqlBatchResult[] = [];
    this.raw.exec('BEGIN');
    try {
      for (const s of stmts) {
        if (!(s instanceof NodeStatement)) throw new TypeError('batch: foreign statement');
        const r = s.execNow();
        out.push({ results: r.results, meta: { changes: r.changes } });
      }
      this.raw.exec('COMMIT');
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
    return out;
  }

  /**
   * Applies every `migrations/*.sql` not yet applied, in name order, recording each in `d1_migrations`
   * (the table wrangler uses, so a local file DB can move between the two tools).
   */
  migrate(dir: string): string[] {
    this.raw.exec(
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const done = new Set((this.raw.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map((r) => r.name));
    const applied: string[] = [];
    for (const f of readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
      if (done.has(f)) continue;
      this.raw.exec('BEGIN');
      try {
        this.raw.exec(readFileSync(join(dir, f), 'utf8'));
        this.raw.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
        this.raw.exec('COMMIT');
      } catch (err) {
        this.raw.exec('ROLLBACK');
        throw err;
      }
      applied.push(f);
    }
    return applied;
  }

  close(): void {
    this.raw.close();
  }
}
