// Owner: ui-shell. 02 §9.1 hint templates: every step kind, unit names, lists, patterns.
import { describe, expect, it } from 'vitest';
import type { HintKind, HintStep, Unit } from '../../../src/engine/types';
import { hintText, unitListName, unitName, type HintTextContext } from '../../../src/ui/overlays/hint-card';

// Region labels 0..3 → palette Lavender (7), Mint (4), Lemon (2), Strawberry (0).
const ctx: HintTextContext = { n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false };
const withPatterns: HintTextContext = { ...ctx, patterns: true };

const row = (index: number): Unit => ({ kind: 'row', index });
const col = (index: number): Unit => ({ kind: 'col', index });
const reg = (index: number): Unit => ({ kind: 'region', index });

function step(kind: HintKind, focusUnits: Unit[], extra: Partial<HintStep> = {}): HintStep {
  return { kind, level: 1, focusUnits, focusCells: [0], effectCells: [], ...extra };
}

describe('unitName', () => {
  it('numbers rows and columns from 1 and names regions by palette colour', () => {
    expect(unitName(row(2), ctx)).toBe('row 3');
    expect(unitName(col(4), ctx)).toBe('column 5');
    expect(unitName(reg(0), ctx)).toBe('Lavender');
    expect(unitName(reg(3), ctx)).toBe('Strawberry');
  });

  it('adds the glyph name when colour patterns are on (02 §18)', () => {
    expect(unitName(reg(0), withPatterns)).toBe('Lavender (bar)');
    expect(unitName(reg(1), withPatterns)).toBe('Mint (diamond)');
    expect(unitName(row(0), withPatterns)).toBe('row 1');
  });

  it('joins lists of lines and colours', () => {
    expect(unitListName([row(1), row(3), row(4)], ctx)).toBe('rows 2, 4 and 5');
    expect(unitListName([col(0), col(2)], ctx)).toBe('columns 1 and 3');
    expect(unitListName([reg(0), reg(1)], ctx)).toBe('Lavender and Mint');
    expect(unitListName([reg(0), reg(1), reg(2)], ctx)).toBe('Lavender, Mint and Lemon');
    expect(unitListName([row(6)], ctx)).toBe('row 7');
    expect(unitListName([], ctx)).toBe('');
  });
});

describe('hintText (02 §9.1 templates)', () => {
  it('shadow', () => {
    expect(hintText(step('shadow', [row(0), col(1), reg(0)], { level: 0 }), ctx)).toBe(
      'This cat claims its row, column, colour and every tile touching it. Cross those out.',
    );
  });

  it('single, for each unit kind, capitalised', () => {
    expect(hintText(step('single', [row(1)], { placeCell: 7 }), ctx)).toBe('Row 2 has just one open tile left, so its cat goes here.');
    expect(hintText(step('single', [col(3)]), ctx)).toBe('Column 4 has just one open tile left, so its cat goes here.');
    expect(hintText(step('single', [reg(0)]), ctx)).toBe('Lavender has just one open tile left, so its cat goes here.');
  });

  it('confinement region → line', () => {
    expect(hintText(step('confine_region_line', [reg(0), row(2)], { level: 2 }), ctx)).toBe(
      'Every open Lavender tile is in row 3. So no other colour can use row 3.',
    );
  });

  it('confinement line → region', () => {
    expect(hintText(step('confine_line_region', [col(1), reg(1)], { level: 2 }), ctx)).toBe(
      'All open tiles of column 2 are Mint. So the rest of Mint is out.',
    );
    expect(hintText(step('confine_line_region', [row(0), reg(2)], { level: 2 }), withPatterns)).toBe(
      'All open tiles of row 1 are Lemon (triangle). So the rest of Lemon (triangle) is out.',
    );
  });

  it('shadow conflict', () => {
    expect(hintText(step('shadow_conflict', [reg(3)], { level: 3 }), ctx)).toBe(
      'A cat here would cross out every open tile of Strawberry. So no cat can go here.',
    );
  });

  it('pigeonhole: colours into rows, rows into colours, columns into colours', () => {
    expect(hintText(step('pigeonhole', [reg(0), reg(1), row(1), row(3)], { level: 4, k: 2 }), ctx)).toBe(
      'Lavender and Mint only fit in rows 2 and 4. Those rows are taken, so clear their other tiles.',
    );
    expect(hintText(step('pigeonhole', [row(0), row(1), row(2), reg(0), reg(2), reg(3)], { level: 4, k: 3 }), ctx)).toBe(
      'Rows 1, 2 and 3 only fit in Lavender, Lemon and Strawberry. Those colours are taken, so clear their other tiles.',
    );
    expect(hintText(step('pigeonhole', [col(0), col(1), reg(2), reg(3)], { level: 4, k: 2 }), ctx)).toBe(
      'Columns 1 and 2 only fit in Lemon and Strawberry. Those colours are taken, so clear their other tiles.',
    );
    // k missing: half the units are sources.
    expect(hintText(step('pigeonhole', [row(0), row(1), col(2), col(3)], { level: 4 }), ctx)).toBe(
      'Rows 1 and 2 only fit in columns 3 and 4. Those columns are taken, so clear their other tiles.',
    );
  });

  it('trial', () => {
    expect(hintText(step('trial', [col(2)], { level: 5 }), ctx)).toBe(
      'Imagine a cat here: column 3 would have no tile left. So this tile is out.',
    );
  });

  it('mistaken mark and reveal fallback', () => {
    expect(hintText(step('mistaken_mark', [], { level: 0 }), ctx)).toBe("This X rules out a tile that can't be ruled out yet.");
    expect(hintText(step('reveal_fallback', [reg(1)], { placeCell: 3 }), ctx)).toBe("Here's a cat to get you going.");
  });

  it('stays readable when a step lacks its units', () => {
    expect(hintText(step('single', []), ctx)).toBe('Hint');
    expect(hintText(step('confine_region_line', [row(1)]), ctx)).toBe('Hint');
    expect(hintText(step('pigeonhole', []), ctx)).toBe('Hint');
  });
});
