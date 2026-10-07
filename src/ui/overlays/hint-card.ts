// Owner: ui-shell
// O1 hint card (02 §5, §9.1): bottom sheet with the explanation, [Apply] and [×]. The board's dimming
// and focus outline come from GameView.highlight. Renders the 02 §9.1 templates via i18n.
// The root holds a CLEAR full-screen scrim, so the dimmed board stays visible while a tap on it
// closes the card (HINT_CLOSE), as does × or Esc (dismiss()).
//
// Classes: .overlay[data-overlay=hint] > .overlay__scrim--clear + .overlay__panel--sheet.hint-card
//          .hint-card__icon .hint-card__text .hint-card__actions
import type { HintStep, Unit, UnitKind } from '../../engine/types';
import { capitalizeFirst, colorName, glyphName, joinList, t } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';

export interface HintTextContext {
  readonly n: number;
  /** Palette index per region label (colour names). */
  readonly colors: Uint8Array;
  /** Colour patterns on → colour names carry their glyph: "Lavender (star)" (02 §18). */
  readonly patterns: boolean;
}

export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  /** ×, Esc or a tap on the dimmed area (HINT_CLOSE). */
  onClose(): void;
  /**
   * Optional: the board's client rect (GameScreen.boardRect). When the bottom sheet would cover it,
   * the sheet moves to the top of the screen, over the top bar and HUD (small or wide screens).
   */
  avoidRect?(): DOMRect | null;
}

/** Margin kept between a top-placed sheet and the screen edge (CSS px). */
const TOP_MARGIN = 12;

/**
 * 'top' when the bottom sheet (`sheet`, measured at the bottom) overlaps `avoid` and the top slot
 * overlaps it less. The top slot is TOP_MARGIN + safeTop from the screen edge.
 */
export function sheetPlacement(sheet: { top: number; height: number }, avoid: { top: number; bottom: number } | null, safeTop = 0): 'bottom' | 'top' {
  if (!avoid) return 'bottom';
  const bottomOverlap = Math.max(0, avoid.bottom - sheet.top);
  if (bottomOverlap <= 0) return 'bottom';
  const topOverlap = Math.max(0, TOP_MARGIN + safeTop + sheet.height - avoid.top);
  return topOverlap < bottomOverlap ? 'top' : 'bottom';
}

/** Colour name of a region label (palette index via ctx.colors), with its glyph when patterns are on. */
function regionName(label: number, ctx: HintTextContext): string {
  const p = ctx.colors[label] ?? label;
  const color = colorName(p);
  return ctx.patterns ? t('unit.colorWithGlyph', { color, glyph: glyphName(p) }) : color;
}

/** "row 3", "column 5", "Lavender" (02 §9.1 unit names; rows/columns 1-based). */
export function unitName(unit: Unit, ctx: HintTextContext): string {
  switch (unit.kind) {
    case 'row':
      return t('unit.row', { index: unit.index + 1 });
    case 'col':
      return t('unit.col', { index: unit.index + 1 });
    case 'region':
      return regionName(unit.index, ctx);
  }
}

/** "rows 2, 4 and 5", "columns 1 and 3", "Lavender and Mint"; a single unit uses unitName(). */
export function unitListName(units: readonly Unit[], ctx: HintTextContext): string {
  const first = units[0];
  if (!first) return '';
  if (units.length === 1) return unitName(first, ctx);
  const sameKind = units.every((u) => u.kind === first.kind);
  if (sameKind && first.kind !== 'region') {
    const list = joinList(units.map((u) => String(u.index + 1)));
    return first.kind === 'row' ? t('unit.rows', { list }) : t('unit.cols', { list });
  }
  return joinList(units.map((u) => unitName(u, ctx)));
}

/** "rows", "columns", "colours" ({T-kind} in the pigeonhole template). */
export function unitKindPlural(kind: UnitKind): string {
  return kind === 'row' ? t('unit.kind.rows') : kind === 'col' ? t('unit.kind.cols') : t('unit.kind.colors');
}

const isLine = (u: Unit): boolean => u.kind === 'row' || u.kind === 'col';

/** The explanation sentence for a step (02 §9.1 templates). Also used for the live announcement. */
export function hintText(step: HintStep, ctx: HintTextContext): string {
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

export function createHintCard(): OverlayView<HintCardProps> {
  let props: HintCardProps | null = null;
  const close = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'hint', scrim: 'clear', panel: 'sheet', onScrimTap: () => void close() });
  shell.panel.classList.add('hint-card');

  const title = h('h2', { class: 'overlay__title visually-hidden', id: shell.titleId }, t('hint.title'));
  const text = h('p', { class: 'hint-card__text', id: shell.descId });
  const apply = makeButton({
    variant: 'primary',
    label: t('hint.apply'),
    autofocus: true,
    className: 'hint-card__apply',
    onPress: () => props?.onApply(),
  });
  const closeBtn = closeButton(() => void close(), t('hint.close'));
  shell.panel.append(
    h('div', { class: 'hint-card__row' }, icon('icon-bulb', { class: 'hint-card__icon' }), title, text),
    h('div', { class: 'overlay__actions hint-card__actions' }, apply, closeBtn),
  );

  /** Measures at the bottom, then flips to the top if that covers the board less. */
  const place = (): void => {
    if (!props || !shell.isOpen()) return;
    shell.el.dataset.placement = 'bottom';
    const avoid = props.avoidRect?.() ?? null;
    if (!avoid) return;
    const r = shell.panel.getBoundingClientRect();
    const safeTop = parseFloat(shell.el.ownerDocument.defaultView?.getComputedStyle(shell.el).getPropertyValue('--safe-top') ?? '') || 0;
    shell.el.dataset.placement = sheetPlacement(r, avoid, safeTop);
  };
  const win = (): Window | null => shell.el.ownerDocument.defaultView;

  const render = (p: HintCardProps): void => {
    props = p;
    setText(text, hintText(p.step, p));
    shell.panel.dataset.kind = p.step.kind;
    place();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      shell.show();
      render(p);
      win()?.addEventListener('resize', place);
    },
    update(p) {
      render(p);
    },
    close() {
      win()?.removeEventListener('resize', place);
      shell.hide();
    },
    dismiss: close,
    destroy() {
      win()?.removeEventListener('resize', place);
      props = null;
      shell.el.remove();
    },
  };
}
