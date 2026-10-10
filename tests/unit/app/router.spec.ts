// @vitest-environment jsdom
// Owner: app. Router (04 §5.3): screens replace each other and close overlays; overlays are created
// lazily once; the top modal holds the only focus trap and everything below it is inert; Esc
// dismisses the top overlay; focus returns where it was.
import { last } from './harness';
import { describe, expect, it } from 'vitest';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
import { cfg } from '../../../src/app/config';
import { createRouter, type OverlayFactories, type RouterFactories } from '../../../src/app/router';
import type { OverlayId } from '../../../src/app/store';
import type { OverlayView } from '../../../src/ui/dom';

interface FakeOverlay extends OverlayView<unknown> {
  calls: string[];
  dismissResult: boolean;
}

function fakeOverlay(id: string, modal: boolean, made: string[]): FakeOverlay {
  made.push(id);
  const el = document.createElement('div');
  el.className = `ov-${id}`;
  const btn = document.createElement('button');
  btn.textContent = id;
  el.appendChild(btn);
  const o: FakeOverlay = {
    el,
    modal,
    calls: [],
    dismissResult: true,
    open: () => void o.calls.push('open'),
    update: () => void o.calls.push('update'),
    close: () => void o.calls.push('close'),
    dismiss: () => (o.calls.push('dismiss'), o.dismissResult),
    destroy: () => void o.calls.push('destroy'),
  };
  return o;
}

/** Resolves after the next animation frame (the router restores focus there, RP-3). */
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

function setup(extra: Partial<RouterFactories> = {}, deps: { reducedMotion?: () => boolean } = {}) {
  document.body.innerHTML = '<button id="outside">outside</button><div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const bus = createEventBus<AppEventMap>();
  const events: string[] = [];
  bus.on('overlay:open', ({ id }) => void events.push(`open:${id}`));
  bus.on('overlay:close', ({ id }) => void events.push(`close:${id}`));
  bus.on('screen', ({ screen }) => void events.push(`screen:${screen}`));
  const made: string[] = [];
  const overlays = new Map<string, FakeOverlay>();
  const factory = (id: OverlayId, modal: boolean) => () => {
    const o = fakeOverlay(id, modal, made);
    overlays.set(id, o);
    return o as never;
  };
  const ids: OverlayId[] = ['hint', 'rewarded', 'fail', 'settings', 'how_to_play', 'daily_result', 'coach'];
  const ovf = Object.fromEntries(ids.map((id) => [id, factory(id, id !== 'coach')])) as unknown as OverlayFactories;
  const traps: string[] = [];
  const inert = new Map<HTMLElement, boolean>();
  const factories: Partial<RouterFactories> = {
    overlays: ovf,
    homeScreen: () => ({ el: document.createElement('main'), update: () => undefined, destroy: () => void events.push('destroy:home') }),
    gameScreen: () =>
      ({
        el: document.createElement('section'),
        update: () => undefined,
        destroy: () => void events.push('destroy:game'),
      }) as never,
    toastLayer: () => ({ el: document.createElement('div'), show: (m: string) => void events.push(`toast:${m}`), clear: () => undefined, destroy: () => undefined }),
    screenTransition: null, // instant screen changes here; the transition cases are below
    trapFocus: (el, opts) => {
      const name = el.className;
      traps.push(`trap:${name}`);
      if (!opts?.restoreOnNextFrame) traps.push('sync-restore'); // the router always defers (RP-3)
      (opts?.initialFocus ?? el.querySelector('button'))?.focus();
      return () => {
        traps.push(`release:${name}`);
        opts?.returnFocus?.focus();
      };
    },
    setInert: (els, on) => {
      for (const e of els) inert.set(e, on);
    },
  };
  const router = createRouter(root, { bus, factories: { ...factories, ...extra }, ...deps });
  return { root, router, events, made, overlays, traps, inert };
}

describe('router', () => {
  it('creates overlays lazily, once, and mirrors the stack', () => {
    const s = setup();
    expect(s.made).toEqual([]);
    s.router.open('settings', {} as never);
    s.router.close('settings');
    s.router.open('settings', {} as never);
    expect(s.made).toEqual(['settings']);
    expect(s.router.stack()).toEqual(['settings']);
    expect(s.router.top()).toBe('settings');
    expect(s.events).toEqual(['open:settings', 'close:settings', 'open:settings']);
  });

  it('re-opening moves an overlay to the top', () => {
    const s = setup();
    s.router.open('coach', {} as never);
    s.router.open('hint', {} as never);
    s.router.open('coach', {} as never);
    expect(s.router.stack()).toEqual(['hint', 'coach']);
  });

  it('modal overlays make the screen and lower overlays inert; the coach does not', () => {
    const s = setup();
    s.router.showGame({} as never, {} as never);
    const screenHost = s.root.querySelector('.app-screen') as HTMLElement;
    s.router.open('coach', {} as never);
    expect(s.inert.get(screenHost) ?? false).toBe(false); // the board stays interactive under O8
    s.router.open('hint', {} as never);
    const coachEl = s.overlays.get('coach')?.el as HTMLElement;
    expect(s.inert.get(screenHost)).toBe(true);
    expect(s.inert.get(coachEl)).toBe(true);
    s.router.close('hint');
    expect(s.inert.get(screenHost)).toBe(false);
    expect(s.inert.get(coachEl)).toBe(false);
  });

  it('PERF-3: reserveModal() makes the screen inert ahead of the modal, without the [data-modal] scrim hand-off', () => {
    const s = setup();
    s.router.showGame({} as never, {} as never);
    const screenHost = s.root.querySelector('.app-screen') as HTMLElement;
    s.router.reserveModal?.();
    expect(s.inert.get(screenHost)).toBe(true);
    expect(screenHost.hasAttribute('data-modal')).toBe(false); // the win scrim stays up
    s.router.open('fail', {} as never); // the modal takes the reservation over
    expect(s.inert.get(screenHost)).toBe(true);
    expect(screenHost.hasAttribute('data-modal')).toBe(true);
    s.router.releaseModal?.(); // nothing left to release: the modal holds it
    expect(s.inert.get(screenHost)).toBe(true);
    s.router.close('fail');
    expect(s.inert.get(screenHost)).toBe(false);
    expect(screenHost.hasAttribute('data-modal')).toBe(false);
    // Released without a modal; and a screen change drops a reservation.
    s.router.reserveModal?.();
    s.router.releaseModal?.();
    expect(s.inert.get(screenHost)).toBe(false);
    s.router.reserveModal?.();
    s.router.showHome({} as never, {} as never);
    expect(s.inert.get(screenHost)).toBe(false);
  });

  it('keeps one focus trap on the top modal and restores focus on close', () => {
    const s = setup();
    const outside = document.getElementById('outside') as HTMLButtonElement;
    outside.focus();
    s.router.open('settings', {} as never);
    const settingsBtn = s.overlays.get('settings')?.el.querySelector('button') as HTMLButtonElement;
    expect(document.activeElement).toBe(settingsBtn);
    s.router.open('how_to_play', {} as never);
    expect(s.traps).toEqual(['trap:ov-settings', 'release:ov-settings', 'trap:ov-how_to_play']);
    s.router.close('how_to_play');
    expect(document.activeElement).toBe(settingsBtn); // back to the button that opened O6
    expect(last(s.traps)).toBe('trap:ov-settings');
    s.router.close('settings');
    expect(document.activeElement).toBe(outside);
  });

  it('Esc dismisses the top overlay only', () => {
    const s = setup();
    s.router.open('settings', {} as never);
    s.router.open('how_to_play', {} as never);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(s.overlays.get('how_to_play')?.calls).toContain('dismiss');
    expect(s.overlays.get('settings')?.calls).not.toContain('dismiss');
    expect(s.router.escape()).toBe(true);
    const empty = setup();
    expect(empty.router.escape()).toBe(false);
  });

  it('a new screen closes every overlay and destroys the previous screen', () => {
    const s = setup();
    s.router.showHome({} as never, {} as never);
    s.router.open('settings', {} as never);
    s.router.showGame({} as never, {} as never);
    expect(s.router.stack()).toEqual([]);
    expect(s.router.screen()).toBe('game');
    expect(s.events).toEqual(['screen:home', 'open:settings', 'close:settings', 'destroy:home', 'screen:game']);
  });

  it('a new screen starts at the top of a scrolled page (short desktop windows)', () => {
    const s = setup();
    s.router.showHome({} as never, {} as never);
    const scroller = document.scrollingElement ?? document.documentElement; // jsdom has no scrollingElement
    scroller.scrollTop = 206; // the offset used to reach Play in a 640×340 window
    s.router.showGame({} as never, {} as never);
    expect(scroller.scrollTop).toBe(0);
  });

  it('update() reaches only open overlays; toast() goes to the toast layer', () => {
    const s = setup();
    s.router.update('fail', {} as never);
    expect(s.made).toEqual([]);
    s.router.open('fail', {} as never);
    s.router.update('fail', {} as never);
    expect(s.overlays.get('fail')?.calls).toEqual(['open', 'update']);
    s.router.toast('hello');
    expect(last(s.events)).toBe('toast:hello');
  });
});

// ─────────────────── lazy overlay chunk, [data-autofocus], loading indicator ───────────────────

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function lazySetup() {
  document.body.innerHTML = '<button id="outside">outside</button><div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const bus = createEventBus<AppEventMap>();
  const events: string[] = [];
  bus.on('overlay:open', ({ id }) => void events.push(`open:${id}`));
  bus.on('overlay:close', ({ id }) => void events.push(`close:${id}`));
  bus.on('error', ({ where }) => void events.push(`error:${where}`));
  const made: string[] = [];
  const opened: { id: string; props: unknown }[] = [];
  const make = (id: OverlayId) => () => {
    made.push(id);
    const el = document.createElement('div');
    el.className = `ov-${id}`;
    const first = document.createElement('button');
    first.textContent = `${id}-first`;
    const auto = document.createElement('button');
    auto.textContent = `${id}-auto`;
    auto.setAttribute('data-autofocus', '');
    el.append(first, auto);
    return {
      el,
      modal: id !== 'coach',
      open: (p: unknown) => void opened.push({ id, props: p }),
      update: (p: unknown) => void opened.push({ id: `${id}:update`, props: p }),
      close: () => undefined,
      dismiss: () => true,
      destroy: () => undefined,
    } as never;
  };
  let loads = 0;
  let gate = deferred<Partial<OverlayFactories>>();
  const lazy = Object.fromEntries((['settings', 'how_to_play', 'fail'] as OverlayId[]).map((id) => [id, make(id)])) as Partial<OverlayFactories>;
  const factories: Partial<RouterFactories> = {
    overlays: { coach: make('coach') },
    loadOverlays: () => {
      loads++;
      return gate.promise;
    },
    gameScreen: () => ({ el: document.createElement('section'), update: () => undefined, destroy: () => undefined }) as never,
  };
  const router = createRouter(root, { bus, factories });
  return {
    root,
    router,
    events,
    made,
    opened,
    lazy,
    onFailed: (fn: (id: string) => void) => bus.on('overlay:failed', ({ id }) => fn(id)),
    loads: () => loads,
    land: async () => {
      gate.resolve(lazy);
      await gate.promise;
      await Promise.resolve();
    },
    fail: async () => {
      gate.reject(new Error('offline'));
      await gate.promise.catch(() => undefined);
      await Promise.resolve();
      gate = deferred<Partial<OverlayFactories>>();
    },
  };
}

describe('router: lazy overlay chunk (04 §9)', () => {
  it('queues an open() until the chunk lands, then opens with the latest props and traps focus', async () => {
    const s = lazySetup();
    s.router.showGame({} as never, {} as never);
    const screenHost = s.root.querySelector('.app-screen') as HTMLElement;
    s.router.open('settings', { v: 1 } as never);
    expect(s.router.isOpen('settings')).toBe(true);
    expect(s.router.stack()).toEqual(['settings']);
    expect(s.events).toEqual(['open:settings']);
    expect(screenHost.hasAttribute('inert')).toBe(true); // the board is blocked while it loads
    expect(s.made).toEqual([]);
    s.router.update('settings', { v: 2 } as never);
    await s.land();
    expect(s.made).toEqual(['settings']);
    expect(s.opened).toEqual([{ id: 'settings', props: { v: 2 } }]);
    expect((document.activeElement as HTMLElement).textContent).toBe('settings-auto');
    expect(s.loads()).toBe(1);
  });

  it('an overlay closed before the chunk lands is never opened', async () => {
    const s = lazySetup();
    s.router.open('fail', {} as never);
    s.router.close('fail');
    expect(s.router.isOpen('fail')).toBe(false);
    await s.land();
    expect(s.opened).toEqual([]);
    s.router.open('fail', { now: true } as never); // later opens are synchronous
    expect(s.opened).toEqual([{ id: 'fail', props: { now: true } }]);
  });

  it('keeps the stack order when several queued overlays land together', async () => {
    const s = lazySetup();
    s.router.open('settings', {} as never);
    s.router.open('how_to_play', {} as never);
    await s.land();
    const host = s.root.querySelector('.app-overlays') as HTMLElement;
    expect(Array.from(host.children).map((c) => c.className)).toEqual(['ov-settings', 'ov-how_to_play']);
    expect((document.activeElement as HTMLElement).textContent).toBe('how_to_play-auto');
    s.router.close('how_to_play');
    expect(s.router.top()).toBe('settings');
  });

  it('a failed chunk load closes the queued overlays, reports it, and the next open retries', async () => {
    const s = lazySetup();
    s.router.open('settings', {} as never);
    await s.fail();
    expect(s.router.isOpen('settings')).toBe(false);
    expect(s.events).toEqual(['open:settings', 'error:overlay_chunk', 'close:settings']);
    s.router.open('settings', {} as never);
    expect(s.loads()).toBe(2);
    await s.land();
    expect(s.opened.map((o) => o.id)).toEqual(['settings']);
  });

  it('a failed chunk load tells the app which queued overlays failed, after closing them (RP-2)', async () => {
    const s = lazySetup();
    const failed: string[] = [];
    s.router.open('fail', {} as never);
    s.router.open('settings', {} as never);
    s.onFailed((id) => failed.push(`${id}:${s.router.isOpen(id as OverlayId) ? 'open' : 'closed'}`));
    await s.fail();
    expect(failed).toEqual(['fail:closed', 'settings:closed']);
    expect(s.router.stack()).toEqual([]);
  });

  it('overlaysReady() loads the chunk once and answers true; false (never rejecting) when it fails', async () => {
    const s = lazySetup();
    const ready = s.router.overlaysReady();
    expect(s.loads()).toBe(1);
    await s.land();
    await expect(ready).resolves.toBe(true);
    await expect(s.router.overlaysReady()).resolves.toBe(true);
    expect(s.loads()).toBe(1);

    const f = lazySetup();
    const notReady = f.router.overlaysReady();
    await f.fail();
    await expect(notReady).resolves.toBe(false);
    const retry = f.router.overlaysReady(); // a later check tries again
    expect(f.loads()).toBe(2);
    await f.land();
    await expect(retry).resolves.toBe(true);
  });

  it('Phase 2d.1 I-4: coachReady() loads only the coach (loadCoach), flushes a queued coach, and never rejects', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    let coachLoads = 0;
    let overlayLoads = 0;
    let gate = deferred<Partial<OverlayFactories>>();
    const opened: string[] = [];
    const coach = () =>
      ({ el: document.createElement('div'), modal: false, open: () => void opened.push('coach'), update: () => undefined, close: () => undefined, dismiss: () => true, destroy: () => undefined }) as never;
    const router = createRouter(root, {
      factories: {
        loadCoach: () => {
          coachLoads++;
          return gate.promise;
        },
        loadOverlays: () => {
          overlayLoads++;
          return new Promise(() => undefined); // the overlay chunk never lands here
        },
        gameScreen: () => ({ el: document.createElement('section'), update: () => undefined, destroy: () => undefined }) as never,
      },
    });
    const first = router.coachReady();
    gate.reject(new Error('offline'));
    await expect(first).resolves.toBe(false);
    gate = deferred<Partial<OverlayFactories>>();
    const ready = router.coachReady(); // a later call retries
    expect(coachLoads).toBe(2);
    router.open('coach', {} as never); // queued: no factory yet, so the router asks for the overlay chunk too
    gate.resolve({ coach });
    await expect(ready).resolves.toBe(true);
    expect(opened).toEqual(['coach']); // flushed by the coach chunk alone
    await expect(router.coachReady()).resolves.toBe(true);
    expect(coachLoads).toBe(2);
    expect(overlayLoads).toBe(1);
  });

  it('Phase 2d.1 I-4: a router with only loadOverlays (tests) finds the coach in that set', async () => {
    const s = lazySetup(); // its coach factory is given up front
    await expect(s.router.coachReady()).resolves.toBe(true);
    expect(s.loads()).toBe(0);
    document.body.innerHTML = '<div id="app"></div>';
    let resolveSet: (v: Partial<OverlayFactories>) => void = () => undefined;
    const r = createRouter(document.getElementById('app') as HTMLElement, {
      factories: { loadOverlays: () => new Promise((res) => (resolveSet = res)) },
    });
    const ready = r.coachReady();
    resolveSet({ coach: (() => ({ el: document.createElement('div'), modal: false, open: () => undefined, update: () => undefined, close: () => undefined, dismiss: () => true, destroy: () => undefined })) as never });
    await expect(ready).resolves.toBe(true);
  });

  it('preloadOverlays() starts the download once and never rejects', async () => {
    const s = lazySetup();
    const p = s.router.preloadOverlays();
    void s.router.preloadOverlays();
    expect(s.loads()).toBe(1);
    await s.land();
    await expect(p).resolves.toBeUndefined();
    s.router.open('settings', {} as never);
    expect(s.made).toEqual(['settings']);
  });

  it('the real chunk provides every overlay, the coach included (lead decision: 04 §9 budget)', async () => {
    const { loadOverlayChunk } = await import('../../../src/app/router');
    const f = await loadOverlayChunk();
    expect(Object.keys(f).sort()).toEqual([
      'coach',
      'daily_result',
      'fail',
      'group_result', // phase2b §2.11: the 2b overlays live in the same lazy chunk
      'hint',
      'how_to_play',
      'rank_hub',
      'ranking',
      'rewarded',
      'settings',
      'shop',
      'victory',
    ]);
  });

  it('the coach is queued until the chunk lands, non-modal all along, then opened with the latest props', async () => {
    let land: (f: Partial<OverlayFactories>) => void = () => undefined;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const made: string[] = [];
    const coach = fakeOverlay('coach', false, made);
    let opened: unknown = null;
    coach.open = (p: unknown) => void (coach.calls.push('open'), (opened = p));
    const router = createRouter(root, {
      factories: {
        loadOverlays: () => new Promise((r) => (land = r)),
        gameScreen: () => ({ el: document.createElement('section'), update: () => undefined, destroy: () => undefined }) as never,
      },
    });
    router.showGame({} as never, {} as never);
    router.open('coach', { step: 1 } as never);
    router.update('coach', { step: 2 } as never);
    expect(router.isOpen('coach')).toBe(true);
    expect(made).toEqual(['coach']); // only our fake; the router has no eager overlay of its own
    expect(coach.calls).toEqual([]);
    land({ coach: () => coach });
    await Promise.resolve();
    await Promise.resolve();
    expect(coach.calls).toEqual(['open']);
    expect(opened).toEqual({ step: 2 });
    expect(root.querySelector('.app-screen')?.hasAttribute('inert')).toBe(false); // the board stays playable
  });
});

describe('router: initial focus honours [data-autofocus] (lead decision)', () => {
  it('focuses the first focusable [data-autofocus] element, skipping hidden ones', async () => {
    const { autofocusTarget } = await import('../../../src/app/router');
    const el = document.createElement('div');
    el.innerHTML = '<button>a</button><button data-autofocus hidden>b</button><button data-autofocus>c</button>';
    document.body.appendChild(el);
    expect(autofocusTarget(el)?.textContent).toBe('c');
    const none = document.createElement('div');
    none.innerHTML = '<button>a</button>';
    expect(autofocusTarget(none)).toBeNull();
  });

  it('a modal opened from the board gets focus on its [data-autofocus] button', async () => {
    const s = lazySetup();
    void s.router.preloadOverlays();
    await s.land();
    (document.getElementById('outside') as HTMLButtonElement).focus();
    s.router.open('fail', {} as never);
    expect((document.activeElement as HTMLElement).textContent).toBe('fail-auto');
    s.router.close('fail');
    // Focus is restored on the next animation frame (restoreOnNextFrame, RP-3), not synchronously.
    await nextFrame();
    expect(document.activeElement?.id).toBe('outside');
  });
});

describe('router: loading indicator (lead decision)', () => {
  it('shows a polite status over the screen and marks the app root busy', () => {
    const s = lazySetup();
    s.router.setLoading(false); // nothing to hide yet: no layer is created
    expect(s.root.querySelector('.loading-layer')).toBeNull();
    s.router.setLoading(true);
    const layer = s.root.querySelector('.loading-layer') as HTMLElement;
    expect(layer.hidden).toBe(false);
    expect(s.root.getAttribute('aria-busy')).toBe('true');
    expect(layer.querySelector('[role="status"]')?.textContent).toBe('Getting the board ready…');
    s.router.setLoading(false);
    expect(layer.hidden).toBe(true);
    expect(s.root.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('router: screen transitions (phase2b §2.9) and the event screen (§4.4)', () => {
  function withTransition(reduced = false) {
    const calls: { kind: string; reduced: boolean; old: HTMLElement | null; next: HTMLElement; resolve: () => void }[] = [];
    const s = setup(
      {
        screenTransition: (old, next, kind, r) =>
          new Promise<void>((resolve) => void calls.push({ kind, reduced: r, old, next, resolve })),
      },
      { reducedMotion: () => reduced },
    );
    return { ...s, calls };
  }

  it('Home → game plays to_game: the old screen stays inert and aria-hidden until the transition ends, then it is destroyed', async () => {
    const s = withTransition();
    s.router.showHome({} as never, {} as never);
    expect(s.calls).toEqual([]); // the first screen has nothing to transition from
    s.router.showGame({} as never, {} as never);
    expect(s.calls.map((c) => c.kind)).toEqual(['to_game']);
    const host = s.root.querySelector('.app-screen') as HTMLElement;
    const old = s.calls[0]?.old as HTMLElement;
    expect(host.children.length).toBe(2);
    expect(old.getAttribute('aria-hidden')).toBe('true');
    expect(old.hasAttribute('inert')).toBe(true);
    expect(s.events).not.toContain('destroy:home');
    s.calls[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.children.length).toBe(1);
    expect(s.events).toContain('destroy:home');
  });

  it('game → Home plays from_game; reduced motion is passed through', () => {
    const s = withTransition(true);
    s.router.showGame({} as never, {} as never);
    s.router.showHome({} as never, {} as never);
    expect(s.calls.map((c) => [c.kind, c.reduced])).toEqual([['from_game', true]]);
  });

  it('a new screen change during a transition ends the previous one at once', () => {
    const s = withTransition();
    s.router.showHome({} as never, {} as never);
    s.router.showGame({} as never, {} as never);
    s.router.showHome({} as never, {} as never);
    const host = s.root.querySelector('.app-screen') as HTMLElement;
    expect(s.events.filter((e) => e.startsWith('destroy:'))).toEqual(['destroy:home']);
    expect(host.children.length).toBe(2); // the game fading out + the new Home
  });

  it('a transition that throws or never settles does not keep the old screen', async () => {
    const s = setup({
      screenTransition: () => {
        throw new Error('no WAAPI');
      },
    });
    s.router.showHome({} as never, {} as never);
    s.router.showGame({} as never, {} as never);
    expect(s.events).toContain('destroy:home');
    expect((s.root.querySelector('.app-screen') as HTMLElement).children.length).toBe(1);
  });

  it('showEvent loads the event screen from the lazy chunk; a failed chunk resolves null and reports', async () => {
    const made: string[] = [];
    const ok = setup({
      loadEventScreen: async () => (view) => {
        made.push((view as { def: { id: string } }).def.id);
        return { el: document.createElement('div'), update: () => undefined, destroy: () => undefined };
      },
    });
    const v = await ok.router.showEvent({ def: { id: 'lantern-walk-2026' } } as never, {} as never);
    expect(v).not.toBeNull();
    expect(made).toEqual(['lantern-walk-2026']);
    expect(ok.router.screen()).toBe('event');
    const bad = setup({
      loadEventScreen: async () => {
        throw new Error('offline');
      },
    });
    expect(await bad.router.showEvent({} as never, {} as never)).toBeNull();
    expect(bad.router.screen()).toBe('boot');
  });

  it('showEvent resolves null when another screen was shown while the chunk loaded', async () => {
    let release: () => void = () => undefined;
    const s = setup({
      loadEventScreen: () =>
        new Promise((resolve) => {
          release = () => resolve(() => ({ el: document.createElement('div'), update: () => undefined, destroy: () => undefined }));
        }),
    });
    const pending = s.router.showEvent({} as never, {} as never);
    s.router.showHome({} as never, {} as never);
    release();
    expect(await pending).toBeNull();
    expect(s.router.screen()).toBe('home');
  });
});

// ─────────────────── 2b review fixes (R): PAR-6 / UX-4, PERF-1, A11Y-FOCUS-1 ───────────────────

describe('router: leaving the victory screen (PAR-6 / UX-4)', () => {
  function victorySetup() {
    const calls: { old: HTMLElement | null; next: HTMLElement; kind: string; resolve: () => void }[] = [];
    const made: string[] = [];
    const s = setup({
      overlays: Object.fromEntries(
        (['victory', 'ranking', 'settings'] as OverlayId[]).map((id) => [id, () => fakeOverlay(id, true, made) as never]),
      ) as unknown as OverlayFactories,
      screenTransition: (old, next, kind) => new Promise<void>((resolve) => void calls.push({ old, next, kind, resolve })),
    });
    return { ...s, calls };
  }

  it('the victory, not the solved board under it, is the outgoing layer; the board goes at once (Home)', async () => {
    const s = victorySetup();
    s.router.showGame({} as never, {} as never);
    const host = s.root.querySelector('.app-screen') as HTMLElement;
    const board = host.firstElementChild as HTMLElement;
    s.router.open('victory', {} as never);
    const victory = s.root.querySelector('.ov-victory') as HTMLElement;
    s.router.showHome({} as never, {} as never);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.kind).toBe('from_game');
    expect(s.calls[0]?.old).toBe(victory); // was: the old game screen, with the solved board on it
    // The board is gone before the first frame of the transition; the victory stays up, inert.
    expect(board.isConnected).toBe(false);
    expect(s.events).toContain('destroy:game');
    expect(Array.from(host.children)).toHaveLength(1);
    expect(victory.hidden).toBe(false);
    expect(victory.hasAttribute('inert')).toBe(true);
    expect(victory.getAttribute('aria-hidden')).toBe('true');
    expect(s.router.isOpen('victory')).toBe(false); // closed for the app; only its picture fades
    s.calls[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(victory.hidden).toBe(true);
    expect(victory.hasAttribute('inert')).toBe(false);
    expect(victory.hasAttribute('aria-hidden')).toBe(false);
  });

  it('victory → next level: to_game from the victory; the old game screen is never the outgoing element', () => {
    const s = victorySetup();
    s.router.showGame({} as never, {} as never);
    const oldGame = (s.root.querySelector('.app-screen') as HTMLElement).firstElementChild;
    s.router.open('victory', {} as never);
    s.router.showGame({} as never, {} as never);
    expect(s.calls.map((c) => c.kind)).toEqual(['to_game']);
    expect(s.calls[0]?.old).not.toBe(oldGame);
    expect(s.calls[0]?.old?.className).toBe('ov-victory');
    expect(oldGame?.isConnected).toBe(false);
  });

  it('a victory opened again while its old picture fades stays open', async () => {
    const s = victorySetup();
    s.router.showGame({} as never, {} as never);
    s.router.open('victory', {} as never);
    s.router.showGame({} as never, {} as never);
    s.router.open('victory', {} as never);
    s.calls[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect((s.root.querySelector('.ov-victory') as HTMLElement).hidden).toBe(false);
    expect(s.router.isOpen('victory')).toBe(true);
  });

  it('without the victory (a fail overlay, settings) the old screen leaves as before', () => {
    const s = victorySetup();
    s.router.showGame({} as never, {} as never);
    const oldGame = (s.root.querySelector('.app-screen') as HTMLElement).firstElementChild;
    s.router.open('settings', {} as never);
    s.router.showHome({} as never, {} as never);
    expect(s.calls[0]?.old).toBe(oldGame);
  });
});

describe('router: beginLeave answers the tap before the build (PERF-1)', () => {
  function leaveSetup(opts: { animates?: boolean } = {}) {
    const outs: { el: HTMLElement; kind: string }[] = [];
    const calls: { old: HTMLElement | null; next: HTMLElement; kind: string; resolve: () => void }[] = [];
    const made: string[] = [];
    const s = setup({
      overlays: Object.fromEntries(
        (['victory', 'settings'] as OverlayId[]).map((id) => [id, () => fakeOverlay(id, true, made) as never]),
      ) as unknown as OverlayFactories,
      screenTransition: (old, next, kind) => new Promise<void>((resolve) => void calls.push({ old, next, kind, resolve })),
      screenOut: (el, kind) => {
        outs.push({ el, kind });
        return opts.animates ?? true;
      },
    });
    return { ...s, outs, calls };
  }

  it('starts the outgoing half at once, resolves after a frame, and the next showGame joins it', async () => {
    const s = leaveSetup();
    s.router.showHome({} as never, {} as never);
    const home = (s.root.querySelector('.app-screen') as HTMLElement).firstElementChild as HTMLElement;
    s.router.open('settings', {} as never);
    const p = s.router.beginLeave('game');
    expect(p).not.toBeNull();
    expect(s.outs).toEqual([{ el: home, kind: 'to_game' }]);
    expect(home.hasAttribute('inert')).toBe(true);
    expect(s.router.stack()).toEqual([]); // the overlays close with the tap
    expect(s.calls).toHaveLength(0); // nothing is built yet
    await p;
    s.router.showGame({} as never, {} as never);
    expect(s.outs).toHaveLength(1); // joined, not restarted
    expect(s.calls.map((c) => [c.old, c.kind])).toEqual([[home, 'to_game']]);
    expect(s.router.screen()).toBe('game');
  });

  it('from the victory: the victory fades and the board under it goes at the tap', () => {
    const s = leaveSetup();
    s.router.showGame({} as never, {} as never);
    const board = (s.root.querySelector('.app-screen') as HTMLElement).firstElementChild as HTMLElement;
    s.router.open('victory', {} as never);
    void s.router.beginLeave('game');
    expect(s.outs.map((o) => o.el.className)).toEqual(['ov-victory']);
    expect(board.isConnected).toBe(false);
    expect(s.events).toContain('destroy:game');
  });

  it('an outgoing half whose fade is over is removed before the new screen is appended', async () => {
    const s = leaveSetup();
    s.router.showHome({} as never, {} as never);
    const home = (s.root.querySelector('.app-screen') as HTMLElement).firstElementChild as HTMLElement;
    let homeInDomAtBuild: boolean | null = null;
    const r = createRouter(s.root, {
      factories: {
        homeScreen: () => ({ el: home, update: () => undefined, destroy: () => undefined }),
        gameScreen: () => {
          homeInDomAtBuild = home.isConnected;
          return { el: document.createElement('section'), update: () => undefined, destroy: () => undefined } as never;
        },
        screenTransition: () => Promise.resolve(),
        screenOut: () => true,
      },
    });
    r.showHome({} as never, {} as never);
    await r.beginLeave('game');
    await new Promise((res) => setTimeout(res, cfg.fx.screenOutMs + 5)); // a slow build: the fade is long over
    r.showGame({} as never, {} as never);
    expect(homeInDomAtBuild).toBe(false);
  });

  it('nothing to animate → null (boot, transitions off, no WAAPI): the caller does not wait', () => {
    const s = leaveSetup();
    s.router.showBoot();
    expect(s.router.beginLeave('game')).toBeNull(); // boot → game has no transition
    const off = setup(); // screenTransition: null
    off.router.showHome({} as never, {} as never);
    expect(off.router.beginLeave('game')).toBeNull();
    const still = leaveSetup({ animates: false });
    still.router.showHome({} as never, {} as never);
    expect(still.router.beginLeave('game')).toBeNull();
  });

  it('a screen change to somewhere else ends the early half at once (a failed load goes Home)', () => {
    const s = leaveSetup();
    s.router.showHome({} as never, {} as never);
    void s.router.beginLeave('game');
    s.router.showHome({} as never, {} as never);
    expect(s.events.filter((e) => e === 'destroy:home')).toHaveLength(1);
    expect((s.root.querySelector('.app-screen') as HTMLElement).children).toHaveLength(1);
  });
});

describe('router: page scroll is read before the build (PERF-1)', () => {
  it('reads scrollTop before the new screen exists, and writes it only when the page was scrolled', () => {
    const order: string[] = [];
    let top = 0;
    const scroller = document.scrollingElement ?? document.documentElement;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => (order.push('read'), top),
      set: (v: number) => void (order.push(`write:${v}`), (top = v)),
    });
    try {
      const s = setup({
        gameScreen: () => (order.push('build'), { el: document.createElement('section'), update: () => undefined, destroy: () => undefined }) as never,
      });
      s.router.showHome({} as never, {} as never);
      order.length = 0;
      s.router.showGame({} as never, {} as never);
      // A read after the new screen is appended forces a full-document style pass (127–170 ms at 4×).
      expect(order).toEqual(['read', 'build']);
      top = 206;
      order.length = 0;
      s.router.showGame({} as never, {} as never);
      expect(order).toEqual(['read', 'build', 'write:0']);
    } finally {
      delete (scroller as unknown as Record<string, unknown>).scrollTop;
      if (desc) Object.defineProperty(Element.prototype, 'scrollTop', desc);
    }
  });
});

describe('router: focus moves into the new screen (A11Y-FOCUS-1)', () => {
  const twoFrames = async (): Promise<void> => {
    await nextFrame();
    await nextFrame();
    await nextFrame();
  };
  function focusSetup(home: () => HTMLElement) {
    const s = setup({
      homeScreen: () => ({ el: home(), update: () => undefined, destroy: () => undefined }),
      gameScreen: () => {
        const el = document.createElement('section');
        const btn = document.createElement('button');
        btn.className = 'top-home';
        el.appendChild(btn);
        return { el, update: () => undefined, destroy: () => undefined } as never;
      },
    });
    return s;
  }
  const withAutofocus = (): HTMLElement => {
    const el = document.createElement('main');
    el.innerHTML = '<h1>Mewdoku</h1><button class="first">Shop</button><button class="play" data-autofocus>Level 3</button>';
    return el;
  };

  it('focus in the old screen → the new screen\'s [data-autofocus] control', async () => {
    const s = focusSetup(withAutofocus);
    s.router.showGame({} as never, {} as never);
    (s.root.querySelector('.top-home') as HTMLButtonElement).focus();
    s.router.showHome({} as never, {} as never);
    await twoFrames();
    expect((document.activeElement as HTMLElement).className).toBe('play');
  });

  it('without [data-autofocus]: the first heading, made focusable (tabindex −1)', async () => {
    const s = focusSetup(() => {
      const el = document.createElement('main');
      el.innerHTML = '<div><h1>Mewdoku</h1></div><button>Level 3</button>';
      return el;
    });
    s.router.showGame({} as never, {} as never);
    (s.root.querySelector('.top-home') as HTMLButtonElement).focus();
    s.router.showHome({} as never, {} as never);
    await twoFrames();
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });

  it('focus not in the app (first route, a tap that focuses nothing) → focus stays put', async () => {
    const s = focusSetup(withAutofocus);
    (document.getElementById('outside') as HTMLButtonElement).focus();
    s.router.showHome({} as never, {} as never);
    await twoFrames();
    expect(document.activeElement?.id).toBe('outside');
  });

  it('never over an open modal, and not on the game screen (it focuses its own board)', async () => {
    const s = focusSetup(withAutofocus);
    s.router.showGame({} as never, {} as never);
    (s.root.querySelector('.top-home') as HTMLButtonElement).focus();
    s.router.showHome({} as never, {} as never);
    s.router.open('settings', {} as never);
    await twoFrames();
    expect((document.activeElement as HTMLElement).textContent).toBe('settings');
    const g = focusSetup(withAutofocus);
    g.router.showHome({} as never, {} as never);
    (g.root.querySelector('.play') as HTMLButtonElement).focus();
    g.router.showGame({} as never, {} as never);
    await twoFrames();
    expect((document.activeElement as HTMLElement).className).not.toBe('top-home');
  });
});

describe('router: the new screen goes before a screen still fading out (PERF-1)', () => {
  it('the leaving screen is the LAST child (its removal then never restyles the new screen)', async () => {
    const calls: { resolve: () => void }[] = [];
    const s = setup({ screenTransition: () => new Promise<void>((resolve) => void calls.push({ resolve })) });
    s.router.showHome({} as never, {} as never);
    const host = s.root.querySelector('.app-screen') as HTMLElement;
    const home = host.firstElementChild as HTMLElement;
    s.router.showGame({} as never, {} as never);
    expect(host.children).toHaveLength(2);
    expect(host.lastElementChild).toBe(home); // was: appended after it, so removing Home restyled the game screen
    expect(host.firstElementChild?.tagName).toBe('SECTION');
    calls[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(Array.from(host.children).map((c) => c.tagName)).toEqual(['SECTION']);
  });
});

describe('router: focus intent survives a quick second screen change (A11Y-FOCUS-1)', () => {
  it('Home shown twice in a row (the shell re-renders it) still gets focus', async () => {
    const homes: HTMLElement[] = [];
    const s = setup({
      homeScreen: () => {
        const el = document.createElement('main');
        el.innerHTML = '<button class="play" data-autofocus>Level 3</button>';
        homes.push(el);
        return { el, update: () => undefined, destroy: () => undefined };
      },
      gameScreen: () => {
        const el = document.createElement('section');
        el.innerHTML = '<button class="top-home">Home</button>';
        return { el, update: () => undefined, destroy: () => undefined } as never;
      },
    });
    s.router.showGame({} as never, {} as never);
    (s.root.querySelector('.top-home') as HTMLButtonElement).focus();
    s.router.showHome({} as never, {} as never);
    s.router.showHome({} as never, {} as never); // focus is on <body> by now
    await nextFrame();
    await nextFrame();
    await nextFrame();
    expect(document.activeElement).toBe(homes[1]?.querySelector('.play'));
  });
});
