// Owner: B (Phase 2b); G2 (Phase 2c: no swap); G3 (Phase 2d: the mouse; Phase 2e: the Buy rows)
// O2 rewarded-ad prompt (02 §5 O2, §13.3). Revive does not use it (the O4 button is the prompt).
// The variant is chosen by the app when the dialog opens; the countdown variant ticks live.
// Phase 2c (fish-lives-spec §5.4): back to the Phase 2 card, [Watch video] [Not now] / "Here's a free
// hint." [Take it] / the countdown with [OK]: no swap row, no balance (fish are lives, not a currency).
// Phase 2d (look-spec §1.12): placement 'mouse' ("Call the mouse?"; every use is one video or one free
// grant, no stock); the art is the helper's own (tool-kitty, tool-bulb, tool-mouse, G2).
//
// Phase 2e (G3, spec §4.1, §4.6, §9.4; CONTRACTS §8): the hint and kitty cards gain Buy rows under the video
// button, in iap.o2Products order: the helper's own pack ("Buy 15 hints · $1.99", its mini-art from the shop)
// and No Ads ("Buy No Ads · $3.99" with its plain line "Removes banners and full-screen ads. Videos for
// helpers stay."). Every purchase label starts with "Buy" and shows the store's price string as given; a
// row the app leaves out (not in the catalogue, No Ads owned, the web, iOS off) is simply absent. With a
// pack row the video body reads "Watch a short video for 1 hint, or buy a Bulb Bundle." States per row:
// loading ("…", aria-busy, named "Getting the price…"), ready, busy (the tapped one, aria-busy) and
// disabled (another purchase in flight): while one is in flight EVERY button of the card is disabled. The
// app re-renders the rows in place through update() (router.update), which keeps the focus; after a cancel
// focus returns to the Buy that was tapped. The mouse card never has a row.
//
// Classes: .overlay[data-overlay=rewarded] > .overlay__panel--dialog.rewarded[data-variant][data-buy]
//          .rewarded__icon .overlay__title .overlay__body .overlay__actions(.rewarded__accept
//          .rewarded__buys(button.rewarded__buy[data-state][data-product][data-kind] + .rewarded__buy-note)
//          .rewarded__ok .rewarded__decline)
import { cfg, type ProductId } from '../../app/config';
import { formatClock, formatNumber, t, translate, type I18nKey } from '../../i18n';
import { icon } from '../art/sprite';
import { clear, h, setText, type OverlayView } from '../dom';
import { createOverlayShell, createTicker, makeButton, setButtonLabel, setGated } from './overlay-base';

export type RewardedVariant =
  | 'video' // [Watch video] [Not now]
  | 'free' // "Here's a free hint." [Take it] [Not now]
  | 'countdown'; // "Next free hint in m:ss" (live), [OK] only

/** Phase 2e (CONTRACTS §8): one Buy row of the out-of-helpers card. */
export interface O2BuyView {
  /** The UI names it with shop.product.<id>.name / desc. */
  readonly productId: ProductId;
  /** 'pack': a helper pack ("Buy 15 hints · $1.99"); 'no_ads': No Ads ("Buy No Ads · $3.99" + its note line). */
  readonly kind: 'pack' | 'no_ads';
  /** 15 / 8; 0 for 'no_ads'. */
  readonly items: number;
  /** The catalogue's price string, as is; null while loading. */
  readonly price: string | null;
  /** 'disabled': another row's purchase is in flight (every button of O2 is disabled then). */
  readonly state: 'loading' | 'ready' | 'busy' | 'disabled';
}

export interface RewardedPromptProps {
  /** Phase 2d §1.12: 'mouse' (the third helper; no stock, every use is one video or one free grant). */
  readonly placement: 'hint' | 'kitty' | 'mouse';
  readonly variant: RewardedVariant;
  /** Epoch ms when the free fallback opens again (countdown variant). */
  readonly nextFreeAt: number;
  /** Clock for the live countdown. */
  now(): number;
  /** Watch video / Take it. */
  onAccept(): void;
  /** Not now / OK / Esc. */
  onDecline(): void;
  // ── Phase 2e (spec §4.1; optional until I-3) ──
  /** The Buy rows in iap.o2Products order; absent or [] = today's card. */
  readonly buy?: readonly O2BuyView[];
  /** A ready Buy row pressed (the app runs the purchase and re-renders the rows through update()). */
  onBuy?(productId: ProductId): void;
}

const productKey = (id: ProductId, part: 'name' | 'desc'): I18nKey => `shop.product.${id}.${part}` as I18nKey;

/** A Buy row's visible label: "Buy 15 hints · $1.99", "Buy No Ads · $3.99" ("…" while the price loads). */
export function buyLabel(b: O2BuyView): string {
  const price = b.price ?? '…';
  return b.kind === 'no_ads' ? t('rewarded.buy.noAds.label', { price }) : t('rewarded.buy.label', { items: translate(productKey(b.productId, 'desc')), price });
}

/** A Buy row's accessible name: "Buy Bulb Bundle, 15 hints, $1.99"; "Getting the price…" while loading. */
export function buyA11y(b: O2BuyView): string {
  if (b.price === null || b.state === 'loading') return t('rewarded.buy.loading');
  return b.kind === 'no_ads'
    ? t('rewarded.buy.noAds.a11y', { price: b.price })
    : t('rewarded.buy.a11y', { name: translate(productKey(b.productId, 'name')), items: translate(productKey(b.productId, 'desc')), price: b.price });
}

/** The pack's mini-art (the shop's: bulb for hints, paw for kitties); No Ads has none. */
const PACK_ART: Partial<Record<ProductId, 'icon-bulb' | 'icon-paw'>> = { hints_15: 'icon-bulb', kitties_8: 'icon-paw' };

/** Countdown refresh period; finer than 1 s so the display never skips a second. */
const TICK_MS = 250;

/** "m:ss" left until `at`, rounded up so the display reaches 0:00 exactly when the wait ends. */
export function countdownText(at: number, now: number): string {
  const left = Math.max(0, at - now);
  return formatClock(Math.ceil(left / 1000) * 1000);
}

function bodyText(p: RewardedPromptProps): string {
  const at = p.placement;
  // Phase 2e §4.1: with a pack row the video card says "… or buy a Bulb Bundle." (only when a pack is offered).
  const pack = (p.buy ?? []).some((b) => b.kind === 'pack');
  switch (p.variant) {
    case 'video':
      if (pack && at === 'hint') return t('rewarded.body.buy.hint');
      if (pack && at === 'kitty') return t('rewarded.body.buy.kitty');
      return at === 'hint' ? t('rewarded.video.hint') : at === 'kitty' ? t('rewarded.video.kitty') : t('rewarded.video.mouse', { count: formatNumber(cfg.mouse.cells) });
    case 'free':
      return at === 'hint' ? t('rewarded.free.hint') : at === 'kitty' ? t('rewarded.free.kitty') : t('rewarded.free.mouse');
    case 'countdown': {
      const time = countdownText(p.nextFreeAt, p.now());
      return at === 'hint' ? t('rewarded.countdown.hint', { time }) : at === 'kitty' ? t('rewarded.countdown.kitty', { time }) : t('rewarded.countdown.mouse', { time });
    }
  }
}

/** The prompt's art and title per placement (Phase 2d: the helpers' own full-colour art). */
const ART = { hint: 'tool-bulb', kitty: 'tool-kitty', mouse: 'tool-mouse' } as const;
const TITLE = { hint: 'rewarded.title.hint', kitty: 'rewarded.title.kitty', mouse: 'rewarded.title.mouse' } as const;

export function createRewardedPrompt(): OverlayView<RewardedPromptProps> {
  let props: RewardedPromptProps | null = null;
  const decline = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    // Phase 2e: never while FB's purchase dialog is open (the card closes when the purchase settles).
    if (!(props.buy ?? []).some((b) => b.state === 'busy')) props.onDecline();
    return true;
  };
  const shell = createOverlayShell({ id: 'rewarded', scrim: 'soft', panel: 'dialog', onScrimTap: () => void decline() });
  shell.panel.classList.add('rewarded');
  const ticker = createTicker();

  const iconSlot = h('div', { class: 'rewarded__icon', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'overlay__title', id: shell.titleId });
  const body = h('p', { class: 'overlay__body', id: shell.descId, 'aria-live': 'off' });
  const accept = makeButton({
    variant: 'primary',
    label: '',
    block: true,
    autofocus: true,
    className: 'rewarded__accept',
    onPress: () => props?.onAccept(),
  });
  const notNow = makeButton({
    variant: 'ghost',
    label: t('common.notNow'),
    className: 'rewarded__decline',
    onPress: () => props?.onDecline(),
  });
  const ok = makeButton({
    variant: 'primary',
    label: t('common.ok'),
    block: true,
    className: 'rewarded__ok',
    onPress: () => props?.onDecline(),
  });
  // Phase 2e: the Buy rows (kept by product id, so an update re-renders them in place and keeps the focus).
  const buys = h('div', { class: 'rewarded__buys' });
  const buyRows = new Map<ProductId, { btn: HTMLButtonElement; note: HTMLElement | null; art: string }>();
  let lastTapped: ProductId | null = null;
  shell.panel.append(iconSlot, title, body, h('div', { class: 'overlay__actions overlay__actions--stack' }, accept, buys, ok, notNow));

  const videoIcon = icon('icon-play-video', { class: 'btn__icon' });

  const renderBuys = (p: RewardedPromptProps): boolean => {
    const rows = p.placement === 'mouse' ? [] : (p.buy ?? []);
    const inFlight = rows.some((b) => b.state === 'busy');
    const want = new Set(rows.map((b) => b.productId));
    for (const [id, r] of buyRows) {
      if (!want.has(id)) {
        r.btn.remove();
        r.note?.remove();
        buyRows.delete(id);
      }
    }
    let prev: Element | null = null;
    for (const b of rows) {
      let r = buyRows.get(b.productId);
      if (!r) {
        const id = b.productId;
        const btn = makeButton({
          variant: 'secondary',
          label: '',
          block: true,
          className: 'rewarded__buy',
          onPress: () => {
            const cur = props?.buy?.find((x) => x.productId === id);
            if (!props || !cur || cur.state !== 'ready' || props.buy?.some((x) => x.state === 'busy')) return;
            lastTapped = id;
            props.onBuy?.(id);
          },
        });
        const note = b.kind === 'no_ads' ? h('p', { class: 'rewarded__buy-note' }) : null;
        r = { btn, note, art: '' };
        buyRows.set(id, r);
      }
      // Keep the catalogue's order (iap.o2Products): move only when out of place.
      const after: Element | null = prev ? prev.nextElementSibling : buys.firstElementChild;
      if (after !== r.btn) buys.insertBefore(r.btn, after);
      prev = r.btn;
      if (r.note) {
        if (r.btn.nextElementSibling !== r.note) r.btn.after(r.note);
        prev = r.note;
        setText(r.note, t('rewarded.buy.noAds.note'));
      }
      r.btn.dataset.state = b.state;
      r.btn.dataset.product = b.productId;
      r.btn.dataset.kind = b.kind;
      r.btn.classList.toggle('rewarded__buy--small', b.kind === 'no_ads');
      const artId = b.kind === 'pack' ? (PACK_ART[b.productId] ?? '') : '';
      if (artId !== r.art) {
        r.art = artId;
        r.btn.querySelector('.rewarded__buy-art')?.remove();
        if (artId) r.btn.insertBefore(icon(artId as 'icon-bulb' | 'icon-paw', { class: 'btn__icon rewarded__buy-art' }), r.btn.firstChild);
      }
      setButtonLabel(r.btn, buyLabel(b));
      r.btn.setAttribute('aria-label', buyA11y(b));
      // One purchase at a time: while one is in flight every other row is gated too, whatever state it came with.
      setGated(r.btn, b.state !== 'ready' || inFlight);
      r.btn.toggleAttribute('aria-busy', b.state === 'loading' || b.state === 'busy');
    }
    buys.hidden = rows.length === 0;
    shell.panel.dataset.buy = String(rows.length);
    return inFlight;
  };

  const render = (p: RewardedPromptProps): void => {
    props = p;
    // Static labels follow the language on every open (review A11Y-I18N-1).
    setButtonLabel(notNow, t('common.notNow'));
    setButtonLabel(ok, t('common.ok'));
    shell.panel.dataset.variant = p.variant;
    shell.panel.dataset.placement = p.placement;
    clear(iconSlot);
    iconSlot.appendChild(icon(ART[p.placement]));
    setText(title, t(TITLE[p.placement]));
    setText(body, bodyText(p));

    const countdown = p.variant === 'countdown';
    accept.hidden = countdown;
    notNow.hidden = countdown;
    ok.hidden = !countdown;
    // The preferred first focus follows the visible primary button (Phase 2e §4.6: Watch video when present,
    // else the first Buy, else Not now / OK).
    accept.toggleAttribute('data-autofocus', !countdown);
    ok.toggleAttribute('data-autofocus', countdown);
    // Phase 2e: the Buy rows; while a purchase is in flight every button is disabled (aria-disabled keeps focus).
    const wasBusy = shell.panel.hasAttribute('data-purchasing');
    const inFlight = renderBuys(p);
    shell.panel.toggleAttribute('data-purchasing', inFlight);
    for (const b of [accept, notNow, ok]) setGated(b, inFlight);
    // After a cancel (busy → ready) focus returns to the Buy that was tapped.
    if (wasBusy && !inFlight && lastTapped) {
      const r = buyRows.get(lastTapped);
      const doc = shell.el.ownerDocument;
      if (r && r.btn.isConnected && (doc.activeElement === null || doc.activeElement === doc.body || !shell.el.contains(doc.activeElement) || doc.activeElement.getAttribute('aria-disabled') === 'true')) r.btn.focus();
    }
    setButtonLabel(accept, p.variant === 'video' ? t('rewarded.watch') : t('rewarded.take'));
    if (p.variant === 'video') {
      if (videoIcon.parentNode !== accept) accept.insertBefore(videoIcon, accept.firstChild);
    } else {
      videoIcon.remove();
    }

    if (countdown) {
      ticker.start(TICK_MS, () => {
        if (props) setText(body, bodyText(props));
      });
    } else {
      ticker.stop();
    }
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      ticker.stop();
      shell.hide();
    },
    dismiss: decline,
    destroy() {
      ticker.stop();
      props = null;
      shell.el.remove();
    },
  };
}
