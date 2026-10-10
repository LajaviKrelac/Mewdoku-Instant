// Owner: E (the aggregator and the Phase 2 keys below; never rename or remove a key).
// Every user-facing string (02 §21). All copy is our own (06 §3): never paste or paraphrase the
// original's store text, tutorial lines, hint sentences, praise words or rule-chip wording.
// Placeholders are {name}; t() type-checks them. Plurals use the `.one` / `.other` suffix pair.
//
// Phase 2b (phase2b §6.7, §12.1 F0 item 7): new keys live in per-owner files under ./en/ and are
// spread into `en` below, so the workstreams never edit the same file:
//   en/art.ts (A) · en/ui-2b.ts (B) · en/events.ts (C) · en/platform.ts (D) · en/i18n.ts (E).
// Phase 2c (fish-lives-spec §1.5, Appendix A): G2 owns every file here; the 2c keys are in en/ui-2c.ts.
// Phase 2d (look-spec Appendix A): G3 owns every file here; the 2d keys are in en/ui-2d.ts.
// The lives are fish: the 2b "heart" values changed (same keys, A.1), the fish-currency keys went (A.3).
// A key must exist in exactly one file (tests/unit/sanity.spec.ts checks it).
import { enArt } from './en/art';
import { enEvents } from './en/events';
import { enI18n } from './en/i18n';
import { enPlatform } from './en/platform';
import { enUi2b } from './en/ui-2b';
import { enUi2c } from './en/ui-2c';
import { enUi2d } from './en/ui-2d';

/** The Phase 2 catalogue (02 §21), E-owned. Values may change; keys and placeholders never do. */
export const enCore = {
  // ── App and boot (S0) ──────────────────────────────────────────────────────
  'app.name': 'Mewdoku',
  'app.tagline': 'A calm cat logic puzzle',
  'boot.loading': 'Waking the cats…',
  'boot.progress': '{pct}%',

  // ── Common controls ────────────────────────────────────────────────────────
  'common.ok': 'OK',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.done': 'Done',
  'common.home': 'Home',
  'common.settings': 'Settings',
  'common.leaderboard': 'Leaderboard',
  'common.notNow': 'Not now',
  'common.hard': 'Hard',
  'common.locked': 'Locked',
  'common.on': 'On',
  'common.off': 'Off',

  // ── Home (S1) ──────────────────────────────────────────────────────────────
  'home.play': 'Level {level}',
  'home.continue': 'Continue · Level {level}',
  'home.daily.title': 'Daily puzzle · {date}',
  'home.daily.size': '{n}×{n}',
  'home.daily.locked': 'Unlocks after level {level}',
  'home.daily.notPlayed': 'Not played yet',
  'home.daily.inProgress': 'In progress',
  'home.daily.solved': 'Solved {time}',
  'home.daily.lockedToast': 'Solve level {level} to open the daily puzzle.',
  'home.daily.a11y': 'Daily puzzle, {date}, {size}, {status}',
  'home.stock.hints': 'Hints: {count}',
  'home.stock.kitties': 'Kitties: {count}',
  'home.daily.sub': '{size} · {status}',

  // ── Game (S2) ──────────────────────────────────────────────────────────────
  'game.title.level': 'Level {level}',
  'game.title.daily': 'Daily · {date}',
  'game.cats.a11y': '{placed} of {n} cats placed',
  'game.hearts.a11y': '{hearts} of {max} fish left',
  'game.chip.colours': '1 cat each colour',
  'game.chip.lines': '1 cat each line',
  'game.chip.space': 'Cats keep apart',
  'game.chip.colours.a11y': 'Every colour holds exactly one cat.',
  'game.chip.lines.a11y': 'Every row and every column holds exactly one cat.',
  'game.chip.space.a11y': 'Two cats never touch, not even at the corners.',
  'game.tool.hint': 'Hint',
  'game.tool.kitty': 'Kitty',
  'game.tool.hint.a11y': 'Hint, {count} left',
  'game.tool.kitty.a11y': 'Kitty, {count} left',
  'game.tool.free': 'Free',
  'game.loading': 'Getting the board ready…',
  'kitty.unavailable': 'The kitty is napping. Try again in a moment.',

  // ── Hint card (O1) and explanation templates (02 §9.1) ─────────────────────
  'hint.title': 'Hint',
  'hint.apply': 'Apply',
  'hint.close': 'Close hint',
  'hint.unavailable': 'Hint unavailable',
  'hint.shadow': 'This cat claims its row, column, colour and every tile touching it. Cross those out.',
  'hint.single': '{unit} has just one open tile left, so its cat goes here.',
  'hint.confineRegionLine': 'Every open {color} tile is in {line}. So no other colour can use {line}.',
  'hint.confineLineRegion': 'All open tiles of {line} are {color}. So the rest of {color} is out.',
  'hint.shadowConflict': 'A cat here would cross out every open tile of {unit}. So no cat can go here.',
  'hint.pigeonhole': '{sources} only fit in {targets}. Those {targetKind} are taken, so clear their other tiles.',
  'hint.trial': 'Imagine a cat here: {unit} would have no tile left. So this tile is out.',
  'hint.mistakenMark': "This X rules out a tile that can't be ruled out yet.",
  'hint.revealFallback': "Here's a cat to get you going.",

  // ── Unit names and lists (02 §9.1): rows and columns are numbered from 1 ──
  'unit.row': 'row {index}',
  'unit.col': 'column {index}',
  'unit.rows': 'rows {list}',
  'unit.cols': 'columns {list}',
  'unit.kind.rows': 'rows',
  'unit.kind.cols': 'columns',
  'unit.kind.colors': 'colours',
  'unit.colorWithGlyph': '{color} ({glyph})',
  'list.pair': '{first} and {last}',
  'list.serial': '{rest} and {last}',
  'list.separator': ', ',

  // ── Region colour names (02 §17.2), one per palette index ─────────────────
  'color.0': 'Coral',
  'color.1': 'Apricot',
  'color.2': 'Mustard',
  'color.3': 'Lime',
  'color.4': 'Denim',
  'color.5': 'Lagoon',
  'color.6': 'Sky',
  'color.7': 'Violet',
  'color.8': 'Orchid',
  'color.9': 'Cocoa',
  'color.10': 'Slate',
  'color.11': 'Pink',

  // ── Pattern glyph names (02 §18), one per palette index ───────────────────
  'glyph.0': 'dot',
  'glyph.1': 'ring',
  'glyph.2': 'triangle',
  'glyph.3': 'square',
  'glyph.4': 'diamond',
  'glyph.5': 'star',
  'glyph.6': 'plus',
  'glyph.7': 'bar',
  'glyph.8': 'chevron',
  'glyph.9': 'heart',
  'glyph.10': 'drop',
  'glyph.11': 'moon',

  // ── Rewarded prompt (O2, 02 §5 / §13.3) ────────────────────────────────────
  'rewarded.title.hint': 'Out of hints',
  'rewarded.title.kitty': 'Out of kitties',
  'rewarded.video.hint': 'Watch a short video for 1 hint?',
  'rewarded.video.kitty': 'Watch a short video for 1 kitty?',
  'rewarded.watch': 'Watch video',
  'rewarded.free.hint': "Here's a free hint.",
  'rewarded.free.kitty': "Here's a free kitty.",
  'rewarded.take': 'Take it',
  'rewarded.countdown.hint': 'Next free hint in {time}',
  'rewarded.countdown.kitty': 'Next free kitty in {time}',
  'rewarded.noVideo': 'No videos right now — try again soon.',
  'ads.placeholder.title': 'Ad placeholder',
  'ads.placeholder.body': 'A real ad would play here.',

  // ── Win overlay (O3) ───────────────────────────────────────────────────────
  'win.praise.0': 'Clever cat!',
  'win.praise.1': 'Whisker-perfect!',
  'win.praise.2': 'Purr-fection!',
  'win.praise.3': 'Nailed it!',
  'win.praise.4': 'Brilliant!',
  'win.praise.5': 'Paws up!',
  'win.levelComplete': 'Level {level} complete',
  'win.next': 'Next: Level {level}',
  'win.tutorial.title': "You're ready!",
  'win.tutorial.body': 'Time to solve one on your own.',
  'win.tutorial.play': 'Play Level {level}',

  // ── Fail overlay (O4) ──────────────────────────────────────────────────────
  'fail.title': 'Out of fish',
  'fail.body': 'Every wrong tile stays marked, so you know more than before.',
  'fail.continue': 'Continue',
  'fail.continue.bonus': '+1',
  'fail.continue.a11y.video': 'Watch a video to continue with one more fish',
  'fail.continue.a11y.free': 'Continue with one more fish',
  'fail.retry': 'Retry level',

  // ── Settings (O5, 02 §14) and About ────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.vibration': 'Vibration',
  'settings.patterns': 'Colour patterns',
  'settings.patterns.note': 'Adds a small symbol to every colour and outlines the crosses.',
  'settings.reduceMotion': 'Reduce motion',
  'settings.reduceMotion.system': 'System',
  'settings.reduceMotion.on': 'On',
  'settings.reduceMotion.off': 'Off',
  'settings.howToPlay': 'How to play',
  'settings.about': 'About & credits',
  'about.title': 'About & credits',
  'about.version': 'Version {version}',
  'about.font': 'Headings use the Fredoka typeface by the Fredoka Project Authors, under the SIL Open Font License 1.1.',
  'about.fontLicence': 'Font licence',
  'about.privacy': 'Privacy policy',
  'about.privacySoon': 'Our privacy policy will be linked here.',

  // ── How to play (O6) ───────────────────────────────────────────────────────
  'howto.title': 'How to play',
  'howto.rule.colours': 'Every colour hides *exactly one cat*.',
  'howto.rule.lines': 'Every row and every column holds *one cat* too.',
  'howto.rule.space': 'Cats like their space: two cats *never touch, not even at the corners*.',
  'howto.controls': 'Tap a tile to cross it out. Double-tap to place a cat. Swipe across tiles to cross out several at once.',
  'howto.hearts': 'Your fish are your lives. A cat on the wrong tile costs a fish. Lose all three and you can try the level again.',
  'howto.helpers': 'Stuck? The bulb explains one step. The kitty finds a cat for you. The mouse crosses out a few tiles that have no cat.',
  'howto.skip': 'I know how to play',
  'howto.replay': 'Replay tutorial',

  // ── Daily result (O7, 02 §12) ──────────────────────────────────────────────
  'daily.title': 'Daily puzzle · {date}',
  'daily.solvedIn': 'Solved in {time}',
  'daily.stats': 'Mistakes {mistakes} · Hints {hints}',
  'daily.next': 'Next puzzle in {time}',
  'daily.done': 'Done',

  // ── Tutorial coach (O8, 02 §11.5) ──────────────────────────────────────────
  'tutorial.step1': 'Every colour hides *exactly one cat*. This {color} colour is a single tile — double-tap it.',
  'tutorial.step2': 'A cat claims its *whole row and column*.',
  'tutorial.step3': "Cats need space — they *can't touch, not even at the corners*. Swipe across these tiles to cross them out.",
  'tutorial.step4': 'Row 2 has *one open tile* left. Double-tap it.',
  'tutorial.step5': 'Stuck? Tap the bulb for a hint.',
  'tutorial.step6': 'Place the last cat.',
  'tutorial.gotIt': 'Got it',

  // ── Toasts (O9) and rotate notice (O10) ────────────────────────────────────
  'toast.storageMemory': "Progress can't be saved on this device right now.",
  'toast.error': 'Oops, something hiccupped. You can keep playing.',
  'rotate.title': 'Please rotate your device',
  'rotate.body': 'This game plays best in portrait.',

  // ── Screen-reader labels and live announcements (02 §18) ──────────────────
  'a11y.board': 'Puzzle board, {n} by {n}',
  'a11y.cell': 'Row {row}, column {col}, {color}, {state}',
  'a11y.cell.empty': 'empty',
  'a11y.cell.mark': 'marked',
  'a11y.cell.cat': 'cat',
  'a11y.cell.wrong': 'wrong',
  'a11y.cell.given': 'given cat',
  'a11y.catPlaced': 'Cat placed. {placed} of {n}.',
  'a11y.catRemoved': 'Cat removed. {placed} of {n}.',
  'a11y.mistake.one': 'Wrong tile. {count} fish left.',
  'a11y.mistake.other': 'Wrong tile. {count} fish left.',
  'a11y.regionDone': '{color} done.',
  'a11y.marked.one': '{count} tile crossed out.',
  'a11y.marked.other': '{count} tiles crossed out.',
  'a11y.unmarked.one': '{count} tile cleared.',
  'a11y.unmarked.other': '{count} tiles cleared.',
  'a11y.won': 'Solved! Every cat found its tile.',
  'a11y.lost': 'Out of fish.',
  'a11y.revived': 'One fish back. Keep going.',
  'a11y.kitty': 'The kitty found a cat. {placed} of {n}.',
  'a11y.hint': 'Hint: {text}',
  'a11y.hintApplied': 'Hint applied.',
  // phase2b Appendix A: the ginger cat is retired; these four describe Tux (values changed at F0).
  'a11y.mascot': 'A black-and-white cat',
  'a11y.illustration.boot': 'A black-and-white cat having a nap',
  'a11y.illustration.win': 'A black-and-white cat leaping with a fish',
  'a11y.illustration.fail': 'A black-and-white cat hiding its eyes',

  // ── Dates and durations ────────────────────────────────────────────────────
  'date.short': '{weekday} {day} {month}',
  'date.weekday.0': 'Sun',
  'date.weekday.1': 'Mon',
  'date.weekday.2': 'Tue',
  'date.weekday.3': 'Wed',
  'date.weekday.4': 'Thu',
  'date.weekday.5': 'Fri',
  'date.weekday.6': 'Sat',
  'date.month.0': 'Jan',
  'date.month.1': 'Feb',
  'date.month.2': 'Mar',
  'date.month.3': 'Apr',
  'date.month.4': 'May',
  'date.month.5': 'Jun',
  'date.month.6': 'Jul',
  'date.month.7': 'Aug',
  'date.month.8': 'Sep',
  'date.month.9': 'Oct',
  'date.month.10': 'Nov',
  'date.month.11': 'Dec',
  'time.hoursMinutes': '{h} h {m} min',
  'time.minutes': '{m} min',
  'time.underMinute': 'under a minute',

  // ── Group A fixes (appended) ───────────────────────────────────────────────
  /** O7 when the next daily is already playable (solved after midnight, or left open past it). */
  'daily.ready': 'A new puzzle is ready',
  /** About credit: the product name comes from 'app.name' (one source of truth, LEGAL-1). */
  'about.madeBy': 'Puzzles, pictures, sounds and words made by the {name} team.',

  // ── Group B fixes (appended) ───────────────────────────────────────────────
  /** Shown in place of the game when start-up failed twice (PLAT-8); never the "keep playing" toast. */
  'boot.failed': "The game couldn't start. Check your connection and try again.",
  'boot.retry': 'Try again',

  // ── Group C fixes (appended) ───────────────────────────────────────────────
  /** Screen-reader line naming the tile a hint points at (A11Y-7); the card's sentence says "here". */
  'a11y.hintAt': 'Highlighted tile: row {row}, column {col}.',
  'a11y.hintAtColor': 'Highlighted tile: row {row}, column {col}, {color}.',
  /** How to play: keyboard controls (02 §6.3), shown where a keyboard or mouse is present. */
  'howto.keys': 'Keyboard: arrow keys move, Space crosses out, Enter places a cat, H for a hint, K for the kitty.',
  /** Fail Continue: the accessible name contains the visible label "Continue +1" (WCAG 2.5.3). */
  'fail.continue.a11y.videoLabel': 'Continue +1 fish, after a short video',
  'fail.continue.a11y.freeLabel': 'Continue +1 fish',
  /** About: the one piece of third-party code in the bundle (Vite's module preload helper, MIT). */
  'about.code': 'Includes a loader helper from Vite, © 2019-present VoidZero Inc. and Vite contributors, MIT License.',
  'about.codeLicence': 'MIT licence',
} as const;

/** The English catalogue: the Phase 2 keys plus every owner's Phase 2b file. */
export const en = { ...enCore, ...enArt, ...enUi2b, ...enUi2c, ...enUi2d, ...enEvents, ...enPlatform, ...enI18n } as const;

/** The per-owner parts of `en`, for the disjointness check (sanity.spec.ts). */
export const EN_PARTS = { enCore, enArt, enUi2b, enUi2c, enUi2d, enEvents, enPlatform, enI18n } as const;

export type En = typeof en;
export type I18nKey = keyof En;
/** A full catalogue for another locale has every key (values are plain strings). */
export type Catalog = { readonly [K in I18nKey]: string };

/** Keys B such that both `${B}.one` and `${B}.other` exist (the bases tn() accepts). */
export type PluralBase = {
  [K in I18nKey]: K extends `${infer B}.one` ? (`${B}.other` extends I18nKey ? B : never) : never;
}[I18nKey];

/**
 * The plural forms other languages add to a base (phase2b §6.4): `${base}.zero|two|few|many`. English
 * has only `.one` / `.other`; a locale catalogue adds the categories Intl.PluralRules uses for it.
 */
export type PluralExtraKey = `${PluralBase}.${'zero' | 'two' | 'few' | 'many'}`;

/** Ordered key lists for indexed strings. Appending a word means appending to its list too. */
export const COLOR_KEYS = [
  'color.0', 'color.1', 'color.2', 'color.3', 'color.4', 'color.5',
  'color.6', 'color.7', 'color.8', 'color.9', 'color.10', 'color.11',
] as const satisfies readonly I18nKey[];
export const GLYPH_KEYS = [
  'glyph.0', 'glyph.1', 'glyph.2', 'glyph.3', 'glyph.4', 'glyph.5',
  'glyph.6', 'glyph.7', 'glyph.8', 'glyph.9', 'glyph.10', 'glyph.11',
] as const satisfies readonly I18nKey[];
export const PRAISE_KEYS = [
  'win.praise.0', 'win.praise.1', 'win.praise.2', 'win.praise.3', 'win.praise.4', 'win.praise.5',
] as const satisfies readonly I18nKey[];
export const TUTORIAL_STEP_KEYS = [
  'tutorial.step1', 'tutorial.step2', 'tutorial.step3', 'tutorial.step4', 'tutorial.step5', 'tutorial.step6',
] as const satisfies readonly I18nKey[];
export const WEEKDAY_KEYS = [
  'date.weekday.0', 'date.weekday.1', 'date.weekday.2', 'date.weekday.3',
  'date.weekday.4', 'date.weekday.5', 'date.weekday.6',
] as const satisfies readonly I18nKey[];
export const MONTH_KEYS = [
  'date.month.0', 'date.month.1', 'date.month.2', 'date.month.3', 'date.month.4', 'date.month.5',
  'date.month.6', 'date.month.7', 'date.month.8', 'date.month.9', 'date.month.10', 'date.month.11',
] as const satisfies readonly I18nKey[];
