// Owner: G4 (Phase 2e). Request bodies (spec §1.4): JSON as `application/json` or `text/plain` (the latter
// needs no CORS preflight), UTF-8, at most `api.maxBodyBytes` (16 KB) → else 413 `too_large`, read with a
// streaming cap so an oversized body is never buffered whole.
import { fail } from './errors';

const ALLOWED_TYPES = ['application/json', 'text/plain'];

export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const type = (req.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type !== '' && !ALLOWED_TYPES.includes(type)) fail('bad_request', 'content-type: application/json or text/plain');
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) fail('too_large', `body over ${maxBytes} bytes`);
  const body = req.body;
  if (body === null) return fail('bad_request', 'body: JSON expected');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      fail('too_large', `body over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(all);
  } catch {
    return fail('bad_request', 'body: not UTF-8');
  }
  if (text.trim() === '') return fail('bad_request', 'body: JSON expected');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail('bad_request', 'body: not JSON');
  }
}
