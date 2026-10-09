// Owner: A. Sprite, illustrations and palette helpers (phase2b §1.12: A extends it with the X edge
// underlay, --xe and the Tux art checks).
// phase2b F0 split: the fx and a11y cases moved to fx-a11y.spec.ts (B).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { illustration, type IllustrationKind } from '../../../src/ui/art/illustrations';
import { mixHex, PALETTE, regionColorsFor, regionColorVar, TOKENS, xEdgeColor } from '../../../src/ui/art/palette';
import { icon, mountSprite, setIcon, SPRITE_ID, type SymbolId } from '../../../src/ui/art/sprite';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('sprite', () => {
  const ids: SymbolId[] = [
    'cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised', 'cat-blink', 'mark-x', 'wrong-x',
    'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw', 'icon-heart', 'icon-heart-empty', 'icon-trophy', 'icon-lock',
    'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron', 'icon-rule-colours', 'icon-rule-lines', 'icon-rule-space',
    ...Array.from({ length: 12 }, (_, i) => `glyph-${i}` as SymbolId),
    // phase2b §1.7, §2.9, §4.4 (F0 placeholders until A's final art)
    'icon-fish', 'icon-plus', 'icon-shop', 'icon-globe', 'icon-crown', 'icon-users', 'cat-ear-flick', 'acc-lantern', 'acc-scarf', 'acc-yarn',
  ];

  it('mounts once and defines every symbol plus the heart clip paths', () => {
    mountSprite();
    mountSprite();
    expect(document.querySelectorAll(`#${SPRITE_ID}`)).toHaveLength(1);
    const sprite = document.getElementById(SPRITE_ID) as Element;
    expect(sprite.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.firstChild).toBe(sprite);
    for (const id of ids) expect(sprite.querySelector(`symbol[id="${id}"]`), id).not.toBeNull();
    expect(sprite.querySelector('#clip-heart-l')).not.toBeNull();
    expect(sprite.querySelector('#clip-heart-r')).not.toBeNull();
  });

  it('icon() is decorative by default and labelled on request', () => {
    const a = icon('icon-paw', { class: 'x' });
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(a.getAttribute('class')).toBe('icon icon-paw x');
    expect(a.querySelector('use')?.getAttribute('href')).toBe('#icon-paw');
    const b = icon('cat-happy', { label: 'A happy cat' });
    expect(b.getAttribute('role')).toBe('img');
    expect(b.getAttribute('aria-label')).toBe('A happy cat');
    setIcon(b, 'cat-sad');
    expect(b.querySelector('use')?.getAttribute('href')).toBe('#cat-sad');
  });
});

describe('illustrations', () => {
  it('builds a fresh SVG for every pose', () => {
    const kinds: IllustrationKind[] = ['home', 'boot', 'win', 'fail', 'daily', 'tutorial'];
    for (const k of kinds) {
      const svg = illustration(k);
      expect(svg.getAttribute('class')).toContain(`illus--${k}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(10);
      expect(svg).not.toBe(illustration(k));
    }
    const labelled = illustration('win', { label: 'A ginger cat in a party hat', class: 'big' });
    expect(labelled.getAttribute('role')).toBe('img');
    expect(labelled.getAttribute('class')).toBe('illus illus--win big');
  });
});

describe('palette helpers', () => {
  it('regionColorVar and mixHex', () => {
    expect(regionColorVar(7)).toBe('var(--r7)');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#F49AAE', '#FBF6EE', 0)).toBe('#f49aae');
  });

  it('regionColorsFor uses fixed tutorial colours or a deterministic engine assignment', () => {
    const puzzle = { id: 'T1' as const, n: 4, regions: Uint8Array.from([0, 1, 2, 2, 0, 0, 2, 2, 0, 3, 3, 2, 3, 3, 3, 3]) };
    expect(Array.from(regionColorsFor(puzzle, [4, 7, 2, 0]))).toEqual([4, 7, 2, 0]);
    const a = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    const b = regionColorsFor({ ...puzzle, id: 'L9' }, null);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(new Set(a).size).toBe(4);
    for (const c of a) expect(c).toBeLessThan(PALETTE.length);
    // a fixed list that is too short or out of range falls back to the assignment
    expect(Array.from(regionColorsFor({ ...puzzle, id: 'L9' }, [1, 2]))).toEqual(Array.from(a));
  });
});

describe('phase2b palette additions', () => {
  it('xEdgeColor mixes each tile toward --ink by layout.markEdgeMix (phase2b §1.5)', () => {
    for (let i = 0; i < PALETTE.length; i++) expect(xEdgeColor(i)).toBe(mixHex(PALETTE[i] as string, TOKENS.ink, cfg.layout.markEdgeMix));
    expect(xEdgeColor(3)).not.toBe(PALETTE[3]);
  });
});
