// UI batch (2026-10-13): profile — the avatar frames and backgrounds (src/ui/art/looks-art.ts) and the shared picture
// (sprite.ts avatarBadge): one symbol per id past the plain look, drawn where they belong around the avatar's disc
// (a frame never covers the cat's face, a background fills the disc), and the badge's layering and id guards.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_COUNT, BACKGROUND_COUNT, FRAME_COUNT } from '../../../src/shared/rank-api';
import { looksArtSymbols } from '../../../src/ui/art/looks-art';
import { ART_LOOKS, avatarBadge } from '../../../src/ui/art/sprite';
import { createLadderSession } from '../../../src/ui/overlays/ladder-session';

afterEach(() => {
  document.body.innerHTML = '';
});

const symbolOf = (markup: string, id: string): string => new RegExp(`<symbol id="${id}" viewBox="0 0 100 100">[\\s\\S]*?</symbol>`).exec(markup)?.[0] ?? '';
const num = (s: string, attr: string): number => Number(new RegExp(`\\b${attr}="([-\\d.]+)"`).exec(s)?.[1] ?? Number.NaN);
/** Every <circle> of a symbol as centre distance from the disc's centre (50, 52), radius and stroke width. */
function circles(sym: string): { d: number; r: number; w: number; filled: boolean }[] {
  return (sym.match(/<circle [^>]*\/>/g) ?? []).map((c) => ({
    d: Math.hypot(num(c, 'cx') - 50, num(c, 'cy') - 52),
    r: num(c, 'r'),
    w: Number.isNaN(num(c, 'stroke-width')) ? 0 : num(c, 'stroke-width'),
    filled: !c.includes('fill="none"'),
  }));
}

describe('the looks art (frames and backgrounds)', () => {
  const m = looksArtSymbols();

  it('draws frame-1 … and bg-1 … for every id past the plain look; the counts match the wire', () => {
    expect(ART_LOOKS).toEqual({ avatars: AVATAR_COUNT, frames: FRAME_COUNT, backgrounds: BACKGROUND_COUNT });
    for (let i = 1; i < FRAME_COUNT; i++) expect(symbolOf(m, `frame-${i}`), `frame-${i}`).not.toBe('');
    for (let i = 1; i < BACKGROUND_COUNT; i++) expect(symbolOf(m, `bg-${i}`), `bg-${i}`).not.toBe('');
    expect(m).not.toContain('id="frame-0"');
    expect(m).not.toContain('id="bg-0"');
    const all = [...Array.from({ length: FRAME_COUNT - 1 }, (_, i) => symbolOf(m, `frame-${i + 1}`)), ...Array.from({ length: BACKGROUND_COUNT - 1 }, (_, i) => symbolOf(m, `bg-${i + 1}`))];
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(s).not.toMatch(/<text|<image|https?:|url\(|<script|on\w+=/);
  });

  it('a frame is a ring around the disc: nothing inside r 38 (the cat\'s face stays clear), nothing past the box', () => {
    for (let i = 1; i < FRAME_COUNT; i++) {
      const s = symbolOf(m, `frame-${i}`);
      for (const c of circles(s)) {
        // a centred unfilled circle is a ring (its band is r ± w/2); anything else covers d ± (r + w/2)
        const inner = !c.filled && c.d < 0.01 ? c.r - c.w / 2 : c.d - c.r - c.w / 2;
        expect(c.d + c.r + c.w / 2, `frame-${i} outer`).toBeLessThanOrEqual(48.6);
        expect(inner, `frame-${i} inner`).toBeGreaterThanOrEqual(38);
      }
      for (const e of s.match(/<ellipse [^>]*\/>/g) ?? []) {
        const d = Math.hypot(num(e, 'cx') - 50, num(e, 'cy') - 52);
        expect(d, `frame-${i} leaf`).toBeGreaterThanOrEqual(40);
        expect(d, `frame-${i} leaf`).toBeLessThanOrEqual(47);
      }
    }
  });

  it('a background fills the avatar\'s disc (centre 50,52, r 47) and draws nothing outside it', () => {
    for (let i = 1; i < BACKGROUND_COUNT; i++) {
      const s = symbolOf(m, `bg-${i}`);
      expect(s, `bg-${i}`).toMatch(/^<symbol[^>]*><circle cx="50" cy="52" r="47" fill="#[0-9a-fA-F]{6}"\/>/);
      for (const c of circles(s)) expect(c.d + c.r + c.w / 2, `bg-${i}`).toBeLessThanOrEqual(47.05);
    }
  });
});

describe('avatarBadge (sprite.ts): the picture with its background and frame', () => {
  const hrefs = (svg: SVGSVGElement): (string | null)[] => Array.from(svg.querySelectorAll('use')).map((u) => u.getAttribute('href'));

  it('the plain look is exactly the avatar (no background, no frame, the head full size)', () => {
    const svg = avatarBadge(4, 0, 0, { class: 'x' });
    expect(hrefs(svg)).toEqual(['#avatar-4']);
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg.getAttribute('class')).toBe('icon icon-avatar-4 avatar-badge x');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const head = svg.querySelector('use') as SVGUseElement;
    expect(head.hasAttribute('style')).toBe(false);
    expect(head.hasAttribute('transform')).toBe(false);
  });

  it('a background goes under (the coat disc off), a frame over (the head 86 % inside it)', () => {
    const svg = avatarBadge(7, 3, 5);
    expect(hrefs(svg)).toEqual(['#bg-5', '#avatar-7', '#frame-3']);
    const head = svg.querySelectorAll('use')[1] as SVGUseElement;
    expect(head.getAttribute('style')).toBe('--avatar-bg:none');
    expect(head.getAttribute('transform')).toBe('matrix(.86 0 0 .86 7 7.28)');
    expect(hrefs(avatarBadge(7, 0, 2))).toEqual(['#bg-2', '#avatar-7']);
    expect(hrefs(avatarBadge(7, 6, 0))).toEqual(['#avatar-7', '#frame-6']);
  });

  it('never points at a symbol we did not draw: unknown ids read as the plain look (a newer server\'s look, a bad value)', () => {
    expect(hrefs(avatarBadge(12, FRAME_COUNT, BACKGROUND_COUNT))).toEqual(['#avatar-0']);
    expect(hrefs(avatarBadge(-1, 1.5, -2))).toEqual(['#avatar-0']);
    expect(hrefs(avatarBadge(Number.NaN, 7, 7))).toEqual(['#bg-7', '#avatar-0', '#frame-7']);
  });

  it('a label makes it an image with that name', () => {
    const svg = avatarBadge(1, 1, 1, { label: 'Captain Purr' });
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Captain Purr');
  });
});

describe('the "New ranking" card shows my picture with its frame and background (UI batch)', () => {
  const hrefsOf = (el: Element | null): (string | null)[] => Array.from(el?.querySelectorAll('use') ?? []).map((u) => u.getAttribute('href'));

  it('draws them, and the plain look without them', () => {
    const card = createLadderSession();
    document.body.appendChild(card.el);
    const base = { endsAt: Date.now() + 3_600_000, now: () => Date.now(), avatarId: 9, reducedMotion: true, onClose: vi.fn() };
    card.open({ ...base, frameId: 7, backgroundId: 1 });
    expect(hrefsOf(card.el.querySelector('.ladder-session__me'))).toEqual(['#bg-1', '#avatar-9', '#frame-7']);
    card.update(base);
    expect(hrefsOf(card.el.querySelector('.ladder-session__me'))).toEqual(['#avatar-9']);
    card.destroy();
  });
});
