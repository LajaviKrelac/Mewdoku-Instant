// Owner: G4 (Phase 2e). Deploy safety (spec §1.2, §10.5 #1, #2): wrangler.toml's production section can
// never run dev routes, the anonymous pool or invocation logs; no secret is committed; the staging and
// production configs load as intended.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config';
import { RETENTION_CRON } from '../../src/cron';
import { SERVER_DIR } from '../helpers/harness';

const TOML = readFileSync(join(SERVER_DIR, 'wrangler.toml'), 'utf8');

/** `KEY = "value"` lines of one `[table]` (enough for our own file; no TOML library: zero dependencies). */
function table(name: string): Record<string, string> {
  const lines = TOML.split('\n');
  const start = lines.findIndex((l) => l.trim() === `[${name}]`);
  if (start < 0) return {};
  const out: Record<string, string> = {};
  for (let i = start + 1; i < lines.length; i++) {
    const l = (lines[i] as string).trim();
    if (l.startsWith('[')) break;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*(#.*)?$/.exec(l);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^"(.*)"$/, '$1');
  }
  return out;
}

describe('wrangler.toml', () => {
  it('production: no dev routes, records on the web, its own DEPLOY_ENV, https origins only', () => {
    const v = table('env.production.vars');
    expect(v.DEV_ROUTES).toBe('false');
    expect(v.WEB_MODE).toBe('records');
    expect(v.DEPLOY_ENV).toBe('production');
    expect(v.RANKING_ENABLED).toBe('true');
    for (const o of (v.ALLOWED_ORIGINS ?? '').split(',')) expect(o.trim(), o).toMatch(/^(https:\/\/|null$)/);
    expect(v.ALLOWED_ORIGINS).not.toMatch(/(^|,)\s*\*\s*(,|$)/);
    const { cfg } = loadConfig(v);
    expect(cfg.devRoutes).toBe(false);
    expect(cfg.web.mode).toBe('records');
    expect(cfg.deployEnv).toBe('production');
    expect(table('env.production').workers_dev).toBe('false');
  });

  it('[D-2e-24] every environment declares RIVALS: off locally and in production (until rollout step 4), on in staging', () => {
    expect(table('vars').RIVALS).toBe('off');
    expect(table('env.staging.vars').RIVALS).toBe('on');
    expect(table('env.production.vars').RIVALS).toBe('off');
    expect(loadConfig(table('env.production.vars')).cfg.rivals.enabled).toBe(false);
    expect(loadConfig(table('env.production.vars')).problems).toEqual([]);
    expect(loadConfig(table('env.staging.vars')).cfg.rivals.enabled).toBe(true);
    expect(loadConfig({ ...table('env.production.vars'), RIVALS: 'on' }).cfg.rivals.enabled).toBe(true); // the rollout flip
  });

  it('staging and dev: DEV_ROUTES stays off on every deployed Worker', () => {
    expect(table('env.staging.vars').DEV_ROUTES).toBe('false');
    expect(table('env.staging.vars').DEPLOY_ENV).toBe('staging');
    expect(table('vars').DEV_ROUTES).toBe('false');
  });

  it('Cloudflare invocation logs are off; the hourly cron runs at :17, the sweep alone at 03:47 UTC', () => {
    expect(table('observability.logs').invocation_logs).toBe('false');
    expect(table('triggers').crons).toBe(`["17 * * * *", "${RETENTION_CRON}"]`);
  });

  it('no secret is set in a committed file', () => {
    for (const name of ['FB_APP_SECRET', 'FB_APP_SECRET_ALT', 'SESSION_SECRET', 'ID_PEPPER', 'ADMIN_KEY']) {
      expect(TOML).not.toMatch(new RegExp(`^\\s*${name}\\s*=`, 'm'));
    }
    expect(readFileSync(join(SERVER_DIR, '.gitignore'), 'utf8')).toMatch(/^\.dev\.vars$/m);
    // committed sources carry only the public test values (never a production-looking secret)
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        if (['node_modules', '.wrangler', 'fixtures', 'generated'].includes(f)) continue;
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|toml|json|md|example|sql)$/.test(f)) files.push(p);
      }
    };
    walk(SERVER_DIR);
    const suspicious = files.filter((f) => /(?:FB_APP_SECRET|SESSION_SECRET|ID_PEPPER|ADMIN_KEY)\s*[:=]\s*['"]?(?![^'"\n]*(?:test|dev|e2e|self-test|unused|alt-secret|REPLACE|<))[A-Za-z0-9+/=_-]{24,}/.test(readFileSync(f, 'utf8')));
    expect(suspicious.map((f) => relative(SERVER_DIR, f))).toEqual([]);
  });
});
