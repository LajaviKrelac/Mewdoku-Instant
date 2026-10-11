// Owner: lead (Phase 2e L0; spec §1.1 "Root integration", §8.2 item 1). The root `npm run verify` step for the
// ranking server: `npm --prefix server run verify` (G4's own typecheck and tests, spec §1.2), guarded so the root
// verify stays green and says what to run when the server cannot be checked here:
//   - no server/package.json (before G4's S0 scaffold)  → a note, exit 0
//   - no server/node_modules (its dev dependencies are not installed in this checkout) → what to run, exit 0
//   - otherwise → runs it and exits with its code
// `--strict` (CI, a release) turns both skips into failures, so a pipeline cannot pass without the server.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type ServerVerifyStep = { readonly kind: 'run' } | { readonly kind: 'skip'; readonly message: string };

export const SERVER_VERIFY_CMD = 'npm --prefix server run verify';

/** What the root verify does about server/ in the checkout at `root`. */
export function serverVerifyStep(root: string, exists: (p: string) => boolean = existsSync): ServerVerifyStep {
  if (!exists(join(root, 'server', 'package.json'))) {
    return { kind: 'skip', message: 'verify:server: no server/ package yet (Phase 2e G4 adds it): nothing to verify.' };
  }
  if (!exists(join(root, 'server', 'node_modules'))) {
    return {
      kind: 'skip',
      message:
        'verify:server: server/node_modules is missing, so the ranking server was NOT verified. ' +
        `Run \`npm --prefix server ci\`, then \`${SERVER_VERIFY_CMD}\` (or \`npm run verify\` again).`,
    };
  }
  return { kind: 'run' };
}

export function main(argv: readonly string[]): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const strict = argv.includes('--strict');
  const step = serverVerifyStep(root);
  if (step.kind === 'skip') {
    (strict ? console.error : console.log)(step.message + (strict ? ' (--strict: failing)' : ''));
    return strict ? 1 : 0;
  }
  const r = spawnSync('npm', ['--prefix', 'server', 'run', 'verify'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.error) {
    console.error(`verify:server: could not run \`${SERVER_VERIFY_CMD}\`: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
