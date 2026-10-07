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
