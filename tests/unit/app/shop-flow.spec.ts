// Owner: C. The shop (phase2b §2.8, §8.4–§8.6, §8.8): the record → grant → critical save → consume
// order; a crash between grant and consume followed by a boot restore consumes only (no second
// grant); No Ads consumed and kept; purchases() null changes nothing; the Buy section waits for
// onReady (late onReady shows it, iOS never); a cancel is silent; fish swaps; grantBeforeConsume false.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { mergeConfig, type GameConfig } from '../../../src/app/config';
import type { AnalyticsEvent } from '../../../src/app/events';
import { createShopFlow } from '../../../src/app/shop-flow';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { PaymentsProvider, PlatformId, Product, Purchase, PurchaseFailReason } from '../../../src/platform/types';
import type { ShopProps } from '../../../src/ui/overlays/shop-sheet';
import { NOW } from './harness';

const CATALOG: Product[] = [
  { id: 'remove_ads', price: '$3.99', currency: 'USD' },
  { id: 'hints_15', price: '$1.99', currency: 'USD' },
  { id: 'kitties_8', price: '$1.99', currency: 'USD' },
  { id: 'fish_250', price: '$1.99', currency: 'USD' },
  { id: 'fish_900', price: '$4.99', currency: 'USD' },
];

interface FakePayments extends PaymentsProvider {
  isReady: boolean;
  readyCbs: (() => void)[];
  log: string[];
  unconsumed: Purchase[] | null;
  next: { ok: true } | { ok: false; reason: PurchaseFailReason };
  fire(): void;
}

function payments(log: string[]): FakePayments {
  let n = 0;
  const p: FakePayments = {
    isReady: true,
    readyCbs: [],
    log,
    unconsumed: [],
    next: { ok: true },
    ready: () => p.isReady,
    onReady: (cb) => (p.isReady ? cb() : void p.readyCbs.push(cb)),
    fire: () => {
      p.isReady = true;
      for (const cb of p.readyCbs.splice(0)) cb();
    },
    catalog: async () => (log.push('catalog'), CATALOG),
    purchase: async (id, payload) => {
      log.push(`purchase:${id}:${payload.split(':')[0]}`);
      if (!p.next.ok) return p.next;
      return { ok: true, p: { productId: id, purchaseToken: `tok${++n}`, paymentId: 'pay', purchaseTime: 1 } };
    },
    purchases: async () => (log.push('purchases'), p.unconsumed),
    consume: async (token) => (log.push(`consume:${token}`), true),
  };
  return p;
}

function setup(opts: { platformId?: PlatformId; caps?: boolean; provider?: boolean; config?: GameConfig; save?: Partial<SaveData>; ready?: boolean } = {}) {
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  let state: SaveData = { ...defaults(NOW), stock: { hints: 0, kitties: 0 }, ...opts.save };
  const pay = payments(log);
  pay.isReady = opts.ready ?? true;
  let open = false;
  let props: ShopProps | null = null;
  const toasts: string[] = [];
  const analytics: AnalyticsEvent[] = [];
  const flow = createShopFlow({
    payments: () => (opts.provider === false ? undefined : pay),
    capabilities: () => ({ payments: opts.caps ?? true }),
    platformId: opts.platformId ?? 'fbig',
    save: () => state,
    updateSave: (fn) => {
      state = fn(state);
      log.push(`state:h${state.stock.hints}k${state.stock.kitties}f${state.wallet.fish}${state.purchases.noAds ? ':noads' : ''}`);
    },
    saves: { now: () => void log.push('save:now'), critical: () => void log.push('save:critical') },
    clock,
    startedAt: NOW,
    playerId: () => 'P1',
    overlay: {
      open: (p) => {
        open = true;
        props = p;
      },
      update: (p) => void (props = p),
      close: () => void (open = false),
      isOpen: () => open,
    },
    toast: (m) => void toasts.push(m),
    log: (e) => void analytics.push(e),
    changed: () => void log.push('changed'),
    ...(opts.config ? { config: opts.config } : {}),
  });
  return { log, clock, flow, pay, toasts, analytics, save: () => state, props: () => props };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('purchase grant order (§8.4)', () => {
  it('record + grant, critical save, then consume; toast thanks; iap ok (no price, no payment id)', async () => {
    const s = setup();
    await s.flow.buy('hints_15');
    expect(s.log).toEqual(['purchase:hints_15:P1', 'state:h15k0f0', 'save:critical', 'changed', 'consume:tok1']);
    expect(s.save().purchases.tokens).toEqual(['hints_15|tok1']);
    expect(s.toasts).toEqual(['Thank you! Your items are in.']);
    expect(s.analytics).toEqual([{ name: 'iap', params: { product: 'hints_15', result: 'ok', platform: 'fbig' } }]);
  });

  it('a crash between grant and consume: the boot restore consumes only (no second grant)', async () => {
    const s = setup({ save: { stock: { hints: 15, kitties: 0 }, purchases: { noAds: false, tokens: ['hints_15|tokX'] } } });
    s.pay.unconsumed = [{ productId: 'hints_15', purchaseToken: 'tokX', paymentId: 'p', purchaseTime: 1 }];
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'consume:tokX']);
    expect(s.save().stock.hints).toBe(15);
  });

  it('an unconsumed purchase never delivered (died before saving) is granted, saved, then consumed', async () => {
    const s = setup();
    s.pay.unconsumed = [{ productId: 'fish_900', purchaseToken: 'tokY', paymentId: 'p', purchaseTime: 1 }];
    await s.flow.restore();
    expect(s.log).toEqual(['purchases', 'state:h0k0f900', 'save:critical', 'changed', 'consume:tokY']);
  });

  it('No Ads is consumed and noAds stays true after a boot whose purchases() is empty', async () => {
    const s = setup();
    await s.flow.buy('remove_ads');
    expect(s.log).toContain('consume:tok1');
    expect(s.save().purchases.noAds).toBe(true);
    s.pay.unconsumed = [];
    await s.flow.restore();
    expect(s.save().purchases.noAds).toBe(true);
  });

  it('purchases() null changes nothing; the restore waits for onReady', async () => {
    const s = setup({ ready: false });
    s.pay.unconsumed = null;
    const before = s.save();
    const done = s.flow.restore();
    await settle();
    expect(s.log).toEqual([]);
    s.pay.fire();
    await done;
    expect(s.log).toEqual(['purchases']);
    expect(s.save()).toBe(before);
  });

  it('a cancel is silent; other failures toast shop.error; nothing is granted', async () => {
    const s = setup();
    s.pay.next = { ok: false, reason: 'cancelled' };
    await s.flow.buy('fish_250');
    expect(s.toasts).toEqual([]);
    s.pay.next = { ok: false, reason: 'error' };
    await s.flow.buy('fish_250');
    expect(s.toasts).toEqual(["We couldn't finish that purchase. Please try again."]);
    expect(s.save().wallet.fish).toBe(0);
    expect(s.analytics.map((e) => e.params)).toEqual([
      { product: 'fish_250', result: 'cancelled', platform: 'fbig' },
      { product: 'fish_250', result: 'error', platform: 'fbig' },
    ]);
  });

  it('grantBeforeConsume false: consume first, then grant and save', async () => {
    const s = setup({ config: mergeConfig({ iap: { grantBeforeConsume: false } }) });
    await s.flow.buy('kitties_8');
    expect(s.log).toEqual(['purchase:kitties_8:P1', 'consume:tok1', 'state:h0k8f0', 'save:critical', 'changed']);
  });

  it("removeAdsMode 'keep': No Ads is never consumed", async () => {
    const s = setup({ config: mergeConfig({ iap: { removeAdsMode: 'keep' } }) });
    await s.flow.buy('remove_ads');
    expect(s.log.some((l) => l.startsWith('consume'))).toBe(false);
    expect(s.save().purchases.noAds).toBe(true);
  });
});

describe('the Buy section (§8.5, §8.6)', () => {
  it('web: hidden (no payments code)', () => {
    const s = setup({ platformId: 'web', provider: false });
    expect(s.flow.buyState()).toEqual({ kind: 'hidden' });
  });

  it('FB before onReady: "Getting the shop ready…" up to 5 s, then unavailable; a late onReady shows Buy', async () => {
    const s = setup({ ready: false });
    s.flow.open();
    expect(s.props()?.buy).toEqual({ kind: 'loading' });
    s.clock.advance(5001);
    expect(s.props()?.buy).toEqual({ kind: 'unavailable' });
    s.pay.fire();
    await settle();
    expect(s.props()?.buy).toEqual({
      kind: 'ready',
      products: CATALOG.map((p) => ({ id: p.id, price: p.price, owned: false })),
    });
  });

  it('iOS / Messenger (capability off): never a Buy section', async () => {
    const s = setup({ caps: false });
    s.clock.advance(6000);
    s.flow.open();
    await settle();
    expect(s.props()?.buy).toEqual({ kind: 'unavailable' });
  });

  it('a catalogue failure shows the error state with retry; No Ads reads "Owned" once bought', async () => {
    const s = setup({ save: { purchases: { noAds: true, tokens: [] } } });
    let fail = true;
    s.pay.catalog = async () => {
      if (fail) throw new Error('net');
      return CATALOG;
    };
    s.flow.open();
    await settle();
    expect(s.props()?.buy).toEqual({ kind: 'error' });
    fail = false;
    s.props()?.onRetry();
    await settle();
    const buy = s.props()?.buy;
    expect(buy?.kind === 'ready' && buy.products.find((p) => p.id === 'remove_ads')?.owned).toBe(true);
  });
});

describe('fish swaps in the shop (§2.8, §8.5)', () => {
  it('insufficient balance: nothing happens (toast); exact balance: swapped and saved at once', () => {
    const s = setup({ save: { wallet: { fish: 14, earned: 14 } } });
    expect(s.flow.swap('hint')).toBe(false);
    expect(s.toasts).toEqual(['Not enough fish yet.']);
    const t = setup({ save: { wallet: { fish: 15, earned: 15 } } });
    expect(t.flow.swap('hint')).toBe(true);
    expect(t.save().wallet.fish).toBe(0);
    expect(t.save().stock.hints).toBe(1);
    expect(t.log).toEqual(['state:h1k0f0', 'save:now', 'changed']);
    const k = setup({ save: { wallet: { fish: 31, earned: 31 } } });
    expect(k.flow.swap('kitty')).toBe(true);
    expect(k.save().wallet.fish).toBe(1);
    expect(k.save().stock.kitties).toBe(1);
  });

  it('the sheet shows the balance and the prices; swaps work on the web too', () => {
    const s = setup({ platformId: 'web', provider: false, save: { wallet: { fish: 40, earned: 40 } } });
    s.flow.open();
    expect(s.props()).toMatchObject({ fish: 40, hintPrice: 15, kittyPrice: 30, buy: { kind: 'hidden' }, busy: false });
    s.props()?.onSwap('kitty');
    expect(s.props()?.fish).toBe(10);
  });
});
