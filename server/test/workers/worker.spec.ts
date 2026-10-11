// Owner: G4 (Phase 2e). The Worker entry (spec §1.1): `export default { fetch, scheduled }` over a D1-shaped
// binding (here the node:sqlite shim, which has D1's shape), the per-isolate app cache, Analytics Engine
// counters; and the Worker's import graph never reaches Node (node:*, the node:sqlite driver, dev/).
// Running these specs inside workerd (@cloudflare/vitest-pool-workers) is the optional CI layer of §10.2.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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
