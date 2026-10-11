// Owner: lead (preview link, 2026-10-11). The PREVIEW build's platform (vite.config.ts mode 'preview-link' maps
// '@platform' here, so this module and everything under preview/ exists in that build only): the owner's review
// link, a static page with no server and no Facebook, that shows every Phase 2e feature, each honestly a stand-in:
//   - the web adapter (src/platform/web) with the e2e / dev mock ads (src/platform/web/mock-ads.ts) drawn by our
//     presenter and labelled "Preview ad" (preview/ads.ts): the banner during levels, interstitials, rewarded videos;
//   - payments: a mock store whose dialog says "Preview purchase — nothing is charged" (preview/payments.ts); the
//     shop flow's real consume-first ledger delivers it;
//   - the worldwide ranking against the in-page sample server (preview/sample-server.ts) on the reserved origin the
//     build's VITE_LADDER_URL names (https://sample-ranking.preview.invalid: `.invalid` never resolves, so nothing
//     can leave the page); its other players are samples, said so on the panel, sheet and result card
//     (preview/labels.ts);
//   - the preview menu (preview/ribbon.ts): New player, Returning player, Out of helpers, End ranking day, Reset.
//     A shortcut reloads with ?preview=<op>; the op is applied here, before the game reads its save (and after the
//     old page's last write), then the parameter is dropped from the address. The first visit is the returning
//     player, so the link opens on Home with the streak, the ranking chip and the daily.
// Everything else is the game's real code: the pacing and banner rules, the helper flows, the streak, the daily, the
// ranking client. No global is added for tests (the e2e twin, dist/preview-e2e, has the usual __E2E__ hooks only).
import './preview.css';
import { cfg } from '../src/app/config';
import { ladderEnv } from '../src/app/ladder-origin';
import { migrate } from '../src/game/save';
import type { SaveData } from '../src/game/types';
import { createSystemTimers } from '../src/platform/shared/timers';
import type { Capabilities, PlatformAdapter, RawSave } from '../src/platform/types';
import { createWebPlatform } from '../src/platform/web';
import { safeLocalStorage } from '../src/platform/web/local-storage';
import { readMockAdMode } from '../src/platform/web/mock-ads';
import { createPreviewAds } from './ads';
import { watchSampleLabels } from './labels';
import { confirmSheet, createPreviewPayments, PURCHASES_KEY } from './payments';
import { mountRibbon, PREVIEW_OPS, type PreviewOp } from './ribbon';
import type { SampleServer } from './sample-server';
import { loadState, queueOperation, type SampleState } from './sample-state';
import { outOfHelpersSave, returningSave } from './scenarios';
import { S } from './strings';

/** The menu's state: the scenario shown as "Now:" and whether the card is open. Also marks the first visit. */
export const UI_KEY = 'mewdoku.preview.ui.v1';
/** The app's own keys a new player must not inherit (src/app/ladder-client.ts DEVICE_KEY, ladder-flow.ts ROWS_KEY, remote-config.ts RC_KEY). */
export const APP_KEYS = { device: 'mewdoku.device.v1', rows: 'mewdoku.ladder.rows.v1', remote: 'mewdoku.rc.v1' } as const;
export const OP_PARAM = 'preview';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
type Scenario = 'new' | 'returning' | 'outOfHelpers';
interface UiState {
  readonly v: 1;
  readonly open: boolean;
  readonly scenario: Scenario;
  readonly dayEnded: boolean;
}

export function readUi(storage: KV | null): UiState | null {
  try {
    const raw = storage?.getItem(UI_KEY) ?? null;
    const v = raw ? (JSON.parse(raw) as Partial<UiState>) : null;
    if (v && v.v === 1 && typeof v.open === 'boolean' && (v.scenario === 'new' || v.scenario === 'returning' || v.scenario === 'outOfHelpers')) {
      return { v: 1, open: v.open, scenario: v.scenario, dayEnded: v.dayEnded === true };
    }
  } catch {
    // starts as a first visit
  }
  return null;
}

function writeUi(storage: KV | null, ui: UiState): void {
  try {
    storage?.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // memory only
  }
}

const remove = (storage: KV | null, key: string): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to remove
  }
};

/** Every key of ours (the game's and the preview's): what Reset clears. */
function clearAll(storage: KV | null): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('mewdoku.')) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    // storage went away: nothing to clear
  }
}

/** What the game's storage.load() must return this page load (the scenario's save), when an op set one. */
export type LoadOverride = { readonly save: SaveData | null } | null;

/**
 * Applies a menu op (or the first visit) to storage before the game loads; returns the save the game must start
 * from (null = a fresh save: the tutorial) when the op set one, so it holds even where storage cannot keep it.
 */
export function applyOp(op: PreviewOp, storage: KV | null, now: number, prev: UiState | null): { load: LoadOverride; ui: UiState; rank: SampleState } {
  const fresh = (scenario: Scenario, open: boolean): { ui: UiState } => ({ ui: { v: 1, open, scenario, dayEnded: false } });
  const newPlayerKeys = (): void => {
    remove(storage, APP_KEYS.device); // the next sign-in is a new sample-server player
    remove(storage, APP_KEYS.rows);
    remove(storage, PURCHASES_KEY);
  };
  const writeSave = (save: SaveData): void => {
    try {
      storage?.setItem(cfg.save.storageKey, JSON.stringify(save));
    } catch {
      // the override below still starts the game from it
    }
  };
  switch (op) {
    case 'new': {
      remove(storage, cfg.save.storageKey);
      newPlayerKeys();
      const rank = queueOperation(storage, 'reset');
      return { load: { save: null }, rank, ...fresh('new', prev?.open ?? true) };
    }
    case 'returning':
    case 'reset': {
      if (op === 'reset') clearAll(storage);
      const save = returningSave(now);
      writeSave(save);
      newPlayerKeys();
      const rank = queueOperation(storage, 'returning');
      return { load: { save }, rank, ...fresh('returning', op === 'reset' ? true : (prev?.open ?? true)) };
    }
    case 'outOfHelpers': {
      let current: SaveData | null = null;
      try {
        const raw = storage?.getItem(cfg.save.storageKey) ?? null;
        current = raw ? migrate(JSON.parse(raw) as unknown, now) : null;
      } catch {
        current = null;
      }
      const save = outOfHelpersSave(current, now);
      writeSave(save);
      // A new player had no ranking day yet: they become the returning player with no helpers.
      const seed = !current || !current.tutorialDone;
      if (seed) newPlayerKeys();
      const rank = seed ? queueOperation(storage, 'returning') : loadState(storage);
      return { load: { save }, rank, ...fresh('outOfHelpers', prev?.open ?? true) };
    }
    case 'endDay': {
      if (!storage) {
        // Nothing survives a reload without storage: the day ends for the first visit's player, the returning one.
        const r = applyOp('returning', null, now, prev);
        r.rank.pending.endDay = true;
        return { ...r, ui: { ...r.ui, dayEnded: true } };
      }
      const rank = queueOperation(storage, 'endDay');
      remove(storage, APP_KEYS.rows);
      return { load: null, rank, ui: { v: 1, open: prev?.open ?? true, scenario: prev?.scenario ?? 'returning', dayEnded: true } };
    }
  }
}

/** ?preview=<op> of the address, removed from it (history.replaceState) so a manual reload does not apply it again. */
export function takeOp(win: Pick<Window, 'location' | 'history'>): PreviewOp | null {
  try {
    const url = new URL(win.location.href);
    const v = url.searchParams.get(OP_PARAM);
    if (v === null) return null;
    url.searchParams.delete(OP_PARAM);
    try {
      win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
    } catch {
      // a sandboxed frame: the parameter stays (applying it again on a manual reload is harmless)
    }
    return (PREVIEW_OPS as readonly string[]).includes(v) ? (v as PreviewOp) : null;
  } catch {
    return null;
  }
}

/** The address that applies `op` on load (the other parameters, e.g. ?ads=, are kept). */
export function opUrl(href: string, op: PreviewOp): string {
  const url = new URL(href);
  url.searchParams.set(OP_PARAM, op);
  return url.href;
}

/** Routes the sample origin's requests to the in-page server; everything else goes to the network as before. */
export function routeSampleFetch(win: Window & typeof globalThis, origin: string, server: Pick<SampleServer, 'fetch'>): () => void {
  const real = win.fetch.bind(win);
  const prefix = `${origin}/`;
  const routed = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith(prefix) ? server.fetch(input, init) : real(input, init);
  }) as typeof fetch;
  win.fetch = routed;
  return () => {
    if (win.fetch === routed) win.fetch = real;
  };
}

function buildStamp(): string | null {
  const b = typeof __PREVIEW_BUILD__ !== 'undefined' ? __PREVIEW_BUILD__ : undefined;
  if (!b) return null;
  const at = b.at.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC');
  return `${S.built} ${at}${b.sha ? ` · ${b.sha}` : ''} · v${b.version}`;
}

function scenarioLabel(ui: UiState): string {
  const name = S.scenario[ui.scenario];
  return ui.dayEnded ? `${name} · ${S.dayEnded}` : name;
}

/** Entry used by main.ts through the '@platform' alias (preview build only). */
export function createPlatform(): PlatformAdapter {
  const win = window;
  const doc = document;
  const storage = safeLocalStorage();
  const now = Date.now();

  // 1. The menu's op of this load, or the first visit (the returning player).
  const prev = readUi(storage);
  const fromMenu = takeOp(win);
  const op = fromMenu ?? (prev === null ? 'reset' : null);
  let ui: UiState = prev ?? { v: 1, open: true, scenario: 'returning', dayEnded: false };
  let load: LoadOverride = null;
  let rank: SampleState | null = null;
  if (op) {
    const r = applyOp(op, storage, now, prev);
    load = r.load;
    // A shortcut comes back with the menu closed (the scenario is what the owner wants to see); Reset opens it.
    ui = fromMenu && fromMenu !== 'reset' ? { ...r.ui, open: false } : r.ui;
    rank = r.rank;
  }
  writeUi(storage, ui);

  // 2. The sample ranking server on the build's ranking origin, loaded with its first request (it carries G4's
  //    solution table, which the game's own first load must not pay for).
  const origin = ladderEnv().url;
  let server: Promise<SampleServer> | null = null;
  const lazy: Pick<SampleServer, 'fetch'> = {
    fetch: (input, init) => (server ??= import('./sample-server').then((m) => m.createSampleServer({ storage, latencyMs: 120, initial: rank }))).then((s) => s.fetch(input, init)),
  };
  if (origin) routeSampleFetch(win, origin, lazy);

  // 3. The web adapter, the preview's ads and the mock store.
  const timers = createSystemTimers();
  const base = createWebPlatform({ mockAds: false, timers, doc, storage });
  const search = win.location.search;
  const adsOn = readMockAdMode(search) !== 'unsupported';
  const ads = createPreviewAds(doc, timers, search);
  const payments = createPreviewPayments({ storage, confirm: confirmSheet(doc) });
  const caps: Capabilities = Object.freeze({
    ...base.capabilities(),
    interstitial: adsOn,
    rewarded: adsOn,
    banner: adsOn && ads.banner !== undefined,
    payments: true,
    paymentsIos: false,
  });

  // 4. The menu and the "sample players" lines.
  mountRibbon(doc, {
    current: scenarioLabel(ui),
    build: buildStamp(),
    open: ui.open,
    onToggle: (open) => {
      ui = { ...ui, open };
      writeUi(storage, ui);
    },
    onAction: (next) => {
      ui = { ...ui, open: false };
      writeUi(storage, ui);
      win.location.replace(opUrl(win.location.href, next));
    },
  });
  watchSampleLabels(doc);

  const storageOf = base.storage;
  return {
    ...base,
    capabilities: () => caps,
    ads,
    payments,
    storage: {
      ...storageOf,
      async load(): Promise<RawSave> {
        const raw = await storageOf.load();
        if (load === null) return raw;
        const save = load.save;
        load = null; // once: a later load (none today) reads storage
        return { local: save, cloud: null, corrupt: false };
      },
    },
  };
}
