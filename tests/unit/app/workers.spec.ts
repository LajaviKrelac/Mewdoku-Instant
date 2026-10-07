// Owner: app. RPC over postMessage and the engine client's worker / main-thread fallback (04 §5.5).
import { describe, expect, it } from 'vitest';
import type { GenResult, GenSpec } from '../../../src/engine/types';
import { createEngineClient } from '../../../src/workers/engine-client';
import { engineWorkerApi } from '../../../src/workers/engine.worker';
import { createRpcChannel, createRpcClient, exposeRpc, type MessagePortLike } from '../../../src/workers/rpc';
import { levelPuzzle, WRONG5 } from './harness';

interface Api {
  add(a: number, b: number): number;
  sum(xs: Uint8Array): number;
  fail(): never;
  slow(ms: number): Promise<string>;
}

const api: Api = {
  add: (a, b) => a + b,
  sum: (xs) => xs.reduce((s, x) => s + x, 0),
  fail: () => {
    throw new Error('nope');
  },
  slow: (ms) => new Promise((r) => setTimeout(() => r(`done ${ms}`), ms)),
};

describe('rpc', () => {
  it('round-trips calls, typed arrays and errors over a MessageChannel', async () => {
    const ch = new MessageChannel();
    const stop = exposeRpc(api, ch.port2 as unknown as MessagePortLike);
    const remote = createRpcClient<Api>(ch.port1 as unknown as MessagePortLike);
    expect(await remote.add(2, 3)).toBe(5);
    expect(await remote.sum(Uint8Array.from([1, 2, 3]))).toBe(6);
    await expect(remote.fail()).rejects.toThrow('nope');
    const [a, b] = await Promise.all([remote.slow(20), remote.slow(5)]);
    expect([a, b]).toEqual(['done 20', 'done 5']);
    stop();
    ch.port1.close();
    ch.port2.close();
  });

  it('unknown methods reject; rejectAll fails pending calls', async () => {
    const ch = new MessageChannel();
    exposeRpc(api, ch.port2 as unknown as MessagePortLike);
    const channel = createRpcChannel<Api & { missing(): void }>(ch.port1 as unknown as MessagePortLike);
    await expect(channel.remote.missing()).rejects.toThrow('unknown method');
    const pending = channel.remote.slow(50);
    expect(channel.pending()).toBe(1);
    channel.rejectAll('worker died');
    await expect(pending).rejects.toThrow('worker died');
    channel.dispose();
    ch.port1.close();
    ch.port2.close();
  });

  it('the proxy is not thenable', () => {
    const ch = new MessageChannel();
    const remote = createRpcClient<Api>(ch.port1 as unknown as MessagePortLike) as unknown as { then?: unknown };
    expect(remote.then).toBeUndefined();
    ch.port1.close();
  });
});

/** A fake Worker backed by a MessageChannel and the real worker API. */
function fakeWorker(opts: { crashOn?: string } = {}): Worker {
  const ch = new MessageChannel();
  const listeners: Record<string, ((ev: Event) => void)[]> = {};
  exposeRpc(
    {
      ...engineWorkerApi,
      getHint: (...args: Parameters<typeof engineWorkerApi.getHint>) => {
        if (opts.crashOn === 'getHint') {
          queueMicrotask(() => {
            for (const l of listeners.error ?? []) l(Object.assign(new Event('error'), { preventDefault: () => undefined }));
          });
          return new Promise<never>(() => undefined);
        }
        return engineWorkerApi.getHint(...args);
      },
    },
    ch.port2 as unknown as MessagePortLike,
  );
  ch.port1.start();
  const w = {
    postMessage: (m: unknown) => ch.port1.postMessage(m),
    addEventListener: (type: string, l: (ev: Event) => void) => {
      if (type === 'message') ch.port1.addEventListener('message', l as (ev: MessageEvent) => void);
      else (listeners[type] ??= []).push(l);
    },
    removeEventListener: (type: string, l: (ev: Event) => void) => {
      if (type === 'message') ch.port1.removeEventListener('message', l as (ev: MessageEvent) => void);
    },
    terminate: () => {
      ch.port1.close();
      ch.port2.close();
    },
  };
  return w as unknown as Worker;
}

describe('engine client', () => {
  const puzzle = levelPuzzle(7);
  const cells = new Uint8Array(25);

  it('runs hints on the main thread within the budget, and pickKittyCell always', async () => {
    let created = 0;
    const client = createEngineClient({ createWorker: () => (created++, null) });
    const step = await client.getHint(puzzle, cells);
    expect(step.kind).toBeTruthy();
    expect(created).toBe(0); // the worker is lazy: hints did not need it
    expect(typeof (await client.pickKittyCell(puzzle, cells))).toBe('number');
    client.dispose();
  });

  it('loads the hint engine lazily, once, and retries a failed chunk load', async () => {
    const real = await import('../../../src/engine/hint');
    let loads = 0;
    let fail = true;
    const client = createEngineClient({
      createWorker: () => null,
      loadHintEngine: () => {
        loads++;
        return fail ? Promise.reject(new Error('chunk failed')) : Promise.resolve(real);
      },
    });
    await expect(client.getHint(puzzle, cells)).rejects.toThrow('chunk failed');
    fail = false;
    client.preload();
    expect((await client.getHint(puzzle, cells)).kind).toBeTruthy();
    expect(typeof (await client.pickKittyCell(puzzle, cells))).toBe('number');
    expect(loads).toBe(2);
    client.dispose();
  });

  it('a mistaken mark yields the mistaken_mark step', async () => {
    const client = createEngineClient({ createWorker: () => null });
    const marked = new Uint8Array(25);
    marked[0] = 1; // (0,0) is a solution cell
    expect((await client.getHint(puzzle, marked)).kind).toBe('mistaken_mark');
    expect(WRONG5).not.toContain(0);
    client.dispose();
  });

  it('hints in the worker when forced, through the RPC', async () => {
    const client = createEngineClient({ createWorker: () => fakeWorker(), hintsInWorker: true });
    const step = await client.getHint(puzzle, cells);
    expect(step.kind).toBeTruthy();
    client.dispose();
  });

  it('falls back to the main thread when the worker crashes', async () => {
    const client = createEngineClient({ createWorker: () => fakeWorker({ crashOn: 'getHint' }), hintsInWorker: true });
    const step = await client.getHint(puzzle, cells);
    expect(step.kind).toBeTruthy();
    client.dispose();
  });

  it('generate() without Worker support uses the main-thread generator', async () => {
    const calls: GenSpec[] = [];
    const result = { ok: false } as unknown as GenResult;
    const client = createEngineClient({
      createWorker: () => null,
      generateOnMain: async (spec) => {
        calls.push(spec);
        return result;
      },
    });
    const spec = { n: 5, seed: 'x' } as unknown as GenSpec;
    expect(await client.generate(spec)).toBe(result);
    expect(calls).toEqual([spec]);
    client.dispose();
  });

  it('slow main-thread hints move later hints of that size to the worker', async () => {
    let now = 0;
    let workers = 0;
    const client = createEngineClient({
      createWorker: () => (workers++, fakeWorker()),
      perf: () => (now += 100), // every hint "takes" 100 ms > hint.mainThreadBudgetMs
    });
    await client.getHint(puzzle, cells);
    expect(workers).toBe(0);
    await client.getHint(puzzle, cells);
    expect(workers).toBe(1);
    client.dispose();
  });

  it('rejects after dispose', async () => {
    const client = createEngineClient({ createWorker: () => null });
    client.dispose();
    await expect(client.getHint(puzzle, cells)).rejects.toThrow('disposed');
  });
});
