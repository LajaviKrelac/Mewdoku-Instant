// Owner: G4 (Phase 2e). JSON responses and API errors (spec §1.4): every response is JSON with
// `serverTime` and `Cache-Control: no-store`; an error is `{error: {code, message, retryAfterMs?}, serverTime}`
// with the code's status from the shared ERROR_STATUS. The client branches on `code` only.
import { ERROR_STATUS, type ErrorCode } from '../contract';

/** Thrown anywhere in a handler; the app turns it into the error response. */
export class ApiFail extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, retryAfterMs?: number): never => {
  throw new ApiFail(code, message, retryAfterMs);
};

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function errorResponse(code: ErrorCode, message: string, serverTime: number, retryAfterMs?: number, headers: Record<string, string> = {}): Response {
  const error = retryAfterMs === undefined ? { code, message } : { code, message, retryAfterMs: Math.max(0, Math.ceil(retryAfterMs)) };
  const extra: Record<string, string> = retryAfterMs === undefined ? {} : { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) };
  return json({ error, serverTime }, ERROR_STATUS[code], { ...extra, ...headers });
}
