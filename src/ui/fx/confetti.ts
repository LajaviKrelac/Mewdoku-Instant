// Owner: B (Phase 2b; was ui-board)
// CSS particle burst: cfg.fx.confettiCount absolutely positioned <i> with random CSS variables,
// removed after cfg.fx.confettiMs (02 §17.5). Skipped under reduced motion by the caller.
// The keyframes (confetti-x / confetti-y, a launch-then-gravity curve) live in styles/fx.css.
import { cfg } from '../../app/config';
import { PALETTE } from '../art/palette';

const SHAPES = ['sq', 'rect', 'dot'] as const;
/** Bright accents mixed into the region palette so the burst reads on the dark scrim. */
const EXTRA = ['#FFD45C', '#FFFFFF', '#5FD3BD'];

/** Appends the burst to `host`; returns a cleanup that removes it early. */
export function burstConfetti(host: HTMLElement, opts?: { count?: number; durationMs?: number; random?: () => number }): () => void {
  const count = opts?.count ?? cfg.fx.confettiCount;
  const duration = opts?.durationMs ?? cfg.fx.confettiMs;
  const rnd = opts?.random ?? Math.random;
  const doc = host.ownerDocument;
  const layer = doc.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--dur', `${duration}ms`);
  const colors = [...PALETTE, ...EXTRA];
  for (let i = 0; i < count; i++) {
    const piece = doc.createElement('i');
    const shape = SHAPES[Math.floor(rnd() * SHAPES.length)] ?? 'sq';
    piece.className = `cf cf-${shape}`;
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 0.95; // mostly upward, fanned out
    const speed = 0.55 + rnd() * 0.45;
    const set = (k: string, v: string): void => piece.style.setProperty(k, v);
    set('--dx', `${(Math.cos(angle) * speed * 46).toFixed(1)}vmin`);
    set('--up', `${(-Math.sin(angle) * speed * 30 + 4).toFixed(1)}vmin`);
    set('--fall', `${(38 + rnd() * 30).toFixed(1)}vmin`);
    set('--rot', `${Math.round((rnd() - 0.5) * 1440)}deg`);
    set('--delay', `${Math.round(rnd() * 120)}ms`);
    set('--c', colors[Math.floor(rnd() * colors.length)] ?? '#FFD45C');
    set('--s', `${(0.7 + rnd() * 0.6).toFixed(2)}`);
    const inner = doc.createElement('b');
    piece.appendChild(inner);
    layer.appendChild(piece);
  }
  host.appendChild(layer);
  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    layer.parentNode?.removeChild(layer);
  };
  const timer = setTimeout(cleanup, duration + 200);
  return cleanup;
}
