// Home redesign (2026-10-11): the Home board (art/home-board.ts) keeps its promises for any seed: every board colour
// shows, no two touching regions share a colour (also across the tile's wrap, so it repeats without a seam), the X
// marks sit centred in their cells and never touch, and the tile size equals tokens.css --home-tile.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CELL, colours, HOME_COLOURS, homeBoardSvg, homeBoardUrl, markCells, N, regions } from '../../../src/ui/art/home-board';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SEEDS = [1, 7, 42, 12345, 987654321, 2147483646];

describe('the Home board', () => {
  it('is the size of tokens.css --home-tile', () => {
    const tokens = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toContain(`--home-tile: ${N * CELL}px;`);
    expect(homeBoardSvg(1)).toContain(`width='${N * CELL}' height='${N * CELL}'`);
  });

  it.each(SEEDS)('seed %i: every colour, and one colour never on both sides of a border (wrap included)', (seed) => {
    const cell = regions(seed);
    const col = colours(cell, seed);
    expect(cell).not.toContain(-1);
    expect(new Set(col).size).toBe(HOME_COLOURS.length);
    const at = (x: number, y: number): number => col[cell[((x + N) % N) + ((y + N) % N) * N] as number] as number;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const id = cell[x + y * N];
        if (cell[((x + 1) % N) + y * N] !== id) expect(at(x + 1, y)).not.toBe(at(x, y));
        if (cell[x + ((y + 1) % N) * N] !== id) expect(at(x, y + 1)).not.toBe(at(x, y));
      }
  });

  it.each(SEEDS)('seed %i: the X marks are centred in their cells and never touch', (seed) => {
    const marks = markCells(seed);
    expect(marks.length).toBeGreaterThanOrEqual(3);
    const svg = homeBoardSvg(seed);
    for (const i of marks) expect(svg).toContain(`x='${(i % N) * CELL + CELL / 2}' y='${Math.floor(i / N) * CELL + CELL / 2}'`);
    for (const a of marks)
      for (const b of marks) {
        if (a === b) continue;
        const dx = Math.abs((a % N) - (b % N));
        const dy = Math.abs(Math.floor(a / N) - Math.floor(b / N));
        expect(Math.min(dx, N - dx) > 1 || Math.min(dy, N - dy) > 1).toBe(true);
      }
  });

  it('is the same board for the same seed and a different one for another', () => {
    expect(homeBoardUrl(5)).toBe(homeBoardUrl(5));
    expect(homeBoardUrl(5)).not.toBe(homeBoardUrl(6));
    expect(homeBoardUrl(5)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
