// Owner: C (Phase 2b; was content)
// CI re-verification of every shipped record (03 §11.2): structure, uniqueness, grade reproducible
// and tight, band, shape filters, no duplicates, contiguous numbering, hard/breather schedule,
// manifest SHA-256. Exit code 1 on any failure. Also home of the pack file format (03 §9.2) and the
// manifest writer shared by gen-levels and gen-daily.
//
// Usage: tsx scripts/verify-levels.ts [--data src/data] [--no-oracle]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cfg } from '../src/app/config';
import { checkRecord, decodeRegions, decodeSolution, isDailyPack, isLevelPack } from '../src/engine/codec';
import { canonicalKey, shapeOk } from '../src/engine/filters';
import { grade } from '../src/engine/grader';
import { solveRows } from '../src/engine/solver-oracle';
import { countSolutions } from '../src/engine/solver';
import type { DailyPack, GradeBand, LevelPack, LevelRecord, PackManifest } from '../src/engine/types';
import { allowG5Steps, dailySlotFor, isHardLevel, shapeLimits } from '../src/game/ramp';
import { TUTORIAL_RECORD } from '../src/game/tutorial';
import { buildSchedule } from './level-schedule';

// ───────────────────────────── Pack format and manifest (03 §8.1, §9) ─────────────────────────────

export const MANIFEST_FILE = 'levels/manifest.json';

/** A record with the 03 §9.1 key order (i, n, r, s, g, e, h, gv, tut); absent keys are omitted. */
export function orderedRecord(rec: LevelRecord): LevelRecord {
  const out: Partial<LevelRecord> = {};
  if (rec.i !== undefined) out.i = rec.i;
  Object.assign(out, { n: rec.n, r: rec.r, s: rec.s, g: rec.g, e: rec.e, h: rec.h });
  if (rec.gv !== undefined) out.gv = rec.gv;
  if (rec.tut !== undefined) out.tut = rec.tut;
  return out as LevelRecord;
}

/** Compact JSON with one record per line (reviewable diffs; ~1 byte per record of overhead). */
export function formatLevelPack(p: LevelPack): string {
  const head = JSON.stringify({ v: p.v, kind: p.kind, first: p.first, count: p.count, gen: p.gen }).slice(0, -1);
  return `${head},"levels":[\n${p.levels.map((r) => JSON.stringify(orderedRecord(r))).join(',\n')}\n]}\n`;
}

export function formatDailyPack(p: DailyPack): string {
  const head = JSON.stringify({ v: p.v, kind: p.kind, month: p.month, gen: p.gen }).slice(0, -1);
  const days = Object.keys(p.days)
    .sort()
    .map((d) => `${JSON.stringify(d)}:${JSON.stringify(orderedRecord(p.days[d] as LevelRecord))}`);
  return `${head},"days":{\n${days.join(',\n')}\n}}\n`;
}

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export const writeLevelPack = (path: string, p: LevelPack): void => writeText(path, formatLevelPack(p));
export const writeDailyPack = (path: string, p: DailyPack): void => writeText(path, formatDailyPack(p));

export const sha256Hex = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

export function readManifest(dataDir: string): PackManifest | null {
  const path = `${dataDir}/${MANIFEST_FILE}`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as PackManifest;
}

/**
 * Rewrites the manifest: `packs` replaces the level list; `daily` entries replace the same months.
 * Entries whose file no longer exists are dropped. `version` is a hash of all file hashes, so it
 * changes exactly when the content does.
 */
export function updateManifest(
  dataDir: string,
  update: {
    packs?: readonly { file: string; first: number; count: number; bytes: Uint8Array }[];
    daily?: readonly { file: string; month: string; bytes: Uint8Array }[];
  },
): PackManifest {
  const old = readManifest(dataDir);
  const packs = update.packs
    ? update.packs.map((p) => ({ file: p.file, first: p.first, count: p.count, sha256: sha256Hex(p.bytes) }))
    : (old?.packs ?? []);
  const byMonth = new Map((old?.daily ?? []).map((d) => [d.month, d]));
  for (const d of update.daily ?? []) byMonth.set(d.month, { file: d.file, month: d.month, sha256: sha256Hex(d.bytes) });
  const daily = [...byMonth.values()].filter((d) => existsSync(`${dataDir}/${d.file}`)).sort((a, b) => a.month.localeCompare(b.month));
  const all = [...packs.map((p) => p.sha256), ...daily.map((d) => d.sha256)].join('\n');
  const manifest: PackManifest = { v: 1, version: `content-${sha256Hex(all).slice(0, 12)}`, gen: cfg.gen.version, packs, daily };
  writeText(`${dataDir}/${MANIFEST_FILE}`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// ───────────────────────────────────────── Verification ─────────────────────────────────────────

export interface VerifyIssue {
  readonly file: string;
  readonly key: string; // level number or date
  readonly message: string;
}

export interface VerifyOptions {
  /** Cross-check uniqueness with the independent row solver (solver-oracle). Default true. */
  readonly oracle?: boolean;
}

interface Expect {
  readonly band: GradeBand;
  readonly limits: { minRegion: number; maxRegion: number };
  readonly sizes: readonly number[];
}

/** Record-level checks shared by level and daily records; returns the canonical key (or null). */
function verifyRecord(rec: LevelRecord, ex: Expect, oracle: boolean, issue: (m: string) => void): string | null {
  const chk = checkRecord(rec);
  if (!chk.ok) {
    issue(`structure: ${chk.reason}`);
    return null;
  }
  const { n } = rec;
  const regions = decodeRegions(rec.r, n);
  const sol = decodeSolution(rec.s, n);
  const res = countSolutions(n, regions, 2);
  if (res.count !== 1) issue(`${res.count} solutions (expected exactly 1)`);
  else if (res.solutions[0]?.join() !== sol.join()) issue('solver solution differs from s');
  if (oracle && solveRows(n, regions, 2).count !== 1) issue('oracle (row solver) does not find exactly 1 solution');
  if (!ex.sizes.includes(n)) issue(`n=${n} not in the slot's sizes ${ex.sizes.join('/')}`);
  const g = grade(n, regions);
  if (g.grade !== rec.g) issue(`stored g=${rec.g}, grader says ${g.grade}`);
  if (g.effort !== rec.e) issue(`stored e=${rec.e}, grader says ${g.effort}`);
  if (rec.g < ex.band[0] || rec.g > ex.band[1]) issue(`g=${rec.g} outside band G${ex.band[0]}–G${ex.band[1]}`);
  if (g.counts[5] > allowG5Steps(ex.band)) issue(`${g.counts[5]} trial steps (allowed ${allowG5Steps(ex.band)})`);
  if (rec.g >= 2 && grade(n, regions, { maxLevel: (rec.g - 1) as 1 | 2 | 3 | 4 }).grade !== 6) issue('rating not tight: solvable below g');
  if (grade(n, regions, { maxLevel: rec.g }).grade === 6) issue('not solvable with techniques up to g');
  if (!shapeOk(n, regions, ex.limits)) issue(`shape filter (regions ${ex.limits.minRegion}..${ex.limits.maxRegion} cells)`);
  return canonicalKey(n, regions);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function verifyAll(dataDir = 'src/data', opts: VerifyOptions = {}): VerifyIssue[] {
  const oracle = opts.oracle !== false;
  const issues: VerifyIssue[] = [];
  const seen = new Map<string, string>(); // canonical key → where
  const dup = (file: string, key: string, ck: string | null): void => {
    if (ck === null) return;
    const where = seen.get(ck);
    if (where) issues.push({ file, key, message: `duplicate board (same canonical key as ${where})` });
    else seen.set(ck, key);
  };
  const manifest = readManifest(dataDir);
  if (!manifest) return [{ file: MANIFEST_FILE, key: '-', message: 'manifest missing' }];
  const listed = new Set<string>();
  const hashOk = (file: string, sha: string): void => {
    listed.add(file);
    const path = `${dataDir}/${file}`;
    if (!existsSync(path)) issues.push({ file, key: '-', message: 'listed in the manifest but missing' });
    else if (sha256Hex(readFileSync(path)) !== sha) issues.push({ file, key: '-', message: 'SHA-256 does not match the manifest' });
  };
  if (manifest.v !== 1 || manifest.gen === '' || manifest.gen.startsWith('placeholder')) issues.push({ file: MANIFEST_FILE, key: '-', message: `bad manifest header (gen ${manifest.gen})` });

  // Level packs.
  const shipped = cfg.levels.shipped;
  const slots = buildSchedule(shipped);
  const ns: number[] = [];
  let expectFirst = 1;
  for (const entry of [...manifest.packs].sort((a, b) => a.first - b.first)) {
    hashOk(entry.file, entry.sha256);
    const path = `${dataDir}/${entry.file}`;
    if (!existsSync(path)) continue;
    const pack = readJson(path);
    const issue = (key: string, message: string): void => void issues.push({ file: entry.file, key, message });
    if (!isLevelPack(pack)) {
      issue('-', 'not a level pack');
      continue;
    }
    if (pack.first !== expectFirst || pack.first !== entry.first) issue('-', `first=${pack.first}, expected ${expectFirst}`);
    if (pack.count !== pack.levels.length || pack.count !== entry.count) issue('-', 'count mismatch');
    if (!pack.gen.startsWith('mewdoku-gen/')) issue('-', `gen "${pack.gen}" is not ours`);
    pack.levels.forEach((rec, q) => {
      const level = pack.first + q;
      const key = String(level);
      const slot = slots[level - 1];
      if (rec.i !== level) issue(key, `i=${rec.i}, expected ${level}`);
      if (!slot) return void issue(key, `level beyond ${shipped}`);
      if (rec.h !== (isHardLevel(level) ? 1 : 0)) issue(key, `h=${rec.h} does not match the hard schedule`);
      if (level === 1) {
        const t = TUTORIAL_RECORD;
        if (rec.r !== t.r || rec.s !== t.s || rec.tut !== 1 || rec.gv !== '' || rec.e !== t.e) issue(key, 'level 1 is not the tutorial record');
      } else if (rec.tut === 1 || (rec.gv ?? '') !== '') issue(key, 'tut/gv set on a normal level');
      const ex: Expect = { band: slot.band, limits: shapeLimits(rec.n, level, level === 1), sizes: slot.pool.map(([s]) => s) };
      dup(entry.file, `level ${level}`, verifyRecord(rec, ex, oracle, (m) => issue(key, m)));
      ns[level - 1] = rec.n;
      const prev = ns.slice(Math.max(0, level - 3), level - 1);
      if (prev.length === 2 && prev[0] === rec.n && prev[1] === rec.n && slot.pool.some(([s]) => s !== rec.n)) {
        issue(key, `three ${rec.n}×${rec.n} levels in a row`);
      }
    });
    expectFirst = pack.first + pack.levels.length;
  }
  if (expectFirst !== shipped + 1) issues.push({ file: 'levels/', key: '-', message: `levels cover 1..${expectFirst - 1}, expected 1..${shipped}` });

  // Daily packs.
  let prevMonth: string | null = null;
  for (const entry of [...manifest.daily].sort((a, b) => a.month.localeCompare(b.month))) {
    hashOk(entry.file, entry.sha256);
    const path = `${dataDir}/${entry.file}`;
    if (!existsSync(path)) continue;
    const pack = readJson(path);
    const issue = (key: string, message: string): void => void issues.push({ file: entry.file, key, message });
    if (!isDailyPack(pack) || pack.month !== entry.month || entry.file !== `daily/${entry.month}.json`) {
      issue('-', 'not the daily pack the manifest names');
      continue;
    }
    if (prevMonth === null && pack.month !== cfg.daily.firstPackMonth) issue('-', `first month should be ${cfg.daily.firstPackMonth}`);
    if (prevMonth !== null && pack.month !== nextMonth(prevMonth)) issue('-', `gap after ${prevMonth}`);
    prevMonth = pack.month;
    const dates = Object.keys(pack.days).sort();
    const expected = Array.from({ length: daysInMonth(pack.month) }, (_, d) => `${pack.month}-${String(d + 1).padStart(2, '0')}`);
    if (dates.join() !== expected.join()) issue('-', `dates are not exactly ${expected[0]}…${expected[expected.length - 1]}`);
    for (const date of dates) {
      const rec = pack.days[date] as LevelRecord;
      if (rec.i !== undefined || rec.h !== 0 || rec.tut !== undefined) issue(date, 'daily records carry no i/tut and h=0');
      const ws = dailySlotFor(date);
      const ex: Expect = { band: ws.band, limits: shapeLimits(ws.n, null), sizes: [ws.n] };
      dup(entry.file, date, verifyRecord(rec, ex, oracle, (m) => issue(date, m)));
    }
  }

  // Files on disk that the manifest does not list.
  for (const sub of ['levels', 'daily']) {
    const dir = `${dataDir}/${sub}`;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.json') && f !== 'manifest.json' && !listed.has(`${sub}/${f}`)) issues.push({ file: `${sub}/${f}`, key: '-', message: 'not listed in the manifest' });
    }
  }
  return issues;
}

/** "YYYY-MM" + 1 month. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function main(argv: readonly string[]): void {
  const at = argv.indexOf('--data');
  const dataDir = at >= 0 ? (argv[at + 1] ?? 'src/data') : 'src/data';
  const t0 = performance.now();
  const issues = verifyAll(dataDir, { oracle: !argv.includes('--no-oracle') });
  const m = readManifest(dataDir);
  for (const i of issues.slice(0, 200)) process.stderr.write(`${i.file} [${i.key}]: ${i.message}\n`);
  if (issues.length > 200) process.stderr.write(`… and ${issues.length - 200} more\n`);
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`verify-levels: ${m?.packs.length ?? 0} level packs, ${m?.daily.length ?? 0} daily months, ${issues.length} issue(s), ${sec} s\n`);
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
