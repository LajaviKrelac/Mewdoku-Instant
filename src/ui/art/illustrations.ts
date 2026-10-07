// Owner: ui-board
// Larger poses of our ginger loaf cat (02 §17.3): home mascot (idle), boot (sleeping), win (party
// hat), fail (small bandage), daily (happy), tutorial. Never a trumpet cat or a crying cat (06 §3).

export type IllustrationKind = 'home' | 'boot' | 'win' | 'fail' | 'daily' | 'tutorial';

/** A fresh inline SVG; decorative (aria-hidden) unless `label` is given. */
export function illustration(kind: IllustrationKind, opts?: { label?: string; class?: string }): SVGSVGElement {
  throw new Error('not implemented: illustration');
}
