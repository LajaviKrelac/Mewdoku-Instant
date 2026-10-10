// Owner: G3 (Phase 2d)
// The level-start toast (look-spec §1.14): a cream pill with our own honest line ("You can solve this
// one!", "A hard one. You've got this!", "Fresh start. You can do it!"; never a statistic) and our
// flexed arm (art-flex), over the pills row's lower edge and the rules container's top. fx.startToast
// times it: delayMs after the board entry starts it slides in from beyond the inline-start edge to
// x = 12 s (inMs, ease-out), holds holdMs, then drifts out toward the inline start at exitPxPerSec × s
// (linear) and is removed once off-screen. Reduced motion: it fades in, holds reducedHoldMs and fades
// out (fx.reducedMotionFadeMs each way). One at a time; decorative (aria-hidden), pointer-events: none.
// The game screen owns the layer (its own fx layer, above the HUD rows, below every overlay).
// Classes: .start-toast[data-kind=level|hard|retry] > .start-toast__text + svg.start-toast__art
import { cfg } from '../../app/config';
import { t } from '../../i18n';
import { icon } from '../art/sprite';

export type StartToastKind = 'level' | 'hard' | 'retry';

export interface StartToastOptions {
  /** Where the toast is placed (the game column); positioned by hud.css. */
  readonly host: HTMLElement;
  /** The screen's scale s (the drift is exitPxPerSec × s). */
  scale(): number;
  reduced(): boolean;
}

export interface StartToast {
  /** Shows the toast for `kind`; a running one is replaced. No-op when fx.startToast.enabled is off. */
  play(kind: StartToastKind): void;
  /** The toast on show, or null. */
  current(): HTMLElement | null;
  destroy(): void;
}

const TEXT = {
  level: 'toast.start.level',
  hard: 'toast.start.hard',
  retry: 'toast.start.retry',
} as const;

/** The motion plan in ms: [delay, in, hold, out] and the drift distance in px (0 with reduced motion). */
export function startToastPlan(opts: { reduced: boolean; width: number; offsetToEdge: number; scale: number }): {
  readonly delay: number;
  readonly inMs: number;
  readonly hold: number;
  readonly out: number;
  readonly enter: number;
  readonly exit: number;
} {
  const T = cfg.fx.startToast;
  if (opts.reduced) {
    const f = cfg.fx.reducedMotionFadeMs;
    return { delay: T.delayMs, inMs: f, hold: T.reducedHoldMs, out: f, enter: 0, exit: 0 };
  }
  // In from beyond the edge: its far end starts at the viewport edge; out: until it has fully left.
  const exit = Math.max(0, opts.offsetToEdge + opts.width);
  const speed = Math.max(1, T.exitPxPerSec * Math.max(0.1, opts.scale));
  return { delay: T.delayMs, inMs: T.inMs, hold: T.holdMs, out: Math.round((exit / speed) * 1000), enter: exit, exit };
}

export function createStartToast(opts: StartToastOptions): StartToast {
  let el: HTMLElement | null = null;
  let anim: Animation | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      anim?.cancel();
    } catch {
      // already gone
    }
    anim = null;
    el?.remove();
    el = null;
  };

  return {
    play(kind) {
      stop();
      if (!cfg.fx.startToast.enabled || !opts.host.isConnected) return;
      const doc = opts.host.ownerDocument;
      const toast = doc.createElement('div');
      toast.className = 'start-toast';
      toast.dataset.kind = kind;
      toast.setAttribute('aria-hidden', 'true');
      const text = doc.createElement('span');
      text.className = 'start-toast__text';
      text.textContent = t(TEXT[kind]);
      toast.append(text, icon('art-flex', { class: 'start-toast__art' }));
      opts.host.appendChild(toast);
      el = toast;
      const reduced = opts.reduced();
      const rtl = doc.defaultView?.getComputedStyle(toast).direction === 'rtl';
      const r = toast.getBoundingClientRect();
      const vw = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
      // The distance from the toast's inline-start side to the viewport's inline-start edge.
      const offsetToEdge = rtl ? Math.max(0, vw - r.right) : Math.max(0, r.left);
      const plan = startToastPlan({ reduced, width: r.width, offsetToEdge, scale: opts.scale() });
      const total = plan.delay + plan.inMs + plan.hold + plan.out;
      const sign = rtl ? 1 : -1;
      if (typeof toast.animate === 'function') {
        const run = plan.inMs + plan.hold + plan.out;
        const a = plan.inMs / run;
        const b = (plan.inMs + plan.hold) / run;
        const frames: Keyframe[] = reduced
          ? [
              { opacity: 0, offset: 0 },
              { opacity: 1, offset: a },
              { opacity: 1, offset: b },
              { opacity: 0, offset: 1 },
            ]
          : [
              { transform: `translateX(${sign * plan.enter}px)`, offset: 0, easing: 'ease-out' },
              { transform: 'none', offset: a },
              { transform: 'none', offset: b, easing: 'linear' },
              { transform: `translateX(${sign * plan.exit}px)`, offset: 1 },
            ];
        try {
          anim = toast.animate(frames, { duration: run, delay: plan.delay, fill: 'both' });
          anim.onfinish = () => {
            if (el === toast) stop();
          };
          return;
        } catch {
          anim = null;
        }
      }
      // No WAAPI: the toast shows still and goes when its time is up.
      timer = setTimeout(() => {
        if (el === toast) stop();
      }, total);
    },
    current: () => el,
    destroy: stop,
  };
}
