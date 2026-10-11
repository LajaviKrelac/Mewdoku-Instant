// Owner: G1 (Phase 2e). Ranking names (docs/phase2e/spec.md §1.8, §10.1): nickText, id bounds, the
// fallback for an unknown id, the append-only guard (a snapshot of the first lists' indices never changes).
import { describe, expect, it } from 'vitest';
import { clampNickNum, isNickPick, nickText, shufflePick } from '../../../src/game/nickname';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../../src/shared/nick-words';
import { NICK_NUM_MAX, NICK_NUM_MIN } from '../../../src/shared/rank-api';

describe('nickText', () => {
  it('the contract example: adj 2 + noun 5 + 27 = "Velvet Pounce 27"', () => {
    expect(nickText({ adj: 2, noun: 5, num: 27 }, NICK_WORDS_V1)).toBe('Velvet Pounce 27');
  });

  it('an index this build does not know → "Cat {num}" (never an invented word)', () => {
    expect(nickText({ adj: 9999, noun: 5, num: 7 }, NICK_WORDS_V1)).toBe('Cat 7');
    expect(nickText({ adj: 1, noun: -1, num: 7 }, NICK_WORDS_V1)).toBe('Cat 7');
    expect(nickText({ adj: 1.5, noun: 1, num: 7 }, NICK_WORDS_V1)).toBe('Cat 7');
  });

  it('num is clamped to NICK_NUM_MIN … NICK_NUM_MAX', () => {
    expect(clampNickNum(0)).toBe(NICK_NUM_MIN);
    expect(clampNickNum(500)).toBe(NICK_NUM_MAX);
    expect(clampNickNum(Number.NaN)).toBe(NICK_NUM_MIN);
    expect(isNickPick({ adj: 0, noun: 0, num: 1 }, NICK_WORDS_V1)).toBe(true);
    expect(isNickPick({ adj: 0, noun: 0, num: 100 }, NICK_WORDS_V1)).toBe(false);
  });
});

describe('the append-only guard (spec §1.8)', () => {
  it('the CONTRACTS §2.3 starter words keep their indices', () => {
    const adj = ['Sleepy', 'Fluffy', 'Velvet', 'Misty', 'Brave', 'Cozy', 'Curious', 'Gentle', 'Lucky', 'Sunny', 'Quiet', 'Nimble', 'Dreamy', 'Cheerful', 'Clever', 'Merry', 'Snowy', 'Golden', 'Silver', 'Breezy', 'Mellow', 'Plucky', 'Toasty', 'Dapper', 'Jolly', 'Bouncy', 'Starry', 'Maple'];
    const noun = ['Whisker', 'Paws', 'Mittens', 'Tabby', 'Biscuit', 'Pounce', 'Purr', 'Muffin', 'Pebble', 'Socks', 'Noodle', 'Button', 'Marble', 'Pudding', 'Clover', 'Ginger', 'Shadow', 'Pepper', 'Bean', 'Toffee', 'Waffle', 'Comet', 'Nugget', 'Tuft'];
    adj.forEach((w, i) => {
      if (!RETIRED_V1.adj.includes(i)) expect(NICK_WORDS_V1.adj[i]).toBe(w);
    });
    noun.forEach((w, i) => {
      if (!RETIRED_V1.noun.includes(i)) expect(NICK_WORDS_V1.noun[i]).toBe(w);
    });
  });
});

describe('shufflePick', () => {
  it('a valid pick from the random source, skipping retired indices and the current name', () => {
    let x = 0;
    const rand = (): number => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
    const avoid = { adj: 0, noun: 0, num: 1 };
    for (let i = 0; i < 50; i++) {
      const p = shufflePick(NICK_WORDS_V1, rand, RETIRED_V1, avoid);
      expect(isNickPick(p, NICK_WORDS_V1)).toBe(true);
      expect(RETIRED_V1.adj.includes(p.adj)).toBe(false);
      expect(p).not.toEqual(avoid);
    }
    // A constant source still never repeats `avoid`.
    expect(shufflePick({ adj: ['A'], noun: ['B'] }, () => 0, { adj: [], noun: [] }, { adj: 0, noun: 0, num: 1 })).not.toEqual({ adj: 0, noun: 0, num: 1 });
  });
});
