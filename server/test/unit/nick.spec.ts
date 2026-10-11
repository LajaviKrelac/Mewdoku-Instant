// Owner: G4 (Phase 2e). Names (spec §1.8): the blocklist build test over EVERY adjective × noun pair of
// src/shared/nick-words.ts (G3 runs `npm --prefix server test -- nick` before landing a list change),
// skeletons, generated names, word picks, the free-text rules.
import { describe, expect, it } from 'vitest';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../src/contract/words';
import { AVATAR_COUNT, NICK_NUM_MAX, NICK_NUM_MIN } from '../../src/contract';
import { blockedTerm, isBlocked, skeleton } from '../../src/core/moderation';
import { checkFreeText, checkPick, generateNick, nextNickChange, renderNick } from '../../src/core/nickname';
import { BLOCKLIST } from '../../src/moderation/blocklist';

describe('nick: the blocklist build test', () => {
  it('no generated name (every adjective × noun pair, any number) spells a blocked term', () => {
    const hits: string[] = [];
    for (let a = 0; a < NICK_WORDS_V1.adj.length; a++) {
      for (let n = 0; n < NICK_WORDS_V1.noun.length; n++) {
        for (const num of [NICK_NUM_MIN, 7, 42, NICK_NUM_MAX]) {
          const name = renderNick(NICK_WORDS_V1, { adj: a, noun: n, num });
          const t = blockedTerm(name);
          if (t) hits.push(`${name} → ${t}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('every list word is clean on its own', () => {
    for (const w of [...NICK_WORDS_V1.adj, ...NICK_WORDS_V1.noun]) expect(isBlocked(w), w).toBe(false);
  });

  it('the blocklist is non-trivial and its entries are distinct skeletons', () => {
    expect(BLOCKLIST.strong.length).toBeGreaterThan(30);
    expect(BLOCKLIST.ambiguous.length).toBeGreaterThan(30);
    for (const t of BLOCKLIST.strong) expect(skeleton(t).length, t).toBeGreaterThanOrEqual(3);
  });
});

describe('nick: skeletons and the check', () => {
  it('normalises look-alikes', () => {
    expect(skeleton('Sh1t')).toBe('shit');
    expect(skeleton('$H!!T')).toBe('sht');
    expect(skeleton('Fuuuck')).toBe('fuck');
    expect(skeleton('P0rn 4 U')).toBe('pornau');
    expect(skeleton('Ｆｕｃｋ')).toBe('fuck'); // NFKC
  });
  it('strong terms match anywhere, ambiguous ones only as whole words', () => {
    expect(isBlocked('Mega Sh1tty Cat')).toBe(true);
    expect(isBlocked('xxfuckxx')).toBe(true);
    expect(isBlocked('Ass')).toBe(true);
    expect(isBlocked('Grass Cat')).toBe(false);
    expect(isBlocked('Classy Tabby 3')).toBe(false);
    expect(isBlocked('Button Mouser')).toBe(false); // "butt" only as a word
    expect(isBlocked('Cocky')).toBe(false);
  });
});

describe('nick: generation, picks, free text, cooldown', () => {
  it('generates a name and avatar from seed bytes, never a retired index', () => {
    const seed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const g = generateNick(seed, NICK_WORDS_V1, RETIRED_V1);
    expect(g.nick.adj).toBeLessThan(NICK_WORDS_V1.adj.length);
    expect(g.nick.num).toBeGreaterThanOrEqual(NICK_NUM_MIN);
    expect(g.nick.num).toBeLessThanOrEqual(NICK_NUM_MAX);
    expect(g.avatarId).toBeLessThan(AVATAR_COUNT);
    expect(generateNick(seed, NICK_WORDS_V1, RETIRED_V1)).toEqual(g);
    const retired = { adj: Array.from({ length: NICK_WORDS_V1.adj.length - 1 }, (_, i) => i), noun: [] };
    expect(generateNick(seed, NICK_WORDS_V1, retired).nick.adj).toBe(NICK_WORDS_V1.adj.length - 1);
  });

  it('checks a pick against the lists, retired words and the number range', () => {
    expect(checkPick({ adj: 2, noun: 5, num: 27 }, 1, NICK_WORDS_V1, RETIRED_V1)).toEqual({ ok: true, nick: { adj: 2, noun: 5, num: 27 } });
    expect(checkPick({ adj: 2, noun: 5 }, 9, NICK_WORDS_V1, RETIRED_V1)).toEqual({ ok: true, nick: { adj: 2, noun: 5, num: 9 } });
    expect(checkPick({ adj: 9999, noun: 5, num: 27 }, 1, NICK_WORDS_V1, RETIRED_V1)).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkPick({ adj: 2, noun: 5, num: 0 }, 1, NICK_WORDS_V1, RETIRED_V1)).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkPick({ adj: 2, noun: 5, num: 100 }, 1, NICK_WORDS_V1, RETIRED_V1)).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkPick({ adj: 2, noun: 5, num: 1 }, 1, NICK_WORDS_V1, { adj: [2], noun: [] })).toMatchObject({ ok: false, code: 'nickname_invalid' });
  });

  it('free text: NFKC, 3–16 characters, ≤ 4 digits, no URL or handle, not blocked', () => {
    expect(checkFreeText('  Kitty   Cat ')).toEqual({ ok: true, text: 'Kitty Cat' });
    expect(checkFreeText('Ko')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('A'.repeat(17))).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('Cat12345')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('www cats')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('cats.com')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('@cat')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('<b>cat</b>')).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('Sh1t Cat')).toMatchObject({ ok: false, code: 'nickname_blocked' });
    expect(checkFreeText('Gato Feliz')).toEqual({ ok: true, text: 'Gato Feliz' });
  });

  it('the first change is free, then once per cooldown', () => {
    expect(nextNickChange(null, 86_400_000, 5)).toBeNull();
    expect(nextNickChange(1000, 86_400_000, 2000)).toBe(86_401_000);
    expect(nextNickChange(1000, 86_400_000, 86_401_000)).toBeNull();
  });
});
