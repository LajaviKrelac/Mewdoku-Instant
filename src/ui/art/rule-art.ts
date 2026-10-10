// Owner: G2 (Phase 2d)
// The rule cards' 3 × 3 mini diagrams (look-spec §1.7), our own three layouts (not the original's),
// drawn as one SVG each on a 32.7-unit box: cells 10.2 at a 11.25 pitch (gap 1.05), radius 1.5.
// A plain cell is a --rule-tile tan square (--rule-tile-2 for the second colour region of `colours`);
// a marked cell is a --rule-mark box with a white X (two rounded bars, 15 % of the box thick, the X
// spanning 65 % of it); the cat cell is a --rule-mark box with our Tux head (#cat-idle) at 90 %.
// aria-hidden; in RTL the card mirrors its position but the diagram is not flipped (look-spec §1.18).
import type { RuleChip } from '../hud/rule-chips';

/** [row, col] of the cat and of the X boxes, per rule (look-spec §1.7 "Our three diagrams"). */
const LAYOUT: Readonly<Record<RuleChip, { readonly cat: number; readonly x: readonly number[] }>> = {
  colours: { cat: 3, x: [0, 1, 2, 6] },
  lines: { cat: 4, x: [1, 3, 5, 7] },
  space: { cat: 0, x: [1, 3, 4] },
};

/** `colours`: the top row and the left column are one region; the other four cells a second one. */
const SECOND_REGION = [4, 5, 7, 8];

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** The 3 × 3 mini diagram of a rule card as SVG markup (aria-hidden, our own layouts, look-spec §1.7). */
export function ruleDiagram(kind: RuleChip): string {
  const { cat, x } = LAYOUT[kind];
  let body = '';
  for (let i = 0; i < 9; i++) {
    const px = (i % 3) * 11.25;
    const py = Math.floor(i / 3) * 11.25;
    const mark = i === cat || x.includes(i);
    const fill = mark ? 'rule-mark' : kind === 'colours' && SECOND_REGION.includes(i) ? 'rule-tile-2' : 'rule-tile';
    body += `<rect x="${px}" y="${py}" width="10.2" height="10.2" rx="1.5" style="fill:var(--${fill})"/>`;
    if (i === cat) body += `<use href="#cat-idle" x="${r2(px + 0.5)}" y="${r2(py + 0.5)}" width="9.2" height="9.2"/>`;
    // the X: bars 1.53 thick and 7.85 long, so the X's box is 65 % of the cell (look-spec §1.7)
    else if (mark) {
      const c = `${r2(px + 5.1)} ${r2(py + 5.1)}`;
      body += [45, -45].map((d) => `<rect x="${r2(px + 1.18)}" y="${r2(py + 4.34)}" width="7.85" height="1.53" rx=".6" fill="#fff" transform="rotate(${d} ${c})"/>`).join('');
    }
  }
  return `<svg class="chip__art" viewBox="0 0 32.7 32.7" aria-hidden="true" focusable="false">${body}</svg>`;
}
