// Owner: D (Phase 2b); G3 (Phase 2c)
// FB payments (phase2b §8.2, §8.4, §8.8): the capability rule (not iOS, purchaseAsync supported),
// onReady gating (never on Messenger.com), the iap.readyTimeoutMs bounds, error mapping, consume
// calls, the stub catalogue, and what a restore may pass on (ours, unconsumed, charges only).
// Phase 2c (docs/phase2c/fish-lives-spec.md §5.3): the catalogue and purchase() take the three products
// on sale (cfg.iap.catalog) only; purchases() also passes on the retired fish packs (cfg.iap.retired),
// so the boot restore can compensate and consume them.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import { createFbPayments, mapPurchaseError, paymentsSupported, toProduct, toPurchase } from '../../../src/platform/fb/fb-payments';
import { createStub, drain, track, type StubConfig } from './helpers';

async function setup(config: StubConfig = {}, opts: { start?: boolean } = {}) {
  const clock = createFakeClock();
  const { sdk, control } = createStub({ playerId: 'p1', ...config }, clock);
  await sdk.initializeAsync();
  if (opts.start !== false) await sdk.startGameAsync();
  const payments = createFbPayments(sdk, { timers: clock });
  await drain();
  return { clock, sdk, control, payments };
}

describe('paymentsSupported (§8.4)', () => {
  it('needs getPlatform() !== IOS and payments.purchaseAsync, after init', async () => {
    const clock = createFakeClock();
    const web = createStub({}, clock).sdk;
    expect(paymentsSupported(web)).toBe(false); // getPlatform() is null before init
    await web.initializeAsync();
    expect(paymentsSupported(web)).toBe(true);
    const android = createStub({ platform: 'ANDROID' }, clock).sdk;
    await android.initializeAsync();
    expect(paymentsSupported(android)).toBe(true);
    const ios = createStub({ presets: ['ios'] }, clock).sdk;
    await ios.initializeAsync();
    expect(paymentsSupported(ios)).toBe(false);
    // iOS even if the API were offered: not eligible (05: confirmed).
    const iosWithApi = createStub({ platform: 'IOS' }, clock).sdk;
    await iosWithApi.initializeAsync();
    expect(paymentsSupported(iosWithApi)).toBe(false);
    const none = createStub({ presets: ['no-payments'] }, clock).sdk;
    await none.initializeAsync();
    expect(paymentsSupported(none)).toBe(false);
  });

  it('maps purchase errors (§8.4)', () => {
    expect(mapPurchaseError({ code: 'USER_INPUT' })).toBe('cancelled');
    expect(mapPurchaseError({ code: 'PAYMENTS_NOT_INITIALIZED' })).toBe('not_ready');
    expect(mapPurchaseError({ code: 'CLIENT_UNSUPPORTED_OPERATION' })).toBe('unsupported');
    for (const code of ['NETWORK_FAILURE', 'INVALID_PARAM', 'INVALID_OPERATION', 'SOMETHING_NEW']) expect(mapPurchaseError({ code })).toBe('error');
    expect(mapPurchaseError(new Error('x'))).toBe('error');
  });
});

describe('createFbPayments: onReady', () => {
  it('ready() after onReady fires; late subscribers are called at once', async () => {
    const { payments, control } = await setup({ payments: { readyDelayMs: 2_000 } });
    expect(control.count('payments.onReady')).toBe(1); // registered once, at creation
    expect(payments.ready()).toBe(false);
    const seen: string[] = [];
    payments.onReady(() => seen.push('early'));
    expect(seen).toEqual([]);
    expect(control.state.paymentsReady).toBe(false);
  });

  it('fires the waiting callbacks once payments are ready', async () => {
    const clock = createFakeClock();
    const { sdk } = createStub({ payments: { readyDelayMs: 2_000 } }, clock);
    await sdk.initializeAsync();
    await sdk.startGameAsync();
    const payments = createFbPayments(sdk, { timers: clock });
    const seen: string[] = [];
    payments.onReady(() => seen.push('early'));
    await clock.advanceAsync(2_000);
    await drain();
    expect(payments.ready()).toBe(true);
    expect(seen).toEqual(['early']);
    payments.onReady(() => seen.push('late'));
    expect(seen).toEqual(['early', 'late']);
  });

  it('Messenger.com (onReady never fires): never ready, purchase answers not_ready without an SDK call', async () => {
    const { payments, control, clock } = await setup({ presets: ['payments-never-ready'] });
    await clock.advanceAsync(cfg.iap.readyTimeoutMs * 4);
    expect(payments.ready()).toBe(false);
    await expect(payments.purchase('hints_15', 'p1:n')).resolves.toEqual({ ok: false, reason: 'not_ready' });
    await expect(payments.catalog()).resolves.toEqual([]);
    expect(control.count('payments.purchaseAsync')).toBe(0);
  });
});

describe('createFbPayments: catalogue', () => {
  it('lists the three products on sale with the localised price string and currency; cached for iap.catalogCacheMs', async () => {
    const { payments, control, clock } = await setup();
    const list = await payments.catalog();
    expect(list.map((p) => p.id)).toEqual(['remove_ads', 'hints_15', 'kitties_8']);
    expect(list.map((p) => p.id)).toEqual(cfg.iap.catalog.map((p) => p.id));
    expect(list[0]).toEqual({ id: 'remove_ads', price: '$3.99', currency: 'USD' });
    await payments.catalog();
    expect(control.count('payments.getCatalogAsync')).toBe(1);
    await clock.advanceAsync(cfg.iap.catalogCacheMs);
    await payments.catalog();
    expect(control.count('payments.getCatalogAsync')).toBe(2);
  });

  it('phase2c: a test app that still lists the retired fish packs: the catalogue never passes them on', async () => {
    const { payments } = await setup({
      payments: {
        catalog: [
          { productID: 'remove_ads', price: '$3.99', priceCurrencyCode: 'USD' },
          { productID: 'fish_250', price: '$1.99', priceCurrencyCode: 'USD' },
          { productID: 'hints_15', price: '$1.99', priceCurrencyCode: 'USD' },
          { productID: 'fish_900', price: '$4.99', priceCurrencyCode: 'USD' },
        ],
      },
    });
    await expect(payments.catalog()).resolves.toEqual([
      { id: 'remove_ads', price: '$3.99', currency: 'USD' },
      { id: 'hints_15', price: '$1.99', currency: 'USD' },
    ]);
  });

  it('drops products that are not ours or have no price; a failure is [] and not cached', async () => {
    const { payments, control } = await setup({
      payments: {
        catalog: [
          { productID: 'hints_15', price: '1,99 €', priceCurrencyCode: 'EUR' },
          { productID: 'gems_100', price: '$0.99' },
          { productID: 'kitties_8', price: '' },
        ],
        errors: { getCatalogAsync: ['NETWORK_FAILURE'] },
      },
    });
    await expect(payments.catalog()).resolves.toEqual([]);
    await expect(payments.catalog()).resolves.toEqual([{ id: 'hints_15', price: '1,99 €', currency: 'EUR' }]);
    expect(control.count('payments.getCatalogAsync')).toBe(2);
  });

  it('a catalogue call that never answers gives [] after iap.readyTimeoutMs', async () => {
    const { payments, sdk, clock } = await setup();
    sdk.payments!.getCatalogAsync = () => new Promise(() => undefined);
    const p = track(payments.catalog());
    await clock.advanceAsync(cfg.iap.readyTimeoutMs);
    await drain();
    expect(p.value).toEqual([]);
  });
});

describe('createFbPayments: purchase, purchases, consume', () => {
  it('purchase passes productID and developerPayload and maps the result', async () => {
    const { payments, control } = await setup();
    const r = await payments.purchase('hints_15', 'p1:abc');
    expect(control.find('payments.purchaseAsync')[0]?.args).toEqual([{ productID: 'hints_15', developerPayload: 'p1:abc' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.p).toMatchObject({ productId: 'hints_15', developerPayload: 'p1:abc', paymentId: 'stub-payment-1' });
    expect(r.p.purchaseToken).toMatch(/^stub-token-/);
    expect(r.p.purchaseTime).toBeGreaterThan(0);
  });

  it('cancel is cancelled; other failures are error; nothing is left half-done', async () => {
    const { payments, control } = await setup({ payments: { purchase: 'USER_INPUT' } });
    await expect(payments.purchase('kitties_8', 'x')).resolves.toEqual({ ok: false, reason: 'cancelled' });
    control.configure({ payments: { purchase: 'NETWORK_FAILURE' } });
    await expect(payments.purchase('kitties_8', 'x')).resolves.toEqual({ ok: false, reason: 'error' });
    expect(control.purchases()).toEqual([]);
  });

  it('one purchase at a time; an id that is not ours never reaches the SDK', async () => {
    const { payments, sdk, control } = await setup();
    let release: () => void = () => undefined;
    const real = sdk.payments!.purchaseAsync.bind(sdk.payments);
    sdk.payments!.purchaseAsync = (c) => new Promise((res) => (release = () => void real(c).then(res)));
    const first = track(payments.purchase('kitties_8', 'x'));
    await drain();
    await expect(payments.purchase('hints_15', 'x')).resolves.toEqual({ ok: false, reason: 'not_ready' });
    release();
    await drain();
    expect(first.value).toMatchObject({ ok: true });
    await expect(payments.purchase('gems' as never, 'x')).resolves.toEqual({ ok: false, reason: 'error' });
    expect(control.count('payments.purchaseAsync')).toBe(1);
  });

  it('phase2c: a retired fish pack can never be bought: purchase() answers error without an SDK call', async () => {
    // Even where a test app still lists them in its catalogue.
    const { payments, control } = await setup({ payments: { catalog: [{ productID: 'fish_250', price: '$1.99' }, { productID: 'fish_900', price: '$4.99' }] } });
    await expect(payments.purchase('fish_250', 'x')).resolves.toEqual({ ok: false, reason: 'error' });
    await expect(payments.purchase('fish_900', 'x')).resolves.toEqual({ ok: false, reason: 'error' });
    expect(control.count('payments.purchaseAsync')).toBe(0);
    expect(control.purchases()).toEqual([]);
  });

  it('phase2c: purchases() passes on unconsumed retired packs (fish_250, fish_900) with catalogue ones, for the restore', async () => {
    const { payments, control } = await setup({ payments: { unconsumed: [{ productID: 'fish_250' }, { productID: 'hints_15' }, { productID: 'fish_900' }] } });
    const list = await payments.purchases();
    expect(list?.map((p) => p.productId)).toEqual(['fish_250', 'hints_15', 'fish_900']);
    expect(list?.[0]).toMatchObject({ productId: 'fish_250', purchaseToken: 'stub-unconsumed-1-fish_250', paymentId: 'stub-unconsumed-payment-1' });
    // The restore consumes it like any other purchase.
    await expect(payments.consume('stub-unconsumed-1-fish_250')).resolves.toBe(true);
    expect((await payments.purchases())?.map((p) => p.productId)).toEqual(['hints_15', 'fish_900']);
    expect(control.purchases().find((p) => p.productID === 'fish_250')?.isConsumed).toBe(true);
  });

  it('phase2c: what counts as retired comes from cfg.iap.retired', async () => {
    const clock = createFakeClock();
    const { sdk } = createStub({ payments: { unconsumed: [{ productID: 'fish_250' }, { productID: 'kitties_8' }] } }, clock);
    await sdk.initializeAsync();
    await sdk.startGameAsync();
    const noRetired = createFbPayments(sdk, { timers: clock, config: mergeConfig({ iap: { retired: [] } }) });
    expect((await noRetired.purchases())?.map((p) => p.productId)).toEqual(['kitties_8']);
  });

  it('purchases() lists unconsumed purchases; consume() removes them; consume of an unknown token is false', async () => {
    const { payments, control } = await setup();
    const a = await payments.purchase('remove_ads', 'x');
    const b = await payments.purchase('kitties_8', 'x');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect((await payments.purchases())?.map((p) => p.productId)).toEqual(['remove_ads', 'kitties_8']);
    await expect(payments.consume(a.p.purchaseToken)).resolves.toBe(true);
    expect(control.find('payments.consumePurchaseAsync')[0]?.args).toEqual([a.p.purchaseToken]);
    expect((await payments.purchases())?.map((p) => p.productId)).toEqual(['kitties_8']);
    await expect(payments.consume(a.p.purchaseToken)).resolves.toBe(false); // already consumed
    await expect(payments.consume('')).resolves.toBe(false);
  });

  it('purchases() is null on failure (the boot restore then changes nothing)', async () => {
    const { payments } = await setup({ payments: { errors: { getPurchasesAsync: ['UNKNOWN'] } } });
    await expect(payments.purchases()).resolves.toBeNull();
    await expect(payments.purchases()).resolves.toEqual([]);
  });

  it('a restore never sees consumed purchases, refunds or products that are not ours', async () => {
    const { payments } = await setup({
      payments: {
        unconsumed: [
          { productID: 'fish_900', purchaseToken: 't1', paymentID: 'pay1', purchaseTime: '1760000000', paymentActionType: 'charge' },
          { productID: 'fish_900', purchaseToken: 't2', isConsumed: true },
          { productID: 'hints_15', purchaseToken: 't3', paymentActionType: 'refund' },
          { productID: 'gems_100', purchaseToken: 't4' },
          { productID: 'kitties_8', purchaseToken: '' },
        ],
      },
    });
    await expect(payments.purchases()).resolves.toEqual([
      { productId: 'fish_900', purchaseToken: 't1', paymentId: 'pay1', purchaseTime: 1_760_000_000 },
    ]);
  });

  it('a consume that never answers is false after iap.readyTimeoutMs', async () => {
    const { payments, sdk, clock } = await setup();
    sdk.payments!.consumePurchaseAsync = () => new Promise(() => undefined);
    const p = track(payments.consume('t'));
    await clock.advanceAsync(cfg.iap.readyTimeoutMs);
    await drain();
    expect(p.value).toBe(false);
  });

  it('the SDK rejects a purchase before startGameAsync (05: confirmed): not ready here', async () => {
    const { payments } = await setup({}, { start: false });
    // onReady may fire; purchaseAsync still rejects before start → error, never a grant.
    const r = await payments.purchase('hints_15', 'x');
    expect(r.ok).toBe(false);
  });
});

describe('mapping helpers', () => {
  it('toProduct takes products on sale only; toPurchase takes ours, retired ones included (phase2c §5.3)', () => {
    expect(toProduct({ productID: 'hints_15', price: '$1.99' })).toEqual({ id: 'hints_15', price: '$1.99', currency: '' });
    expect(toProduct({ productID: 'fish_250', price: '$1.99' })).toBeNull(); // retired: never on sale
    expect(toProduct({ productID: 'fish_900', price: '$4.99' })).toBeNull();
    expect(toProduct({ productID: 'HINTS_15', price: '$1.99' })).toBeNull();
    expect(toProduct(null)).toBeNull();
    expect(toPurchase({ productID: 'fish_900', purchaseToken: 'y', purchaseTime: 1_760_000_000 })).toMatchObject({ productId: 'fish_900' });
    expect(toPurchase({ productID: 'gems_100', purchaseToken: 'z' })).toBeNull();
    expect(toPurchase({ productID: 'fish_250', purchaseToken: 'x', purchaseTime: 'soon' })).toEqual({
      productId: 'fish_250',
      purchaseToken: 'x',
      paymentId: '',
      purchaseTime: 0,
    });
  });
});
