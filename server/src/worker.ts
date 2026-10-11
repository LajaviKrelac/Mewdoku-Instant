// Owner: G4 (Phase 2e). The Cloudflare Worker "mewdoku-rank" (spec §1.1): export default { fetch, scheduled }.
// The app is built once per isolate (the solution table is split lazily, the HMAC keys imported once).
// Never imports Node: the node:sqlite driver and the dev server are separate (tsconfig.json excludes them).
import { createApp, type App } from './app';
import { d1Db } from './store/drivers/d1';
import type { Env, ExecutionContextLike, ScheduledLike } from './env';
import type { Metrics } from './services';

let cached: { env: Env; app: App } | null = null;

function metricsOf(env: Env): Metrics | undefined {
  const ds = env.METRICS;
  if (!ds) return undefined;
  return {
    count(name: string, label?: string, value = 1): void {
      try {
        ds.writeDataPoint({ blobs: [name, label ?? ''], doubles: [value], indexes: [name] });
      } catch {
        // counters never break a request
      }
    },
  };
}

function appFor(env: Env): App {
  if (cached === null || cached.env !== env) {
    const metrics = metricsOf(env);
    cached = { env, app: createApp(metrics ? { db: d1Db(env.DB), env, metrics } : { db: d1Db(env.DB), env }) };
  }
  return cached.app;
}

export default {
  fetch(req: Request, env: Env, _ctx: ExecutionContextLike): Promise<Response> {
    return appFor(env).fetch(req);
  },
  async scheduled(controller: ScheduledLike, env: Env, ctx: ExecutionContextLike): Promise<void> {
    ctx.waitUntil(appFor(env).scheduled(controller.scheduledTime, controller.cron));
  },
};
