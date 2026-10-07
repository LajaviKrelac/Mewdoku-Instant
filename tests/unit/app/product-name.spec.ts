// Owner: app. The product name has ONE source of truth, the i18n key 'app.name' (LEGAL-1): the
// working title "Mewdoku" is a code name (06 §6.1), so a rename before Phase 4 must be a one-line
// change in src/i18n/en.ts plus the <title> this test keeps in sync. Also: index.html links our own
// favicon (RP-7), so the web build never requests a missing /favicon.ico.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en';
import { t } from '../../../src/i18n';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const NAME = en['app.name'];

/** Keys that spell the name out instead of taking {name}: none (the old 'about.made' was removed). */
const LEGACY: string[] = [];

describe('product name: one source of truth (LEGAL-1)', () => {
  it("index.html's <title> is the i18n 'app.name'", () => {
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(NAME);
  });

  it('index.html names the product nowhere else (description, meta)', () => {
    expect(html.replace(/<title>[^<]*<\/title>/, '').toLowerCase()).not.toContain(NAME.toLowerCase());
  });

  it("no other string hard-codes the name: they take it from 'app.name' through {name}", () => {
    const spelled = Object.entries(en)
      .filter(([key, value]) => key !== 'app.name' && value.toLowerCase().includes(NAME.toLowerCase()))
      .map(([key]) => key);
    expect(spelled).toEqual(LEGACY);
    expect(t('about.madeBy', { name: t('app.name') })).toContain(NAME);
    expect(en['about.madeBy']).toContain('{name}');
  });

  it('the shipped licence notices say "This game", never the name', () => {
    const dir = resolve(ROOT, 'src/ui/overlays/licences');
    const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(resolve(dir, file), 'utf8');
      expect(text.toLowerCase(), file).not.toContain(NAME.toLowerCase());
      expect(text, file).toMatch(/^This game /);
    }
  });
});

describe('favicon (RP-7)', () => {
  it('index.html links our own SVG icon, which exists in public/', () => {
    const href = /<link rel="icon"[^>]*href="\/?([^"]+)"/.exec(html)?.[1];
    expect(href).toBe('favicon.svg');
    const svg = readFileSync(resolve(ROOT, 'public', href as string), 'utf8');
    expect(existsSync(resolve(ROOT, 'public', href as string))).toBe(true);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.length).toBeLessThan(1000); // tiny, self-contained, no external references
    expect(svg).not.toMatch(/href=|url\(|<image|<script/);
  });
});
