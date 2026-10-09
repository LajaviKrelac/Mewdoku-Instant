// Owner: C (Phase 2b; was app)
// ~30-line promise RPC over postMessage (04 §5.5). Structured-clone payloads (typed arrays are fine).

export interface MessagePortLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
}

export interface RpcRequest {
  readonly id: number;
  readonly method: string;
  readonly args: readonly unknown[];
}
export type RpcResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string };

/** Every method of T, returning a promise. */
export type Remote<T> = {
  readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

/** Client channel: the remote proxy plus a way to fail every pending call (worker crashed). */
export interface RpcChannel<T> {
  readonly remote: Remote<T>;
  /** Rejects every pending call with `reason`. */
  rejectAll(reason: string): void;
  pending(): number;
  /** Stops listening and rejects pending calls. */
  dispose(): void;
}

function isResponse(x: unknown): x is RpcResponse {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as { id?: unknown; ok?: unknown };
  return typeof r.id === 'number' && typeof r.ok === 'boolean';
}

function isRequest(x: unknown): x is RpcRequest {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as { id?: unknown; method?: unknown; args?: unknown };
  return typeof r.id === 'number' && typeof r.method === 'string' && Array.isArray(r.args);
}

/** MessagePort needs start() when listening through addEventListener; Workers and windows do not. */
function startPort(port: MessagePortLike): void {
  const p = port as MessagePortLike & { start?: () => void };
  if (typeof p.start === 'function') p.start();
}

export function createRpcChannel<T extends object>(port: MessagePortLike): RpcChannel<T> {
  let nextId = 1;
  const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  const onMessage = (ev: MessageEvent): void => {
    const msg: unknown = ev.data;
    if (!isResponse(msg)) return;
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.ok) w.resolve(msg.value);
    else w.reject(new Error(msg.error));
  };
  port.addEventListener('message', onMessage);
  startPort(port);

  const call = (method: string, args: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      const req: RpcRequest = { id, method, args };
      try {
        port.postMessage(req);
      } catch (err) {
        waiting.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  const remote = new Proxy({} as Remote<T>, {
    // 'then' stays undefined so the proxy is never mistaken for a thenable.
    get: (_target, prop) =>
      typeof prop === 'string' && prop !== 'then' ? (...args: unknown[]) => call(prop, args) : undefined,
  });

  const rejectAll = (reason: string): void => {
    const all = [...waiting.values()];
    waiting.clear();
    for (const w of all) w.reject(new Error(reason));
  };

  return {
    remote,
    rejectAll,
    pending: () => waiting.size,
    dispose() {
      port.removeEventListener('message', onMessage);
      rejectAll('rpc disposed');
    },
  };
}

/** Client side: method calls become requests; rejections carry the worker's error message. */
export function createRpcClient<T extends object>(port: MessagePortLike): Remote<T> {
  return createRpcChannel<T>(port).remote;
}

/** Worker side: answers requests by calling `api[method](...args)`. Returns the unsubscribe. */
export function exposeRpc<T extends object>(api: T, port: MessagePortLike): () => void {
  const table = api as unknown as Record<string, unknown>;
  const reply = (res: RpcResponse): void => port.postMessage(res);
  const onMessage = (ev: MessageEvent): void => {
    const msg: unknown = ev.data;
    if (!isRequest(msg)) return;
    const fn = Object.prototype.hasOwnProperty.call(table, msg.method) ? table[msg.method] : undefined;
    if (typeof fn !== 'function') {
      reply({ id: msg.id, ok: false, error: `unknown method: ${msg.method}` });
      return;
    }
    Promise.resolve()
      .then(() => (fn as (...a: unknown[]) => unknown).apply(api, [...msg.args]))
      .then(
        (value) => reply({ id: msg.id, ok: true, value }),
        (err: unknown) => reply({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
  };
  port.addEventListener('message', onMessage);
  startPort(port);
  return () => port.removeEventListener('message', onMessage);
}
