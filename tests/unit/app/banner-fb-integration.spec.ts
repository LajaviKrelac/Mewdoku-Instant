// Owner: C + D (D-2e-25 review round 3, 2026-10-15). The banner flow (C, banner-flow.ts) wired to the FB adapter (D,
// fb-banner.ts) over an SDK whose loads land when the test says so: the SDK's state must match what the flow believes
// (a banner is up iff its last answered show() was ok, or 'timeout' = maybe up, and no hide() since). R3-4: Home's
// banner kept into the board (no hide), the board's own load (after the window) hangs and is given up, O4's first Retry
// (no interstitial, no hide) loads again and comes back empty, and the given-up board load lands late: round 2 took
// the banner down (only a NEWER load's ok counted), the flow kept `shown` with nothing on screen and every re-show path
// blocked. Now the late landing only refreshes the slot the flow counts as up.
import { describe, expect, it } from 'vitest';
import { createBannerFlow, type BannerFlow } from '../../../src/app/banner-flow';
import { cfg } from '../../../src/app/config';
import { createShell, type Shell } from '../../../src/app/shell';
import type { SaveData } from '../../../src/game/types';
import { createFbBanner } from '../../../src/platform/fb/fb-banner';
import type { FBInstantSDK } from '../../../src/platform/fb/fbinstant';
import { createHarness, loseGame, startLevel, type Harness } from './harness';

const veteran = (s: SaveData): SaveData => ({ ...s, progress: { level: 15, completed: 14, best: {} }, stock: { hints: 0, kitties: 3 } });
const WINDOW = cfg.ads.banner.minReloadSec * 1000;

/** Meta's banner as far as the test can see it: a load that resolves shows one (load = show); a hide takes it down. */
interface FakeSdk {
  onScreen: boolean;
  hideCalls: number;
  readonly loads: { resolve(): void; reject(code: string): void }[];
}

function play(): { h: Harness; flow: BannerFlow; shell: Shell; fake: FakeSdk } {
  const fake: FakeSdk = { onScreen: false, hideCalls: 0, loads: [] };
  const sdk = {
    loadBannerAdAsync: () =>
      new Promise<void>((resolve, reject) => {
        fake.loads.push({
          resolve: () => {
            fake.onScreen = true;
            resolve();
          },
          reject: (code) => reject({ code, message: '' }),
        });
      }),
    hideBannerAdAsync: () => {
      fake.hideCalls++;
      fake.onScreen = false;
      return Promise.resolve();
    },
  } as unknown as FBInstantSDK;
  let flow: BannerFlow | null = null;
  let shell: Shell | null = null;
  const h = createHarness({
    save: veteran,
    caps: { banner: true, interstitial: false },
    extra: (p) => {
      p.platform.ads.banner = createFbBanner(sdk, { placement: 'ban-1', timers: p.clock, config: p.config });
      const f = createBannerFlow({ platform: p.platform, store: p.store, clock: p.clock, config: p.config });
      flow = f;
      return { banners: f, goHome: () => shell?.showHome(), openSettings: () => shell?.openSettings() };
    },
  });
  shell = createShell({
    store: h.store,
    bus: h.bus,
    clock: h.clock,
    router: h.router,
    platform: h.platform,
    saves: h.saves,
    session: () => h.session,
    audio: { setMuted: () => undefined },
    applyReducedMotion: () => false,
    version: 'test',
    banners: flow as unknown as BannerFlow,
    config: h.config,
  });
  return { h, flow: flow as unknown as BannerFlow, shell, fake };
}

/** The band the game screen was last rendered with (GameView.bannerBand). */
const band = (h: Harness): boolean | undefined => h.router.game?.last.bannerBand;

describe('banner flow + FB adapter (D-2e-25 review round 3, 2026-10-15)', () => {
  it('R3-4: Home → Play (kept) → the board load given up → O4 → Retry empty: the late board load leaves the banner the flow counts as up', async () => {
    const { h, flow, shell, fake } = play();
    shell.showHome();
    await h.settle(0);
    expect(fake.loads).toHaveLength(1);
    fake.loads[0]?.resolve(); // L1: Home's banner
    await h.settle(0);
    expect([flow.showing(), fake.onScreen]).toEqual([true, true]);

    await h.settle(WINDOW);
    await startLevel(h, 15); // banner-to-banner: no hide; the board entry's end loads after the window (L2)
    expect(fake.hideCalls).toBe(0);
    expect(fake.loads).toHaveLength(2);
    await h.settle(cfg.ads.readyTimeoutMs); // L2 answers 'timeout' (maybe up); L1's banner stays
    expect(band(h)).toBe(true);

    await loseGame(h); // O4 keeps it
    expect(h.router.isOpen('fail')).toBe(true);
    await h.settle(WINDOW); // the window (and stuckLoadMs) since L2
    await h.session.onRetry(); // no interstitial (caps), no hide: a new board entry
    await h.settle(h.config.fx.boardEntryMs);
    expect(fake.loads).toHaveLength(3); // L2 given up: L3
    expect(fake.hideCalls).toBe(0);

    fake.loads[1]?.resolve(); // L2 lands late
    await h.settle(0);
    fake.loads[2]?.reject('ADS_NO_FILL'); // the Retry's load is empty: the flow keeps L1's banner (shown)
    await h.settle(0);
    expect(fake.hideCalls).toBe(0);
    expect([flow.showing(), fake.onScreen]).toEqual([true, true]); // the SDK matches the flow
    expect(band(h)).toBe(true);
    await h.settle(10_000);
    expect([flow.showing(), fake.onScreen, fake.hideCalls]).toEqual([true, true, 0]);

    // The flow's next hide (Settings over the board) reaches the SDK and takes it down.
    h.router.game?.cb.onSettings();
    await h.settle(0);
    expect([flow.showing(), fake.onScreen, fake.hideCalls]).toEqual([false, false, 1]);
  });
});
