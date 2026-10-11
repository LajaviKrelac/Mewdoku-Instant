// Owner: lead (preview link, 2026-10-11). The preview's ads: src/platform/web/mock-ads.ts (the e2e / dev mock: its
// ?ads= modes, one ad at a time, the banner bar at the game screen's band) with our own full-screen presenter and
// the banner labelled "Preview ad". The game's real rules decide WHEN any of them shows (src/game/ad-pacing.ts, the
// banner flow, the helper flows); this module only draws them:
//   - an interstitial: "Preview ad · Full-screen ad", closable after 2 s (a countdown on the button), gone by itself
//     after 30 s (well inside ads.showWatchdogMs);
//   - a rewarded video: "Preview ad · Rewarded video" with what it pays, a 3 s progress bar, then it closes and
//     grants; "Close without reward" before the end answers 'skipped' (no reward, as on FB).
import { createMockAds, createMockBanner, readMockAdMode, type MockAdPresenter } from '../src/platform/web/mock-ads';
import type { AdKind, PlatformAds, PlatformTimers } from '../src/platform/types';
import { fill, S } from './strings';

export const PREVIEW_AD = {
  /** An interstitial can be closed after this long. */
  closableAfterMs: 2000,
  /** …and closes by itself after this long. */
  autoCloseMs: 30_000,
  /** A rewarded video grants after this long. */
  rewardedMs: 3000,
} as const;

/** The full-screen preview ad; resolves 'ok' when closed normally or watched, 'skipped' when a video was cut short. */
export function previewPresenter(doc: Document, timers: PlatformTimers, timing: Partial<typeof PREVIEW_AD> = {}): MockAdPresenter {
  const t = { ...PREVIEW_AD, ...timing };
  return (kind: AdKind, placement: string) =>
    new Promise<'ok' | 'skipped'>((resolve) => {
      const root = doc.createElement('div');
      root.className = `mwp-ad mwp-ad--${kind}`;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', `${S.ad.badge}: ${kind === 'rewarded' ? S.ad.rewardedTitle : S.ad.interstitialTitle}`);
      // The attributes the e2e specs already look for (MOCK_AD_TEST_ID).
      root.setAttribute('data-testid', 'mock-ad');
      root.setAttribute('data-kind', kind);
      root.setAttribute('data-placement', placement);
      const card = doc.createElement('div');
      card.className = 'mwp-ad__card';
      const badge = doc.createElement('p');
      badge.className = 'mwp-badge';
      badge.textContent = S.ad.badge;
      const title = doc.createElement('h2');
      title.className = 'mwp-ad__title';
      title.textContent = kind === 'rewarded' ? S.ad.rewardedTitle : S.ad.interstitialTitle;
      const body = doc.createElement('p');
      body.className = 'mwp-ad__body';
      body.textContent = kind === 'rewarded' ? (S.ad.reward[placement] ?? S.ad.rewardedTitle) : S.ad.interstitialBody;
      card.append(badge, title, body);
      const timersSet: number[] = [];
      let done = false;
      const finish = (r: 'ok' | 'skipped'): void => {
        if (done) return;
        done = true;
        for (const id of timersSet) timers.clearTimeout(id);
        root.remove();
        resolve(r);
      };
      const button = (text: string, cls: string): HTMLButtonElement => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `mwp-btn ${cls}`;
        b.textContent = text;
        return b;
      };
      if (kind === 'interstitial') {
        const close = button(fill(S.ad.closeIn, { s: Math.ceil(t.closableAfterMs / 1000) }), 'mwp-btn--primary mwp-ad__close');
        close.disabled = true;
        close.addEventListener('click', () => finish('ok'));
        card.append(close);
        let left = Math.ceil(t.closableAfterMs / 1000);
        const tick = (): void => {
          left -= 1;
          if (left > 0) {
            close.textContent = fill(S.ad.closeIn, { s: left });
            timersSet.push(timers.setTimeout(tick, 1000));
          } else {
            close.textContent = S.ad.close;
            close.disabled = false;
            close.focus();
          }
        };
        timersSet.push(timers.setTimeout(tick, Math.min(1000, t.closableAfterMs)));
        timersSet.push(timers.setTimeout(() => finish('ok'), t.autoCloseMs));
      } else {
        const bar = doc.createElement('div');
        bar.className = 'mwp-ad__bar';
        const fillEl = doc.createElement('div');
        fillEl.className = 'mwp-ad__fill';
        fillEl.style.animationDuration = `${t.rewardedMs}ms`;
        bar.append(fillEl);
        const status = doc.createElement('p');
        status.className = 'mwp-ad__status';
        status.setAttribute('aria-live', 'polite');
        let left = Math.ceil(t.rewardedMs / 1000);
        status.textContent = fill(S.ad.rewardIn, { s: left });
        const skip = button(S.ad.skip, 'mwp-btn--ghost mwp-ad__skip');
        skip.addEventListener('click', () => finish('skipped'));
        card.append(bar, status, skip);
        const tick = (): void => {
          left -= 1;
          if (left > 0) {
            status.textContent = fill(S.ad.rewardIn, { s: left });
            timersSet.push(timers.setTimeout(tick, 1000));
          }
        };
        timersSet.push(timers.setTimeout(tick, 1000));
        timersSet.push(
          timers.setTimeout(() => {
            status.textContent = S.ad.rewardDone;
            finish('ok');
          }, t.rewardedMs),
        );
      }
      root.append(card);
      // Swallow input so nothing underneath reacts while the "ad" plays (as the mock does).
      for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) root.addEventListener(type, (e) => e.stopPropagation());
      (doc.body ?? doc.documentElement).appendChild(root);
    });
}

/** PlatformAds of the preview: the mock's modes (?ads=…), our presenter, the banner bar labelled "Preview ad". */
export function createPreviewAds(doc: Document, timers: PlatformTimers, search: string): PlatformAds {
  const mode = readMockAdMode(search);
  const ads = createMockAds(mode, { doc, timers, present: previewPresenter(doc, timers) });
  const banner = createMockBanner(mode, { doc, label: () => S.ad.banner });
  return banner ? { ...ads, banner } : ads;
}
