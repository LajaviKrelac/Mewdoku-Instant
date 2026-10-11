// Owner: G4 (Phase 2e). The deploy smoke (spec §1.2 "Deploy pipeline"):
//   staging:    SMOKE_ALT_SECRET=<staging FB_APP_SECRET_ALT> npm --prefix server run smoke -- --url <staging URL>
//               → /v1/health, /v1/config, a session signed with the ALT secret (pool fb:synthetic), one win,
//                 one bracket read
//   production: npm --prefix server run smoke -- --url https://rank.<domain> --read-only
//               → /v1/health and /v1/config only: no synthetic player is ever created in production (H-1)
import { argOf, Recorder, SyntheticPlayer } from './client';

async function main(argv: readonly string[]): Promise<number> {
  const url = argOf(argv, '--url');
  const readOnly = argv.includes('--read-only');
  const secret = process.env.SMOKE_ALT_SECRET ?? '';
  if (!url || (!readOnly && !secret)) {
    console.error('smoke: --url <base URL> and, unless --read-only, SMOKE_ALT_SECRET (staging FB_APP_SECRET_ALT)');
    return 2;
  }
  const rec = new Recorder();
  const p = new SyntheticPlayer(url, secret, `smoke-${Date.now().toString(36)}`, rec);
  const steps: [string, () => Promise<number | boolean>][] = [
    ['health', () => p.health()],
    ['config', () => p.config()],
  ];
  if (!readOnly) {
    steps.push(['session', () => p.signIn()], ['win', () => p.wins(1)], ['bracket', () => p.bracket()]);
  }
  let ok = true;
  for (const [name, run] of steps) {
    const r = await run();
    const good = r === true || r === 200;
    ok &&= good;
    console.log(`smoke: ${name.padEnd(8)} ${good ? 'ok' : `FAILED (${String(r)})`}`);
    if (!good) break;
  }
  return ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
