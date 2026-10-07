// Owner: game
// Vite asset wiring for the level data (04 §3): pack-000 is a normal JSON import (bundled, no fetch);
// packs 001–009 and the daily months are `?url` assets, emitted as hashed same-origin files and
// fetched on demand. The fetch itself is injected by the app (game/ stays free of I/O globals).
// Missing files are handled gracefully: an absent pack resolves null (→ substitute board at once),
// an absent month resolves null (→ daily generated from its seed, 02 §12).
import type { LevelPack } from '../engine/types';
import pack000 from '../data/levels/pack-000.json';
import type { LevelsRepoDeps } from './levels-repo';

/** pack-000, validated by createLevelsRepo (an invalid bundle → substitute boards, never a crash). */
export const BUNDLED_PACK: LevelPack = pack000 as unknown as LevelPack;

// `base` keeps the keys short ('./pack-001.json', './2026-10.json'): they ship in the main bundle.
const PACK_URLS: Record<string, string> = import.meta.glob<string>(['./pack-*.json', '!./pack-000.json'], {
  query: '?url',
  import: 'default',
  eager: true,
  base: '../data/levels',
});
const DAILY_URLS: Record<string, string> = import.meta.glob<string>('./*.json', {
  query: '?url',
  import: 'default',
  eager: true,
  base: '../data/daily',
});

/** URL of pack k (1..9), or null when that file is not in the build. */
export function packUrl(packIndex: number): string | null {
  return PACK_URLS[`./pack-${String(packIndex).padStart(3, '0')}.json`] ?? null;
}

/** URL of daily/YYYY-MM.json, or null when that month is not in the build. */
export function dailyMonthUrl(month: string): string | null {
  return DAILY_URLS[`./${month}.json`] ?? null;
}

/** Pack indices and months present in this build (diagnostics and tests). */
export function availableAssets(): { packs: number[]; months: string[] } {
  const packs = Object.keys(PACK_URLS)
    .map((k) => Number(/pack-(\d+)\.json$/.exec(k)?.[1] ?? NaN))
    .filter((k) => Number.isInteger(k))
    .sort((a, b) => a - b);
  const months = Object.keys(DAILY_URLS)
    .map((k) => /(\d{4}-\d{2})\.json$/.exec(k)?.[1] ?? '')
    .filter((m) => m !== '')
    .sort();
  return { packs, months };
}

/**
 * The repo's loaders, given a JSON fetcher (the app passes app/fetch-json's fetchJsonWithTimeout).
 * Rejections are retried by the repo. The fetcher must reject on a timeout, never hang (04 §8): a
 * pending load is shared by every later request for that pack or month until it settles.
 */
export function createAssetLoaders(
  fetchJson: (url: string) => Promise<unknown>,
): Pick<LevelsRepoDeps, 'bundled' | 'loadPack' | 'loadDailyMonth'> {
  return {
    bundled: BUNDLED_PACK,
    loadPack(packIndex: number): Promise<unknown> {
      const url = packUrl(packIndex);
      return url ? fetchJson(url) : Promise.resolve(null);
    },
    loadDailyMonth(month: string): Promise<unknown | null> {
      const url = dailyMonthUrl(month);
      return url ? fetchJson(url) : Promise.resolve(null);
    },
  };
}
