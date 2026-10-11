// Owner: G4 (Phase 2e). Builds the ranking server's solution table offline (spec §1.9.2, D-2e-14, critic
// C-7/C-8): src/content/generated/solutions.ts. The Worker never runs the generator; this script runs the
// ROOT engine in Node (read-only use of src/engine, src/game and scripts/gen-pool.ts) with exactly the
// client's device rules (levels-repo.ts: `generate(spec)`, then once `endlessRetrySpec(spec)`; no dedupe).
//
//   npm --prefix server run solutions              build (generation cached in server/node_modules/.cache)
//   npm --prefix server run solutions:check        drift guard (verify, CI): the pack part byte for byte,
//                                                  20 random + 5 endless + 5 substitute + 5 post-pack daily
//                                                  boards re-generated, every board a king permutation
//   options: --workers N (default 2) · --endless-to L (default 3000) · --daily-to YYYY-MM-DD (default
//            2030-12-31) · --fresh (drop older content versions' boards) · --seed S (the check's sample)
//
// What the table holds per id (the set of every board a client can show for it):
//   L2…L<shipped>   the pack board + the substitute board (generated when a pack fails to load)
//   L<shipped+1>…   the endless board (generated on the device)
//   D<first pack month>…<last pack day>   the pack board + the device fallback when it differs
//   D…<daily-to>    the generated board (the client's fallback path after the packs end)
//   E<id>/<i>       the event pack board + the device fallback (eventSpec) when it differs
// Older content versions' boards are kept as extra alternatives (solutions.keepVersions 2).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from '../../src/app/config';
import { checkRecord, isDailyPack, isLevelPack } from '../../src/engine/codec';
import { generate } from '../../src/engine/generator';
import type { DailyPack, GenSpec, LevelPack, LevelRecord } from '../../src/engine/types';
import { eventSpec, isEventPack, validateEventDefs, type EventDef, type EventPack } from '../../src/game/events';
import { dailyRecordIn, dailySpec, endlessRetrySpec, endlessSpec, levelRecordIn, substituteSpec } from '../../src/game/progression';
import { parseArgs, runGenTasks, type GenTask } from '../../scripts/gen-pool';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..');
const ROOT = resolve(SERVER, '..');
const DATA = join(ROOT, 'src', 'data');
const OUT = join(SERVER, 'src', 'content', 'generated', 'solutions.ts');
const CACHE = join(SERVER, 'node_modules', '.cache', 'mewdoku-solutions', 'device-boards.jsonl');
const DAY = 86_400_000;
/** solutions.keepVersions (spec §1.16): older content versions whose boards stay accepted. */
const KEEP_VERSIONS = 2;

export interface TableShape {
  format: 1;
  contentVersions: string[];
  gen: string;
  levels: { first: number; shipped: number; last: number; boards: string };
  daily: { first: string; packLast: string; last: string; boards: string };
  events: { id: string; startUtc: string; endUtc: string; count: number; lives: number; boards: string }[];
}

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
const dateKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (key: string): number => Date.parse(`${key}T00:00:00Z`);

/** The client's device generation: the spec, then once the widened retry spec (levels-repo.ts). */
const deviceTask = (key: string, spec: GenSpec): GenTask => ({ key, specs: [spec, endlessRetrySpec(spec)] });

interface Content {
  version: string;
  packs: Map<number, LevelPack>;
  months: Map<string, DailyPack>;
  events: { def: EventDef; pack: EventPack | null }[];
}

function loadContent(): Content {
  const manifest = readJson(join(DATA, 'levels', 'manifest.json')) as { version: string };
  const packs = new Map<number, LevelPack>();
  for (const f of readdirSync(join(DATA, 'levels')).filter((x) => /^pack-\d{3}\.json$/.test(x)).sort()) {
    const p = readJson(join(DATA, 'levels', f));
    if (!isLevelPack(p)) throw new Error(`${f}: not a level pack`);
    packs.set(Number(f.slice(5, 8)), p);
  }
  const months = new Map<string, DailyPack>();
  for (const f of readdirSync(join(DATA, 'daily')).filter((x) => /^\d{4}-\d{2}\.json$/.test(x)).sort()) {
    const p = readJson(join(DATA, 'daily', f));
    if (!isDailyPack(p)) throw new Error(`${f}: not a daily pack`);
    months.set(p.month, p);
  }
  const { defs, errors } = validateEventDefs(readJson(join(DATA, 'events', 'events.json')));
  if (errors.length > 0) throw new Error(`events.json: ${errors.join('; ')}`);
  const events = defs.map((def) => {
    const file = join(DATA, def.puzzles.file);
    const raw = existsSync(file) ? readJson(file) : null;
    return { def, pack: raw !== null && isEventPack(raw, def.id) ? raw : null };
  });
  return { version: manifest.version, packs, months, events };
}

function packBoard(c: Content, level: number): string | null {
  const k = Math.floor((level - 1) / cfg.levels.packSize);
  const pack = c.packs.get(k);
  const rec = pack ? levelRecordIn(pack, level) : null;
  return rec && checkRecord(rec).ok ? rec.s : null;
}

function dailyPackBoard(c: Content, date: string): string | null {
  const pack = c.months.get(date.slice(0, 7));
  const rec: LevelRecord | null = pack ? dailyRecordIn(pack, date) : null;
  return rec && checkRecord(rec).ok ? rec.s : null;
}

function eventPackBoard(pack: EventPack | null, i: number): string | null {
  const rec = pack ? (pack.puzzles[i] ?? null) : null;
  return rec && (rec.i === undefined || rec.i === i + 1) && checkRecord(rec).ok ? rec.s : null;
}

interface Ranges {
  endlessTo: number;
  dailyFirst: string;
  packLast: string;
  dailyTo: string;
}

function rangesOf(c: Content, endlessTo: number, dailyTo: string): Ranges {
  const monthsSorted = [...c.months.keys()].sort();
  const firstMonth = monthsSorted[0];
  const lastPack = monthsSorted[monthsSorted.length - 1];
  if (!firstMonth || !lastPack) throw new Error('no daily packs');
  const lastDays = Object.keys((c.months.get(lastPack) as DailyPack).days).sort();
  return { endlessTo, dailyFirst: `${firstMonth}-01`, packLast: lastDays[lastDays.length - 1] as string, dailyTo };
}

/** Every device-generated board the table needs, as generation tasks (keys say what they are). */
function deviceTasks(c: Content, r: Ranges): GenTask[] {
  const tasks: GenTask[] = [];
  for (let L = 2; L <= cfg.levels.shipped; L++) tasks.push(deviceTask(`sub:${L}`, substituteSpec(L)));
  for (let L = cfg.levels.shipped + 1; L <= r.endlessTo; L++) tasks.push(deviceTask(`end:${L}`, endlessSpec(L)));
  for (let t = dayMs(r.dailyFirst); t <= dayMs(r.dailyTo); t += DAY) tasks.push(deviceTask(`day:${dateKey(t)}`, dailySpec(dateKey(t))));
  for (const { def } of c.events) {
    for (let i = 0; i < def.puzzles.count; i++) {
      const spec = eventSpec(def, i);
      if (spec) tasks.push(deviceTask(`evt:${def.id}:${i}`, spec));
    }
  }
  return tasks;
}

const join2 = (alts: (string | null | undefined)[]): string => [...new Set(alts.filter((x): x is string => typeof x === 'string' && x !== ''))].join('|');

/** The current version's table from the packs and the device boards (`dev(key)`: null = not generated). */
function assemble(c: Content, r: Ranges, dev: (key: string) => string | null): TableShape {
  const levels: string[] = [];
  for (let L = 2; L <= r.endlessTo; L++) {
    levels.push(L <= cfg.levels.shipped ? join2([packBoard(c, L), dev(`sub:${L}`)]) : join2([dev(`end:${L}`)]));
  }
  const dailies: string[] = [];
  for (let t = dayMs(r.dailyFirst); t <= dayMs(r.dailyTo); t += DAY) {
    const d = dateKey(t);
    dailies.push(join2([d <= r.packLast ? dailyPackBoard(c, d) : null, dev(`day:${d}`)]));
  }
  const events = c.events.map(({ def, pack }) => {
    const boards: string[] = [];
    for (let i = 0; i < def.puzzles.count; i++) boards.push(join2([eventPackBoard(pack, i), dev(`evt:${def.id}:${i}`)]));
    return { id: def.id, startUtc: def.startUtc, endUtc: def.endUtc, count: def.puzzles.count, lives: def.rules?.hearts ?? cfg.hearts.perAttempt, boards: boards.join(',') };
  });
  return {
    format: 1,
    contentVersions: [c.version],
    gen: cfg.gen.version,
    levels: { first: 2, shipped: cfg.levels.shipped, last: r.endlessTo, boards: levels.join(',') },
    daily: { first: r.dailyFirst, packLast: r.packLast, last: r.dailyTo, boards: dailies.join(',') },
    events,
  };
}

/** Reads the committed table (null when absent or unreadable). */
export function readTable(path = OUT): TableShape | null {
  if (!existsSync(path)) return null;
  const m = /export const SOLUTIONS: SolutionTableData = (\{[\s\S]*\});\s*$/.exec(readFileSync(path, 'utf8'));
  if (!m) return null;
  try {
    return JSON.parse(m[1] as string) as TableShape;
  } catch {
    return null;
  }
}

const unionEntries = (a: string, b: string): string => {
  const x = a.split(',');
  const y = b.split(',');
  return x.map((e, i) => join2([...e.split('|'), ...(y[i] ?? '').split('|')])).join(',');
};

/** Keeps an older version's boards as extra alternatives (same ranges only; else the old table is dropped). */
function mergeOld(cur: TableShape, old: TableShape | null, keep: number): TableShape {
  if (!old || old.contentVersions[0] === cur.contentVersions[0]) return { ...cur, contentVersions: old ? old.contentVersions.slice(0, 1 + keep) : cur.contentVersions };
  const sameRanges =
    old.levels.first === cur.levels.first && old.levels.last === cur.levels.last && old.daily.first === cur.daily.first && old.daily.last === cur.daily.last;
  if (!sameRanges) return cur;
  return {
    ...cur,
    contentVersions: [cur.contentVersions[0] as string, ...old.contentVersions].slice(0, 1 + keep),
    levels: { ...cur.levels, boards: unionEntries(cur.levels.boards, old.levels.boards) },
    daily: { ...cur.daily, boards: unionEntries(cur.daily.boards, old.daily.boards) },
    events: cur.events.map((e) => {
      const o = old.events.find((x) => x.id === e.id && x.count === e.count);
      return o ? { ...e, boards: unionEntries(e.boards, o.boards) } : e;
    }),
  };
}

function render(t: TableShape): string {
  return [
    '// Owner: G4 (Phase 2e). GENERATED by server/scripts/build-solutions.ts — do not edit by hand.',
    '// Every board a client can show for each scored puzzle id (spec §1.9.2): "," between ids, "|" between',
    '// alternatives; `npm --prefix server run solutions:check` fails when this drifts from the packs or the engine.',
    "import type { SolutionTableData } from '../lookup';",
    '',
    `export const SOLUTIONS: SolutionTableData = ${JSON.stringify(t, null, 1)};`,
    '',
  ].join('\n');
}

function isKing(s: string): boolean {
  const n = s.length;
  if (n < 4 || n > 12) return false;
  const used = new Set<number>();
  let prev = -10;
  for (const ch of s) {
    const c = parseInt(ch, 36);
    if (!(c >= 0 && c < n) || used.has(c) || Math.abs(c - prev) < 2) return false;
    used.add(c);
    prev = c;
  }
  return true;
}

/** Generates one device board in this thread (the check's samples). */
function deviceBoard(task: GenTask): string | null {
  for (const spec of task.specs) {
    const res = generate(spec);
    if (res.ok) return res.record.s;
  }
  return null;
}

/** A tiny deterministic sampler for the check (seeded, printed, reproducible). */
function sampler(seed: number): (n: number) => number {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s % n;
  };
}

export function check(table: TableShape, c: Content, seed: number, log: (s: string) => void): string[] {
  const problems: string[] = [];
  const r = rangesOf(c, table.levels.last, table.daily.last);
  if (table.contentVersions[0] !== c.version) problems.push(`table is for ${table.contentVersions[0]}, the packs are ${c.version}: run \`npm --prefix server run solutions\``);
  if (table.gen !== cfg.gen.version) problems.push(`table generator ${table.gen} ≠ engine ${cfg.gen.version}: rebuild`);
  if (table.daily.packLast !== r.packLast || table.daily.first !== r.dailyFirst) problems.push(`daily pack range ${table.daily.first}…${table.daily.packLast} ≠ packs ${r.dailyFirst}…${r.packLast}`);
  const levels = table.levels.boards.split(',');
  const dailies = table.daily.boards.split(',');
  if (levels.length !== table.levels.last - table.levels.first + 1) problems.push(`levels: ${levels.length} entries for ${table.levels.first}…${table.levels.last}`);
  const days = Math.round((dayMs(table.daily.last) - dayMs(table.daily.first)) / DAY) + 1;
  if (dailies.length !== days) problems.push(`daily: ${dailies.length} entries for ${days} days`);
  // 1. Pack part byte for byte: the first alternative of every pack id is the pack's board.
  for (let L = 2; L <= cfg.levels.shipped; L++) {
    const want = packBoard(c, L);
    const got = (levels[L - 2] ?? '').split('|')[0];
    if (want !== null && got !== want) problems.push(`L${L}: table ${got} ≠ pack ${want}`);
  }
  for (let t = dayMs(r.dailyFirst); t <= dayMs(r.packLast); t += DAY) {
    const d = dateKey(t);
    const want = dailyPackBoard(c, d);
    const got = (dailies[Math.round((t - dayMs(table.daily.first)) / DAY)] ?? '').split('|')[0];
    if (want !== null && got !== want) problems.push(`D${d}: table ${got} ≠ pack ${want}`);
  }
  for (const { def, pack } of c.events) {
    const e = table.events.find((x) => x.id === def.id);
    if (!e) {
      problems.push(`event ${def.id}: missing`);
      continue;
    }
    if (e.startUtc !== def.startUtc || e.endUtc !== def.endUtc || e.count !== def.puzzles.count) problems.push(`event ${def.id}: window or count drifted`);
    const boards = e.boards.split(',');
    for (let i = 0; i < def.puzzles.count; i++) {
      const want = eventPackBoard(pack, i);
      if (want !== null && (boards[i] ?? '').split('|')[0] !== want) problems.push(`E${def.id}/${i}: pack board drifted`);
    }
  }
  // 2. Every board a king permutation.
  const all = [...levels, ...dailies, ...table.events.flatMap((e) => e.boards.split(','))];
  let bad = 0;
  for (const entry of all) for (const b of entry.split('|')) if (!isKing(b)) bad++;
  if (bad > 0) problems.push(`${bad} board(s) are not king permutations`);
  // 3. Generated boards re-generated with the client's rules.
  const pick = sampler(seed);
  const samples: { key: string; id: string; entry: string; spec: GenSpec }[] = [];
  const endless = (L: number): void => void samples.push({ key: `end:${L}`, id: `L${L}`, entry: levels[L - 2] ?? '', spec: endlessSpec(L) });
  const sub = (L: number): void => void samples.push({ key: `sub:${L}`, id: `L${L} (substitute)`, entry: levels[L - 2] ?? '', spec: substituteSpec(L) });
  const day = (d: string): void =>
    void samples.push({ key: `day:${d}`, id: `D${d}`, entry: dailies[Math.round((dayMs(d) - dayMs(table.daily.first)) / DAY)] ?? '', spec: dailySpec(d) });
  const endlessN = table.levels.last - cfg.levels.shipped;
  const postPackDays = Math.round((dayMs(table.daily.last) - dayMs(r.packLast)) / DAY);
  for (let i = 0; i < 5 && endlessN > 0; i++) endless(cfg.levels.shipped + 1 + pick(endlessN));
  for (let i = 0; i < 5; i++) sub(2 + pick(cfg.levels.shipped - 1));
  for (let i = 0; i < 5 && postPackDays > 0; i++) day(dateKey(dayMs(r.packLast) + (1 + pick(postPackDays)) * DAY));
  const kinds = [
    () => endlessN > 0 && endless(cfg.levels.shipped + 1 + pick(endlessN)),
    () => sub(2 + pick(cfg.levels.shipped - 1)),
    () => day(dateKey(dayMs(table.daily.first) + pick(days) * DAY)),
  ];
  for (let i = 0; i < 20; i++) (kinds[pick(kinds.length)] as () => unknown)();
  const t0 = Date.now();
  for (const s of samples) {
    const board = deviceBoard(deviceTask(s.key, s.spec));
    if (board === null) problems.push(`${s.id}: the generator found no board (the client would fail too)`);
    else if (!s.entry.split('|').includes(board)) problems.push(`${s.id}: generated ${board} is not in the table (${s.entry})`);
  }
  log(`solutions:check: ${samples.length} generated boards re-made in ${((Date.now() - t0) / 1000).toFixed(1)} s (seed ${seed})`);
  return problems;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const log = (s: string): void => console.log(s);
  const c = loadContent();
  if (args.flag('--check')) {
    const table = readTable();
    if (!table) {
      console.error('solutions:check: no table at src/content/generated/solutions.ts; run `npm --prefix server run solutions`');
      return 1;
    }
    const seed = args.num('--seed') ?? (Date.now() % 1_000_000_007);
    const problems = check(table, c, seed, log);
    if (problems.length > 0) {
      console.error(`solutions:check: ${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
      return 1;
    }
    log(`solutions:check: ok (${table.contentVersions.join(', ')}; levels ≤ L${table.levels.last}, dailies ≤ ${table.daily.last}, ${table.events.length} events)`);
    return 0;
  }
  const r = rangesOf(c, args.num('--endless-to') ?? 3000, args.str('--daily-to') ?? '2030-12-31');
  const tasks = deviceTasks(c, r);
  const workers = args.num('--workers') ?? 2;
  const results = await runGenTasks(tasks, { workers, cachePath: CACHE, log, label: 'solutions' });
  const dev = (key: string): string | null => results.get(key)?.record.s ?? null;
  const table = mergeOld(assemble(c, r, dev), args.flag("--fresh") ? null : readTable(), KEEP_VERSIONS);
  const text = render(table);
  writeFileSync(OUT, text);
  const differ = {
    sub: tasks.filter((t) => t.key.startsWith('sub:') && dev(t.key) !== packBoard(c, Number(t.key.slice(4)))).length,
    dayFallback: tasks.filter((t) => t.key.startsWith('day:') && t.key.slice(4) <= r.packLast && dev(t.key) !== dailyPackBoard(c, t.key.slice(4))).length,
  };
  log(
    `solutions: wrote ${OUT} (${(text.length / 1024).toFixed(1)} KB; ${tasks.length} device boards; ${differ.sub} substitutes and ${differ.dayFallback} pack-range daily fallbacks differ from their packs)`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.stack ?? err.message : String(err));
      process.exit(1);
    },
  );
}
