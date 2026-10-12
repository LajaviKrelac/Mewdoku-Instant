// Owner: G3 (Phase 2e)
// The Phase 2e copy (spec Appendix A, §0.4 honesty, §7.6, §10.6 #4) and the ranking-name word lists
// (spec §1.8, CONTRACTS §2.3): every key in its own file and in every catalogue; the counts come from the
// server's rules and dayStreak.cycleDays (no literal "top 3" or "7 days"); no invented statistic, no promise
// that queued fish will count, no urgency; "ranking" never "leaderboard"; a heart is a cheer, never a life;
// every purchase button starts with the language's word for "Buy"; the width limits are noted for
// translators; the word lists are ours, plain, unique and append-only from the CONTRACTS starters.
import { describe, expect, it } from 'vitest';
import { cfg, type LocaleId } from '../../../src/app/config';
import { en, EN_PARTS } from '../../../src/i18n/en';
import { displayWidth, META, sampleText } from '../../../src/i18n/meta';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../../src/shared/nick-words';
import { checkCatalog, loadCatalogs } from '../../../scripts/i18n-check';

// Phase 2e I-4: the 2e keys that only lazy chunks show moved verbatim to en/lazy.ts (enLazyUi2e); both parts are G3's 2e copy.
const E2 = { ...EN_PARTS.enUi2e, ...EN_PARTS.enLazyUi2e } as Readonly<Record<string, string>>;
const KEYS = Object.keys(E2);
const CATALOGS = await loadCatalogs();

describe('Phase 2e English (Appendix A, ours)', () => {
  it('the keys live in en/ui-2e.ts (first load) and en/lazy.ts (enLazyUi2e) and read as specified', () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(105); // 110 until the audit fix round removed four unused keys
    expect(E2['ladder.alone']).toBe("You're the only player in this ranking."); // audit B14: no "so far"
    expect(E2['ladder.offline']).toBe("You're offline. We'll try to send your fish when you're back online.");
    expect(E2['rewarded.buy.label']).toBe('Buy {items} · {price}');
    expect(E2['rewarded.buy.noAds.note']).toBe('Removes banners and full-screen ads. Videos for helpers stay.');
    expect(E2['streak.new']).toBe('A new streak starts today.');
    // Appendix A's victory.streak ships as victory.streakDay (the 2c.1 retired key stays gone).
    expect('victory.streak' in en).toBe(false);
    expect(E2['victory.streakDay']).toBe('Streak: day {day} of {total}');
    for (const k of KEYS) expect(en[k as keyof typeof en], k).toBe(E2[k]);
  });

  it('counts come from the server rules and the cycle, never a literal (C-5, §10.6 #4)', () => {
    for (const k of KEYS) {
      const v = E2[k] as string;
      expect(v, k).not.toMatch(/\btop 3\b|\b7 days\b|\bweekly\b|\b50 players\b|\b24 h(ours)?\b(?!.*first win)/i);
    }
    expect(E2['ladder.rewards.line.other']).toContain('{count}');
    expect(E2['howto.streak']).toContain('{days}');
    // The one rule that is a fixed fact of the game (fish kept per win, 1–3) may say "up to 3".
    expect(E2['ladder.info.fish']).toContain('up to 3');
  });

  it('honesty: no invented statistic, no promise that queued fish count, no urgency (H-2, H-4, §5.1)', () => {
    const all = KEYS.map((k) => `${k}: ${E2[k]}`).join('\n');
    // Leaderboard update: "Online now" only as one row's status (the server's seenAt for that one player).
    expect(KEYS.filter((k) => k !== 'ladder.status.online').map((k) => `${k}: ${E2[k]}`).join('\n')).not.toMatch(/online now|players online|% of|most players|everyone is|join thousands/i);
    expect(all).not.toMatch(/will be (sent|counted)|will count|guaranteed/i);
    expect(all).not.toMatch(/hurry|don't lose|lose your streak|last chance|before it'?s too late/i);
    // Player counts appear only where the server's number or rule goes in.
    const counted = KEYS.filter((k) => /\{count\} players?\b/.test(E2[k] as string));
    expect(counted.sort()).toEqual(['ladder.info.window.rolling', 'ladder.info.window.rollingJoin', 'ladder.info.window.utcDay', 'ladder.players.other', 'ladder.players.one', 'ladder.rewards.min'].sort());
  });

  it('"ranking" never "leaderboard"; a heart is a cheer, never a life (glossary)', () => {
    for (const k of KEYS) expect(E2[k], k).not.toMatch(/leaderboard/i);
    for (const k of KEYS.filter((k) => /heart/i.test(E2[k] as string))) expect(E2[k], k).not.toMatch(/\blives?\b|\blife\b/i);
  });

  it('translators get the width limits of spec §7.6: the chip 12, the Buy labels 28, the strip text 36', () => {
    expect(META['ladder.join']?.maxLength).toBe(12);
    expect(META['rewarded.buy.label']?.maxLength).toBe(28);
    expect(META['rewarded.buy.noAds.label']?.maxLength).toBe(28);
    for (const k of ['streak.start', 'streak.new', 'streak.next', 'streak.today', 'streak.rewardDone'] as const) expect(META[k]?.maxLength, k).toBe(36);
    // English fits them, with a long store price.
    expect(displayWidth(sampleText(en['rewarded.buy.label']))).toBeLessThanOrEqual(28);
    expect(displayWidth(sampleText(en['rewarded.buy.noAds.label']))).toBeLessThanOrEqual(28);
  });
});

/** The word each locale's purchase buttons start with (C-3: money is spent, the button says so). */
const BUY: Readonly<Record<string, RegExp>> = {
  de: /^Kaufen/, es: /^Comprar/, fr: /^Acheter/, it: /^Compra/, 'pt-BR': /^Comprar/, id: /^Beli/, tr: /^Satın al/, pl: /^Kup/, ru: /^Купить/,
  vi: /^Mua/, th: /^ซื้อ/, ja: /^購入/, ko: /^구매/, 'zh-Hans': /^购买/, hi: /^खरीदें/, ar: /^اشترِ/,
};

describe.each([...Object.entries(CATALOGS)].sort((a, b) => a[0].localeCompare(b[0])))('Phase 2e drafts: %s', (id, catalog) => {
  const cat = catalog as Readonly<Record<string, string | undefined>>;
  it('has the 2e keys (AI draft, unreviewed) and passes the catalogue check', () => {
    for (const k of KEYS) {
      if (k.endsWith('.one') && cat[k] === undefined && cat[`${k.slice(0, -4)}.other`] !== undefined) continue;
      expect(cat[k], `${id} ${k}`).toBeTruthy();
    }
    expect(checkCatalog(id, cat).errors).toEqual([]);
  });

  it('every purchase button starts with its word for "Buy" and keeps the price exactly as given', () => {
    const re = BUY[id] as RegExp;
    for (const k of ['rewarded.buy.label', 'rewarded.buy.noAds.label'] as const) {
      expect(cat[k], `${id} ${k}`).toMatch(re);
      expect(cat[k], `${id} ${k}`).toContain('{price}');
    }
  });

  it('the chip\'s "Join" fits 12', () => {
    expect(displayWidth(cat['ladder.join'] ?? '')).toBeLessThanOrEqual(12);
  });
});

describe('ranking-name word lists (spec §1.8, CONTRACTS §2.3)', () => {
  const STARTER_ADJ = ['Sleepy', 'Fluffy', 'Velvet', 'Misty', 'Brave', 'Cozy', 'Curious', 'Gentle', 'Lucky', 'Sunny', 'Quiet', 'Nimble', 'Dreamy', 'Cheerful', 'Clever', 'Merry', 'Snowy', 'Golden', 'Silver', 'Breezy', 'Mellow', 'Plucky', 'Toasty', 'Dapper', 'Jolly', 'Bouncy', 'Starry', 'Maple'];
  const STARTER_NOUN = ['Whisker', 'Paws', 'Mittens', 'Tabby', 'Biscuit', 'Pounce', 'Purr', 'Muffin', 'Pebble', 'Socks', 'Noodle', 'Button', 'Marble', 'Pudding', 'Clover', 'Ginger', 'Shadow', 'Pepper', 'Bean', 'Toffee', 'Waffle', 'Comet', 'Nugget', 'Tuft'];

  it('≈ 64 + 64 plain words, 3–10 letters, capitalised, unique, the starters first and in order', () => {
    expect(NICK_WORDS_V1.adj).toHaveLength(64);
    expect(NICK_WORDS_V1.noun).toHaveLength(64);
    expect(NICK_WORDS_V1.adj.slice(0, STARTER_ADJ.length)).toEqual(STARTER_ADJ);
    expect(NICK_WORDS_V1.noun.slice(0, STARTER_NOUN.length)).toEqual(STARTER_NOUN);
    const all = [...NICK_WORDS_V1.adj, ...NICK_WORDS_V1.noun];
    for (const w of all) expect(w, w).toMatch(/^[A-Z][a-z]{2,9}$/);
    expect(new Set(all.map((w) => w.toLowerCase())).size).toBe(all.length);
    expect(RETIRED_V1).toEqual({ adj: [], noun: [] });
    // The contract fixtures' names come out of the lists by index.
    expect(`${NICK_WORDS_V1.adj[2]} ${NICK_WORDS_V1.noun[5]} 27`).toBe('Velvet Pounce 27');
    expect(`${NICK_WORDS_V1.adj[0]} ${NICK_WORDS_V1.noun[0]} 27`).toBe('Sleepy Whisker 27');
  });

  it('no pair spells a rude or hurtful fragment (a first screen; the server\'s blocklist test is the gate)', () => {
    const BAD = ['ass', 'sex', 'fuck', 'shit', 'cum', 'tit', 'dick', 'cock', 'fag', 'nazi', 'porn', 'nude', 'kill', 'dead', 'hate', 'slut', 'whore', 'rape', 'piss', 'crap', 'damn', 'bitch', 'nig', 'retard', 'drug', 'weed', 'gun'];
    const hits: string[] = [];
    for (const a of NICK_WORDS_V1.adj) {
      for (const n of NICK_WORDS_V1.noun) {
        const s = `${a}${n}`.toLowerCase();
        for (const b of BAD) if (s.includes(b)) hits.push(`${a} ${n} (${b})`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('a name fits the 40-character save limit and the ranking row', () => {
    const longest = Math.max(...NICK_WORDS_V1.adj.map((w) => w.length)) + 1 + Math.max(...NICK_WORDS_V1.noun.map((w) => w.length)) + 3;
    expect(longest).toBeLessThanOrEqual(24);
    expect(cfg.ladder.panelRows).toBe(0);
  });
});

// Phase 2e I-4 (lead, spec §10.6 #4): the same honesty rules as a scripts/ check (`npm run i18n:check` fails on them).
describe('i18n-check honestyProblems (spec §10.6 #4)', () => {
  it('passes the shipped English and fails each kind of dishonest copy', async () => {
    const { honestyProblems, PLAYER_COUNT_KEYS } = await import('../../../scripts/i18n-check');
    expect(honestyProblems(en)).toEqual([]);
    for (const k of PLAYER_COUNT_KEYS) expect(k in en, k).toBe(true);
    const bad: Record<string, string> = {
      'ladder.alone': '1,204 players online now',
      'ladder.info.fish': 'You and 40 players are racing',
      'streak.text': 'Win {count} players over',
      'ladder.rewards.line.other': 'The top 3 win hints',
      'howto.streak': 'Play 7 days in a row',
      'streak.next': "Hurry, don't lose your streak!",
      'ladder.offline': 'Your fish will count later',
    };
    const problems = honestyProblems(bad);
    for (const k of Object.keys(bad)) expect(problems.some((p) => p.includes(` ${k} `)), k).toBe(true);
  });

  it('[audit A-H2] urgency and promises in any key (the rewarded video, the shop), and urgency words in the locale drafts', async () => {
    const { honestyProblems, localeHonestyProblems, URGENCY_WORDS } = await import('../../../scripts/i18n-check');
    const bad: Record<string, string> = {
      'rewarded.body.hint': 'Hurry: watch a video before it is gone',
      'shop.product.hints_15.desc': 'Last chance: 15 hints',
      'rewarded.buy.noAds.note': 'Your next reward will count twice',
    };
    const problems = honestyProblems(bad);
    for (const k of Object.keys(bad)) expect(problems.some((p) => p.includes(` ${k} `)), k).toBe(true);
    // every draft catalogue has a word list, and the shipped drafts pass it
    for (const id of cfg.i18n.locales) if (id !== 'en') expect(URGENCY_WORDS[id]?.length ?? 0, id).toBeGreaterThan(0);
    const drafts = await loadCatalogs();
    for (const [id, cat] of Object.entries(drafts)) expect(localeHonestyProblems(id as LocaleId, cat as Record<string, string>), id).toEqual([]);
    expect(localeHonestyProblems('de', { 'rewarded.body.hint': 'Beeil dich: nur heute!' })).toHaveLength(1);
    expect(localeHonestyProblems('fr', { 'streak.next': 'Dernière chance pour ta série' })).toHaveLength(1);
    expect(localeHonestyProblems('ar', { 'rank.title.daily': 'الأسرع اليوم' })).toEqual([]); // "the fastest", not "hurry"
  });
});
