// Owner: G4 (Phase 2e). The server never redefines a wire type: it re-exports the shared contract
// (src/shared/rank-api.ts, CONTRACTS §2), which both bundles compile on their own.
export * from '../../../src/shared/rank-api';
// The response parsers (split out of rank-api.ts at the lead's I-2/I-4 so the client's first load stays small).
export * from '../../../src/shared/rank-api-parse';
// UI batch (profile): the shape of a typed name, shared with the client's name sheet.
export * from '../../../src/shared/nick-text';
