// Owner: G1 (Phase 2e). The shop flow's Phase 2e rules (docs/phase2e/spec.md §4.1–§4.5; CONTRACTS §7):
// - consume first through the intent ledger (iap.grantBeforeConsume false, the L1 value) and exactly-once
//   delivery at every crash point of the §4.2 table (consume failed, died after the consume, died after
//   the grant), the 2b order still with grantBeforeConsume true;
// - paymentsAllowed: iOS sells only with the iOS switch on (build value or the remote switch, both ways);
//   the boot restore delivers on iOS whatever the switch says;
// - O2's Buy rows (o2Buy): iap.o2Products order, hidden off FB / without payments / iap.inPlay or the
//   remote iapInPlay off / a catalogue error / Messenger after iap.readyTimeoutMs; loading; one row per
//   product in the catalogue; No Ads hidden once owned; busy and disabled during a purchase; the mouse none;
// - buyInPlay resolves its result, pauses through purchaseDialog (open, then closed in a finally), logs
//   iap {source: 'o2'} and toasts an early failure; prefetchCatalog after onReady (FB only).
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { mergeConfig, type GameConfig } from '../../../src/app/config';
import type { AnalyticsEvent } from '../../../src/app/events';
import { createShopFlow, type ShopFlowDeps } from '../../../src/app/shop-flow';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { PaymentsProvider, PlatformId, Product, Purchase, PurchaseFailReason } from '../../../src/platform/types';
import { NOW } from './harness';

const CATALOG: Product[] = [
  { id: 'remove_ads', price: '$3.99', currency: 'USD' },
  { id: 'hints_15', price: '$1.99', currency: 'USD' },
  { id: 'kitties_8', price: '$1.99', currency: 'USD' },
];

/** The L1 value (spec §7.2.2): consume first. */
const L1 = mergeConfig({ iap: { grantBeforeConsume: false } });

interface Fake extends PaymentsProvider {
  isReady: boolean;
  readyCbs: (() => void)[];
  unconsumed: Purchase[] | null;
  next: { ok: true } | { ok: false; reason: PurchaseFailReason };
  consumeOk: boolean | 'throw';
  catalogCalls: number;
  catalogList: Product[];
  fire(): void;
}

function payments(log: string[]): Fake {
  let n = 0;
  const p: Fake = {
    isReady: true,
    readyCbs: [],
    unconsumed: [],
    next: { ok: true },
    consumeOk: true,
    catalogCalls: 0,
    catalogList: CATALOG,
    ready: () => p.isReady,
    onReady: (cb) => (p.isReady ? cb() : void p.readyCbs.push(cb)),
    fire: () => {
      p.isReady = true;
      for (const cb of p.readyCbs.splice(0)) cb();
    },
    catalog: async () => {
      p.catalogCalls++;
      log.push('catalog');
      return p.catalogList;
    },
    purchase: async (id) => {
      log.push(`purchase:${id}`);
      if (!p.next.ok) return p.next;
      return { ok: true, p: { productId: id, purchaseToken: `tok${++n}`, paymentId: 'pay', purchaseTime: 1 } };
    },
    purchases: async () => (log.push('purchases'), p.unconsumed),
    consume: async (token) => {
      log.push(`consume:${token}`);
      if (p.consumeOk === 'throw') throw new Error('net');
      return p.consumeOk;
    },
  };
  return p;
}

interface Opts {
  platformId?: PlatformId;
  payments?: boolean;
  ios?: boolean;
  iosOn?: boolean;
  inPlayOn?: boolean;
  config?: GameConfig;
  save?: Partial<SaveData>;
  ready?: boolean;
  noDialog?: boolean;
}

function setup(o: Opts = {}) {
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  let state: SaveData = { ...defaults(NOW), stock: { hints: 0, kitties: 0 }, ...o.save };
  const pay = payments(log);
  pay.isReady = o.ready ?? true;
  const toasts: string[] = [];
  const analytics: AnalyticsEvent[] = [];
  const deps: ShopFlowDeps = {
    payments: () => pay,
    capabilities: () => ({ payments: o.payments ?? true, paymentsIos: o.ios ?? false }),
    platformId: o.platformId ?? 'fbig',
    save: () => state,
    updateSave: (fn) => {
      state = fn(state);
      log.push(`state:h${state.stock.hints}k${state.stock.kitties}:p${state.purchases.pending.length}${state.purchases.noAds ? ':noads' : ''}`);
    },
    saves: { now: () => void log.push('save:now'), critical: () => void log.push('save:critical') },
    clock,
    startedAt: NOW,
    playerId: () => 'P1',
    overlay: { open: () => undefined, update: () => undefined, close: () => undefined, isOpen: () => false },
    toast: (m) => void toasts.push(m),
    log: (e) => void analytics.push(e),
    changed: () => void log.push('changed'),
    config: o.config ?? L1,
    ...(o.iosOn !== undefined ? { iosOn: () => o.iosOn as boolean } : {}),
    ...(o.inPlayOn !== undefined ? { inPlayOn: () => o.inPlayOn as boolean } : {}),
    ...(o.noDialog ? {} : { purchaseDialog: (open: boolean) => void log.push(open ? 'dialog:open' : 'dialog:closed') }),
  };
  const flow = createShopFlow(deps);
  return { log, clock, flow, pay, toasts, analytics, save: () => state, set: (s: SaveData) => void (state = s) };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const purchase = (productId: Purchase['productId'], purchaseToken: string): Purchase => ({ productId, purchaseToken, paymentId: 'p', purchaseTime: 1 });

describe('consume first with the intent ledger (spec §4.2, D-2e-10)', () => {
  it('purchase → intent into pending + critical save → consume → grant out of pending + critical save', async () => {
    const s = setup();
    await s.flow.buy('hints_15');
    expect(s.log).toEqual([
      'dialog:open',
      'purchase:hints_15',
      'state:h0k0:p1',
      'save:critical',
      'consume:tok1',
      'state:h15k0:p0',
      'save:critical',
      'changed',
      'dialog:closed',
    ]);
    expect(s.save().purchases).toEqual({ noAds: false, tokens: ['hints_15|tok1'], pending: [] });
    expect(s.toasts).toEqual(['Thank you! Your items are in.']);
  });

  it('the consume fails: nothing granted yet, the intent stays, shop.error; the next restore consumes, then grants once', async () => {
    const s = setup();
    s.pay.consumeOk = false;
    expect(await s.flow.buyInPlay('kitties_8')).toBe('error');
    expect(s.save().stock.kitties).toBe(0);
    expect(s.save().purchases.pending).toEqual(['kitties_8|tok1']);
    expect(s.toasts).toEqual(["We couldn't finish that purchase. Please try again."]);
    // Next boot: FB still lists it unconsumed.
    s.pay.consumeOk = true;
    s.pay.unconsumed = [purchase('kitties_8', 'tok1')];
    s.log.length = 0;
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'consume:tok1', 'state:h0k8:p0', 'save:critical', 'changed']);
    expect(s.save().purchases).toEqual({ noAds: false, tokens: ['kitties_8|tok1'], pending: [] });
    // Again (say the list was stale): never a second grant.
    s.log.length = 0;
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'consume:tok1']);
    expect(s.save().stock.kitties).toBe(8);
  });

  it('a consume that throws (timeout) is the same as a failed one', async () => {
    const s = setup();
    s.pay.consumeOk = 'throw';
    expect(await s.flow.buyInPlay('hints_15')).toBe('error');
    expect(s.save().purchases.pending).toEqual(['hints_15|tok1']);
    expect(s.save().stock.hints).toBe(0);
  });

  it('died after the consume, before the grant: a pending token FB no longer lists is granted once, without a consume', async () => {
    const s = setup({ save: { purchases: { noAds: false, tokens: [], pending: ['hints_15|tokP'] } } });
    s.pay.unconsumed = [];
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'state:h15k0:p0', 'save:critical', 'changed']);
    expect(s.save().purchases).toEqual({ noAds: false, tokens: ['hints_15|tokP'], pending: [] });
    expect(s.analytics).toEqual([{ name: 'iap', params: { product: 'hints_15', result: 'ok', platform: 'fbig', source: 'shop' } }]);
    s.log.length = 0;
    await s.flow.restore();
    expect(s.log).toEqual(['purchases']);
    expect(s.save().stock.hints).toBe(15);
  });

  it('died after the grant, before leaving pending: the token is only dropped from pending (never granted twice)', async () => {
    const s = setup({ save: { stock: { hints: 15, kitties: 0 }, purchases: { noAds: false, tokens: ['hints_15|tokG'], pending: ['hints_15|tokG'] } } });
    s.pay.unconsumed = [];
    await s.flow.restore();
    expect(s.save().purchases).toEqual({ noAds: false, tokens: ['hints_15|tokG'], pending: [] });
    expect(s.save().stock.hints).toBe(15);
    expect(s.log).toContain('save:critical');
    expect(s.analytics).toEqual([]);
  });

  it('a granted token FB still lists unconsumed (and still pending): consume only, then out of pending', async () => {
    const s = setup({ save: { stock: { hints: 15, kitties: 0 }, purchases: { noAds: false, tokens: ['hints_15|tokG'], pending: ['hints_15|tokG'] } } });
    s.pay.unconsumed = [purchase('hints_15', 'tokG')];
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'consume:tokG', 'state:h15k0:p0', 'save:critical']);
    expect(s.save().stock.hints).toBe(15);
  });

  it('No Ads through the same path: entitlement kept after the consume', async () => {
    const s = setup();
    expect(await s.flow.buyInPlay('remove_ads')).toBe('ok');
    expect(s.save().purchases).toEqual({ noAds: true, tokens: ['remove_ads|tok1'], pending: [] });
  });

  it("grantBeforeConsume true keeps 2b's order (record + grant + save, then consume; no pending)", async () => {
    const s = setup({ config: mergeConfig({ iap: { grantBeforeConsume: true } }) });
    await s.flow.buy('hints_15');
    expect(s.log).toEqual(['dialog:open', 'purchase:hints_15', 'state:h15k0:p0', 'save:critical', 'changed', 'consume:tok1', 'dialog:closed']);
  });
});

describe('iOS (spec §4.4, D-2e-11)', () => {
  it('iOS with the switch off (build default false): no Buy anywhere; buyInPlay unsupported (toast), no purchase call', async () => {
    const s = setup({ ios: true });
    expect(s.flow.paymentsAllowed()).toBe(false);
    expect(s.flow.buyState()).toEqual({ kind: 'unavailable' });
    expect(s.flow.o2Buy('hint')).toEqual([]);
    expect(await s.flow.buyInPlay('hints_15')).toBe('unsupported');
    expect(s.log).not.toContain('purchase:hints_15');
    expect(s.toasts).toEqual(["We couldn't finish that purchase. Please try again."]);
  });

  it('the remote switch turns iOS on (and off) without a release; iap.iosEnabled true is the build default', async () => {
    const on = setup({ ios: true, iosOn: true });
    expect(on.flow.paymentsAllowed()).toBe(true);
    expect(await on.flow.buyInPlay('hints_15')).toBe('ok');
    const off = setup({ ios: true, iosOn: false, config: mergeConfig({ iap: { grantBeforeConsume: false, iosEnabled: true } }) });
    expect(off.flow.paymentsAllowed()).toBe(false);
    const build = setup({ ios: true, config: mergeConfig({ iap: { grantBeforeConsume: false, iosEnabled: true } }) });
    expect(build.flow.paymentsAllowed()).toBe(true);
  });

  it('Android / desktop ignore the switch', () => {
    expect(setup({ ios: false, iosOn: false }).flow.paymentsAllowed()).toBe(true);
    expect(setup({ payments: false }).flow.paymentsAllowed()).toBe(false);
  });

  it('the boot restore delivers on iOS even with the switch off', async () => {
    const s = setup({ ios: true, iosOn: false });
    s.pay.unconsumed = [purchase('kitties_8', 'tokI')];
    await s.flow.restore();
    expect(s.save().stock.kitties).toBe(8);
    expect(s.log).toContain('consume:tokI');
  });
});

describe("O2's Buy rows (spec §4.1)", () => {
  const ready = (id: string, kind: 'pack' | 'no_ads', items: number, price: string) => ({ productId: id, kind, items, price, state: 'ready' });

  it('iap.o2Products order, prices from the catalogue as given; the mouse card has none', async () => {
    const s = setup();
    expect(s.flow.o2Buy('hint').map((r) => r.state)).toEqual(['loading', 'loading']); // the catalogue is on its way
    await settle();
    expect(s.flow.o2Buy('hint')).toEqual([ready('hints_15', 'pack', 15, '$1.99'), ready('remove_ads', 'no_ads', 0, '$3.99')]);
    expect(s.flow.o2Buy('kitty')).toEqual([ready('kitties_8', 'pack', 8, '$1.99'), ready('remove_ads', 'no_ads', 0, '$3.99')]);
    expect(s.flow.o2Buy('mouse')).toEqual([]);
  });

  it('No Ads is hidden once owned; a product missing from the catalogue is left out alone', async () => {
    const s = setup({ save: { purchases: { noAds: true, tokens: [], pending: [] } } });
    s.pay.catalogList = CATALOG.filter((p) => p.id !== 'kitties_8');
    s.flow.o2Buy('hint');
    await settle();
    expect(s.flow.o2Buy('hint').map((r) => r.productId)).toEqual(['hints_15']);
    expect(s.flow.o2Buy('kitty')).toEqual([]);
  });

  it('hidden: the web, no payments, iap.inPlay off, the remote iapInPlay off, a catalogue error (no Retry in play)', async () => {
    expect(setup({ platformId: 'web' }).flow.o2Buy('hint')).toEqual([]);
    expect(setup({ payments: false }).flow.o2Buy('hint')).toEqual([]);
    expect(setup({ config: mergeConfig({ iap: { grantBeforeConsume: false, inPlay: false } }) }).flow.o2Buy('hint')).toEqual([]);
    expect(setup({ inPlayOn: false }).flow.o2Buy('hint')).toEqual([]);
    const err = setup();
    err.pay.catalogList = [];
    err.flow.o2Buy('hint');
    await settle();
    expect(err.flow.o2Buy('hint')).toEqual([]);
  });

  it('Messenger.com (onReady never fires): loading for iap.readyTimeoutMs from the start, then hidden', () => {
    const s = setup({ ready: false });
    expect(s.flow.o2Buy('hint').map((r) => [r.state, r.price])).toEqual([
      ['loading', null],
      ['loading', null],
    ]);
    s.clock.advance(5001);
    expect(s.flow.o2Buy('hint')).toEqual([]);
  });

  it('a late onReady fetches the catalogue and tells the open card (onRowsChange)', async () => {
    const s = setup({ ready: false });
    let changes = 0;
    // As O2 does: every change re-reads the rows (which asks for the catalogue once payments are ready).
    const off = s.flow.onRowsChange(() => {
      changes++;
      s.flow.o2Buy('hint');
    });
    s.flow.o2Buy('hint');
    s.pay.fire();
    await settle();
    expect(changes).toBeGreaterThan(0);
    expect(s.flow.o2Buy('hint').every((r) => r.state === 'ready')).toBe(true);
    off();
  });

  it('during a purchase the tapped row is busy and the others disabled; afterwards ready again', async () => {
    const s = setup();
    s.flow.o2Buy('hint');
    await settle();
    let release: () => void = () => undefined;
    const orig = s.pay.purchase;
    s.pay.purchase = (id, payload) =>
      new Promise((resolve) => {
        release = () => void orig(id, payload).then(resolve);
      });
    const seen: string[][] = [];
    s.flow.onRowsChange(() => void seen.push(s.flow.o2Buy('hint').map((r) => r.state)));
    const done = s.flow.buyInPlay('hints_15');
    await settle();
    expect(s.flow.o2Buy('hint').map((r) => r.state)).toEqual(['busy', 'disabled']);
    expect(await Promise.race([done, Promise.resolve('pending')])).toBe('pending');
    release();
    expect(await done).toBe('ok');
    expect(s.flow.o2Buy('hint').map((r) => r.state)).toEqual(['ready', 'ready']);
    expect(seen[0]).toEqual(['busy', 'disabled']);
  });
});

describe('buyInPlay (spec §4.2, §4.3, §4.6)', () => {
  it('resolves the purchase result; the dialog pause wraps it; iap carries source o2; a cancel is silent', async () => {
    const s = setup();
    s.pay.next = { ok: false, reason: 'cancelled' };
    expect(await s.flow.buyInPlay('hints_15')).toBe('cancelled');
    expect(s.log).toEqual(['dialog:open', 'purchase:hints_15', 'dialog:closed']);
    expect(s.toasts).toEqual([]);
    s.pay.next = { ok: true };
    expect(await s.flow.buyInPlay('hints_15')).toBe('ok');
    expect(s.analytics.map((e) => e.params)).toEqual([
      { product: 'hints_15', result: 'cancelled', platform: 'fbig', source: 'o2' },
      { product: 'hints_15', result: 'ok', platform: 'fbig', source: 'o2' },
    ]);
  });

  it('an error resolves error with the toast; not ready resolves not_ready with the toast; No Ads owned is unsupported', async () => {
    const s = setup();
    s.pay.next = { ok: false, reason: 'error' };
    expect(await s.flow.buyInPlay('hints_15')).toBe('error');
    s.pay.isReady = false;
    expect(await s.flow.buyInPlay('hints_15')).toBe('not_ready');
    expect(s.toasts).toHaveLength(2);
    const owned = setup({ save: { purchases: { noAds: true, tokens: [], pending: [] } } });
    expect(await owned.flow.buyInPlay('remove_ads')).toBe('unsupported');
    expect(owned.log).not.toContain('purchase:remove_ads');
  });

  it('the dialog closes even when the provider throws', async () => {
    const s = setup();
    s.pay.purchase = async () => {
      throw new Error('boom');
    };
    expect(await s.flow.buyInPlay('hints_15')).toBe('error');
    expect(s.log).toEqual(['dialog:open', 'dialog:closed']);
  });
});

describe('prefetchCatalog (spec §4.1)', () => {
  it('FB with payments: after onReady, once; cached for iap.catalogCacheMs', async () => {
    const s = setup({ ready: false });
    s.flow.prefetchCatalog();
    await settle();
    expect(s.pay.catalogCalls).toBe(0);
    s.pay.fire();
    await settle();
    expect(s.pay.catalogCalls).toBe(1);
    expect(s.flow.o2Buy('hint')[0]?.price).toBe('$1.99');
    s.flow.prefetchCatalog();
    await settle();
    expect(s.pay.catalogCalls).toBe(1);
  });

  it('never on the web, without payments, on iOS with the switch off, or with iap.prefetchCatalog false', async () => {
    for (const s of [
      setup({ platformId: 'web' }),
      setup({ payments: false }),
      setup({ ios: true }),
      setup({ config: mergeConfig({ iap: { grantBeforeConsume: false, prefetchCatalog: false } }) }),
    ]) {
      s.flow.prefetchCatalog();
      await settle();
      expect(s.pay.catalogCalls).toBe(0);
    }
  });
});
