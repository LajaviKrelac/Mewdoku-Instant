// Owner: platform
// fb-analytics: logEvent name/param sanitising to the 05 §10 limits.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
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
      ['level_start', null, { level: 3 }],
      ['js_error', null, null],
    ]);
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
