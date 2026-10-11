// Owner: G1 (Phase 2e)
// The ranking's app code as ONE lazy import (docs/phase2e/spec.md §2.12, §7.9: "ladder-flow + ladder-client +
// remote-config + the shared validators" in a core lazy chunk): boot loads it at step 8 only where the
// ranking origin is in use, so web-prod never downloads it and never sends a request. Not the `ladder` UI
// chunk (app/ladder-chunk.ts), whose views the flow loads on its own.
export { createLadderClient, deviceCredential } from './ladder-client';
export { createLadderFlow } from './ladder-flow';
export { createRemoteConfig } from './remote-config';
