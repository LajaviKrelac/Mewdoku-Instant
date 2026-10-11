// Home redesign (2026-10-11): tokens.css --home-art is exactly what scripts/home-art.ts generates, and the tile
// keeps its promises (every palette colour shows, no two touching regions share a colour, also across the wrap).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colours, dataUri, N, PALETTE, regions, tileSvg } from '../../../scripts/home-art';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('the Home background tile', () => {
  it('tokens.css carries the generated tile and its size', () => {
    const tokens = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toContain(`--home-art: ${dataUri(tileSvg())};`);
    expect(tokens).toContain(`width='${/--home-tile: (\d+)px;/.exec(tokens)?.[1]}'`);
  });

  it('uses every board colour and never puts one colour on both sides of a border', () => {
    const cell = regions();
    const col = colours(cell);
    const at = (x: number, y: number): number => col[cell[((x + N) % N) + ((y + N) % N) * N] as number] as number;
    expect(new Set(col).size).toBe(PALETTE.length);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const id = cell[x + y * N];
        if (cell[((x + 1) % N) + y * N] !== id) expect(at(x + 1, y)).not.toBe(at(x, y));
        if (cell[x + ((y + 1) % N) * N] !== id) expect(at(x, y + 1)).not.toBe(at(x, y));
      }
  });
});
