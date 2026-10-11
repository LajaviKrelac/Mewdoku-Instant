// Owner: G4 (Phase 2e). The shape test of the nickname word lists (spec §1.8, CONTRACTS §2.3; G3 writes
// the words, G4 the shape). The blocklist test over every adjective × noun pair is the server's
// (`npm --prefix server test -- nick`, server/test/unit/nick.spec.ts).
import { describe, expect, it } from 'vitest';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../../src/shared/nick-words';
import { NICK_NUM_MAX, NICKNAME_MAX_LENGTH } from '../../../src/shared/rank-api';

/** CONTRACTS §2.3 starter words, in their order: append-only, so these indices never move. */
const STARTER_ADJ = ['Sleepy', 'Fluffy', 'Velvet', 'Misty', 'Brave', 'Cozy', 'Curious', 'Gentle', 'Lucky', 'Sunny', 'Quiet', 'Nimble', 'Dreamy', 'Cheerful', 'Clever', 'Merry', 'Snowy', 'Golden', 'Silver', 'Breezy', 'Mellow', 'Plucky', 'Toasty', 'Dapper', 'Jolly', 'Bouncy', 'Starry', 'Maple'];
const STARTER_NOUN = ['Whisker', 'Paws', 'Mittens', 'Tabby', 'Biscuit', 'Pounce', 'Purr', 'Muffin', 'Pebble', 'Socks', 'Noodle', 'Button', 'Marble', 'Pudding', 'Clover', 'Ginger', 'Shadow', 'Pepper', 'Bean', 'Toffee', 'Waffle', 'Comet', 'Nugget', 'Tuft'];

describe('nick-words: shape', () => {
  for (const [kind, list, starter] of [
    ['adj', NICK_WORDS_V1.adj, STARTER_ADJ],
    ['noun', NICK_WORDS_V1.noun, STARTER_NOUN],
  ] as const) {
    it(`${kind}: capitalised ASCII words of 3–10 letters, unique, the starter words first`, () => {
      expect(list.length).toBeGreaterThanOrEqual(starter.length);
      expect(list.length).toBeLessThanOrEqual(256);
      for (const w of list) expect(w, w).toMatch(/^[A-Z][a-z]{2,9}$/);
      expect(new Set(list.map((w) => w.toLowerCase())).size).toBe(list.length);
      expect(list.slice(0, starter.length)).toEqual(starter);
    });
  }

  it('the contract fixtures name "Velvet Pounce 27" (adj 2, noun 5)', () => {
    expect(`${NICK_WORDS_V1.adj[2]} ${NICK_WORDS_V1.noun[5]} 27`).toBe('Velvet Pounce 27');
  });

  it('retired indices exist and leave words to pick', () => {
    for (const i of RETIRED_V1.adj) expect(i >= 0 && i < NICK_WORDS_V1.adj.length).toBe(true);
    for (const i of RETIRED_V1.noun) expect(i >= 0 && i < NICK_WORDS_V1.noun.length).toBe(true);
    expect(NICK_WORDS_V1.adj.length - RETIRED_V1.adj.length).toBeGreaterThan(8);
    expect(NICK_WORDS_V1.noun.length - RETIRED_V1.noun.length).toBeGreaterThan(8);
  });

  it('the longest name fits the wire and save bounds', () => {
    const longest = (xs: readonly string[]): number => Math.max(...xs.map((w) => w.length));
    expect(longest(NICK_WORDS_V1.adj) + 1 + longest(NICK_WORDS_V1.noun) + 1 + String(NICK_NUM_MAX).length).toBeLessThanOrEqual(NICKNAME_MAX_LENGTH);
  });
});
