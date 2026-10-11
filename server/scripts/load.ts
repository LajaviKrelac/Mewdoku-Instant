// Owner: G4 (Phase 2e). The load test (spec §10.4), run by hand before launch AGAINST STAGING:
//   LOAD_ALT_SECRET=<staging's FB_APP_SECRET_ALT> npm --prefix server run load -- \
//       --url https://mewdoku-rank-staging.<account>.workers.dev [--rps 30] [--seconds 300] [--players 300]
// Synthetic players only (FB_APP_SECRET_ALT → pool `fb:synthetic`; never the live app secret, never real
// players' brackets, H-1; a production Worker refuses the ALT secret). Mix per spec §10.4: sessions, wins in
// batches, bracket reads, hearts, claims. Prints p50 / p95 per route and the error rate, and checks the pass
// line: p95 < 800 ms for /v1/wins and errors < 0.5 %. Rows read / written per request and CPU per request
// come from the Cloudflare dashboard for the same window (Workers → mewdoku-rank-staging → Metrics; D1 →
// mewdoku-rank-staging → Metrics): the pass line there is ≤ 5 rows written per win and no CPU-limit errors.
// `--self-test` runs a few seconds against an in-process Node dev server instead (no account needed).
import { startDevServer } from '../dev/serve';
import { argOf, Recorder, SyntheticPlayer } from './client';

async function main(argv: readonly string[]): Promise<number> {
  const selfTest = argv.includes('--self-test');
  const rps = Number(argOf(argv, '--rps') ?? (selfTest ? 20 : 30));
  const seconds = Number(argOf(argv, '--seconds') ?? (selfTest ? 5 : 300));
  const nPlayers = Number(argOf(argv, '--players') ?? (selfTest ? 30 : 300));
  let url = argOf(argv, '--url');
  let secret = process.env.LOAD_ALT_SECRET ?? '';
  let stop: (() => Promise<void>) | null = null;
  if (selfTest) {
    const port = Number(argOf(argv, '--port') ?? 8799);
    secret = 'mewdoku-load-self-test-alt-secret-0001';
    const srv = await startDevServer({
      port,
      host: '127.0.0.1',
      db: ':memory:',
      quiet: true,
      env: {
        FB_APP_SECRET: 'unused-live-secret-in-self-test',
        FB_APP_SECRET_ALT: secret,
        SESSION_SECRET: 'self-test-session-secret',
        ID_PEPPER: 'self-test-pepper',
        ADMIN_KEY: 'self-test-admin-key-0123456789abcdef0123456789',
        DEPLOY_ENV: 'staging',
        WEB_MODE: 'anon',
        CONFIG_OVERRIDES: JSON.stringify({ rateLimits: Object.fromEntries(['wins', 'bracket', 'hearts', 'profile', 'claims', 'session', 'me', 'admin'].map((b) => [b, { n: 1e6, perMs: 60_000 }])) }),
      },
    });
    url = srv.url;
    stop = srv.close;
  }
  if (!url || !secret) {
    console.error('load: --url <staging base URL> and LOAD_ALT_SECRET (staging FB_APP_SECRET_ALT) are required (or --self-test)');
    return 2;
  }
  if (/rank\.(?!.*staging)/.test(url) && !argv.includes('--yes-this-is-not-production')) {
    console.error(`load: ${url} looks like a production host; the load test runs against staging only`);
    return 2;
  }
  const rec = new Recorder();
  const runTag = Date.now().toString(36);
  const players = Array.from({ length: nPlayers }, (_, i) => new SyntheticPlayer(url as string, secret, `load-${runTag}-${i}`, rec));
  console.log(`load: ${url}, ${rps} req/s for ${seconds} s, ${nPlayers} synthetic players (pool fb:synthetic)`);
  // Sign everyone in first (spread over the first seconds), then the steady mix.
  const signed: SyntheticPlayer[] = [];
  for (const p of players) {
    if (await p.signIn()) signed.push(p);
  }
  if (signed.length === 0) {
    console.error('load: no session could be made (wrong LOAD_ALT_SECRET, or the Worker refuses the ALT secret)');
    await stop?.();
    return 1;
  }
  const end = Date.now() + seconds * 1000;
  const inflight = new Set<Promise<unknown>>();
  let i = 0;
  while (Date.now() < end) {
    const p = signed[i++ % signed.length] as SyntheticPlayer;
    const roll = Math.random();
    const job =
      roll < 0.45 ? p.wins(1 + Math.floor(Math.random() * 3)) : roll < 0.75 ? p.bracket() : roll < 0.85 ? p.heart() : roll < 0.9 ? p.claim() : roll < 0.95 ? p.signIn() : p.config();
    inflight.add(job);
    void job.finally(() => inflight.delete(job));
    await new Promise((r) => setTimeout(r, 1000 / rps));
  }
  await Promise.all(inflight);
  await stop?.();
  const rows = rec.summary();
  console.table(rows);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const errors = rows.reduce((s, r) => s + r.errors, 0);
  const winsP95 = rows.find((r) => r.route === 'wins')?.p95 ?? 0;
  const errorRate = total === 0 ? 1 : errors / total;
  const pass = winsP95 < 800 && errorRate < 0.005;
  console.log(`load: ${total} requests, error rate ${(errorRate * 100).toFixed(2)} %, /v1/wins p95 ${winsP95.toFixed(0)} ms → ${pass ? 'PASS' : 'FAIL'} (p95 < 800 ms, errors < 0.5 %)`);
  console.log('load: read rows read/written per request and CPU per request for this window in the Cloudflare dashboard (pass: ≤ 5 rows written per win, no CPU-limit errors).');
  return pass ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
