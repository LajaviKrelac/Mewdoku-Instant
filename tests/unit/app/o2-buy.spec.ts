// Owner: G1 (Phase 2e). Buying helpers during play (docs/phase2e/spec.md §3.3, §4.1–§4.3, §4.6), through the
// session and the real shop flow: O2 carries the Buy rows (o2_shown), a pack bought closes O2 and one is
// used at once (iap.useOneAfterBuy), No Ads keeps O2 open without its row, a cancel goes back to O2, the
// mouse card has no row, the pack stays unused when the card closed meanwhile, the timer pauses for FB's
// dialog, ads.rewarded.promptFirst false starts the video at once.
import { describe, expect, it } from 'vitest';
import type { DeepPartial, GameConfig } from '../../../src/app/config';
import { createShopFlow, type ShopFlow } from '../../../src/app/shop-flow';
import type { SaveData } from '../../../src/game/types';
import type { PaymentsProvider, Product, PurchaseFailReason } from '../../../src/platform/types';

type PurchaseResult = Awaited<ReturnType<PaymentsProvider['purchase']>>;
import { createHarness, startLevel, NOW, type Harness, type HarnessParts } from './harness';

const CATALOG: Product[] = [
  { id: 'remove_ads', price: '$3.99', currency: 'USD' },
  { id: 'hints_15', price: '$1.99', currency: 'USD' },
  { id: 'kitties_8', price: '$1.99', currency: 'USD' },
];

interface Pay extends PaymentsProvider {
  next: { ok: true } | { ok: false; reason: PurchaseFailReason };
  /** When set, the purchase waits for release() (FB's dialog open). */
  hold: boolean;
  release(): void;
}

function fakePayments(log: string[]): Pay {
  let n = 0;
  let pending: (() => void) | null = null;
  const p: Pay = {
    next: { ok: true },
    hold: false,
    release: () => {
      const f = pending;
      pending = null;
      f?.();
    },
    ready: () => true,
    onReady: (cb) => cb(),
    catalog: async () => CATALOG,
    purchase: (id) => {
      log.push(`iap:purchase:${id}`);
      const answer = (): PurchaseResult =>
        p.next.ok ? { ok: true, p: { productId: id, purchaseToken: `tok${++n}`, paymentId: 'pay', purchaseTime: 1 } } : p.next;
      if (!p.hold) return Promise.resolve(answer());
      return new Promise((resolve) => {
        pending = () => resolve(answer());
      });
    },
    purchases: async () => [],
    consume: async (token) => (log.push(`iap:consume:${token}`), true),
  };
  return p;
}

interface Setup {
  h: Harness;
  pay: Pay;
  shop: () => ShopFlow;
}

function setup(
  o: { save?: (s: SaveData) => SaveData; config?: DeepPartial<GameConfig>; platformId?: 'fbig' | 'web'; caps?: { rewarded?: boolean }; payments?: boolean } = {},
): Setup {
  const log: string[] = [];
  const pay = fakePayments(log);
  let shop: ShopFlow | null = null;
  const h = createHarness({
    save: (s) => (o.save ? o.save({ ...s, stock: { hints: 0, kitties: 0 } }) : { ...s, stock: { hints: 0, kitties: 0 } }),
    config: { iap: { grantBeforeConsume: false }, ...o.config },
    ...(o.caps ? { caps: o.caps } : {}),
    extra: (parts: HarnessParts) => {
      shop = createShopFlow({
        payments: () => pay,
        capabilities: () => ({ payments: o.payments ?? true, paymentsIos: false }),
        platformId: o.platformId ?? 'fbig',
        save: () => parts.store.get().save,
        updateSave: (fn) => parts.store.update((st) => ({ ...st, save: fn(st.save) })),
        saves: parts.saves,
        clock: parts.clock,
        startedAt: NOW - 600_000,
        playerId: () => 'P1',
        overlay: { open: () => undefined, update: () => undefined, close: () => undefined, isOpen: () => false },
        toast: (m) => parts.log.push(`toast:${m}`),
        log: (e) => parts.bus.emit('analytics', e),
        changed: () => {
          const s = parts.store.get().save;
          parts.bus.emit('stock', { hints: s.stock.hints, kitties: s.stock.kitties });
        },
        config: parts.config,
        purchaseDialog: (open) => parts.bus.emit(open ? 'pause' : 'resume', { reason: 'purchase' }),
      });
      shop.prefetchCatalog();
      return { shop };
    },
  });
  // The pay log goes into the harness log (same order).
  const push = log.push.bind(log);
  log.push = (...items: string[]): number => {
    h.log.push(...items);
    return push(...items);
  };
  return {
    h,
    pay,
    shop: () => {
      if (!shop) throw new Error('no shop');
      return shop;
    },
  };
}

/** Opens O2 from a tool at stock 0; `run` settles when the tool's flow ends (an async function would flatten it). */
async function openO2(s: Setup, tool: 'bulb' | 'paw' | 'mouse' = 'bulb'): Promise<{ run: Promise<void> }> {
  const { h } = s;
  h.router.rewardedAnswer = null;
  await startLevel(h);
  h.log.length = 0;
  h.analytics.length = 0;
  const run = tool === 'bulb' ? h.session.onBulb() : tool === 'paw' ? h.session.onPaw() : h.session.onMouse();
  await h.settle(0);
  expect(h.router.isOpen('rewarded')).toBe(true);
  return { run };
}

const o2 = (h: Harness) => {
  const p = h.router.props.rewarded;
  if (!p) throw new Error('O2 never opened');
  return p;
};
const named = (h: Harness, name: string) => h.analytics.filter((e) => e.name === name).map((e) => e.params);

describe('O2 Buy rows (spec §4.1)', () => {
  it('the out-of-hints card offers the Bulb Bundle, then No Ads, with the catalogue prices; o2_shown counts them', async () => {
    const s = setup();
    void (await openO2(s)).run;
    expect(o2(s.h).variant).toBe('video');
    expect(o2(s.h).buy).toEqual([
      { productId: 'hints_15', kind: 'pack', items: 15, price: '$1.99', state: 'ready' },
      { productId: 'remove_ads', kind: 'no_ads', items: 0, price: '$3.99', state: 'ready' },
    ]);
    expect(named(s.h, 'o2_shown')).toEqual([{ placement: 'hint', video: 1, buy: 2 }]);
  });

  it('the mouse card never has a row; the web has none', async () => {
    const mouse = setup();
    void (await openO2(mouse, 'mouse')).run;
    expect(o2(mouse.h).buy).toEqual([]);
    expect(named(mouse.h, 'o2_shown')).toEqual([{ placement: 'mouse', video: 1, buy: 0 }]);
    const web = setup({ platformId: 'web', payments: false }); // the web adapter never sells
    void (await openO2(web)).run;
    expect(o2(web.h).buy).toEqual([]);
  });

  it('the free and countdown cards carry the rows too', async () => {
    const s = setup({ caps: { rewarded: false }, save: (x) => ({ ...x, ads: { lastAdAt: 0, lastFallbackGrantAt: NOW - 1000 } }) });
    void (await openO2(s)).run;
    expect(o2(s.h).variant).toBe('countdown');
    expect(o2(s.h).buy?.map((r) => r.productId)).toEqual(['hints_15', 'remove_ads']);
    expect(named(s.h, 'o2_shown')).toEqual([{ placement: 'hint', video: 0, buy: 2 }]);
  });
});

describe('buying on O2 (spec §4.2, §4.3)', () => {
  it('a pack: FB dialog (timer paused), consume first, +15, O2 closes, one used at once (14 left, the hint opens charged)', async () => {
    const s = setup();
    const { run } = await openO2(s);
    s.pay.hold = true;
    o2(s.h).onBuy?.('hints_15');
    await s.h.settle(0);
    expect(o2(s.h).buy?.map((r) => r.state)).toEqual(['busy', 'disabled']);
    expect(s.h.store.get().ui.paused || s.h.muted.has('ad')).toBe(true); // the timer paused, audio muted
    // While FB's dialog is open "Not now" does nothing.
    o2(s.h).onDecline();
    expect(s.h.router.isOpen('rewarded')).toBe(true);
    s.pay.release();
    await run;
    expect(s.h.router.isOpen('rewarded')).toBe(false);
    expect(s.h.save().stock.hints).toBe(14);
    expect(s.h.save().purchases.tokens).toEqual(['hints_15|tok1']);
    expect(s.h.game().status).toBe('hint');
    expect(s.h.muted.has('ad')).toBe(false);
    expect(named(s.h, 'o2_choice')).toEqual([{ placement: 'hint', choice: 'buy' }]);
    expect(named(s.h, 'iap')).toEqual([{ product: 'hints_15', result: 'ok', platform: 'fbig', source: 'o2' }]);
    expect(s.h.log).toContain('toast:Thank you! Your items are in.');
    expect(s.h.log.some((l) => l.startsWith('ad:rewarded'))).toBe(false); // no video
  });

  it('the kitty pack: +8, one used at once (KITTY dispatched, 7 left)', async () => {
    const s = setup();
    const { run } = await openO2(s, 'paw');
    o2(s.h).onBuy?.('kitties_8');
    await run;
    expect(s.h.save().stock.kitties).toBe(7);
    expect(s.h.game().kittiesUsed).toBe(1);
  });

  it('iap.useOneAfterBuy false: the pack stays in stock, nothing used', async () => {
    const s = setup({ config: { iap: { useOneAfterBuy: false } } });
    const { run } = await openO2(s);
    o2(s.h).onBuy?.('hints_15');
    await run;
    expect(s.h.save().stock.hints).toBe(15);
    expect(s.h.game().status).toBe('playing');
  });

  it('No Ads: granted (thanks), O2 stays open without its row; the player still chooses', async () => {
    const s = setup();
    const { run } = await openO2(s);
    o2(s.h).onBuy?.('remove_ads');
    await s.h.settle(0);
    expect(s.h.save().purchases.noAds).toBe(true);
    expect(s.h.router.isOpen('rewarded')).toBe(true);
    expect(o2(s.h).buy?.map((r) => r.productId)).toEqual(['hints_15']);
    expect(named(s.h, 'o2_choice')).toEqual([{ placement: 'hint', choice: 'no_ads' }]);
    o2(s.h).onDecline();
    await run;
    expect(s.h.save().stock.hints).toBe(0);
    expect(named(s.h, 'o2_choice')).toEqual([
      { placement: 'hint', choice: 'no_ads' },
      { placement: 'hint', choice: 'decline' },
    ]);
  });

  it('a cancel goes back to O2 silently, rows ready again; then Watch video still works', async () => {
    const s = setup();
    const { run } = await openO2(s);
    s.pay.next = { ok: false, reason: 'cancelled' };
    o2(s.h).onBuy?.('hints_15');
    await s.h.settle(0);
    expect(s.h.router.isOpen('rewarded')).toBe(true);
    expect(o2(s.h).buy?.map((r) => r.state)).toEqual(['ready', 'ready']);
    expect(s.h.log.filter((l) => l.startsWith('toast:'))).toEqual([]);
    o2(s.h).onAccept();
    await run;
    expect(s.h.log).toContain('ad:rewarded:hint');
    expect(s.h.save().stock.hints).toBe(0); // +1 from the video, used at once
    expect(s.h.game().status).toBe('hint');
  });

  it('an error toasts shop.error and goes back to O2', async () => {
    const s = setup();
    const { run } = await openO2(s);
    s.pay.next = { ok: false, reason: 'error' };
    o2(s.h).onBuy?.('hints_15');
    await s.h.settle(0);
    expect(s.h.router.isOpen('rewarded')).toBe(true);
    expect(s.h.log).toContain("toast:We couldn't finish that purchase. Please try again.");
    o2(s.h).onDecline();
    await run;
  });

  it("the card closed while FB's dialog was open (leaving the board): the pack stays in stock unused", async () => {
    const s = setup();
    const { run } = await openO2(s);
    s.pay.hold = true;
    o2(s.h).onBuy?.('hints_15');
    await s.h.settle(0);
    s.h.router.closeAll();
    await run;
    s.pay.release();
    await s.h.settle(0);
    expect(s.h.save().stock.hints).toBe(15);
    expect(s.h.game().status).toBe('playing');
  });
});

describe('ads.rewarded.promptFirst (spec §3.3, P-R2)', () => {
  it('false: the video starts at once (no O2); the free / countdown cards still ask', async () => {
    const s = setup({ config: { ads: { rewarded: { promptFirst: false } } } });
    await startLevel(s.h);
    s.h.log.length = 0;
    await s.h.session.onBulb();
    expect(s.h.log.filter((l) => l === 'open:rewarded')).toEqual([]);
    expect(s.h.log).toContain('ad:rewarded:hint');
    expect(s.h.game().status).toBe('hint');
  });
});
