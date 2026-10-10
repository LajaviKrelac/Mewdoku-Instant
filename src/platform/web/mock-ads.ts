// Owner: D (Phase 2b; was platform)
// Dev/e2e mock ads (04 §6.2): ?ads=ok|nofill|unsupported|close, a placeholder overlay for
// cfg.ads.mock.durationMs. Never bundled in production web or fbig builds.
// phase2b §3.3: the same ?ads= mode drives a mock banner, a 50 px grey "Banner placeholder" bar fixed
// at the bottom, shown and hidden by the app's banner rules exactly like the FB banner (ok / close:
// shown; nofill: no_fill; unsupported: no banner at all).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.16): the bar also shows on the game screen (banner during
// play). There it is drawn like the original's banner, 320 × 50 and centred, at the band the game
// screen reserves: its bottom edge at var(--play-band-bottom), which the game screen publishes on
// <html> while it is mounted (platform/ may not import ui/). Elsewhere the variables are absent and
// the bar is the 2b full-width bar at the bottom.
import { cfg } from '../../app/config';
import { t } from '../../i18n';
import type { AdKind, AdResult, PlatformAds, PlatformTimers } from '../types';
import { sleep } from '../shared/timers';

export type MockAdMode = 'ok' | 'nofill' | 'unsupported' | 'close';

const MODES: readonly MockAdMode[] = ['ok', 'nofill', 'unsupported', 'close'];

/** Parses `?ads=` from a query string; default 'ok'. */
export function readMockAdMode(search: string): MockAdMode {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get('ads');
  } catch {
    value = null;
  }
  const v = (value ?? '').trim().toLowerCase();
  return (MODES as readonly string[]).includes(v) ? (v as MockAdMode) : 'ok';
}

/** Attribute the e2e tests look for while the placeholder is up. */
export const MOCK_AD_TEST_ID = 'mock-ad';
/** Attribute of the mock banner bar (phase2b §3.3). */
export const MOCK_BANNER_TEST_ID = 'mock-banner';
/** The FB banner's height (50 dp, [search: Meta docs]); the app reserves ads.banner.reservePx around it. */
export const MOCK_BANNER_HEIGHT_PX = 50;
/** Phase 2d §1.16: the standard banner's width, as the original's in the user's recording (320 × 50). */
export const MOCK_BANNER_GAME_WIDTH_PX = 320;

/**
 * The bar's inline style. On the game screen (`--play-band` > 0 on <html>, the band is reserved) the
 * width resolves to 320 px and the bottom to `--play-band-bottom`; elsewhere both variables are absent
 * (0) and the bar spans the viewport at the bottom, as in 2b. CSS only, so the bar follows the screen
 * it is on (a banner may stay up from the victory into the next game screen) without any listener.
 */
export function mockBannerStyle(): string {
  return [
    'position:fixed',
    'left:0',
    'right:0',
    'margin:0 auto',
    // 100 % when --play-band is 0 or absent; any band (≥ 1 px) makes the second term negative → 320 px.
    `width:max(${MOCK_BANNER_GAME_WIDTH_PX}px, calc(100% - var(--play-band, 0px) * 100000))`,
    'max-width:100%',
    'bottom:var(--play-band-bottom, 0px)',
    `height:${MOCK_BANNER_HEIGHT_PX}px`,
    'box-sizing:border-box',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:#d9d9d9',
    'color:#333',
    'font:14px system-ui,-apple-system,sans-serif',
    'border-top:1px solid #bbb',
  ].join(';');
}

/**
 * Mock PlatformAds.banner for dev/e2e (phase2b §3.3), or undefined in 'unsupported' mode. show() puts
 * the bar up (idempotent) and answers ok, or no_fill in 'nofill' mode; hide() takes it down. Never rejects.
 */
export function createMockBanner(mode: MockAdMode, opts: { doc: Document }): PlatformAds['banner'] {
  if (mode === 'unsupported') return undefined;
  const doc = opts.doc;
  let bar: HTMLElement | null = null;
  return {
    show() {
      if (mode === 'nofill') return Promise.resolve({ ok: false, reason: 'no_fill' });
      if (!bar) {
        bar = doc.createElement('div');
        bar.setAttribute('data-testid', MOCK_BANNER_TEST_ID);
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', t('ads.banner.placeholder'));
        bar.textContent = t('ads.banner.placeholder');
        // Inline styles: platform/ may not use ui/ or styles/. Neutral grey, like an empty ad slot.
        bar.style.cssText = mockBannerStyle();
        (doc.body ?? doc.documentElement).appendChild(bar);
      }
      return Promise.resolve({ ok: true });
    },
    hide() {
      bar?.parentNode?.removeChild(bar);
      bar = null;
      return Promise.resolve();
    },
  };
}

/**
 * ok: shows the placeholder, resolves {ok:true}; nofill: {ok:false,'no_fill'}; unsupported:
 * {ok:false,'unsupported'}; close: rewarded resolves {ok:false,'skipped'} (closed early).
 */
export function createMockAds(mode: MockAdMode, opts: { doc: Document; timers: PlatformTimers; durationMs?: number }): PlatformAds {
  const durationMs = opts.durationMs ?? cfg.ads.mock.durationMs;
  let showing = false;

  const show = async (kind: AdKind, placement: string): Promise<AdResult> => {
    if (mode === 'unsupported') return { ok: false, reason: 'unsupported' };
    if (mode === 'nofill') return { ok: false, reason: 'no_fill' };
    if (showing) return { ok: false, reason: 'not_ready' };
    showing = true;
    try {
      await showPlaceholder(opts.doc, opts.timers, durationMs, kind, placement);
    } finally {
      showing = false;
    }
    if (mode === 'close' && kind === 'rewarded') return { ok: false, reason: 'skipped' };
    return { ok: true };
  };

  return {
    preload(): void {},
    isReady: () => (mode === 'ok' || mode === 'close') && !showing,
    showInterstitial: (p) => show('interstitial', p),
    showRewarded: (p) => show('rewarded', p),
  };
}

/** Minimal self-contained full-screen overlay (inline styles: platform/ may not use ui/ or styles/). */
async function showPlaceholder(
  doc: Document,
  timers: PlatformTimers,
  ms: number,
  kind: AdKind,
  placement: string,
): Promise<void> {
  const el = doc.createElement('div');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('ads.placeholder.title'));
  el.setAttribute('data-testid', MOCK_AD_TEST_ID);
  el.setAttribute('data-kind', kind);
  el.setAttribute('data-placement', placement);
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'bottom:0',
    'z-index:2147483647',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'text-align:center',
    'background:rgba(28,24,36,0.94)',
    'color:#fff',
    'font-family:system-ui,-apple-system,sans-serif',
    'touch-action:none',
  ].join(';');
  const title = doc.createElement('strong');
  title.textContent = t('ads.placeholder.title');
  title.style.cssText = 'font-size:22px;margin-bottom:8px';
  const body = doc.createElement('p');
  body.textContent = t('ads.placeholder.body');
  body.style.cssText = 'font-size:15px;margin:0;opacity:0.8';
  el.appendChild(title);
  el.appendChild(body);
  // Swallow input so nothing underneath reacts while the "ad" plays.
  const stop = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) el.addEventListener(type, stop);
  (doc.body ?? doc.documentElement).appendChild(el);
  try {
    await sleep(timers, ms);
  } finally {
    el.parentNode?.removeChild(el);
  }
}
