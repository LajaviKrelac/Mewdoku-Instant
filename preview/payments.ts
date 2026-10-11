// Owner: lead (preview link, 2026-10-11). The preview's mock store: a PaymentsProvider (src/platform/types.ts, the
// contract src/platform/fb/fb-payments.ts fulfils on Facebook) whose catalogue is our three products at their
// planned prices and whose purchase dialog is our own sheet, "Preview purchase — nothing is charged". Everything
// after the dialog is the game's real code: the shop flow's consume-first intent ledger (purchases.pending, a
// critical save, consume, the grant, the token ledger; src/app/shop-flow.ts), the O2 "use one at once" and the
// boot restore. Like FB, a purchase stays unconsumed until consume(): kept in
// localStorage['mewdoku.preview.purchases.v1'], so a reload between the two is delivered by the boot restore.
import { cfg, type GameConfig } from '../src/app/config';
import type { ProductId } from '../src/game/types';
import type { PaymentsProvider, Product, Purchase } from '../src/platform/types';
import { S } from './strings';

export const PURCHASES_KEY = 'mewdoku.preview.purchases.v1';

/** Our products at the prices planned for the FB dashboard (docs/phase2e/spec.md §11.4). */
export const PREVIEW_CATALOG: readonly Product[] = [
  { id: 'remove_ads', price: '$3.99', currency: 'USD' },
  { id: 'hints_15', price: '$1.99', currency: 'USD' },
  { id: 'kitties_8', price: '$1.99', currency: 'USD' },
];

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** The confirm sheet: true = Buy, false = Cancel (a closed sheet). */
export type ConfirmPurchase = (product: Product) => Promise<boolean>;

export interface PreviewPaymentsDeps {
  readonly storage: KV | null;
  readonly confirm: ConfirmPurchase;
  readonly now?: () => number;
  readonly config?: GameConfig;
  readonly random?: () => number;
}

function readList(storage: KV | null): Purchase[] {
  try {
    const raw = storage?.getItem(PURCHASES_KEY) ?? null;
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v.filter((p) => p && typeof p === 'object' && typeof (p as Purchase).purchaseToken === 'string') as Purchase[]) : [];
  } catch {
    return [];
  }
}

export function createPreviewPayments(deps: PreviewPaymentsDeps): PaymentsProvider {
  const c = deps.config ?? cfg;
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  /** Unconsumed purchases (memory copy; written through to storage when there is one). */
  let unconsumed = readList(deps.storage);
  let buying = false;
  let n = 0;
  const write = (): void => {
    try {
      deps.storage?.setItem(PURCHASES_KEY, JSON.stringify(unconsumed));
    } catch {
      // memory only
    }
  };
  const onSale = (id: ProductId): Product | null => (c.iap.catalog.some((d) => d.id === id) ? (PREVIEW_CATALOG.find((p) => p.id === id) ?? null) : null);

  return {
    ready: () => true,
    onReady(cb) {
      try {
        cb();
      } catch {
        // a listener must never break payments
      }
    },
    catalog: () => Promise.resolve(PREVIEW_CATALOG.filter((p) => onSale(p.id) !== null)),
    async purchase(id, payload) {
      const product = onSale(id);
      if (!product) return { ok: false, reason: 'error' };
      if (buying) return { ok: false, reason: 'not_ready' };
      buying = true;
      try {
        const yes = await deps.confirm(product).catch(() => false);
        if (!yes) return { ok: false, reason: 'cancelled' };
        n += 1;
        const token = `preview-${now().toString(36)}-${n}-${Math.floor(random() * 1e9).toString(36)}`;
        const p: Purchase = { productId: id, purchaseToken: token, paymentId: `preview-payment-${n}`, purchaseTime: Math.floor(now() / 1000), developerPayload: payload };
        unconsumed = [...unconsumed, p];
        write();
        return { ok: true, p };
      } finally {
        buying = false;
      }
    },
    purchases: () => Promise.resolve([...unconsumed]),
    consume(token) {
      const before = unconsumed.length;
      unconsumed = unconsumed.filter((p) => p.purchaseToken !== token);
      write();
      return Promise.resolve(unconsumed.length < before);
    },
  };
}

/**
 * The preview's purchase dialog (where FB opens its own): a bottom sheet over everything but the mock ads, with the
 * product, its price, Buy and Cancel. Esc or a tap outside cancels. Own styles (preview/preview.css).
 */
export function confirmSheet(doc: Document): ConfirmPurchase {
  return (product) =>
    new Promise<boolean>((resolve) => {
      const root = doc.createElement('div');
      root.className = 'mwp-sheet';
      root.setAttribute('data-preview-ui', 'purchase');
      const panel = doc.createElement('div');
      panel.className = 'mwp-sheet__panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'mwp-sheet-title');
      const badge = doc.createElement('p');
      badge.className = 'mwp-badge';
      badge.textContent = S.tab;
      const title = doc.createElement('h2');
      title.id = 'mwp-sheet-title';
      title.className = 'mwp-sheet__title';
      title.textContent = S.buy.title;
      const item = doc.createElement('p');
      item.className = 'mwp-sheet__item';
      const name = doc.createElement('span');
      name.textContent = S.buy.product[product.id] ?? product.id;
      const price = doc.createElement('strong');
      price.textContent = product.price;
      item.append(name, price);
      const body = doc.createElement('p');
      body.className = 'mwp-sheet__body';
      body.textContent = S.buy.body;
      const actions = doc.createElement('div');
      actions.className = 'mwp-sheet__actions';
      const cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.className = 'mwp-btn mwp-btn--ghost';
      cancel.textContent = S.buy.cancel;
      const buy = doc.createElement('button');
      buy.type = 'button';
      buy.className = 'mwp-btn mwp-btn--primary';
      buy.textContent = `${S.buy.confirm} · ${product.price}`;
      actions.append(cancel, buy);
      panel.append(badge, title, item, body, actions);
      root.append(panel);
      let done = false;
      const finish = (yes: boolean): void => {
        if (done) return;
        done = true;
        doc.removeEventListener('keydown', onKey, true);
        root.remove();
        resolve(yes);
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          finish(false);
        }
      };
      // Nothing underneath reacts while the sheet is up (the game's own overlays listen on the app root).
      for (const type of ['pointerdown', 'pointerup', 'click']) root.addEventListener(type, (e) => e.stopPropagation());
      root.addEventListener('click', (e) => {
        if (e.target === root) finish(false);
      });
      cancel.addEventListener('click', () => finish(false));
      buy.addEventListener('click', () => finish(true));
      doc.addEventListener('keydown', onKey, true);
      (doc.body ?? doc.documentElement).appendChild(root);
      buy.focus();
    });
}
