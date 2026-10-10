// Owner: E (Phase 2b); G2 (Phase 2c: lives are fish, the period and streak keys, the fish currency went;
// Phase 2c.1: the level points per cat, the perfect-streak keys went); G3 (Phase 2d: the Score column,
// the mouse, the video badge's name, the level-start toast, the gear's dot; Phase 2d.1: the completion
// label, the level-start tickers)
// Translator notes per key (phase2b §6.7 step 1): a description, a max length where the layout needs
// one (chips ≤ 18 chars, buttons ≤ 22, titles ≤ 28) and placeholder notes. The AI-draft brief carries
// only our English, this file and docs/i18n/glossary.md (never the original game or its strings).
// Imported by tests and scripts only (never by the game bundle).
//
// Lengths are display widths measured on the template with sample values in the placeholders
// (displayWidth: CJK and other wide characters count 2, combining marks 0). Over-long strings are
// warnings (tests/unit/i18n/catalogs.spec.ts, `npm run i18n:check`), checked visually at 320 px by
// tests/e2e/i18n.spec.ts.
import type { LocaleId } from '../app/config';
import { en, type I18nKey } from './en';

export interface KeyMeta {
  readonly description: string;
  /** Soft limit, reported as a warning by the catalogue test. */
  readonly maxLength?: number;
  /** What each {placeholder} holds. */
  readonly placeholders?: Readonly<Record<string, string>>;
  /** false for keys that may equal English in every locale (app.name, boot.progress, numbers, endonyms). */
  readonly translatable?: boolean;
}

/** What each placeholder name holds, wherever it appears. */
export const PLACEHOLDER_NOTES: Readonly<Record<string, string>> = {
  level: 'a level number, e.g. 37',
  date: "a short date from the date formatter, e.g. 'Tue 6 Oct' (localized)",
  n: 'the board size, e.g. 9 (shown as 9×9)',
  size: "the board size text, e.g. '9×9'",
  status: "the daily card status line, e.g. 'Solved 4:12' or 'In progress'",
  time: "a clock ('4:12') or a duration ('7 h 48 min', '2 d 5 h', 'under a minute')",
  count: 'a number (already formatted for the locale)',
  placed: 'number of cats placed so far',
  hearts: 'fish (lives) left',
  max: 'fish at the start (3)',
  unit: "a row ('row 3'), a column ('column 5') or a colour name ('Violet'); may start the sentence",
  color: "a colour name such as 'Violet' (a proper name, used in apposition: 'the colour Violet')",
  line: "a row or a column, e.g. 'row 3' or 'column 5'",
  sources: "a list of rows, columns or colours, e.g. 'rows 2 and 4' or 'Violet and Denim'",
  targets: "a list of rows, columns or colours, e.g. 'columns 1 and 3'",
  targetKind: "the plural kind word of the targets: 'rows', 'columns' or 'colours'",
  index: 'a 1-based number (row, column or puzzle number)',
  list: "a list of numbers, e.g. '2, 4 and 5'",
  first: 'the first list item',
  last: 'the last list item',
  rest: 'all list items but the last, already joined with the separator',
  glyph: "a pattern glyph name, e.g. 'star'",
  version: 'the app version, e.g. 0.1.0',
  name: 'the app name (Mewdoku for now)',
  row: 'a 1-based row number',
  col: 'a 1-based column number',
  state: "the tile state word: 'empty', 'marked', 'cat', 'wrong' or 'given cat'",
  text: 'a whole hint sentence',
  pct: 'a percentage number, 0–100',
  weekday: "a short weekday name ('Tue')",
  day: 'a day of the month',
  month: "a short month name ('Oct')",
  h: 'hours',
  m: 'minutes',
  d: 'days',
  mistakes: 'number of mistakes',
  hints: 'number of hints used',
  total: "a total: fish kept this period (a number), puzzles in an event, or in rank.sub.period the whole 'This week: 42' text",
  reward: "an event reward phrase, e.g. '2 hints' or '2 hints and 5 kitties'",
  rank: 'a rank number (formatted), shown after #',
  score: 'a score (formatted points or a time)',
  event: "an event name, e.g. 'Lantern Walk'",
  solved: 'puzzles solved',
  hours: 'a number of hours (e.g. 72); write it so any number reads correctly',
  kitties: 'a number of kitties (e.g. 2); write it so any number reads correctly',
  place: 'a finishing place (1, 2, 3 …)',
  price: 'a store price with its currency, as the store formats it',
  at: 'a number of puzzles solved (a milestone)',
  wins: 'puzzles won so far in a group challenge',
  needed: 'puzzles to win for the reward',
  tool: "a helper's name: 'Kitty' (game.tool.kitty) or 'Hint' (game.tool.hint)",
};

/** Descriptions by key prefix (the longest matching prefix wins). */
const GROUPS: readonly (readonly [prefix: string, description: string, maxLength?: number])[] = [
  ['app.', 'App identity'],
  ['boot.', 'Web loading screen and the start-up error screen'],
  ['common.', 'Generic button or label used on many screens', 22],
  ['home.', 'Home screen'],
  ['home.daily.', 'Home: the daily puzzle card (title line and status line)'],
  ['home.stock.', 'Home: screen-reader label of the hint or kitty counter'],
  ['game.', 'Game screen'],
  ['game.title.', 'Game: the title in the top bar, centred between the safe zone and two round buttons (tight at 320 px)', 18],
  ['game.chip.', 'Game: a rule chip above the board (short, no full stop)', 18],
  ['game.tool.', 'Game: the kitty, hint (bulb) and mouse buttons under the board'],
  ['kitty.', 'Toast when the kitty booster cannot run'],
  ['mouse.', 'Toast when the mouse helper cannot run (the mouse is a small animal, never the computer device)'],
  ['hint.', 'Hint card: explanation sentences (02 §9.1). Rows and columns are numbered from 1'],
  ['unit.', 'Names of rows, columns and colours inside hint sentences (lower case unless your language capitalises nouns)'],
  ['list.', 'List joining for hint sentences: "A and B", "A, B and C"'],
  ['color.', 'A region colour name (12 pastel tile colours). Short, a proper name, distinct from the other 11; used alone and inside sentences in apposition ("the colour Violet")', 12],
  ['glyph.', 'Name of a small pattern symbol shown on a colour when colour patterns are on (lower case, one word)', 12],
  ['rewarded.', 'Pop-up offering a short video or a free item when hints or kitties run out'],
  ['ads.', 'Developer placeholders for ads (dev and test builds only)'],
  ['win.', 'Win overlay (Phase 2 fallback) and the praise words of the victory screen'],
  ['win.praise.', 'A praise exclamation shown big (40 px) when a level is solved; cat-themed puns welcome, never the same as another praise word', 16],
  ['fail.', 'Pop-up when all fish (the lives) are lost'],
  ['settings.', 'Settings dialog row label', 28],
  ['about.', 'About & credits dialog'],
  ['howto.', 'How to play dialog: the rules and controls'],
  ['daily.', 'Daily puzzle result'],
  ['tutorial.', 'Tutorial coach card (first level); short friendly sentences'],
  ['toast.', 'Short message at the bottom of the screen'],
  ['rotate.', 'Notice when a phone is held in landscape'],
  ['a11y.', 'Screen-reader text (not shown on screen); full sentences, may be longer'],
  ['date.', 'Date parts for English only; other locales use the system date formatter and may leave these out'],
  ['time.', 'Duration text (abbreviations fine)'],
  ['settings.language', 'Settings: the Language row (§6.8)', 28],
  ['settings.shop', 'Settings: the Shop row', 28],
  ['settings.removeAds', 'Settings: the Remove ads row', 28],
  ['fish.', 'Fish: the lives (3 per puzzle) and the leaderboard points they become (always "fish", never "golden fish", never a currency word)'],
  ['period.', 'The leaderboard period (a UTC day, week or month): the fish kept at each win add up and start again at 0 each period'],
  ['rank.title.period.', 'Ranking panel title (28 px, orange): the ranking of fish kept this period', 20],
  ['rank.tab.period.', 'Rankings hub tab and records row: this period (short)', 14],
  ['rank.records.best.', 'Ranking panel records row: the best period so far', 22],
  ['howto.points.', 'How to play: where the fish you keep go (the period ranking, reset at 00:00 UTC)'],
  // Phase 2c.1 (fish-lives-spec §10.7): "points" are always level points, earned per cat inside one level.
  ['points.', 'Level points: earned for each cat found inside one level (0 at the start of every level); never the leaderboard (that is fish)'],
  ['victory.', 'Victory screen after a win'],
  ['rank.', 'Ranking panel after a win and the rankings hub (never invent players or scores)'],
  ['rank.records.', 'Ranking panel: a row label of the personal records card', 22],
  ['group.', 'Group challenge (FB group play); in participation mode never say "won"'],
  ['shop.', 'Shop sheet'],
  ['shop.product.', 'Shop: a product name (short) or its one-line description'],
  ['event.', 'Limited-time events: names, taglines, the Home card and the event screen'],
  ['event.card.', 'Event card on Home: one short status line', 24],
  ['locale.name.', "The language's own name (endonym) in the Language list; identical in every catalogue"],
  // Phase 2d.1 (helpers-spec §4.3, §5.4).
  ['fx.', 'Game screen: a short animated word over the board (decorative; the same news is also read to screen readers)'],
  ['ticker.', 'Game screen: a level-start ticker, a one-line cream strip that slides across the top of the screen once. Only the player\'s own numbers, the board, a true fact or a tip; never a statistic about other players', 40],
];

/** Per-key notes on top of the group text (description suffix, max length, non-translatable). */
const NOTES: Readonly<Partial<Record<I18nKey, Partial<KeyMeta>>>> = {
  'app.name': { description: 'The game name; never translated (set per release)', translatable: false },
  'app.tagline': { description: 'Subtitle under the game name on Home', maxLength: 32 },
  'boot.loading': { description: 'Loading line under the sleeping cat', maxLength: 28 },
  'boot.progress': { description: 'Loading percentage; only reorder if your language writes % first', translatable: false },
  'boot.retry': { maxLength: 22 },
  'common.leaderboard': { maxLength: 22 },
  'common.hard': { description: 'Small badge on hard levels (Home play button, game top bar)', maxLength: 9 },
  'common.on': { description: 'State text next to a toggle switch', maxLength: 6 },
  'common.off': { description: 'State text next to a toggle switch', maxLength: 6 },
  'home.play': { description: 'Home: the big play button', maxLength: 22 },
  'home.continue': { description: 'Home: the big play button when a level is half done', maxLength: 26 },
  'home.daily.title': { maxLength: 30 },
  'home.daily.size': { description: 'Board size', translatable: false },
  'home.daily.sub': { description: 'Daily card second line: size · status', translatable: false },
  // Phase 2d (look-spec Appendix A).
  'game.score': { description: 'The top bar\'s label over the level points of this level (one short word, about 19 px, centred over the number; never "fish")', maxLength: 10 },
  'common.settings.new': { description: 'Screen-reader name of the gear button while its red dot shows (something in Settings is new)', maxLength: 40 },
  'game.tool.mouse': { description: 'Name of the third helper: a little mouse that crosses out a few tiles that cannot hold a cat (an animal, never the computer device)', maxLength: 12 },
  'game.tool.mouse.a11y': { description: 'Screen-reader name of the mouse button; {count} is 3' },
  'game.tool.video.a11y': { description: 'Screen-reader name of the kitty or hint button at 0 when a short video can refill it' },
  'a11y.mouse.one': { description: 'Read once after the mouse crossed out tiles' },
  'rewarded.title.mouse': { description: 'Title of the pop-up before the mouse helps (a friendly question)', maxLength: 24 },
  'rewarded.video.mouse': { description: 'Pop-up text: a video, then the mouse crosses out {count} (3) tiles without a cat' },
  'toast.start.level': { description: 'Level-start toast: a short honest encouragement (never a statistic, never "N % of players")', maxLength: 32 },
  'toast.start.hard': { description: 'Level-start toast on a Hard level: a short honest encouragement (never a statistic)', maxLength: 32 },
  'toast.start.retry': { description: 'Level-start toast after Retry: a short honest encouragement (never a statistic)', maxLength: 32 },
  // Phase 2d.1 (helpers-spec Appendix A).
  'fx.done': {
    description: 'A short cheer that pops under a row, column or colour the player just finished (every other tile crossed out, its cat in place). One exclamation, not a button; it shows for under a second in big outlined letters',
    maxLength: 8,
  },
  'a11y.unitDone': { description: 'Read after a move that finishes a row, column or colour; several are joined into one list' },
  'ticker.best': { description: 'Level-start ticker (a one-line strip sliding across the top): the player\'s own best time on this level; {time} is a clock ("4:12")', maxLength: 40 },
  'ticker.cats.one': { description: 'Level-start ticker: how many cats this board hides ({count} = the board size, 5 to 12). Never a statistic', maxLength: 40 },
  'ticker.cats.other': { description: 'Level-start ticker: how many cats this board hides ({count} = the board size, 5 to 12). Never a statistic', maxLength: 40 },
  'ticker.solved.one': { description: 'Level-start ticker: the number of levels THIS player has solved (their own count, never a worldwide number)', maxLength: 40 },
  'ticker.solved.other': { description: 'Level-start ticker: the number of levels THIS player has solved (their own count, never a worldwide number)', maxLength: 40 },
  'ticker.points.one': { description: 'Level-start ticker: the level points THIS player has earned so far (their own total)', maxLength: 40 },
  'ticker.points.other': { description: 'Level-start ticker: the level points THIS player has earned so far (their own total)', maxLength: 40 },
  'ticker.daily': { description: "Level-start ticker: today's daily puzzle is open and not solved yet", maxLength: 40 },
  'ticker.unique': { description: 'Level-start ticker: a true fact, every puzzle has exactly one solution', maxLength: 40 },
  'ticker.tip.cat': { description: 'Level-start ticker: a short tip, a double tap on a tile places a cat ("Tip:" prefix in your usual form)', maxLength: 40 },
  'ticker.tip.drag': { description: 'Level-start ticker: a short tip, dragging over tiles crosses many out at once', maxLength: 40 },
  'game.tool.hint': { description: 'Name of the bulb button (screen reader, settings)', maxLength: 14 },
  'game.tool.kitty': { description: 'Name of the paw booster that places one correct cat. Always the same cute word for a little cat, distinct from "cat"', maxLength: 14 },
  'game.tool.free': { description: 'Tiny badge on the bulb when a free hint is available', maxLength: 7 },
  'game.title.daily': { description: 'Game title in daily mode with a short date', maxLength: 20 },
  'game.chip.colours': { description: 'Rule chip: every colour region holds exactly one cat' },
  'game.chip.lines': { description: 'Rule chip: every row and column holds exactly one cat' },
  'game.chip.space': { description: 'Rule chip: cats never touch, not even diagonally' },
  'hint.title': { maxLength: 20 },
  'hint.apply': { description: 'Button: apply the hint', maxLength: 16 },
  'unit.colorWithGlyph': { description: 'A colour with its pattern symbol in brackets', translatable: false },
  'list.separator': { description: 'Separator between list items (comma and space in English)', translatable: false },
  'rewarded.watch': { maxLength: 22 },
  'rewarded.take': { maxLength: 18 },
  'rewarded.title.hint': { maxLength: 24 },
  'rewarded.title.kitty': { maxLength: 24 },
  'win.levelComplete': { maxLength: 28 },
  'win.next': { description: 'Button to the next level', maxLength: 22 },
  'win.tutorial.title': { maxLength: 20 },
  'win.tutorial.play': { maxLength: 22 },
  'fail.title': { maxLength: 22 },
  'fail.continue': { description: 'Button: continue with one more fish (a "+1" badge with a fish icon follows it)', maxLength: 14 },
  'fail.continue.bonus': { description: 'Badge on the Continue button', translatable: false },
  'fail.retry': { maxLength: 22 },
  'settings.title': { maxLength: 20 },
  'settings.patterns.note': { maxLength: 72 },
  'settings.reduceMotion.system': { description: 'Segment of a three-way switch: follow the device setting', maxLength: 9 },
  'settings.reduceMotion.on': { description: 'Segment of a three-way switch', maxLength: 6 },
  'settings.reduceMotion.off': { description: 'Segment of a three-way switch', maxLength: 6 },
  'settings.language.auto': { description: 'Language list: follow the device or Facebook language', maxLength: 22 },
  'howto.title': { maxLength: 20 },
  'howto.skip': { description: 'Button closing How to play', maxLength: 22 },
  'howto.replay': { maxLength: 22 },
  'daily.title': { maxLength: 30 },
  'daily.done': { maxLength: 16 },
  'tutorial.gotIt': { maxLength: 14 },
  'about.title': { maxLength: 24 },
  'about.fontLicence': { maxLength: 22 },
  'about.privacy': { maxLength: 22 },
  'about.codeLicence': { maxLength: 22 },
  'about.version': { maxLength: 22 },
  'rotate.title': { maxLength: 32 },
  'date.short': { description: 'English short date pattern (fallback only)' },
  'fish.plus': { description: 'Rising "+3" label', translatable: false },
  'fish.count.one': { description: 'A number of fish: lives kept, or leaderboard points ("42 fish")' },
  'game.hearts.a11y': { description: 'Screen-reader label of the lives pill: the fish are the lives' },
  'howto.hearts': { description: 'How to play: the fish are the lives; a wrong cat costs one' },
  'victory.next': { description: 'The wide orange button to the next level (24 px)', maxLength: 18 },
  // Phase 2c.1 (§10.7): the level points.
  'game.points.a11y': { description: 'Screen-reader label of the level-points counter in the game HUD (never shown): the running total of this level' },
  'a11y.points.one': { description: 'A short sentence read right after "Cat placed. 3 of 8.": the level\'s running points total ("2,016 points.")' },
  'points.count.one': {
    description: 'Victory screen: the level\'s points total in a white pill ("7,296 points"); must fit at 320 px with a 5-digit number',
    // 18 wide with "13,248" (§10.7); measured with the 2-digit sample "37", so 4 less.
    maxLength: 14,
  },
  'points.count.other': {
    description: 'Victory screen: the level\'s points total in a white pill ("7,296 points"); must fit at 320 px with a 5-digit number',
    // 18 wide with "13,248" (§10.7); measured with the 2-digit sample "37", so 4 less.
    maxLength: 14,
  },
  'howto.levelPoints': { description: 'How to play: how level points are earned (a paragraph next to a small star icon)' },
  'period.total.day': { description: 'Victory and ranking panel: the fish total of this period', maxLength: 20 },
  'period.total.week': { description: 'Victory and ranking panel: the fish total of this period', maxLength: 20 },
  'period.total.month': { description: 'Victory and ranking panel: the fish total of this period', maxLength: 20 },
  'period.pill.day.one': { description: 'Screen-reader label of the Home period pill (a trophy and a number)' },
  'period.pill.week.one': { description: 'Screen-reader label of the Home period pill (a trophy and a number)' },
  'period.pill.month.one': { description: 'Screen-reader label of the Home period pill (a trophy and a number)' },
  'rank.sub.period.one': { description: 'Ranking panel subtitle after a win: the fish this win added, then the period total ({total} is the whole "This week: 42")', maxLength: 30 },
  'rank.sub.period.other': { description: 'Ranking panel subtitle after a win: the fish this win added, then the period total ({total} is the whole "This week: 42")', maxLength: 30 },
  'rank.title.daily': { description: "Ranking panel title: the fastest solvers of today's daily puzzle", maxLength: 20 },
  'rank.title.event': { maxLength: 28 },
  'rank.tap': { description: 'Pulsing line under the ranking panel', maxLength: 26 },
  'rank.you': { maxLength: 10 },
  'rank.seeTop': { description: 'Button opening the Facebook top-players view', maxLength: 22 },
  'rank.hub': { maxLength: 18 },
  'group.title': { maxLength: 24 },
  'group.start': { maxLength: 26 },
  'group.take': { maxLength: 18 },
  'group.participation': { description: 'Rank mode, not the winner: {count} is a hint phrase ("1 hint")' },
  'group.double': { maxLength: 26 },
  'shop.title': { maxLength: 16 },
  'shop.buy': { maxLength: 10 },
  'shop.owned': { maxLength: 10 },
  'shop.product.remove_ads.name': { maxLength: 18 },
  'shop.product.hints_15.name': { maxLength: 18 },
  'shop.product.kitties_8.name': { maxLength: 18 },
  'event.lantern.name': { description: 'Event name (our own); short, title case where your language uses it', maxLength: 20 },
  'event.snow.name': { description: 'Event name (our own)', maxLength: 20 },
  'event.yarn.name': { description: 'Event name (our own)', maxLength: 20 },
  'event.play': { description: 'Event screen: the play button', maxLength: 22 },
  'event.back': { maxLength: 22 },
  'event.topList': { maxLength: 18 },
  'event.title.game': { description: 'Game title in event mode: event name · puzzle number', translatable: false },
  'time.daysHours': { description: 'Duration of days and hours (event countdowns); unit abbreviations may stay as in English', translatable: false },
  'time.hoursMinutes': { description: 'Unit abbreviations may stay as in English (h, min)', translatable: false },
  'time.minutes': { description: 'Unit abbreviations may stay as in English (min)', translatable: false },
};

/**
 * Keys that may legitimately equal the English text in one locale (a loanword the language really
 * uses, a symbol). Everything else marked translatable must differ from English (catalogs.spec.ts).
 */
export const SAME_AS_ENGLISH: Readonly<Partial<Record<LocaleId, readonly I18nKey[]>>> = {
  de: ['about.version', 'common.ok', 'home.play', 'game.title.level', 'victory.next', 'shop.title', 'settings.shop', 'glyph.1', 'glyph.6', 'rank.tab.event'],
  fr: ['about.version', 'common.ok', 'points.count.one', 'points.count.other', 'a11y.points.one', 'a11y.points.other', 'glyph.2', 'glyph.8', 'ads.placeholder.title'],
  it: ['common.ok', 'color.3', 'shop.owned'],
  // Phase 2d: "Coral" is the Portuguese and Spanish word too.
  'pt-BR': ['color.0'],
  es: ['color.0'],
  id: ['rank.tab.event', 'color.4', 'game.title.level', 'home.play', 'victory.next'],
  tr: [],
  pl: ['common.ok'],
  vi: [],
  ja: ['common.ok'],
};

/**
 * Keys only the English catalogue needs: the date parts behind formatShortDate's English template.
 * Every other locale formats dates with Intl.DateTimeFormat (phase2b §6.4), so its catalogue may
 * leave them out (they cost ≈ 0.5 KB per lazy chunk).
 */
export function isEnglishOnly(key: string): boolean {
  return key.startsWith('date.');
}

/** A key's placeholder names, in order of first appearance. */
export function placeholdersOf(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{(\w+)\}/g)) if (out.indexOf(m[1] as string) < 0) out.push(m[1] as string);
  return out;
}

function build(): Readonly<Partial<Record<I18nKey, KeyMeta>>> {
  const out: Partial<Record<I18nKey, KeyMeta>> = {};
  for (const key of Object.keys(en) as I18nKey[]) {
    let group: (typeof GROUPS)[number] | undefined;
    for (const g of GROUPS) if (key.startsWith(g[0]) && (!group || g[0].length > group[0].length)) group = g;
    const note = NOTES[key] ?? {};
    const names = placeholdersOf(en[key]);
    const placeholders: Record<string, string> = {};
    for (const p of names) placeholders[p] = PLACEHOLDER_NOTES[p] ?? p;
    const base = group?.[1] ?? 'UI text';
    const description = note.description ? (group ? `${base}. ${note.description}` : note.description) : base;
    // Endonyms are the same everywhere; the English date parts are a fallback (Intl formats dates).
    const translatable = note.translatable ?? !(key.startsWith('locale.name.') || key.startsWith('date.'));
    // Screen-reader variants (…a11y…) are never on screen, so they never inherit a group limit.
    const maxLength = note.maxLength ?? (key.includes('a11y') ? undefined : group?.[2]);
    out[key] = {
      description,
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(names.length > 0 ? { placeholders } : {}),
      translatable,
    };
  }
  return out;
}

export const META: Readonly<Partial<Record<I18nKey, KeyMeta>>> = build();

/**
 * Display width of a string: East Asian wide and fullwidth characters count 2, combining marks and
 * format characters 0, everything else 1. Used for the max-length warnings.
 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (/[\p{M}\p{Cf}]/u.test(ch)) continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

/** Sample values for the length check, by placeholder name (typical widths, not the longest). */
const SAMPLES: Readonly<Record<string, string>> = {
  date: 'Tue 6 Oct',
  time: '7 h 48 min',
  event: 'Lantern Walk',
  color: 'Lavender',
  unit: 'row 3',
  line: 'row 3',
  reward: '2 hints',
  status: 'Solved 4:12',
  size: '9×9',
  version: '0.1.0',
  name: 'Mewdoku',
};

/** The template with sample values filled in (numbers become two digits). */
export function sampleText(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => SAMPLES[name] ?? '37');
}
