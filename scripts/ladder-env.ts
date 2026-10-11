// Owner: lead (Phase 2e L0). Which ranking-server build values reach the bundle (spec §7.3, §2.11, D-2e-5,
// D-2e-20). vite.config.ts calls ladderEnv() with the mode and the loaded env (`.env*` files and the
// process environment) and defines import.meta.env.VITE_LADDER_URL / VITE_LADDER_WEB from the result, so the
// client only ever sees a clean value or `undefined`:
//   VITE_LADDER_URL  the API base, trimmed and without a trailing slash; a value that is not an http(s) URL
//                    (or carries credentials, a query or a fragment) is dropped with a warning. Empty = off:
//                    no ladder, every surface shows the personal records (never a broken build).
//   VITE_LADDER_WEB  'off' | 'anon', overriding cfg.ladder.web in dev, e2e and staging builds only. Release
//                    builds never get it (web-prod never calls the ranking server: there cfg.ladder.web, 'off'
//                    by default, decides; switching the web on in production is a config.ts change, D-2e-5).
//                    Any other value is dropped with a warning.
// The release check of spec §10.6 #6 (a release build whose VITE_LADDER_URL points at staging or workers.dev
// fails) is a separate lead item in zip-fbig.ts / size-check.ts.
import { isReleaseMode } from './locale-loaders.ts';

export type LadderWeb = 'off' | 'anon';

export interface LadderEnv {
  /** The API base as the client sees it; undefined = no ladder in this build. */
  readonly url: string | undefined;
  /** The override of cfg.ladder.web; undefined = no override. */
  readonly web: LadderWeb | undefined;
  /** One line per dropped or ignored value (vite.config.ts prints them). */
  readonly warnings: readonly string[];
}

/** The API base from a raw VITE_LADDER_URL, or null when it is not a usable http(s) base. '' → undefined. */
export function ladderUrl(raw: string | undefined): string | undefined | null {
  const v = (raw ?? '').trim();
  if (v === '') return undefined;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export function ladderEnv(mode: string, env: Readonly<Record<string, string | undefined>>): LadderEnv {
  const warnings: string[] = [];
  const url = ladderUrl(env.VITE_LADDER_URL);
  if (url === null) {
    warnings.push(
      `VITE_LADDER_URL ${JSON.stringify(env.VITE_LADDER_URL)} is not an http(s) API base (no credentials, query or fragment): this build has no ladder (personal records)`,
    );
  }
  const rawWeb = (env.VITE_LADDER_WEB ?? '').trim();
  let web: LadderWeb | undefined;
  if (rawWeb === 'off' || rawWeb === 'anon') {
    if (isReleaseMode(mode)) {
      if (rawWeb === 'anon') warnings.push(`VITE_LADDER_WEB=anon is ignored in the ${mode} build: web-prod never calls the ranking server (cfg.ladder.web decides)`);
    } else web = rawWeb;
  } else if (rawWeb !== '') {
    warnings.push(`VITE_LADDER_WEB ${JSON.stringify(rawWeb)} is not 'off' or 'anon': ignored (cfg.ladder.web decides)`);
  }
  return { url: url ?? undefined, web, warnings };
}

/** The `define` entries for vite.config.ts: a JSON string, or the expression `undefined` when not given. */
export function ladderDefine(le: LadderEnv): Record<string, string> {
  return {
    'import.meta.env.VITE_LADDER_URL': le.url === undefined ? 'undefined' : JSON.stringify(le.url),
    'import.meta.env.VITE_LADDER_WEB': le.web === undefined ? 'undefined' : JSON.stringify(le.web),
  };
}
