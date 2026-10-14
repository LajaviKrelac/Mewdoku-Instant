// Owner: G4 (Phase 2e). Names (spec §1.8): the blocklist build test over EVERY adjective × noun pair of
// src/shared/nick-words.ts (G3 runs `npm --prefix server test -- nick` before landing a list change),
// skeletons, generated names, word picks, the free-text rules.
import { describe, expect, it } from 'vitest';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../src/contract/words';
import { AVATAR_COUNT, NICK_NUM_MAX, NICK_NUM_MIN } from '../../src/contract';
import { nameWidth } from '../../src/contract';
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

  it('the blocklist is non-trivial; a strong entry is at least 3 wide (a wide character counts 2)', () => {
    expect(BLOCKLIST.strong.length).toBeGreaterThan(30);
    expect(BLOCKLIST.ambiguous.length).toBeGreaterThan(30);
    for (const t of BLOCKLIST.strong) expect(nameWidth(t), t).toBeGreaterThanOrEqual(3);
    for (const t of [...BLOCKLIST.strong, ...BLOCKLIST.ambiguous, ...BLOCKLIST.innocent]) expect(skeleton(t).length, t).toBeGreaterThan(0);
    // an innocent word really does contain a strong term (else it does nothing)
    for (const w of BLOCKLIST.innocent) expect(blockedTerm(w, { strong: BLOCKLIST.strong, ambiguous: [] }), w).not.toBeNull();
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

  // UI batch (profile): typed names are on, so these were measured against real names and real attacks.
  it('accents fold on Latin, Greek and Cyrillic letters; other scripts keep their vowel signs', () => {
    expect(skeleton('Fück')).toBe('fuck');
    expect(skeleton('Zoë François')).toBe('zoefrancois');
    expect(skeleton('राहुल')).toBe('राहुल');
    expect(skeleton('ณัฐพล')).toBe('ณัฐพล');
    expect(skeleton('がっこう')).toBe('がっこう');
    expect(skeleton('شَرْموطة')).toBe(skeleton('شرموطة')); // optional Arabic vowel signs and ta marbuta
    expect(skeleton('شـرموطة')).toBe(skeleton('شرموطة')); // a stretching tatweel
  });

  it('look-alike Cyrillic and Greek letters read as Latin; native terms still match', () => {
    expect(skeleton('fuсk', true)).toBe('fuck'); // a Cyrillic с
    expect(isBlocked('fuсk cat')).toBe(true);
    expect(isBlocked('ѕһіт')).toBe(true); // all Cyrillic look-alikes
    expect(isBlocked('ΚΙΚΕ')).toBe(true); // Greek capitals (read before lowercasing: Ν is an N, its ν a v)
    expect(isBlocked('ΝΑΖΙ')).toBe(true);
    expect(isBlocked('блять кот')).toBe(true);
    expect(isBlocked('Сука')).toBe(true);
    expect(isBlocked('хуй')).toBe(true);
  });

  it('the worst terms in our locales\' own scripts are caught', () => {
    for (const bad of ['ไอ้ควย', 'まんこ猫', '씨발고양이', '傻逼猫', 'चूतिया', 'शेर रंडी', 'قحبة', 'كس امك', 'địt mẹ', 'Hurensohn', 'hijo de puta'])
      expect(isBlocked(bad), bad).toBe(true);
  });

  it('measured false positives pass: names that contain a short term', () => {
    for (const name of ['Pornchai', 'Nazia', 'Nazir', 'Huy Tran', 'Ho Minh', 'Hoshita', 'Yoshitaka', 'Scunthorpe', 'Nigar', 'Atwater', 'Cassandra', 'Hancock', 'Titus', 'Cumhur', 'Dickens', 'Analía'])
      expect(isBlocked(name), name).toBe(false);
    // Review fix (F2): with the four short terms strong again, these common names are innocent words too.
    for (const name of ['Nazim', 'Yamashita', 'Kinoshita', 'Matsushita', 'Kshitij', 'Pornthip', 'Porntip', 'Pornpimol', 'Pornsak', 'Nigar Aliyeva', 'Nazia_99'])
      expect(isBlocked(name), name).toBe(false);
  });

  it('review fix (F2): the slur and obscenity compounds and spaced spellings are blocked (the four short terms are strong)', () => {
    const attacks = [
      'Niggaz', 'MyNigga', 'NiggaCat', 'Niggah', 'n i g g a', 'N.i.g.g.a', 'Shitcat', 'Catshit', 'S h i t', 'Nazicat', 'Nazism', 'N.a.z.i',
      'P o r n', 'Pornlover',
      // an innocent word never shelters a doubled spelling or a whole-word term split out of it
      'Niggar', 'NiggaRat', 'Ho Shit A', 'Nazi A', 'Porn Chai', 'Yama Shit A',
    ];
    for (const bad of attacks) {
      expect(isBlocked(bad), bad).toBe(true);
      expect(checkFreeText(bad), bad).toMatchObject({ ok: false, code: 'nickname_blocked' });
    }
  });

  it('review fix (F6): one Latin letter in a native Cyrillic term is caught (the terms are folded too)', () => {
    for (const bad of ['Xуй', 'xyй', 'пиздa', 'бляtь', 'Xуй кот']) {
      expect(isBlocked(bad), bad).toBe(true);
      expect(checkFreeText(bad), bad).toMatchObject({ ok: false, code: 'nickname_blocked' });
    }
  });

  it('review fix (F3): italic-only look-alikes are not folded (Рита is not "puta")', () => {
    expect(skeleton('Рита', true)).not.toBe('puta');
    for (const name of ['Рита', 'Кит', 'Сим', 'Вит', 'Дик', 'Гена', 'Дима']) {
      expect(isBlocked(name), name).toBe(false);
      expect(checkFreeText(name), name).toEqual({ ok: true, text: name });
    }
  });

  it('common names in our 17 languages pass', () => {
    const names = [
      'Алексей', 'Мария Кот', 'Сукачёв', 'Рита', 'Νίκος', 'Σοφία', 'Mehmet', 'Ayşe', 'François', 'José', 'Ngọc Anh', 'Nguyễn Huy',
      'Siti Nurhaliza', 'Priya', 'राहुल', 'चैतन्य', 'ณัฐพล', 'สมชาย', '李明', '王小红', 'ゆい', 'さくら', '민준', '서연', 'محمد', 'فاطمة',
      'Łukasz', 'Dvořák', 'Giulia', 'Lukas Müller',
    ];
    for (const name of names) expect(isBlocked(name), name).toBe(false);
  });

  it('a removed innocent word never joins its two sides into a term', () => {
    expect(isBlocked('fuscunthorpeck')).toBe(false);
    expect(isBlocked('Scunthorpe Fuck')).toBe(true);
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

  it('free text: NFKC, 3–16 wide, ≤ 4 digits, no URL or handle, not blocked', () => {
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

  it('free text (UI batch): combining marks on letters, 2-character CJK names, no mark noise', () => {
    for (const name of ['राहुल', 'ณัฐพล', '李明', 'ゆい', '민준', 'محمد', 'Nguyễn', 'Pornchai', 'Nazia', 'Hoshita'])
      expect(checkFreeText(name), name).toEqual({ ok: true, text: name });
    expect(checkFreeText('李')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // 2 wide: too short
    expect(checkFreeText('Ca\u0336\u0336\u0336\u0336t')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // 4 stacked marks
    expect(checkFreeText('Ca\u0336\u0336\u0336t')).toMatchObject({ ok: true }); // 3 are fine
    expect(checkFreeText('\u0301Cat')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // a mark without a letter
    expect(checkFreeText('1234')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // no letter
    expect(checkFreeText('Cat\u200dCat')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // a joiner
    expect(checkFreeText('блять кот')).toMatchObject({ ok: false, code: 'nickname_blocked' });
    expect(checkFreeText('fuсk cat')).toMatchObject({ ok: false, code: 'nickname_blocked' });
  });

  it('review fix (F4): short Hindi names pass (a spacing vowel sign takes room: it counts 1 wide)', () => {
    for (const name of ['राम', 'रवि', 'सीता', 'गीता', 'मीना', 'राधा', 'रीना', 'नीता', 'पूजा', 'राज', 'रिया', 'दिया', 'शिव', 'लता'])
      expect(checkFreeText(name), name).toEqual({ ok: true, text: name });
    expect(checkFreeText('रा')).toMatchObject({ ok: false, code: 'nickname_invalid' }); // र ा: 2 wide
  });

  it('review fix (F12): invisible Hangul fillers are refused (no blank or padded ranking name)', () => {
    for (const name of ['ㅤㅤㅤ', 'ᅟᅟ', 'aㅤㅤ', 'Catﾠ', 'CatᅠCat'])
      expect(checkFreeText(name), JSON.stringify(name)).toMatchObject({ ok: false, code: 'nickname_invalid' });
    expect(checkFreeText('민준')).toEqual({ ok: true, text: '민준' });
  });

  it('review fix (F13): a dot or "ww" in a name is not a link; real domains and handles still are', () => {
    for (const name of ['Dr.Cat', 'Mr.Tom', 'J.Lo', 'Mr.Comet', 'Awww', 'J.R. Mew', 'St. Purr'])
      expect(checkFreeText(name), name).toEqual({ ok: true, text: name });
    const links = ['cats.com', 'CATS.COM', 'Cats.Com', 'mew.io', 'kitty.gg', 'meow.xyz', 'cat.tv', 'www.cats', 'www cats'];
    for (const link of [...links, '@cat', 'cat@mail', 'http cat']) expect(checkFreeText(link), link).toMatchObject({ ok: false, code: 'nickname_invalid' });
  });

  it('the first change is free, then once per cooldown', () => {
    expect(nextNickChange(null, 86_400_000, 5)).toBeNull();
    expect(nextNickChange(1000, 86_400_000, 2000)).toBe(86_401_000);
    expect(nextNickChange(1000, 86_400_000, 86_401_000)).toBeNull();
  });
});
