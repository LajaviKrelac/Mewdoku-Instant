// Owner: G4 (Phase 2e). The hourly cron (wrangler `17 * * * *`; spec §1.1, §1.10, §1.14): finalise due
// brackets (≤ cron.finalizePerRun per run: Free's 50 queries per invocation), purge used nonces, roll up the
// day's stats; the retention sweep runs once a day in its own trigger (RETENTION_CRON). Every read is by index range.
import { DAY, HOUR, utcDateKey, utcDayStart } from './core/clock';
import { randomBase36 } from './core/crypto';
import type { Services } from './services';
import { finalizeIfDue } from './handlers/views';

export interface CronReport {
  readonly finalized: number;
  readonly noncesPurged: number;
  readonly swept: Record<string, number> | null;
  readonly stats: boolean;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;
}

/**
 * The retention sweep's own trigger (wrangler.toml): the hourly run finalises up to `cron.finalizePerRun`
 * brackets (≈ 6 statements each: 45 in all for six full brackets) and the sweep needs up to 44, so on Workers
 * Free (50 queries per invocation) they run in separate invocations (measured in test/http/budget.spec.ts).
 */
export const RETENTION_CRON = '47 3 * * *';

export interface CronOptions {
  /** Default: the run whose UTC hour is cron.retentionHourUtc (tests and the Node dev server). */
  readonly retention?: boolean;
  readonly finalize?: boolean;
  readonly stats?: boolean;
  /** Dev routes: one test pool only. */
  readonly pools?: readonly string[];
}

/** What a Worker cron trigger runs: the daily sweep alone, or the hourly finalise / purge / stats. */
export function cronOptionsFor(cron: string | undefined): CronOptions {
  if (cron === undefined) return {};
  return cron === RETENTION_CRON ? { retention: true, finalize: false, stats: false } : { retention: false };
}

export async function runCron(s: Services, now: number, opts: CronOptions = {}): Promise<CronReport> {
  let finalized = 0;
  if (opts.finalize !== false) {
    const due = await s.store.dueBrackets(now - s.cfg.bracket.finalizeGraceMs, s.cfg.cron.finalizePerRun, opts.pools ?? null);
    for (const id of due) if (await finalizeIfDue(s, id, now)) finalized++;
  }
  // Nonces live in real time (a dev pool's moved clock never purges a live one early).
  const noncesPurged = await s.store.purgeNonces(Math.min(now, s.clock.now()));

  // Stats rollup: the last hour's wins and flags are added; DAU and the members-per-bracket spread of
  // brackets ended today are set (each read by index range; critic C-18). The watermark `stats_at` ("<ms>:<nonce>")
  // moves in the same batch as the sums, guarded by the value read here, so overlapping runs never add twice
  // (audit A-S6).
  let stats = false;
  if (opts.stats !== false) {
    try {
      const prev = await s.store.getMeta('stats_at');
      const lastAt = prev === null ? Number.NaN : Number(prev.split(':')[0]);
      const last = Number.isFinite(lastAt) ? lastAt : now - HOUR;
      const from = Math.max(last, now - 2 * HOUR);
      const day = utcDateKey(now);
      const w = await s.store.statsWindow(from, now, utcDayStart(now));
      const add: Record<string, number> = {};
      for (const r of w.winsByVerdict) add[`wins_${r.verdict}`] = Number(r.n);
      for (const r of w.flagsByKind) add[`flags_${r.kind}`] = Number(r.n);
      const sizes = w.endedToday.map((b) => b.final_members ?? b.members).sort((a, b) => a - b);
      stats = await s.store.writeStats(
        day,
        add,
        {
          dau: w.dau,
          brackets_ended: sizes.length,
          members_p10: percentile(sizes, 10),
          members_p50: percentile(sizes, 50),
          members_p90: percentile(sizes, 90),
        },
        { k: 'stats_at', prev, next: `${now}:${randomBase36(s.rng, 8)}` },
      );
      if (!stats) s.log({ level: 'info', msg: 'stats rollup skipped: another run moved the watermark first' });
    } catch (err) {
      s.log({ level: 'error', msg: 'stats rollup failed', err: err instanceof Error ? err.message : String(err) });
    }
  }

  let swept: Record<string, number> | null = null;
  const runRetention = opts.retention ?? new Date(now).getUTCHours() === s.cfg.cron.retentionHourUtc;
  if (runRetention) {
    const r = s.cfg.retention;
    swept = await s.store.sweep(
      {
        winsBefore: now - r.winsDays * DAY,
        bracketsEndedBefore: now - r.bracketsDays * DAY,
        rewardsExpiredBefore: now - r.rewardsDays * DAY,
        flagsBefore: now - r.flagsDays * DAY,
        playersSeenBefore: now - r.inactivePlayerDays * DAY,
        tombstonesBefore: now,
        adminLogBefore: now - r.adminLogDays * DAY,
        ipQuotaDayBefore: utcDateKey(now - (r.ipQuotaDays - 1) * DAY),
        statsDayBefore: utcDateKey(now - r.statsDays * DAY),
        tombstoneUntil: now + r.tombstoneDays * DAY,
        // UI batch (victory): daily ids are 'D' + the date key, so this is every daily older than keepDays.
        dailyTimesBefore: `D${utcDateKey(now - s.cfg.dailyStats.keepDays * DAY)}`,
      },
      s.cfg.cron.sweepChunk,
      s.cfg.cron.sweepChunksPerRun,
    );
  }
  const report: CronReport = { finalized, noncesPurged, swept, stats };
  s.log({ t: now, route: 'cron', ...report });
  return report;
}
