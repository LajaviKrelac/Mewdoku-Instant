// Owner: G4 (Phase 2e). Pure rules: bracket windows (both period modes), the ranking order and ties, who
// is paid (minMembers, needOneBelow), and the server config with its variables (spec §1.5, §1.6, §1.16).
import { describe, expect, it } from 'vitest';
import { bracketTimes, grantOf, heartsNew, paidPlaces, rankRows } from '../../src/core/brackets';
import { DEFAULT_CONFIG, loadConfig, mergeOverrides, parseOrigins, parseSwitches, solveFloors } from '../../src/core/config';
import { isRivalSlot } from '../../src/core/rivals';
import { originAllowed } from '../../src/http/cors';
import { DAY, HOUR } from '../helpers/harness';

describe('bracket windows (§1.5)', () => {
  it('rolling: 24 h from the first win, joinable for 2 h', () => {
    expect(bracketTimes('rolling', 1000, DEFAULT_CONFIG)).toEqual({ openedAt: 1000, joinUntil: 1000 + 2 * HOUR, endsAt: 1000 + DAY });
  });
  it('utc_day: ends at the next 00:00 UTC; with less than 2 h left it runs to the following day', () => {
    const noon = Date.parse('2026-11-15T12:00:00Z');
    expect(bracketTimes('utc_day', noon, DEFAULT_CONFIG)).toEqual({ openedAt: noon, joinUntil: Date.parse('2026-11-15T22:00:00Z'), endsAt: Date.parse('2026-11-16T00:00:00Z') });
    const late = Date.parse('2026-11-15T22:30:00Z');
    expect(bracketTimes('utc_day', late, DEFAULT_CONFIG).endsAt).toBe(Date.parse('2026-11-17T00:00:00Z'));
  });
});

describe('ranking order (P-L11) and rewards (§1.6)', () => {
  const m = (slot: number, points: number, scoredAt: number) => ({ slot, points, scoredAt });
  it('points desc, then who reached the total first, then slot; ranks are positions', () => {
    const r = rankRows([m(0, 5, 30), m(1, 9, 50), m(2, 5, 10), m(3, 5, 10)]);
    expect(r.map((x) => [x.slot, x.rank])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [0, 4],
    ]);
  });
  it('pays only with ≥ 5 visible members and someone below each paid place', () => {
    const five = rankRows([m(0, 9, 1), m(1, 8, 1), m(2, 7, 1), m(3, 6, 1), m(4, 5, 1)]);
    // UI batch (2026-10-13; D-2e-17 / P-L5 revised): 1st 3 + 3, 2nd 2 + 2, 3rd 1 + 1.
    expect(paidPlaces(five, DEFAULT_CONFIG).map((p) => [p.place, p.slot, p.hints, p.kitties])).toEqual([
      [1, 0, 3, 3],
      [2, 1, 2, 2],
      [3, 2, 1, 1],
    ]);
    expect(paidPlaces(five.slice(0, 4), DEFAULT_CONFIG)).toEqual([]);
    const small = { ...DEFAULT_CONFIG, rewards: { ...DEFAULT_CONFIG.rewards, minMembers: 2 } };
    expect(paidPlaces(five.slice(0, 3), small).map((p) => p.place)).toEqual([1, 2]); // 3rd beat nobody
    expect(paidPlaces(five.slice(0, 1), small)).toEqual([]);
    expect(grantOf(2, 2, true)).toEqual({ hints: 4, kitties: 4 });
    expect(heartsNew(5, 1, 3)).toBe(1);
    expect(heartsNew(2, 1, 3)).toBe(0);
  });
  it('[D-2e-24] a merged table (computer players at slots ≥ 9000): every row counts toward minMembers and the one-below rule; a place a rival holds is dropped, never passed down', () => {
    // real 0 (9), rival 9000 (8), real 1 (7), rival 9001 (6): four rows only, so nobody is paid (minMembers 5)
    const four = rankRows([m(0, 9, 1), m(9000, 8, 1), m(1, 7, 1), m(9001, 6, 1)]);
    expect(paidPlaces(four, DEFAULT_CONFIG)).toEqual([]);
    // a fifth row (a rival) makes the table eligible: 1st and 3rd are real and paid as they read; 2nd is a rival's
    const five = rankRows([m(0, 9, 1), m(9000, 8, 1), m(1, 7, 1), m(9001, 6, 1), m(9002, 5, 1)]);
    const placed = paidPlaces(five, DEFAULT_CONFIG);
    expect(placed.map((p) => [p.place, p.slot])).toEqual([
      [1, 0],
      [2, 9000],
      [3, 1],
    ]);
    const paid = placed.filter((p) => !isRivalSlot(p.slot));
    expect(paid.map((p) => [p.place, p.slot, p.hints, p.kitties])).toEqual([
      [1, 0, 3, 3],
      [3, 1, 1, 1],
    ]);
    // a real player last of five beat nobody: never paid even when the places above are rivals'
    const last = rankRows([m(9000, 9, 1), m(9001, 8, 1), m(9002, 7, 1), m(9003, 6, 1), m(4, 5, 1)]);
    expect(paidPlaces(last, DEFAULT_CONFIG).filter((p) => !isRivalSlot(p.slot))).toEqual([]);
    // exact ties go to the lower slot: the real player ranks above a rival with the same points and time
    expect(rankRows([m(9000, 3, 10), m(0, 3, 10)]).map((x) => x.slot)).toEqual([0, 9000]);
  });
});

describe('config (§1.16)', () => {
  it('the defaults are the spec values', () => {
    const c = DEFAULT_CONFIG;
    expect([c.bracket.periodMode, c.bracket.durationMs, c.bracket.joinWindowMs, c.bracket.maxMembers]).toEqual(['rolling', DAY, 2 * HOUR, 50]);
    expect([c.rewards.minMembers, c.rewards.claimTtlMs, c.hearts.maxGivenPerBracket, c.nickname.changeCooldownMs]).toEqual([5, 7 * DAY, 20, DAY]);
    expect([c.antiCheat.maxWinsPerWindow, c.antiCheat.flagWinsPerWindow, c.antiCheat.maxLevelJump, c.antiCheat.dailyGraceMs]).toEqual([150, 60, 30, 25 * HOUR]);
    expect([c.session.ttlMs, c.nonce.ttlMs, c.signature.maxAgeMs, c.signature.requireIssuedAt]).toEqual([DAY, 300_000, 600_000, false]);
    expect([c.api.maxWinsPerRequest, c.api.maxBodyBytes, c.web.newDevicesPerIpPerDay]).toEqual([10, 16_384, 5]);
    expect(solveFloors(c, 9)).toEqual([3500, 11_000]);
    expect(solveFloors(c, 3)).toEqual([1500, 4000]);
  });

  it('variables override; production never runs dev routes', () => {
    const { cfg, problems } = loadConfig({
      RANKING_ENABLED: 'false',
      PERIOD_MODE: 'utc_day',
      WEB_MODE: 'records',
      DEV_ROUTES: 'true',
      DEPLOY_ENV: 'production',
      ALLOWED_ORIGINS: ' https://apps-1.apps.fbsbx.com/ , https://x.example ',
      MIN_CLIENT_VERSION: '0.2.0',
      RC_SWITCHES: '{"iapIos":true,"ads":true,"ladder":"no"}',
    });
    expect(cfg.rankingEnabled).toBe(false);
    expect(cfg.bracket.periodMode).toBe('utc_day');
    expect(cfg.web.mode).toBe('records');
    expect(cfg.devRoutes).toBe(false);
    expect(cfg.allowedOrigins).toEqual(['https://apps-1.apps.fbsbx.com', 'https://x.example']);
    expect(cfg.minClientVersion).toBe('0.2.0');
    expect(cfg.rcSwitches).toEqual({ iapIos: true });
    expect(problems.join(' ')).toMatch(/DEV_ROUTES/);
    expect(loadConfig({ DEV_ROUTES: 'TRUE' }).cfg.devRoutes).toBe(false); // exactly "true"
    expect(loadConfig({ DEV_ROUTES: 'true', DEPLOY_ENV: 'staging' }).cfg.devRoutes).toBe(true);
  });

  it('[audit A-S5] production runs records on the web unless WEB_MODE=anon itself says otherwise (D-2e-5)', () => {
    expect(DEFAULT_CONFIG.web.mode).toBe('records');
    expect(loadConfig({ DEPLOY_ENV: 'production' }).cfg.web.mode).toBe('records'); // WEB_MODE missing
    const viaOverrides = loadConfig({ DEPLOY_ENV: 'production', CONFIG_OVERRIDES: '{"web":{"mode":"anon"}}' });
    expect(viaOverrides.cfg.web.mode).toBe('records');
    expect(viaOverrides.problems.join(' ')).toMatch(/anon ignored in production/);
    expect(loadConfig({ DEPLOY_ENV: 'production', WEB_MODE: 'anon' }).cfg.web.mode).toBe('anon'); // the deliberate switch
    expect(loadConfig({ DEPLOY_ENV: 'staging', CONFIG_OVERRIDES: '{"web":{"mode":"anon"}}' }).cfg.web.mode).toBe('anon');
    expect(loadConfig({ DEPLOY_ENV: 'staging', WEB_MODE: 'anon' }).cfg.web.mode).toBe('anon');
    expect(loadConfig({}).cfg.web.mode).toBe('records');
  });

  it('CONFIG_OVERRIDES deep-merges typed values and reports the rest', () => {
    const problems: string[] = [];
    const c = mergeOverrides(DEFAULT_CONFIG, { rewards: { minMembers: 3, places: [{ place: 1, hints: 5, kitties: 5 }] }, hearts: { enabled: 'yes' }, nope: 1, antiCheat: { minSolveMs: { '13': [1, 2] } } }, problems);
    expect(c.rewards.minMembers).toBe(3);
    expect(c.rewards.places).toEqual([{ place: 1, hints: 5, kitties: 5 }]);
    expect(c.hearts.enabled).toBe(true);
    expect(c.antiCheat.minSolveMs['13']).toEqual([1, 2]);
    expect(problems).toEqual(['hearts.enabled: expected boolean', 'nope: unknown key']);
    expect(loadConfig({ CONFIG_OVERRIDES: '{bad' }).problems).toEqual(['CONFIG_OVERRIDES: not JSON']);
  });

  it('origins and switches parse defensively', () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseSwitches('[]', [])).toEqual({});
    expect(parseSwitches('{"banner":false,"bannerInPlay":true}', [])).toEqual({ banner: false, bannerInPlay: true });
  });

  it('CORS patterns: exact, null, one-label wildcard, star', () => {
    const allowed = ['http://127.0.0.1:4173', 'https://*.apps.fbsbx.com', 'null'];
    expect(originAllowed('http://127.0.0.1:4173', allowed)).toBe(true);
    expect(originAllowed('https://apps-123.apps.fbsbx.com', allowed)).toBe(true);
    expect(originAllowed('https://a.b.apps.fbsbx.com', allowed)).toBe(false);
    expect(originAllowed('https://apps.fbsbx.com', allowed)).toBe(false);
    expect(originAllowed('http://apps-1.apps.fbsbx.com', allowed)).toBe(false);
    expect(originAllowed('https://evil.com/.apps.fbsbx.com', allowed)).toBe(false);
    expect(originAllowed('null', allowed)).toBe(true);
    expect(originAllowed('null', ['http://127.0.0.1:4173'])).toBe(false);
    expect(originAllowed('https://anything.example', ['*'])).toBe(true);
  });
});
