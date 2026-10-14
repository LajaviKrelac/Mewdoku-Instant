// UI batch (2026-10-13): profile — the shape of a typed ranking name (src/shared/nick-text.ts), the rule the server's
// checkFreeText and the profile sheet share: NFKC and white space, 3 … 16 wide (a wide character counts 2), letters
// with their combining marks, digits, space . _ -, ≤ 4 digits, no link or handle.
import { describe, expect, it } from 'vitest';
import { NAME_MAX_CHARS, NAME_MAX_DIGITS, NAME_MIN_WIDTH, nameProblem, nameWidth, normalizeName } from '../../../src/shared/nick-text';

describe('typed names: the shape rule', () => {
  it('normalises: NFKC, trimmed, inner white space as one space', () => {
    expect(normalizeName('  Captain \t  Purr ')).toBe('Captain Purr');
    expect(normalizeName('Ｃａｔ')).toBe('Cat');
    expect([NAME_MAX_CHARS, NAME_MIN_WIDTH, NAME_MAX_DIGITS]).toEqual([16, 3, 4]);
  });

  it('measures display width: wide characters 2, combining marks 0', () => {
    expect(nameWidth('Cat')).toBe(3);
    expect(nameWidth('李明')).toBe(4);
    expect(nameWidth('ゆい')).toBe(4);
    expect(nameWidth('민준')).toBe(4);
    expect(nameWidth('राहुल')).toBe(3); // र ा ह ु ल: the vowel signs are marks
  });

  it('accepts names in our 17 languages, 2-character CJK ones included', () => {
    for (const ok of ['Captain Purr', 'Gato Feliz', 'Zoë', 'Łukasz', 'Nguyễn Huy', 'Ayşe', 'Алексей', 'Νίκος', '李明', 'ゆい', '민준', 'राहुल', 'ณัฐพล', 'محمد', 'J.R. Mew', 'cat_99', 'Mew-Mew'])
      expect(nameProblem(normalizeName(ok)), ok).toBeNull();
  });

  it('names what is wrong', () => {
    const p = (raw: string): string | null => nameProblem(normalizeName(raw));
    expect(p('')).toBe('short');
    expect(p('Ko')).toBe('short');
    expect(p('李')).toBe('short');
    expect(p('A'.repeat(17))).toBe('long');
    expect(p('猫'.repeat(16))).toBeNull(); // 16 code points (32 wide) is the code-point limit, not a width limit
    expect(p('<b>cat</b>')).toBe('chars');
    expect(p('Cat!')).toBe('chars');
    expect(p('1234')).toBe('chars'); // at least one letter
    expect(p('Cat‍Cat')).toBe('chars'); // a joiner
    expect(p('́Cat')).toBe('chars'); // a mark without its letter
    expect(p('Ca̶̶̶̶t')).toBe('chars'); // stacked marks
    expect(p('Ca̶̶̶t')).toBeNull();
    expect(p('Cat12345')).toBe('digits');
    expect(p('Cat1234')).toBeNull();
    for (const link of ['www cats', 'cats.com', 'mew.io', '@cat', 'http cat']) expect(p(link), link).toBe('link');
  });
});
