// Owner: G4 (Phase 2e). The Worker entry (spec §1.1): `export default { fetch, scheduled }` over a D1-shaped
// binding (here the node:sqlite shim, which has D1's shape), the per-isolate app cache, Analytics Engine
// counters; and the Worker's import graph never reaches Node (node:*, the node:sqlite driver, dev/).
// Running these specs inside workerd (@cloudflare/vitest-pool-workers) is the optional CI layer of §10.2.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../src/contract/words';
import { rivalAt, rivalNames, rivalRoster } from '../../src/core/rivals';
import { liveRivals } from '../../src/core/table';
import worker from '../../src/worker';
import type { Env } from '../../src/env';
import { NodeSqliteDb } from '../../src/store/drivers/node-sqlite';
import { MIGRATIONS, SERVER_DIR, TEST_ENV } from '../helpers/harness';

function env(over: Partial<Env> = {}): Env & { points: unknown[] } {
  const db = new NodeSqliteDb(':memory:');
  db.migrate(MIGRATIONS);
  const points: unknown[] = [];
  return { ...TEST_ENV, DB: db as unknown as Env['DB'], METRICS: { writeDataPoint: (p) => void points.push(p) }, points, ...over } as Env & { points: unknown[] };
}
const ctx = { waitUntil: (p: Promise<unknown>): void => void p.catch(() => undefined) };

describe('worker entry', () => {
  it('fetch answers through the app; counters go to Analytics Engine; one app per env', async () => {
    const e = env();
    const r = await worker.fetch(new Request('https://rank.example.com/v1/health'), e, ctx);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { db: string }).db).toBe('ok');
    expect(e.points.length).toBeGreaterThan(0);
    expect(JSON.stringify(e.points)).not.toMatch(/\d+\.\d+\.\d+\.\d+/); // no IP in a counter
    const nonce = await worker.fetch(new Request('https://rank.example.com/v1/session/nonce', { method: 'POST' }), e, ctx);
    expect(nonce.status).toBe(200);
  });

  it('dev routes stay closed on a non-loopback host even with DEV_ROUTES=true', async () => {
    const r = await worker.fetch(new Request('https://rank.example.com/dev/reset', { method: 'POST', body: '{"devPool":"x"}' }), env(), ctx);
    expect(r.status).toBe(404);
  });

  it('scheduled: the hourly trigger finalises and purges; the 03:47 trigger only sweeps', async () => {
    const e = env();
    const run = async (cron: string, at: string): Promise<{ finalized: number; swept: unknown; stats: boolean }> => {
      let waited: Promise<unknown> | null = null;
      await worker.scheduled({ scheduledTime: Date.parse(at), cron }, e, { waitUntil: (p) => void (waited = p) });
      return (await (waited as unknown as Promise<unknown>)) as { finalized: number; swept: unknown; stats: boolean };
    };
    const hourly = await run('17 * * * *', '2026-11-16T03:17:00Z');
    expect(hourly.swept).toBeNull();
    expect(hourly.stats).toBe(true);
    const daily = await run('47 3 * * *', '2026-11-16T03:47:00Z');
    expect(daily.swept).not.toBeNull();
    expect(daily.stats).toBe(false);
  });
});

describe('computer rivals in the Worker (2026-10-12, D-2e-24)', () => {
  it('migrations 0003 and 0004 are applied: brackets.rivals, final_rivals, final_real, deleted_joins (2026-10-12, r2)', () => {
    const db = new NodeSqliteDb(':memory:');
    db.migrate(MIGRATIONS);
    const cols = (db.raw.prepare('PRAGMA table_info(brackets)').all() as { name: string; type: string }[]).map((c) => `${c.name}:${c.type}`);
    expect(cols).toEqual(expect.arrayContaining(['rivals:TEXT', 'final_rivals:TEXT', 'final_real:INTEGER', 'deleted_joins:TEXT']));
  });

  it('the r1 golden fixture (design §3.8) computes the same here: run inside workerd, this proves workerd and Node agree', () => {
    const O = Date.parse('2026-10-12T08:00:00Z');
    const b = { opened_at: O, join_until: O + 2 * 3_600_000, ends_at: O + 86_400_000, max_members: 50 };
    const r = rivalRoster('r1:k3j9x0a1b20a:100:64:64', b);
    expect(r && [r.size, r.rivals.length, r.sigma, r.quiet, r.cohort]).toEqual([50, 49, 105, false, 10]);
    const x = r!.rivals[0]!;
    expect([x.base, x.pace, x.wins.length, x.hearts.length]).toEqual([3, 16, 14, 8]);
    expect(rivalAt(x, b.join_until, O + 23 * 3_600_000)).toMatchObject({ points: 42, hearts: 8 });
    expect(rivalAt(x, b.join_until, O + 3_600_000)).toEqual({ points: 4, scoredAt: O + 37.5 * 60_000, hearts: 0 });
    const names = rivalNames(r!, new Set(['velvet pounce 27']), NICK_WORDS_V1, RETIRED_V1);
    expect([names.get(9000), names.get(9048)]).toEqual([
      { nickname: 'Calm Pumpkin 6', avatar: 6 },
      { nickname: 'Brave Noodle 85', avatar: 4 },
    ]);
  });

  // 2026-10-12, r2: the r2 golden (test/unit/rivals.spec.ts section 12) here too, with its replay of the real joins.
  it('the r2 golden fixture computes the same here, its replay of the real joins included', () => {
    const O = Date.parse('2026-10-12T08:00:00Z');
    const b = { opened_at: O, join_until: O + 2 * 3_600_000, ends_at: O + 86_400_000, max_members: 50, next_slot: 5, deleted_joins: null };
    const r = rivalRoster('r2:k3j9x0a1b20a:100:64:64', b);
    expect(r && [r.preset, r.size, r.rivals.length, r.sigma, r.quiet, r.cohort]).toEqual(['r2', 50, 49, 105, false, 10]);
    const x = r!.rivals[0]!;
    expect([x.base, x.pace, x.winsPerDay, x.wins.map((w) => [w.t - O, w.f])]).toEqual([3, 0, 4, [[1352208, 3], [1438563, 3], [24549372, 2]]]);
    expect(rivalAt(x, b.join_until, O + 3_600_000)).toEqual({ points: 9, scoredAt: O + 1438563, hearts: 0 });
    expect(r!.rivals[48]!.arrivalAt - O).toBe(6888901);
    const joined = [0, 30, 60, 100, 119].map((m, slot) => ({ slot, joined_at: O + m * 60_000 }));
    expect(liveRivals(r!, b, joined).retired.map((q) => [q.script.slot, q.at === null ? null : (q.at - O) / 60_000])).toEqual([[9026, 119], [9046, 100], [9047, 60], [9048, 30]]);
    // 2026-10-12, r2 (review fix): slot 4 deleted, its join time kept in deleted_joins: the same replay
    const kept = { ...b, deleted_joins: `4:${O + 119 * 60_000}` };
    expect(liveRivals(r!, kept, joined.slice(0, 4)).retired.map((q) => [q.script.slot, q.at === null ? null : (q.at - O) / 60_000])).toEqual([[9026, 119], [9046, 100], [9047, 60], [9048, 30]]);
  });

  it('RIVALS=on through the Worker entry: a session carries the disclosure line', async () => {
    const e = env({ RIVALS: 'on' });
    const nonce = await worker.fetch(new Request('https://rank.example.com/v1/session/nonce', { method: 'POST' }), e, ctx);
    expect(nonce.status).toBe(200);
    const web = await worker.fetch(
      new Request('https://rank.example.com/v1/session', {
        method: 'POST',
        body: JSON.stringify({ platform: 'web', device: { id: 'A'.repeat(22), secret: 'B'.repeat(43) }, clientVersion: '0.2.0', contentVersion: 'content-bb8a756dfaf9' }),
      }),
      e,
      ctx,
    );
    expect(web.status).toBe(200);
    expect(((await web.json()) as { rules: { computerPlayers?: boolean } }).rules.computerPlayers).toBe(true);
  });
});

describe('the Worker bundle never imports Node', () => {
  it('walks every relative import from src/worker.ts', () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
        const spec = m[1] as string;
        if (/^\s*(import|export)\s+type\s/.test(m[0])) continue;
        if (spec.startsWith('node:') || !spec.startsWith('.')) {
          bad.push(`${file.slice(SERVER_DIR.length)} → ${spec}`);
          continue;
        }
        const target = resolve(dirname(file), spec);
        visit(target.endsWith('.ts') ? target : existsSync(`${target}.ts`) ? `${target}.ts` : join(target, 'index.ts'));
      }
    };
    visit(join(SERVER_DIR, 'src', 'worker.ts'));
    expect(bad).toEqual([]);
    const files = [...seen].map((f) => f.slice(SERVER_DIR.length));
    expect(files.some((f) => f.includes('node-sqlite'))).toBe(false);
    expect(files.some((f) => f.includes('/dev/'))).toBe(false);
    expect(files).toContain('/src/content/generated/solutions.ts');
    expect([...seen].some((f) => f.endsWith('/src/shared/rank-api.ts'))).toBe(true);
  });
});
