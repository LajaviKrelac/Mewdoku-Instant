// Owner: D (Phase 2b; was platform)
// Dev/e2e mock ads (04 §6.2): ?ads=ok|nofill|unsupported|close, a placeholder overlay for
// cfg.ads.mock.durationMs. Never bundled in production web or fbig builds.
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
