// Owner: G3 (Phase 2e)
// The ranking-name word lists (spec §1.8, D-2e-16; CONTRACTS §2.3). Our own words: plain, everyday,
// friendly English, cat-themed (coats, cosy food, garden things, cat habits), each 3–10 letters, chosen for
// this game (never taken from the original or another app). A name is `${adj[i]} ${noun[j]} ${num}` with
// NICK_NUM_MIN ≤ num ≤ NICK_NUM_MAX (src/shared/rank-api.ts); names are the same text in every locale and
// are never translated (docs/i18n/glossary.md).
//
// APPEND-ONLY: every player stores the indices and the rendered text, so a word is never reordered or
// removed. A retired word is replaced IN PLACE by a fallback word and its index listed in RETIRED_V1 (the
// server never picks a retired index for a new name; existing names keep their stored text).
// Moderation: no word is slang, an insult, a body word or a word with a second meaning we would not want
// on a stranger's screen, and the server's build test checks every adjective × noun pair against its
// blocklist skeletons (server/src/moderation/blocklist.ts, G4; run `npm --prefix server test -- nick`
// before landing a change here). The lead reviews every addition.
// The first entries are the CONTRACTS §2.3 starter words in their order (the contract fixtures use them:
// adj 2 "Velvet" + noun 5 "Pounce" = "Velvet Pounce 27").
// Leaf module: imports nothing; compiled into the client's lazy `ladder` chunk and into the Worker.

export interface NickWords {
  readonly adj: readonly string[];
  readonly noun: readonly string[];
}

export const NICK_WORDS_V1: NickWords = {
  adj: [
    // 0–27: the CONTRACTS §2.3 starter words, in order
    'Sleepy', 'Fluffy', 'Velvet', 'Misty', 'Brave', 'Cozy', 'Curious', 'Gentle',
    'Lucky', 'Sunny', 'Quiet', 'Nimble', 'Dreamy', 'Cheerful', 'Clever', 'Merry',
    'Snowy', 'Golden', 'Silver', 'Breezy', 'Mellow', 'Plucky', 'Toasty', 'Dapper',
    'Jolly', 'Bouncy', 'Starry', 'Maple',
    // 28–63
    'Happy', 'Calm', 'Kind', 'Bright', 'Swift', 'Tiny', 'Rosy', 'Peachy',
    'Witty', 'Bold', 'Frosty', 'Amber', 'Honey', 'Mossy', 'Silky', 'Snug',
    'Spry', 'Tidy', 'Zippy', 'Lively', 'Sparkly', 'Speedy', 'Wise', 'Patient',
    'Friendly', 'Playful', 'Sweet', 'Hazel', 'Cloudy', 'Polite', 'Humble', 'Chipper',
    'Twinkly', 'Sunlit', 'Dainty', 'Brisk',
  ],
  noun: [
    // 0–23: the CONTRACTS §2.3 starter words, in order
    'Whisker', 'Paws', 'Mittens', 'Tabby', 'Biscuit', 'Pounce', 'Purr', 'Muffin',
    'Pebble', 'Socks', 'Noodle', 'Button', 'Marble', 'Pudding', 'Clover', 'Ginger',
    'Shadow', 'Pepper', 'Bean', 'Toffee', 'Waffle', 'Comet', 'Nugget', 'Tuft',
    // 24–63
    'Kitten', 'Mouser', 'Tiger', 'Pumpkin', 'Cookie', 'Cupcake', 'Pancake', 'Mochi',
    'Dumpling', 'Sprout', 'Acorn', 'Willow', 'Juniper', 'Poppy', 'Daisy', 'Tulip',
    'Bramble', 'Thistle', 'Fern', 'Meadow', 'Cloud', 'Snowball', 'Pippin', 'Cinnamon',
    'Nutmeg', 'Caramel', 'Truffle', 'Sesame', 'Pretzel', 'Crumpet', 'Scone', 'Yarn',
    'Bell', 'Napper', 'Furball', 'Fluff', 'Catnip', 'Patch', 'Smudge', 'Whisper',
  ],
};

/** Indices retired from new picks (their slots hold a fallback word). None yet. */
export const RETIRED_V1: { readonly adj: readonly number[]; readonly noun: readonly number[] } = { adj: [], noun: [] };
