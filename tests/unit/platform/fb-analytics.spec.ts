// Owner: platform
// fb-analytics: logEvent name/param sanitising to the 05 §10 limits.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { ANALYTICS_PARAM_KEYS } from '../../../src/app/events';
import { createFbAnalytics, sanitizeEventName, sanitizeParams } from '../../../src/platform/fb/fb-analytics';
import { createStub } from './helpers';

describe('sanitizeEventName', () => {
  it.each([
    ['level_win', 'level_win'],
    ['ad-rewarded 2', 'ad-rewarded 2'],
    ['level.win', 'level_win'],
    ['  padded  ', 'padded'],
    ['é', null],
    ['x', null],
    ['__', null],
    ['', null],
    ['a'.repeat(60), 'a'.repeat(40)],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeEventName(input)).toBe(expected);
  });
});

describe('the 02 §20 event table fits the logEvent limits (05 §10, 02 §23)', () => {
  it('every event name and parameter key passes through the sanitisers unchanged', () => {
    const names = Object.keys(ANALYTICS_PARAM_KEYS) as (keyof typeof ANALYTICS_PARAM_KEYS)[];
    expect(names.length).toBeGreaterThanOrEqual(15);
    for (const name of names) {
      expect(sanitizeEventName(name), name).toBe(name);
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(40);
      const keys = ANALYTICS_PARAM_KEYS[name] as readonly string[];
      expect(keys.length, name).toBeLessThanOrEqual(25);
      // A worst-case value per key: 99 characters, the longest the limit allows.
      const params = Object.fromEntries(keys.map((k) => [k, 'v'.repeat(99)]));
      expect(sanitizeParams(params), name).toEqual(params);
      for (const k of keys) expect(k.length >= 2 && k.length <= 40 && /^[A-Za-z0-9_]+$/.test(k), `${name}.${k}`).toBe(true);
    }
  });
});

describe('sanitizeParams', () => {
  it('keeps valid params untouched (our event table already fits)', () => {
    const p = { level: 12, size: 7, mode: 'level', charged: 1 };
    expect(sanitizeParams(p)).toEqual(p);
    expect(sanitizeParams(undefined)).toEqual({});
  });

  it('drops 1-char keys, fixes characters, truncates long keys and values', () => {
    const out = sanitizeParams({ n: 7, 'where.at': 'boot', ['k'.repeat(50)]: 1, msg: 'm'.repeat(150) });
    expect(out).toEqual({ where_at: 'boot', ['k'.repeat(40)]: 1, msg: 'm'.repeat(cfg.analytics.valueMaxLen) });
    expect((out.msg as string).length).toBeLessThan(100);
  });

  it('drops non-finite numbers and duplicate keys after sanitising', () => {
    expect(sanitizeParams({ ms: Number.NaN, 'a.b': 1, a_b: 2 })).toEqual({ a_b: 1 });
  });

  it('keeps at most 25 params', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 40; i++) many[`p${String(i).padStart(2, '0')}`] = i;
    const out = sanitizeParams(many);
    expect(Object.keys(out)).toHaveLength(cfg.analytics.maxParams);
    expect(out.p00).toBe(0);
    expect(out.p24).toBe(24);
  });
});

describe('createFbAnalytics', () => {
  it('logs sanitised events with no valueToSum, only once ready', () => {
    const { sdk, control } = createStub({}, createFakeClock());
    let ready = false;
    const a = createFbAnalytics(sdk, { ready: () => ready });
    a.log('level_start', { level: 3 });
    expect(control.count('logEvent')).toBe(0);
    ready = true;
    a.log('level.start', { level: 3, n: 5 });
    a.log('?', { level: 1 });
    a.log('js_error');
    expect(control.find('logEvent').map((c) => c.args)).toEqual([
      ['level_start', null, { level: '3' }],
      ['js_error', null, null],
    ]);
  });

  it('sends every parameter value as a string under the length limit (the SDK takes string values only)', () => {
    const { sdk, control } = createStub({}, createFakeClock());
    createFbAnalytics(sdk).log('level_win', { level: 5, ms: 61_234.5, mode: 'level', where: 'x'.repeat(200) });
    const params = control.find('logEvent')[0]?.args[2] as Record<string, unknown>;
    expect(params).toEqual({ level: '5', ms: '61234.5', mode: 'level', where: 'x'.repeat(cfg.analytics.valueMaxLen) });
    for (const v of Object.values(params)) {
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeLessThan(100);
    }
  });

  it('never throws, even when the SDK does', () => {
    const { sdk } = createStub({}, createFakeClock());
    const broken = Object.assign(Object.create(sdk) as typeof sdk, {
      logEvent: () => {
        throw new Error('boom');
      },
    });
    expect(() => createFbAnalytics(broken).log('level_win', { level: 2 })).not.toThrow();
  });
});
