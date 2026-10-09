// Owner: D
// PaymentsProvider over FB payments (phase2b §8.2, §8.4): onReady, getCatalogAsync, purchaseAsync
// ({productID, developerPayload}), getPurchasesAsync (unconsumed), consumePurchaseAsync(token).
// Supported iff getPlatform() !== 'IOS' and 'payments.purchaseAsync' is in getSupportedAPIs(); if
// onReady never fires, payments are unsupported for the session. Errors: USER_INPUT → 'cancelled'
// (silent); PAYMENTS_NOT_INITIALIZED → 'not_ready'; NETWORK_FAILURE, INVALID_PARAM,
// INVALID_OPERATION → 'error'. Never rejects. Lazy `fb-social` chunk. The grant order is C's
// (shop-flow: record, grant, save, then consume).
// F0 stub: signatures final; bodies are D's.
import type { GameConfig } from '../../app/config';
import type { PaymentsProvider, PlatformTimers } from '../types';
import type { FBInstantSDK } from './fbinstant';

export interface FbPaymentsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
}

/** The capabilities().payments rule (§8.4). */
export function paymentsSupported(sdk: FBInstantSDK): boolean {
  void sdk;
  throw new Error('not implemented: paymentsSupported (D, phase2b §8.4)');
}

export function createFbPayments(sdk: FBInstantSDK, opts: FbPaymentsOptions): PaymentsProvider {
  void sdk;
  void opts;
  throw new Error('not implemented: createFbPayments (D, phase2b §8.4)');
}
