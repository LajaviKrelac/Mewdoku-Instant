// Owner: platform
// Safe localStorage JSON I/O (04 §6.2, §7.2): try/catch everywhere, in-memory fallback on failure,
// unparseable data backed up under save.corruptKeyPrefix + timestamp (keeping the last corruptKeep).
import { cfg, type GameConfig } from '../../app/config';
import type { StorageStatus } from '../types';

export interface LocalStore {
  /** Parsed value, or null when absent. corrupt = present but unparseable (and backed up). */
  read(): { value: unknown | null; corrupt: boolean };
  /** Writes JSON; on failure switches to memory and returns false. */
  write(value: unknown): boolean;
  status(): StorageStatus;
  /**
   * One-time warning hook: `cb` runs once, the first time the store is (or becomes) memory-only,
   * immediately when it already is. Every registered callback fires at most once.
   */
  onMemory?(cb: () => void): void;
}

const PROBE_KEY = 'mewdoku.probe';

/** window.localStorage if usable (feature test with try/catch), else null. */
export function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    if (!s) return null;
    s.setItem(PROBE_KEY, '1');
    s.removeItem(PROBE_KEY);
    return s;
  } catch {
    // Safari private mode (old), disabled cookies / site data, sandboxed iframes: all throw here.
    return null;
  }
}

export function createLocalStore(
  key: string,
  opts?: { storage?: Storage | null; now?: () => number; config?: GameConfig },
): LocalStore {
  const c = opts?.config ?? cfg;
  const now = opts?.now ?? (() => Date.now());
  let storage: Storage | null = opts?.storage === undefined ? safeLocalStorage() : opts.storage;
  /** JSON text while memory-only (a copy, like real storage, so callers cannot alias it). */
  let memory: string | null = null;
  const waiting: (() => void)[] = [];

  const switchToMemory = (json: string | null): void => {
    storage = null;
    memory = json;
    const cbs = waiting.splice(0);
    for (const cb of cbs) safeCall(cb);
  };

  const backUpCorrupt = (s: Storage, raw: string): void => {
    try {
      s.setItem(`${c.save.corruptKeyPrefix}${now()}`, raw);
      s.removeItem(key);
      pruneBackups(s, c.save.corruptKeyPrefix, c.save.corruptKeep);
    } catch {
      /* quota: keep the original key untouched; defaults are used either way */
    }
  };

  return {
    read() {
      let raw: string | null;
      if (storage) {
        try {
          raw = storage.getItem(key);
        } catch {
          switchToMemory(null);
          raw = null;
        }
      } else {
        raw = memory;
      }
      if (raw === null) return { value: null, corrupt: false };
      try {
        return { value: JSON.parse(raw) as unknown, corrupt: false };
      } catch {
        if (storage) backUpCorrupt(storage, raw);
        else memory = null;
        return { value: null, corrupt: true };
      }
    },
    write(value) {
      let json: string;
      try {
        json = JSON.stringify(value) ?? 'null';
      } catch {
        return false; // not serialisable (cycle): a programming error, never a storage switch
      }
      if (storage) {
        try {
          storage.setItem(key, json);
          return true;
        } catch {
          switchToMemory(json); // quota exceeded or storage revoked mid-session
          return false;
        }
      }
      memory = json;
      return false;
    },
    status: () => (storage ? 'ok' : 'memory'),
    onMemory(cb) {
      if (storage) waiting.push(cb);
      else safeCall(cb);
    },
  };
}

function safeCall(cb: () => void): void {
  try {
    cb();
  } catch {
    /* a listener must never break storage */
  }
}

/** Removes the oldest `prefix<ts>` backups so that at most `keep` remain. */
function pruneBackups(s: Storage, prefix: string, keep: number): void {
  const found: { key: string; ts: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k !== null && k.startsWith(prefix)) found.push({ key: k, ts: Number(k.slice(prefix.length)) || 0 });
  }
  found.sort((a, b) => b.ts - a.ts);
  for (const old of found.slice(Math.max(0, keep))) s.removeItem(old.key);
}
