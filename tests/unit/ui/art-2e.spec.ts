// Owner: G2 (Phase 2e)
// The Phase 2e art (spec Appendix C, §10.1; CONTRACTS §9): every new symbol id exists where it belongs (the
// streak art — the flame and steps — lazy with the overlay chunk since I-4 (art/streak-art.ts, spec §7.9's rule;
// it was in the first-load sprite); the ranking art, lazy: medals, avatars, hearts, the reward
// chests, name tag, edit/shuffle/info; the 2d.1 lazy art is unchanged), has a viewBox and uses only registered palette colours; the
// avatars cover 0 … AVATAR_COUNT − 1 and stay distinct; the ranking art is never reachable from the first load.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AVATAR_COUNT, BACKGROUND_COUNT, FRAME_COUNT } from '../../../src/shared/rank-api';
import { CAT_COLORS, CHEST_COLORS, PALETTE, TOKENS } from '../../../src/ui/art/palette';
import { AVATAR_COATS, AVATAR_DISC_MIX, avatarDisc, LOOK_COLORS, MEDAL_COLORS, MEDAL_NUMBER_INK, TAG_COLORS } from '../../../src/ui/art/palette-2e';
import { lazyArtSymbols } from '../../../src/ui/art/lazy-art';
import { ART_AVATAR_COUNT, avatarSymbol, HEART_POP, HEART_POP_MS, ladderArtSymbols, MEDAL_FACE, mountLadderArt } from '../../../src/ui/art/ladder-art';
import { ART_LOOKS, avatarBadge, icon, mountSprite, spriteMarkup, SPRITE_ID, type IconSymbol } from '../../../src/ui/art/sprite';
import { mountStreakArt, streakArtSymbols } from '../../../src/ui/art/streak-art';
import { deltaE2000, hexToLab } from '../../../scripts/palette-check';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The streak art (Phase 2e I-4: lazy, art/streak-art.ts; the name is kept from when it was first-load art). */
const FIRST_LOAD: readonly IconSymbol[] = ['icon-streak-flame', 'streak-step-empty', 'streak-step-done', 'streak-step-today', 'streak-step-chest'];
const AVATARS = Array.from({ length: 12 }, (_, i) => `avatar-${i}`) as IconSymbol[];
/** UI batch (profile): the avatar frames and backgrounds (looks-art.ts; id 0 of each is the plain look, no symbol). */
const LOOKS = [
  ...Array.from({ length: FRAME_COUNT - 1 }, (_, i) => `frame-${i + 1}`),
  ...Array.from({ length: BACKGROUND_COUNT - 1 }, (_, i) => `bg-${i + 1}`),
] as IconSymbol[];
const LADDER: readonly IconSymbol[] = ['medal-1', 'medal-2', 'medal-3', ...AVATARS, 'icon-heart-line', 'icon-heart-fill', 'reward-chest', 'reward-chest-open', 'nick-tag', 'icon-pencil', 'icon-info', ...LOOKS];
const ALL = [...FIRST_LOAD, ...LADDER];

/** The markup of one <symbol> in a markup string. */
function symbolOf(markup: string, id: string): string {
  const m = new RegExp(`<symbol id="${id}" viewBox="[^"]+">[\\s\\S]*?</symbol>`).exec(markup);
  return m?.[0] ?? '';
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phase 2e art: where each symbol lives (CONTRACTS §9, spec §7.9)', () => {
  it('the streak flame and steps are in the streak art (lazy since I-4, not the first-load sprite); the ranking art and the chests are in neither, nor in the 2d.1 lazy art', () => {
    const first = spriteMarkup();
    for (const id of FIRST_LOAD) {
      expect(streakArtSymbols(), id).toContain(`<symbol id="${id}" `);
      expect(first, id).not.toContain(`id="${id}"`);
    }
    for (const id of LADDER) {
      expect(first, id).not.toContain(`id="${id}"`);
      expect(lazyArtSymbols(), id).not.toContain(`id="${id}"`); // the lazy-art chunk keeps its size (its 4.4 KB row)
      expect(ladderArtSymbols(), id).toContain(`<symbol id="${id}" `);
    }
  });

  it('every new symbol has a viewBox (square for the steps, the flame, the icons, the medals and the avatars) and no text or external reference', () => {
    const all = spriteMarkup() + streakArtSymbols() + ladderArtSymbols();
    for (const id of ALL) {
      const s = symbolOf(all, id);
      expect(s, id).not.toBe('');
      const vb = /viewBox="([^"]+)"/.exec(s)?.[1]?.split(' ').map(Number) ?? [];
      expect(vb, id).toHaveLength(4);
      expect(vb[2], id).toBe(vb[3]);
      expect(s, id).not.toMatch(/<text|<image|https?:|<script|on\w+=/);
    }
  });

  it('mountLadderArt: a no-op before the sprite, then adds the ranking art and the chests once (idempotent)', () => {
    mountLadderArt();
    expect(document.getElementById('avatar-0')).toBeNull();
    mountSprite();
    mountLadderArt();
    mountLadderArt();
    const sprite = document.getElementById(SPRITE_ID) as Element;
    for (const id of LADDER) expect(sprite.querySelectorAll(`symbol[id="${id}"]`), id).toHaveLength(1);
    expect(sprite.querySelectorAll('[id="chest-glow"]')).toHaveLength(1);
  });

  it('mountStreakArt (I-4): a no-op before the sprite, then adds the flame and the steps once (idempotent)', () => {
    mountStreakArt();
    expect(document.getElementById('icon-streak-flame')).toBeNull();
    mountSprite();
    mountStreakArt();
    mountStreakArt();
    const sprite = document.getElementById(SPRITE_ID) as Element;
    for (const id of FIRST_LOAD) expect(sprite.querySelectorAll(`symbol[id="${id}"]`), id).toHaveLength(1);
  });

  it('icon() draws them: class names and the decorative default', () => {
    mountSprite();
    const svg = icon('avatar-3');
    expect(svg.getAttribute('class')).toBe('icon icon-avatar-3');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(icon('icon-heart-fill').getAttribute('class')).toBe('icon icon-heart-fill');
    expect(icon('streak-step-today').querySelector('use')?.getAttribute('href')).toBe('#streak-step-today');
  });

  it('no module of the first load (src/main.ts and both platform entries, static imports) reaches the ranking art', () => {
    const seen = new Set<string>();
    const resolveImport = (from: string, spec: string): string | null => {
      if (spec === '@platform') return null; // both entries are walked as roots
      if (!spec.startsWith('.')) return null;
      const base = resolve(dirname(from), spec);
      for (const f of [base, `${base}.ts`, `${base}/index.ts`]) if (existsSync(f) && f.endsWith('.ts')) return f;
      return null;
    };
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
      for (const m of src.matchAll(re)) {
        const next = resolveImport(file, m[1] as string);
        if (next) walk(next);
      }
    };
    for (const entry of ['src/main.ts', 'src/platform/web/index.ts', 'src/platform/fb/index.ts']) walk(resolve(ROOT, entry));
    expect(seen.size).toBeGreaterThan(30);
    expect(seen.has(resolve(ROOT, 'src/ui/art/sprite.ts'))).toBe(true);
    // Phase 2e I-4: the streak art, the chip and the strip are lazy too (the overlay chunk, spec §7.9's rule).
    for (const lazy of ['src/ui/art/ladder-art.ts', 'src/ui/art/looks-art.ts', 'src/ui/art/palette-2e.ts', 'src/ui/art/lazy-art.ts', 'src/ui/art/streak-art.ts', 'src/ui/hud/streak-strip.ts', 'src/ui/hud/ladder-chip.ts']) {
      expect(seen.has(resolve(ROOT, lazy)), lazy).toBe(false);
    }
  });
});

describe('Phase 2e art: colours come from the registered palettes (palette-check sees them)', () => {
  const allowed = new Set<string>(
    [
      '#fff',
      '#ffffff',
      ...Object.values(TOKENS),
      ...Object.values(CAT_COLORS),
      ...Object.values(CHEST_COLORS),
      ...PALETTE,
      ...MEDAL_COLORS.flatMap((m) => Object.values(m)),
      ...AVATAR_COATS.flatMap((c) => [c.coat, c.edge, c.mark, c.muzzle, c.mark2, c.line, avatarDisc(c)]),
      ...Object.values(TAG_COLORS),
      ...Object.values(LOOK_COLORS),
    ]
      .filter((v) => v.startsWith('#'))
      .map((v) => v.toLowerCase()),
  );

  it('every colour literal in the new symbols is a token, a cat colour, a palette colour or a Phase 2e art colour', () => {
    const all = spriteMarkup() + streakArtSymbols() + ladderArtSymbols();
    for (const id of ALL) {
      const s = symbolOf(all, id);
      for (const hex of s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(allowed.has(hex.toLowerCase()), `${id} ${hex}`).toBe(true);
    }
  });

  it('custom properties fall back to their token values: --cheer, --step-line, --icon-fill', () => {
    const all = ladderArtSymbols() + spriteMarkup() + streakArtSymbols();
    expect(symbolOf(all, 'icon-heart-fill')).toContain(`var(--cheer,${TOKENS.cheer})`);
    expect(symbolOf(all, 'streak-step-empty')).toContain(`var(--step-line,${TOKENS['step-line']})`);
    expect(symbolOf(all, 'icon-heart-line')).toContain('fill:var(--icon-fill,none)');
    const tokens = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(new RegExp(`--cheer:\\s*${TOKENS.cheer.toLowerCase()};`));
    expect(tokens).toMatch(new RegExp(`--step-line:\\s*${TOKENS['step-line'].toLowerCase()};`));
  });
});

describe('Phase 2e art: the drawings (spec Appendix C)', () => {
  it('medals: three discs on a ribbon, each with its paw emboss; the number is the UI\'s (no text), centred on the face', () => {
    const m = ladderArtSymbols();
    MEDAL_COLORS.forEach((c, i) => {
      const s = symbolOf(m, `medal-${i + 1}`);
      expect(s).toContain(`fill="${c.face}"`);
      expect(s).toContain(`fill="${c.rim}"`);
      expect(s).toContain(`<g fill="${c.emboss}"`); // the paw
      expect(s).toContain(`fill="${c.ribbon}"`);
      // the face's centre is MEDAL_FACE (fractions of the 32 box)
      const face = new RegExp(`<circle cx="([\\d.]+)" cy="([\\d.]+)" r="([\\d.]+)" fill="${c.face}"/>`).exec(s);
      expect(Number(face?.[1]) / 32).toBeCloseTo(MEDAL_FACE.x, 2);
      expect(Number(face?.[2]) / 32).toBeCloseTo(MEDAL_FACE.y, 2);
      expect(Number(face?.[3]) / 32).toBeCloseTo(MEDAL_FACE.r, 2);
    });
    expect(MEDAL_NUMBER_INK).toBe(TOKENS['ink-deep']);
    // places differ by more than colour: gold, silver and bronze faces are all different, and the UI adds the number
    expect(new Set(MEDAL_COLORS.map((c) => c.face)).size).toBe(3);
  });

  it('avatars: avatar-0 … avatar-{AVATAR_COUNT − 1}, one coat each, the same head and the same eyes', () => {
    expect(ART_AVATAR_COUNT).toBe(AVATAR_COUNT);
    expect(AVATAR_COATS).toHaveLength(AVATAR_COUNT);
    expect(AVATAR_COATS.map((c) => c.name)).toEqual([
      'ginger', 'grey tabby', 'black', 'white', 'calico', 'tuxedo', 'cream', 'siamese points', 'brown tabby', 'blue-grey', 'tortoiseshell', 'white with grey patches',
    ]);
    const m = ladderArtSymbols();
    const eyes = new Set<string>();
    for (let i = 0; i < AVATAR_COUNT; i++) {
      const s = symbolOf(m, `avatar-${i}`);
      expect(s, `avatar-${i}`).toContain(`fill="${AVATAR_COATS[i]?.coat}"`);
      // UI batch (profile): the disc is overridable, so a chosen background shows under the head
      expect(s).toContain(`<circle cx="50" cy="52" r="47" style="fill:var(--avatar-bg,${avatarDisc(AVATAR_COATS[i] as (typeof AVATAR_COATS)[number])})"/>`);
      eyes.add((s.match(/<ellipse cx="(33|67)"[^>]*>/g) ?? []).join(''));
    }
    expect(eyes.size).toBe(1); // "the same eyes"
    expect(new Set(Array.from({ length: AVATAR_COUNT }, (_, i) => symbolOf(m, `avatar-${i}`))).size).toBe(AVATAR_COUNT);
  });

  it('avatars stay distinct at 24–32 px: every two differ by ΔE00 ≥ 10 in their fur or their disc, and each disc is its own palette colour', () => {
    expect(new Set(AVATAR_COATS.map((c) => c.disc)).size).toBe(AVATAR_COUNT);
    expect(AVATAR_DISC_MIX).toBeGreaterThan(0.4);
    for (let a = 0; a < AVATAR_COATS.length; a++) {
      for (let b = a + 1; b < AVATAR_COATS.length; b++) {
        const A = AVATAR_COATS[a] as (typeof AVATAR_COATS)[number];
        const B = AVATAR_COATS[b] as (typeof AVATAR_COATS)[number];
        const fur = deltaE2000(hexToLab(A.coat), hexToLab(B.coat));
        const disc = deltaE2000(hexToLab(avatarDisc(A)), hexToLab(avatarDisc(B)));
        expect(Math.max(fur, disc), `${A.name} / ${B.name}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('avatarSymbol maps an id to its avatar and never to one we did not draw', () => {
    expect(avatarSymbol(0)).toBe('avatar-0');
    expect(avatarSymbol(11)).toBe('avatar-11');
    for (const bad of [-1, 12, 1.5, Number.NaN, 999]) expect(avatarSymbol(bad)).toBe('avatar-0');
  });

  it('hearts: one rounded shape, a line and a fill of the same size; the fill is --cheer, never the fish', () => {
    const m = ladderArtSymbols();
    const line = symbolOf(m, 'icon-heart-line');
    const fill = symbolOf(m, 'icon-heart-fill');
    const d = (s: string): string | undefined => /<path d="([^"]+)"/.exec(s)?.[1];
    expect(d(line)).toBe(d(fill));
    expect(line).toContain('stroke="currentColor"');
    expect(line).toContain('stroke-width="2"');
    expect(fill).toContain('stroke-width="2"'); // the same outer size: no jump when pressed
    expect(fill).toContain('stroke-linejoin="round"');
    expect(fill).not.toContain(TOKENS.fish);
    // the colour-pattern glyph 9 is another drawing
    expect(spriteMarkup()).not.toContain(d(line) as string);
  });

  it('the like motion: a swell that settles back to scale 1', () => {
    expect(HEART_POP[0]).toEqual({ transform: 'scale(1)' });
    expect(HEART_POP[HEART_POP.length - 1]).toEqual({ transform: 'scale(1)' });
    expect(HEART_POP_MS).toBeGreaterThanOrEqual(200);
    expect(HEART_POP_MS).toBeLessThanOrEqual(400);
  });

  it('streak steps: the paw as outline, fill and fill with a check; the chest step opens through --chest-open / --chest-shut', () => {
    const m = streakArtSymbols();
    const paw = (s: string): number => (s.match(/<ellipse cx="(5\.6|9\.4|14\.6|18\.4)"/g) ?? []).length;
    for (const id of ['streak-step-empty', 'streak-step-done', 'streak-step-today']) expect(paw(symbolOf(m, id)), id).toBe(4);
    expect(symbolOf(m, 'streak-step-empty')).toContain('fill:var(--step-wash,#fff)');
    expect(symbolOf(m, 'streak-step-done')).toContain(`fill="${TOKENS.accent}" stroke="${TOKENS['accent-deep']}"`);
    const today = symbolOf(m, 'streak-step-today');
    expect(today).toContain('stroke="#fff"'); // the soft check
    expect(today).toContain(`<circle cx="12" cy="13" r="11" fill="${TOKENS.gold}" opacity=".4"/>`);
    const chest = symbolOf(m, 'streak-step-chest');
    expect(chest).toContain('style="opacity:var(--chest-open,0)"');
    expect(chest).toContain('style="opacity:var(--chest-shut,1)"');
    // our own fish-shaped lock on the chest (a small gold fish with its eye as the keyhole)
    expect(chest).toContain(`stroke="${TOKENS['gold-deep']}"`);
  });

  it('the reward chests: wood, two gold straps, the fish lock; the open one adds the glow and the light', () => {
    const m = ladderArtSymbols();
    const closed = symbolOf(m, 'reward-chest');
    const open = symbolOf(m, 'reward-chest-open');
    for (const s of [closed, open]) {
      expect(s).toContain(`fill="${CHEST_COLORS.wood}"`);
      expect(s).toContain(`<ellipse cx="23.2"`); // the fish lock's body
    }
    expect(closed).not.toContain('chest-glow');
    expect(open).toContain('url(#chest-glow)');
    expect(open).toContain(`fill="${CHEST_COLORS.inside}"`);
  });

  it('the name tag: a collar, a round tag with a paw and a bell; no bone', () => {
    const s = symbolOf(ladderArtSymbols(), 'nick-tag');
    expect(s).toContain(`fill="${TAG_COLORS.collar}"`);
    expect(s).toContain('stroke-dasharray'); // the stitching
    expect((s.match(/<circle /g) ?? []).length).toBeGreaterThanOrEqual(5); // ring, tag rim, tag face, bell loop, bell
    expect(s).toContain(`<g fill="${TOKENS['gold-deep']}"`); // the engraved paw
  });

  it('pencil and info are line icons in the icon set\'s 2-unit stroke (the shuffle glyph went with the word pickers)', () => {
    const m = ladderArtSymbols();
    expect(m).not.toContain('id="icon-shuffle"');
    for (const id of ['icon-pencil', 'icon-info']) {
      const s = symbolOf(m, id);
      expect(s, id).toContain('stroke="currentColor" stroke-width="2"');
      expect(s, id).toContain('stroke-linecap="round"');
    }
  });
});
