// Owner: G4 (Phase 2e). The Worker's bindings, variables and secrets (spec §1.2, CONTRACTS §4).
import type { AppEnv } from './services';

/** Analytics Engine's dataset binding (optional counters, spec §1.14). */
export interface AnalyticsEngineLike {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface Env extends AppEnv {
  /** D1 "mewdoku-rank-<env>" (drivers/d1.ts narrows it to SqlDb). */
  readonly DB: { prepare(sql: string): unknown; batch(statements: unknown[]): Promise<unknown[]> };
  readonly METRICS?: AnalyticsEngineLike;
}

/** The parts of workerd's ExecutionContext / ScheduledController we use. */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
export interface ScheduledLike {
  readonly scheduledTime: number;
  readonly cron: string;
}
