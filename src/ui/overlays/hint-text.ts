// Owner: B (Phase 2b; was ui-shell)
// 02 §9.1 hint explanation templates and unit names, rendered with i18n. Split from hint-card.ts so
// the session's live announcements (02 §18) can use them while the O1 card itself stays in the lazy
// overlay chunk (04 §9 budget). hint-card.ts re-exports everything here.
// Review PAR-7: hintRichText() renders the same sentence with each colour as a token, so the card can
// show the colour name with a swatch in its tile colour (src/ui/rich-text.ts); the words are identical.
import type { HintStep, Unit, UnitKind } from '../../engine/types';
import { capitalizeFirst, colorName, glyphName, joinList, t } from '../../i18n';
import { CAP, colorToken } from '../rich-tokens';

export interface HintTextContext {
  readonly n: number;
  /** Palette index per region label (colour names). */
  readonly colors: Uint8Array;
  /** Colour patterns on → colour names carry their glyph: "Lavender (star)" (02 §18). */
  readonly patterns: boolean;
  /** Optional region label per cell (puzzle.regions): lets hintLocation() name the tile's colour. */
  readonly regions?: Uint8Array;
}

/** Colour name of a region label (palette index via ctx.colors), with its glyph when patterns are on. */
export function regionName(label: number, ctx: HintTextContext): string {
  const p = ctx.colors[label] ?? label;
  const color = colorName(p);
  return ctx.patterns ? t('unit.colorWithGlyph', { color, glyph: glyphName(p) }) : color;
}

/** How a sentence names a region and capitalises its start: plain text, or rich-text tokens. */
interface Namer {
  region(label: number, ctx: HintTextContext): string;
  capitalize(s: string): string;
}
const PLAIN: Namer = { region: regionName, capitalize: capitalizeFirst };
/** Colour tokens carry the region label; CAP asks the renderer to capitalise the first text it emits. */
const RICH: Namer = { region: (label) => colorToken(label), capitalize: (s) => `${CAP}${s}` };

function unitNameWith(unit: Unit, ctx: HintTextContext, nm: Namer): string {
  switch (unit.kind) {
    case 'row':
      return t('unit.row', { index: unit.index + 1 });
    case 'col':
      return t('unit.col', { index: unit.index + 1 });
    case 'region':
      return nm.region(unit.index, ctx);
  }
}

/** "row 3", "column 5", "Lavender" (02 §9.1 unit names; rows/columns 1-based). */
export function unitName(unit: Unit, ctx: HintTextContext): string {
  return unitNameWith(unit, ctx, PLAIN);
}

function unitListNameWith(units: readonly Unit[], ctx: HintTextContext, nm: Namer): string {
  const first = units[0];
  if (!first) return '';
  if (units.length === 1) return unitNameWith(first, ctx, nm);
  const sameKind = units.every((u) => u.kind === first.kind);
  if (sameKind && first.kind !== 'region') {
    const list = joinList(units.map((u) => String(u.index + 1)));
    return first.kind === 'row' ? t('unit.rows', { list }) : t('unit.cols', { list });
  }
  return joinList(units.map((u) => unitNameWith(u, ctx, nm)));
}

/** "rows 2, 4 and 5", "columns 1 and 3", "Lavender and Mint"; a single unit uses unitName(). */
export function unitListName(units: readonly Unit[], ctx: HintTextContext): string {
  return unitListNameWith(units, ctx, PLAIN);
}

/** "rows", "columns", "colours" ({T-kind} in the pigeonhole template). */
export function unitKindPlural(kind: UnitKind): string {
  return kind === 'row' ? t('unit.kind.rows') : kind === 'col' ? t('unit.kind.cols') : t('unit.kind.colors');
}

const isLine = (u: Unit): boolean => u.kind === 'row' || u.kind === 'col';

/** The explanation sentence for a step (02 §9.1 templates). Also used for the live announcement. */
export function hintText(step: HintStep, ctx: HintTextContext): string {
  return compose(step, ctx, PLAIN);
}

/**
 * hintText() with every colour as a rich-text token (its region label) for setRichText(); the card
 * resolves each token to the colour name with a swatch (PAR-7). Same words as hintText().
 */
export function hintRichText(step: HintStep, ctx: HintTextContext): string {
  return compose(step, ctx, RICH);
}

function compose(step: HintStep, ctx: HintTextContext, nm: Namer): string {
  const unitName = (u: Unit, c: HintTextContext): string => unitNameWith(u, c, nm);
  const unitListName = (u: readonly Unit[], c: HintTextContext): string => unitListNameWith(u, c, nm);
  const capitalizeFirst = nm.capitalize;
  const units = step.focusUnits;
  const u0 = units[0];
  // A step whose units are missing should never reach the UI; keep the card readable anyway.
  const fallback = t('hint.title');
  switch (step.kind) {
    case 'shadow':
      return t('hint.shadow');
    case 'mistaken_mark':
      return t('hint.mistakenMark');
    case 'reveal_fallback':
      return t('hint.revealFallback');
    case 'single':
      return u0 ? capitalizeFirst(t('hint.single', { unit: unitName(u0, ctx) })) : fallback;
    case 'confine_region_line': {
      const region = units.find((u) => u.kind === 'region');
      const line = units.find(isLine);
      if (!region || !line) return fallback;
      const ln = unitName(line, ctx);
      return t('hint.confineRegionLine', { color: unitName(region, ctx), line: ln });
    }
    case 'confine_line_region': {
      const region = units.find((u) => u.kind === 'region');
      const line = units.find(isLine);
      if (!region || !line) return fallback;
      return t('hint.confineLineRegion', { line: unitName(line, ctx), color: unitName(region, ctx) });
    }
    case 'shadow_conflict':
      return u0 ? t('hint.shadowConflict', { unit: unitName(u0, ctx) }) : fallback;
    case 'trial':
      return u0 ? t('hint.trial', { unit: unitName(u0, ctx) }) : fallback;
    case 'pigeonhole': {
      // focusUnits = S (k units of kind A) then T (k units of kind B) (03 §6).
      const k = step.k ?? Math.floor(units.length / 2);
      const sources = units.slice(0, k);
      const targets = units.slice(k);
      const tKind = targets[0]?.kind;
      if (sources.length === 0 || !tKind) return fallback;
      return capitalizeFirst(
        t('hint.pigeonhole', {
          sources: unitListName(sources, ctx),
          targets: unitListName(targets, ctx),
          targetKind: unitKindPlural(tKind),
        }),
      );
    }
  }
}
