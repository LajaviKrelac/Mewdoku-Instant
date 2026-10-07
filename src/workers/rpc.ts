// Owner: app
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

/** Client side: method calls become requests; rejections carry the worker's error message. */
export function createRpcClient<T extends object>(port: MessagePortLike): Remote<T> {
  throw new Error('not implemented: createRpcClient');
}

/** Worker side: answers requests by calling `api[method](...args)`. Returns the unsubscribe. */
export function exposeRpc<T extends object>(api: T, port: MessagePortLike): () => void {
  throw new Error('not implemented: exposeRpc');
}
