// Owner: B (Phase 2b; was ui-shell)
// The sound recipes (sfx.ts) as a lazy chunk (04 §9 first-load budget). No sound can play before
// the first pointerdown unlocks the AudioContext (02 §16), so the recipes are fetched right after
// the first screen (boot step 8) and nothing audible is lost; a play() before they land is dropped.
import type { AudioEngine } from './audio-engine';
import type { Sfx } from './sfx';

export interface LazySfx extends Sfx {
  /** Loads the recipes (idempotent; a failed load is retried on the next call). Never rejects. */
  load(): Promise<void>;
  /** True once the recipes are in. */
  ready(): boolean;
}

export function createLazySfx(
  engine: AudioEngine,
  loadModule: () => Promise<Pick<typeof import('./sfx'), 'createSfx'>> = () => import('./sfx'),
): LazySfx {
  let impl: Sfx | null = null;
  let loading: Promise<void> | null = null;
  const load = (): Promise<void> => {
    loading ??= loadModule().then(
      (m) => {
        impl = m.createSfx(engine);
      },
      () => {
        loading = null;
      },
    );
    return loading;
  };
  return {
    play(id, opts) {
      if (impl) impl.play(id, opts);
      else void load();
    },
    load,
    ready: () => impl !== null,
  };
}
