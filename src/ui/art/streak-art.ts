// Owner: G2 (Phase 2e; moved out of sprite.ts by the lead at I-4, requests-G2 R4)
// The streak art (the flame and the four steps). Not in the first-load sprite: mountStreakArt() adds the symbols
// once, called by the lazy overlay chunk (app/overlay-chunk.ts), which brings everything that draws them (Home's
// streak strip, the victory's streak row, How to play). A <use> made earlier draws as soon as they arrive.
import { CHEST_COLORS, TOKENS } from './palette';
import { icon24, PAW, SPRITE_ID } from './sprite';

/**
 * Phase 2e (spec §5.3, Appendix C; ours, drawn from the spec's words): the streak strip's art. G2 drew it for the
 * first-load sprite; at I-4 (spec §7.9's rule) the strip moved to the lazy overlay chunk, and this art with it
 * (requests-G2 R4): Home's strip, the victory's streak row and How to play all come with that chunk.
 * - icon-streak-flame: a small warm flame (--accent outside, --gold inside, a --fish-hi core) whose round base
 *   ends in three soft lobes like a paw's main pad, with a small side tongue;
 * - streak-step-empty: the paw print as an outline (--step-line, a muted mauve, 3.10 on --page) around a white
 *   wash (--step-wash); the strip may colour the next step's line (e.g. --accent-deep) through --step-line;
 * - streak-step-done: the paw filled in --accent with a --accent-deep rim (a shape, not colour alone);
 * - streak-step-today: the done paw on a soft gold halo with a white rounded check on its main pad;
 * - streak-step-chest: the day-7 step, a small wooden chest (a rounded lid, gold straps, a gold fish-shaped
 *   lock); with --chest-open: 1 and --chest-shut: 0 the lid stands open over a pale gold light in a soft glow
 *   (day 7 collected). Kept to its few shapes: it is first-load art (the chests' detail is in ladder-art.ts).
 */
/** The streak art's symbols (markup), for mountStreakArt and the art tests. */
export function streakArtSymbols(): string {
  const { accent, gold } = TOKENS;
  const W = CHEST_COLORS;
  const step = (paint: string): string => `<g ${paint}>${PAW}</g>`;
  const done = step(`fill="${accent}" stroke="${TOKENS['accent-deep']}" stroke-width=".9"`);
  return [
    icon24(
      'icon-streak-flame',
      `<path d="M12.6 1.4c1.5 3.4 6 6 6.6 11.2.3 2.4-.2 4.4-1.2 6Q18 21.8 14.8 20.4 13.8 22.8 12 22.8t-2.8-2.4Q6 21.8 6 18.6c-1.2-1.8-1.5-3.6-1.2-5.8.3-2.2 1.6-3.8 2.6-5.4.2 1.6.8 2.6 1.6 3.2.2-3.6 2-6.2 3.6-9.2Z" fill="${accent}"/>` +
        `<path d="M12.4 8.6c1.1 2.4 3.6 3.8 3.6 7 0 2.6-1.8 4.4-4 4.4s-4-1.8-4-4.2c0-2.6 2.6-4.2 4.4-7.2Z" fill="${gold}"/>` +
        `<ellipse cx="12" cy="16.6" rx="2" ry="2.6" fill="${TOKENS['fish-hi']}"/>`,
    ),
    icon24('streak-step-empty', step(`style="fill:var(--step-wash,#fff);stroke:var(--step-line,${TOKENS['step-line']})" stroke-width="1.4"`)),
    icon24('streak-step-done', done),
    icon24(
      'streak-step-today',
      `<circle cx="12" cy="13" r="11" fill="${gold}" opacity=".4"/>${done}` +
        `<path d="m9.5 16.2 1.8 1.8 3.3-3.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
    icon24(
      'streak-step-chest',
      `<g style="opacity:var(--chest-open,0)"><circle cx="12" cy="10" r="9" fill="${gold}" opacity=".45"/>` +
        `<path d="M4.4 11 5.6 4q.3-1.4 1.8-1.4h9.2q1.5 0 1.8 1.4l1.2 7Z" fill="${W.grain}"/><path d="M4.6 11.8q2.6-3.6 7.4-3.6t7.4 3.6Z" fill="${TOKENS['fish-hi']}"/></g>` +
        `<rect x="3.4" y="11.2" width="17.2" height="9.6" rx="1.8" fill="${W.wood}"/>` +
        `<g style="opacity:var(--chest-shut,1)"><path d="M3.4 12.6V9.8c0-2.6 2-4.4 4.6-4.4h8c2.6 0 4.6 1.8 4.6 4.4v2.8Z" fill="${W.lid}"/>` +
        `<path d="M3.4 11.6h17.2v1.4H3.4Z" fill="${W.grain}"/><path d="M6.2 5.6H8v6H6.2Zm9.8 0h1.8v6H16Z" fill="${gold}"/></g>` +
        `<path d="M6.2 12.6H8v8.2H6.2Zm9.8 0h1.8v8.2H16Z" fill="${gold}"/><path d="m14.2 13.4 2.4-1.8v3.6Z" fill="${TOKENS['gold-deep']}"/>` +
        `<ellipse cx="11.8" cy="13.4" rx="3" ry="2.2" fill="${gold}" stroke="${TOKENS['gold-deep']}" stroke-width=".7"/>`,
    ),
  ].join('');
}

/** Adds the streak art to the sprite once (idempotent; a no-op before the sprite is mounted or without a DOM). */
export function mountStreakArt(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  const sprite = doc?.getElementById(SPRITE_ID);
  if (!doc || !sprite || doc.getElementById('icon-streak-flame')) return;
  const holder = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.innerHTML = streakArtSymbols();
  sprite.append(...Array.from(holder.childNodes));
}
