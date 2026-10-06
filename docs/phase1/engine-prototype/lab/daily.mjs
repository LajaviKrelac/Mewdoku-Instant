import { makeRng, randomKingPerm, growRegions, repairUnique2, grade, encodeRegions, regionsToString, solveMRV } from './queens.mjs';
function daily(dateStr, N, version = 'v1') {
  const rng = makeRng(`meow:${version}:${dateStr}:${N}`);
  for (let attempt = 0; ; attempt++) {
    const perm = randomKingPerm(N, rng);
    const reg = growRegions(N, perm, rng, 'eden');
    if (repairUnique2(N, reg, perm, rng).ok) return { reg, perm, attempt };
  }
}
const a = daily('2026-10-06', 8), b = daily('2026-10-06', 8);
const ea = encodeRegions(8, a.reg), eb = encodeRegions(8, b.reg);
console.log('deterministic:', ea === eb);
console.log(regionsToString(8, a.reg));
const solStr = Array.from(a.perm).map((c) => c.toString(36)).join('');
console.log('regions (canonical labels):', ea, `(${ea.length} chars)`);
console.log('solution (col per row, base36):', solStr);
console.log('grade:', JSON.stringify(grade(8, a.reg)));
// border-bit encoding size: vertical walls N*(N-1) + horizontal walls (N-1)*N bits
for (const N of [5, 8, 10, 12]) { const bits = 2 * N * (N - 1); console.log(`N=${N}: letters ${N * N} chars; wall bits ${bits} -> base64 ${Math.ceil(bits / 6)} chars; packed region ids ${Math.ceil(N * N * Math.ceil(Math.log2(N)) / 8)} bytes`); }
