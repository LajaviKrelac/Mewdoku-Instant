// Owner: E
// Catalogue and release checks (phase2b §6.7 step 6, §6.9). `npm run i18n:check` runs in `verify`;
// `npm run build:release` runs it with --release after the release-mode builds.
//   always:    i18n.releaseLocales ⊆ i18n.locales, includes 'en', no duplicates; every catalogue file
//              src/i18n/locales/<id>.ts passes checkCatalog() (errors fail, warnings print):
//                errors   — a missing or unknown key (English-only date parts and unused `.one`
//                           forms excepted), an empty value, a placeholder set that differs
//                           from English, a missing plural category, a translatable value identical
//                           to English (outside meta.ts SAME_AS_ENGLISH), a banned phrase, keyword
//                           markers (`*…*`, review PAR-7) that do not pair up or whose count differs
//                           from English;
//                warnings — a value over meta.ts maxLength (display width), a translation whose
//                           English source changed since the draft (docs/i18n/drafted-from.json).
//   --release: every release locale other than 'en' has a catalogue that passes, and a line in
//              docs/i18n/review-log.md; the release outputs (dist/release-web, dist/release-fbig)
//              contain no locale chunk (assets/locale-<id>-*.js) outside i18n.releaseLocales.
// Options: --quiet (no warnings), --locale <id> (check one catalogue), --write-drafted-from (record
// the current English of every key a catalogue translates, after a translation pass).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cfg, type GameConfig, type LocaleId } from '../src/app/config';
import { en } from '../src/i18n/en';
import { markCount } from '../src/i18n/format';
import { displayWidth, isEnglishOnly, META, placeholdersOf, SAME_AS_ENGLISH, sampleText } from '../src/i18n/meta';
import { pluralCategory, requiredPluralCategories, type PluralCategory } from '../src/i18n/plural';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = join(ROOT, 'src/i18n/locales');
const DRAFTED_FROM = join(ROOT, 'docs/i18n/drafted-from.json');

/**
 * Known phrases of the original game (06 §3), its event names (phase2b §0.2) and "golden fish"
 * (our copy says "fish"). Lowercase; matched case-insensitively. tests/unit/sanity.spec.ts imports this list.
 */
export const BANNED_PHRASES: readonly string[] = [
  'exclusive territory',
  'aloof',
  'guess right',
  'guess wrong',
  'non-intrusive',
  'test your iq',
  'find the cats',
  'endless levels',
  "guessing won't",
  'zero interruptions',
  'one per color',
  'no touching',
  'meowdoku',
  'meow cup',
  'long live meow',
  'moonlit meows',
  'golden fish',
  // The original's Indonesian victory label (differences-vs-original §2.3; review CLEAN-1).
  'kelas master',
];

type Strings = Readonly<Record<string, string | undefined>>;

export interface CatalogReport {
  readonly locale: string;
  readonly errors: string[];
  readonly warnings: string[];
}

const EXTRA_CATEGORIES: readonly PluralCategory[] = ['zero', 'two', 'few', 'many'];

/** The plural bases of the English catalogue: keys B with both B.one and B.other. */
export function pluralBases(source: Strings = en): string[] {
  const out: string[] = [];
  for (const k of Object.keys(source)) {
    if (!k.endsWith('.one')) continue;
    const base = k.slice(0, -'.one'.length);
    if (source[`${base}.other`] !== undefined) out.push(base);
  }
  return out;
}

/** The counts (0…200, 1 000) for which `category` is selected in `locale`. */
function countsFor(locale: string, category: PluralCategory): number[] {
  const out: number[] = [];
  for (let n = 0; n <= 200; n++) if (pluralCategory(locale, n) === category) out.push(n);
  if (pluralCategory(locale, 1000) === category) out.push(1000);
  return out;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.indexOf(x) >= 0);

/** Checks one translated catalogue against English (phase2b §6.9). */
export function checkCatalog(
  locale: LocaleId | string,
  catalog: Strings,
  opts: { draftedFrom?: Readonly<Record<string, string>> } = {},
): CatalogReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const source = en as Strings;
  const bases = pluralBases(source);
  const required = requiredPluralCategories(locale);
  const extraAllowed = new Set<string>();
  for (const b of bases) for (const c of EXTRA_CATEGORIES) extraAllowed.add(`${b}.${c}`);
  const sameOk = new Set<string>(SAME_AS_ENGLISH[locale as LocaleId] ?? []);

  // Keys: every English key present and non-empty; nothing unknown. Two exceptions keep the lazy
  // chunks small (24 KB each, phase2b §11): the English date parts (other locales format dates with
  // Intl, §6.4) and a plural `.one` form the locale never selects (ja, ko, zh, th, vi, id).
  const oneUnused = required.indexOf('one') < 0;
  for (const key of Object.keys(source)) {
    const v = catalog[key];
    if (v === undefined) {
      if (isEnglishOnly(key)) continue;
      if (oneUnused && key.endsWith('.one') && bases.indexOf(key.slice(0, -'.one'.length)) >= 0) continue;
      errors.push(`${locale}: missing ${key}`);
    } else if (typeof v !== 'string' || v.trim() === '') errors.push(`${locale}: empty ${key}`);
  }
  for (const key of Object.keys(catalog)) {
    if (source[key] === undefined && !extraAllowed.has(key)) errors.push(`${locale}: unknown key ${key}`);
  }

  // Plural categories: each base has every category Intl.PluralRules selects for this locale.
  for (const base of bases) {
    for (const c of required) {
      if (catalog[`${base}.${c}`] === undefined) errors.push(`${locale}: plural ${base} lacks .${c}`);
    }
  }

  // Placeholders: the same set as English. In a plural form that stands for one exact number
  // (Arabic zero/one/two), {count} may be omitted.
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') continue;
    let englishKey = key;
    let category: PluralCategory | null = null;
    if (source[key] === undefined) {
      const dot = key.lastIndexOf('.');
      englishKey = `${key.slice(0, dot)}.other`;
      category = key.slice(dot + 1) as PluralCategory;
    } else if (bases.some((b) => key === `${b}.one` || key === `${b}.other`)) {
      category = key.slice(key.lastIndexOf('.') + 1) as PluralCategory;
    }
    const english = source[englishKey];
    if (english === undefined) continue;
    const want = placeholdersOf(english);
    const got = placeholdersOf(value);
    if (sameSet(want, got)) continue;
    const exact = category !== null && countsFor(locale, category).length === 1;
    const withoutCount = want.filter((p) => p !== 'count');
    if (exact && sameSet(withoutCount, got)) continue;
    errors.push(`${locale}: ${key} placeholders {${got.join('},{')}} ≠ English {${want.join('},{')}}`);
  }

  // Keyword markers (review PAR-7): `*…*` pairs, as many as English has (a translator places them).
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') continue;
    const english = source[key] ?? source[`${key.slice(0, key.lastIndexOf('.'))}.other`];
    const got = markCount(value);
    if (got === null) {
      errors.push(`${locale}: ${key} has an unpaired keyword marker (*)`);
      continue;
    }
    const want = english === undefined ? 0 : markCount(english);
    if (want !== null && got !== want) errors.push(`${locale}: ${key} marks ${got} keyword(s), English ${want}`);
  }

  // Identical to English: only for keys meta marks non-translatable, or listed per locale.
  for (const key of Object.keys(source)) {
    const v = catalog[key];
    if (v === undefined || v !== source[key]) continue;
    if (META[key as keyof typeof META]?.translatable === false || sameOk.has(key)) continue;
    if (!/\p{L}/u.test(v)) continue; // numbers and symbols only
    errors.push(`${locale}: ${key} is identical to English ("${v}")`);
  }

  // Banned phrases (06 §3, phase2b §0.2).
  const all = Object.values(catalog).join('\n').toLowerCase();
  for (const phrase of BANNED_PHRASES) if (all.includes(phrase)) errors.push(`${locale}: banned phrase "${phrase}"`);

  // Max lengths (warnings): display width of the template with sample values.
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') continue;
    const metaKey = (source[key] === undefined ? `${key.slice(0, key.lastIndexOf('.'))}.other` : key) as keyof typeof META;
    const max = META[metaKey]?.maxLength;
    if (max === undefined) continue;
    const w = displayWidth(sampleText(value));
    if (w > max) warnings.push(`${locale}: ${key} is ${w} wide (max ${max}): "${value}"`);
  }

  // Stale translations (warnings): English changed since the draft.
  const drafted = opts.draftedFrom;
  if (drafted) {
    for (const key of Object.keys(source)) {
      if (drafted[key] !== undefined && drafted[key] !== source[key] && catalog[key] !== undefined) {
        warnings.push(`${locale}: ${key} was translated from "${drafted[key]}", English is now "${source[key]}"`);
      }
    }
  }
  return { locale, errors, warnings };
}

/** The catalogue files that exist (src/i18n/locales/<id>.ts with <id> in i18n.locales), by id. */
export function catalogFiles(dir: string = LOCALES_DIR, c: GameConfig = cfg): Partial<Record<LocaleId, string>> {
  const out: Partial<Record<LocaleId, string>> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const id = f.replace(/\.ts$/, '');
    if (f.endsWith('.ts') && (c.i18n.locales as readonly string[]).indexOf(id) >= 0 && id !== 'en') out[id as LocaleId] = join(dir, f);
  }
  return out;
}

/** Loads every catalogue file (tsx or Vitest). */
export async function loadCatalogs(dir: string = LOCALES_DIR, c: GameConfig = cfg): Promise<Partial<Record<LocaleId, Strings>>> {
  const out: Partial<Record<LocaleId, Strings>> = {};
  for (const [id, file] of Object.entries(catalogFiles(dir, c)) as [LocaleId, string][]) {
    const mod = (await import(pathToFileURL(file).href)) as { catalog?: Strings };
    out[id] = mod.catalog ?? {};
  }
  return out;
}

/** The English each key had when the drafts were last written (docs/i18n/drafted-from.json), if recorded. */
export function readDraftedFrom(path: string = DRAFTED_FROM): Record<string, string> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  } catch {
    return undefined;
  }
}

/** Problems with the locale lists themselves. */
export function checkLocaleLists(c: GameConfig = cfg): string[] {
  const out: string[] = [];
  const all = new Set<string>(c.i18n.locales);
  if (all.size !== c.i18n.locales.length) out.push('i18n.locales has duplicates');
  if (new Set(c.i18n.releaseLocales).size !== c.i18n.releaseLocales.length) out.push('i18n.releaseLocales has duplicates');
  if (!c.i18n.releaseLocales.includes('en')) out.push("i18n.releaseLocales must include 'en'");
  for (const id of c.i18n.releaseLocales) if (!all.has(id)) out.push(`release locale ${id} is not in i18n.locales`);
  if (!all.has(c.i18n.fallback)) out.push(`i18n.fallback ${c.i18n.fallback} is not in i18n.locales`);
  for (const id of c.i18n.rtl) if (!all.has(id)) out.push(`rtl locale ${id} is not in i18n.locales`);
  return out;
}

/** True when docs/i18n/review-log.md has an approval line for `id` (a table row naming the locale). */
export function hasReviewLine(log: string, id: string): boolean {
  const esc = id.replace(/[-]/g, '\\-');
  return new RegExp(`^\\|\\s*\`?${esc}\`?\\s*\\|`, 'm').test(log);
}

/** Release rules: catalogues present, review-log lines and no stray locale chunks in the release outputs. */
export function checkRelease(root: string = ROOT, c: GameConfig = cfg, catalogs?: Partial<Record<LocaleId, Strings>>): string[] {
  const out: string[] = [];
  const release = new Set<string>(c.i18n.releaseLocales);
  const logPath = join(root, 'docs/i18n/review-log.md');
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const approvals = log.split(/^## /m).find((s) => s.startsWith('Approvals')) ?? '';
  for (const id of c.i18n.releaseLocales) {
    if (id === 'en') continue;
    if (!hasReviewLine(approvals, id)) out.push(`release locale ${id} has no approval line in docs/i18n/review-log.md`);
    if (catalogs && !catalogs[id]) out.push(`release locale ${id} has no catalogue (src/i18n/locales/${id}.ts)`);
    const cat = catalogs?.[id];
    if (cat) for (const e of checkCatalog(id, cat).errors) out.push(`release locale ${e}`);
  }
  for (const dir of ['dist/release-web', 'dist/release-fbig']) {
    const assets = join(root, dir, 'assets');
    if (!existsSync(assets)) continue;
    for (const f of readdirSync(assets)) {
      if (!f.startsWith('locale-') || !f.endsWith('.js')) continue;
      // Hashes may contain '-', so match the longest known id rather than parsing the name.
      const id = c.i18n.locales.filter((l) => f.startsWith(`locale-${l}-`)).sort((x, y) => y.length - x.length)[0];
      if (id === undefined || !release.has(id)) out.push(`${dir}/assets/${f}: locale ${id ?? '?'} is not in i18n.releaseLocales`);
    }
  }
  return out;
}

/** The English source of every key, for docs/i18n/drafted-from.json. */
export function draftedFromSnapshot(): Record<string, string> {
  return { ...(en as Record<string, string>) };
}

async function main(argv: readonly string[]): Promise<number> {
  const quiet = argv.includes('--quiet');
  const only = argv.includes('--locale') ? argv[argv.indexOf('--locale') + 1] : undefined;
  if (argv.includes('--write-drafted-from')) {
    writeFileSync(DRAFTED_FROM, `${JSON.stringify(draftedFromSnapshot(), null, 2)}\n`);
    console.log(`i18n-check: wrote ${DRAFTED_FROM}`);
  }
  const catalogs = await loadCatalogs();
  const draftedFrom = readDraftedFrom();
  const problems = [...checkLocaleLists()];
  let warningCount = 0;
  for (const [id, cat] of Object.entries(catalogs) as [LocaleId, Strings][]) {
    if (only && id !== only) continue;
    const r = checkCatalog(id, cat, { draftedFrom });
    problems.push(...r.errors);
    warningCount += r.warnings.length;
    if (!quiet) for (const w of r.warnings) console.warn(`i18n-check: warning: ${w}`);
  }
  if (argv.includes('--release')) problems.push(...checkRelease(ROOT, cfg, catalogs));
  for (const p of problems) console.error(`i18n-check: ${p}`);
  if (problems.length > 0) return 1;
  const ids = Object.keys(catalogs);
  console.log(
    `i18n-check: OK (${ids.length + 1} catalogues: en, ${ids.join(', ')}; release: ${cfg.i18n.releaseLocales.join(', ')}; ${warningCount} warnings)`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
}
