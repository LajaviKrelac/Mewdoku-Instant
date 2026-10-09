// @vitest-environment jsdom
// Owner: app. Router (04 §5.3): screens replace each other and close overlays; overlays are created
// lazily once; the top modal holds the only focus trap and everything below it is inert; Esc
// dismisses the top overlay; focus returns where it was.
import { last } from './harness';
import { describe, expect, it } from 'vitest';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
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

function setup() {
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
  const ids: OverlayId[] = ['hint', 'rewarded', 'win', 'fail', 'settings', 'how_to_play', 'daily_result', 'coach'];
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
  const router = createRouter(root, { bus, factories });
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
    s.router.open('win', {} as never);
    s.router.open('settings', {} as never);
    s.onFailed((id) => failed.push(`${id}:${s.router.isOpen(id as OverlayId) ? 'open' : 'closed'}`));
    await s.fail();
    expect(failed).toEqual(['win:closed', 'settings:closed']);
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
      'win',
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
