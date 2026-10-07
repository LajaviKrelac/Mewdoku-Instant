// Owner: platform
// Safe localStorage JSON I/O (04 §6.2, §7.2): try/catch everywhere, in-memory fallback on failure,
// unparseable data backed up under save.corruptKeyPrefix + timestamp (keeping the last corruptKeep).
import type { StorageStatus } from '../types';

export interface LocalStore {
  /** Parsed value, or null when absent. corrupt = present but unparseable (and backed up). */
  read(): { value: unknown | null; corrupt: boolean };
  /** Writes JSON; on failure switches to memory and returns false. */
  write(value: unknown): boolean;
  status(): StorageStatus;
}

/** window.localStorage if usable (feature test with try/catch), else null. */
export function safeLocalStorage(): Storage | null {
  throw new Error('not implemented: safeLocalStorage');
}

export function createLocalStore(
  key: string,
  opts?: { storage?: Storage | null; now?: () => number },
): LocalStore {
  throw new Error('not implemented: createLocalStore');
}
