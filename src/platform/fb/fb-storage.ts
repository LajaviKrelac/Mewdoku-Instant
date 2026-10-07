// Owner: platform
// FB player data (05 §7, 04 §7.1/§7.3): getDataAsync(['save']) + local mirror on load; every write
// mirrored locally at once; setDataAsync debounced cfg.save.cloudDebounceMs; flushDataAsync only for
// 'flush'; NETWORK_FAILURE retried with backoff; PENDING_REQUEST coalesced.
import type { PlatformStorage, PlatformTimers } from '../types';
import type { LocalStore } from '../web/local-storage';
import type { FBInstantSDK } from './fbinstant';

export function createFbStorage(sdk: FBInstantSDK, deps: { local: LocalStore; timers: PlatformTimers }): PlatformStorage {
  throw new Error('not implemented: createFbStorage');
}
