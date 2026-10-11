// Owner: G4 (Phase 2e). The server never redefines a wire type: it re-exports the shared contract
// (src/shared/rank-api.ts, CONTRACTS §2), which both bundles compile on their own.
export * from '../../../src/shared/rank-api';
