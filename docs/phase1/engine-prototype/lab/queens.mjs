// Experimental Queens / 1-star Star Battle (no-touch) engine for research measurements.
// Regions: Int8Array(N*N) with ids 0..N-1. Solution: Int8Array(N), sol[r] = column.

// ---------- PRNG ----------
export function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
export function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0; // uint32
  };
}
export function makeRng(seedStr) {
  const s = cyrb128(seedStr);
  const next = sfc32(s[0], s[1], s[2], s[3]);
  for (let i = 0; i < 15; i++) next();
  return {
    u32: next,
    int(n) { return next() % n; }, // tiny modulo bias acceptable for experiments
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = next() % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
  };
}

const popcnt = (x) => { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

// ---------- Solver A: row-by-row bitmask DFS (count up to limit) ----------
export function solveRows(N, reg, limit = 2, stats) {
  const sols = [];
  const cols = new Int8Array(N);
  // regRowMask[g] bit r set if region g has a cell in row >= r ... we precompute maxRow per region
  const maxRow = new Int8Array(N).fill(-1);
  for (let i = 0; i < N * N; i++) { const r = (i / N) | 0; if (r > maxRow[reg[i]]) maxRow[reg[i]] = r; }
  let nodes = 0;
  function dfs(r, colMask, regMask, prevC) {
    nodes++;
    if (r === N) { sols.push(cols.slice()); return sols.length >= limit; }
    // prune: every unused region must still have a row >= r
    for (let g = 0; g < N; g++) if (!((regMask >> g) & 1) && maxRow[g] < r) return false;
    const base = r * N;
    for (let c = 0; c < N; c++) {
      if ((colMask >> c) & 1) continue;
      if (c === prevC - 1 || c === prevC + 1) continue;
      const g = reg[base + c];
      if ((regMask >> g) & 1) continue;
      cols[r] = c;
      if (dfs(r + 1, colMask | (1 << c), regMask | (1 << g), c)) return true;
    }
    return false;
  }
  dfs(0, 0, 0, -10);
  if (stats) stats.nodes = nodes;
  return sols;
}

// ---------- Solver B: unit-MRV + propagation on row bitmasks (DLX-like "choose most constrained item") ----------
// state: cand[r] = column bitmask of candidate cells in row r; placed rows/cols/regions masks.
export function makeCtx(N, reg) {
  const regRows = Array.from({ length: N }, () => new Int32Array(N)); // regRows[g][r] = col mask of region g in row r
  for (let i = 0; i < N * N; i++) { const r = (i / N) | 0, c = i % N; regRows[reg[i]][r] |= 1 << c; }
  return { N, reg, regRows, full: (1 << N) - 1 };
}
function placeCat(ctx, cand, r, c) {
  const { N, reg, regRows } = ctx;
  const g = reg[r * N + c];
  const colBit = 1 << c, nb = (colBit | (colBit << 1) | (colBit >>> 1)) & ctx.full;
  for (let rr = 0; rr < N; rr++) {
    let m = cand[rr] & ~colBit & ~regRows[g][rr];
    if (rr === r) m = 0;
    else if (rr === r - 1 || rr === r + 1) m &= ~nb;
    cand[rr] = m;
  }
}
export function solveMRV(N, reg, limit = 2, stats) {
  const ctx = makeCtx(N, reg);
  const sols = [];
  const cand0 = new Int32Array(N).fill(ctx.full);
  const sol = new Int8Array(N).fill(-1);
  let nodes = 0;
  // returns true to stop
  function rec(cand, doneRows, doneCols, doneRegs, depth) {
    nodes++;
    if (depth === N) { sols.push(sol.slice()); return sols.length >= limit; }
    // pick most constrained unit
    let best = -1, bestCnt = 99, bestType = 0;
    for (let r = 0; r < N; r++) {
      if ((doneRows >> r) & 1) continue;
      const k = popcnt(cand[r]); if (k === 0) return false;
      if (k < bestCnt) { bestCnt = k; best = r; bestType = 0; }
    }
    for (let c = 0; c < N; c++) {
      if ((doneCols >> c) & 1) continue;
      let k = 0; const bit = 1 << c;
      for (let r = 0; r < N; r++) if (cand[r] & bit) k++;
      if (k === 0) return false;
      if (k < bestCnt) { bestCnt = k; best = c; bestType = 1; }
    }
    for (let g = 0; g < N; g++) {
      if ((doneRegs >> g) & 1) continue;
      let k = 0; const rr = ctx.regRows[g];
      for (let r = 0; r < N; r++) k += popcnt(cand[r] & rr[r]);
      if (k === 0) return false;
      if (k < bestCnt) { bestCnt = k; best = g; bestType = 2; }
    }
    // enumerate candidate cells of chosen unit
    const cells = [];
    if (bestType === 0) { let m = cand[best]; while (m) { const b = m & -m; cells.push(best * N + (31 - Math.clz32(b))); m ^= b; } }
    else if (bestType === 1) { for (let r = 0; r < N; r++) if (cand[r] & (1 << best)) cells.push(r * N + best); }
    else { for (let r = 0; r < N; r++) { let m = cand[r] & ctx.regRows[best][r]; while (m) { const b = m & -m; cells.push(r * N + (31 - Math.clz32(b))); m ^= b; } } }
    for (const cell of cells) {
      const r = (cell / N) | 0, c = cell % N, g = reg[cell];
      const nc = cand.slice();
      placeCat(ctx, nc, r, c);
      sol[r] = c;
      if (rec(nc, doneRows | (1 << r), doneCols | (1 << c), doneRegs | (1 << g), depth + 1)) return true;
      sol[r] = -1;
    }
    return false;
  }
  rec(cand0, 0, 0, 0, 0);
  if (stats) stats.nodes = nodes;
  return sols;
}

// ---------- Generation ----------
// Random permutation with |p[i]-p[i+1]| >= 2 ("king permutation"), uniform-ish via randomized DFS.
export function randomKingPerm(N, rng) {
  const p = new Int8Array(N);
  function dfs(r, used, prev) {
    if (r === N) return true;
    const order = rng.shuffle([...Array(N).keys()]);
    for (const c of order) {
      if ((used >> c) & 1) continue;
      if (c === prev - 1 || c === prev + 1) continue;
      p[r] = c;
      if (dfs(r + 1, used | (1 << c), c)) return true;
    }
    return false;
  }
  if (!dfs(0, 0, -10)) return null;
  return p;
}
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// mode: 'eden' (uniform random frontier cell), 'balanced' (prefer smallest region), 'weighted' (cspuz-like size^-k weights)
export function growRegions(N, perm, rng, mode = 'eden', power = 4) {
  const reg = new Int8Array(N * N).fill(-1);
  const size = new Int32Array(N);
  const ids = rng.shuffle([...Array(N).keys()]);
  for (let r = 0; r < N; r++) { reg[r * N + perm[r]] = ids[r]; size[ids[r]] = 1; }
  let remaining = N * N - N;
  while (remaining > 0) {
    // collect frontier (cell, region)
    const fr = [];
    for (let i = 0; i < N * N; i++) {
      if (reg[i] !== -1) continue;
      const r = (i / N) | 0, c = i % N;
      for (const [dr, dc] of DIRS4) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const g = reg[rr * N + cc];
        if (g !== -1) fr.push(i, g);
      }
    }
    let pick;
    if (mode === 'eden') pick = rng.int(fr.length / 2);
    else if (mode === 'balanced') {
      let minS = 1e9; for (let k = 1; k < fr.length; k += 2) minS = Math.min(minS, size[fr[k]]);
      const opts = []; for (let k = 0; k < fr.length; k += 2) if (size[fr[k + 1]] === minS) opts.push(k / 2);
      pick = opts[rng.int(opts.length)];
    } else { // weighted: integer weights ~ size^-power scaled
      const w = []; let tot = 0;
      for (let k = 1; k < fr.length; k += 2) { const x = Math.max(1, Math.floor(1e6 / Math.pow(size[fr[k]], power))); w.push(x); tot += x; }
      let t = rng.int(tot); pick = 0; while (t >= w[pick]) { t -= w[pick]; pick++; }
    }
    const cell = fr[pick * 2], g = fr[pick * 2 + 1];
    reg[cell] = g; size[g]++; remaining--;
  }
  return reg;
}
function regionConnectedWithout(N, reg, g, excluded) {
  let start = -1, total = 0;
  for (let i = 0; i < N * N; i++) if (reg[i] === g && i !== excluded) { total++; if (start < 0) start = i; }
  if (total === 0) return false;
  const seen = new Uint8Array(N * N); const q = [start]; seen[start] = 1; let cnt = 0;
  while (q.length) {
    const i = q.pop(); cnt++;
    const r = (i / N) | 0, c = i % N;
    for (const [dr, dc] of DIRS4) {
      const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      const j = rr * N + cc; if (!seen[j] && reg[j] === g && j !== excluded) { seen[j] = 1; q.push(j); }
    }
  }
  return cnt === total;
}
// Repair: while a 2nd solution S2 exists, move one of S2's cat cells (not in S1) into an orthogonally adjacent region.
export function repairUnique(N, reg, perm, rng, solver = solveMRV, maxIter = 200) {
  let iters = 0;
  while (iters < maxIter) {
    const sols = solver(N, reg, 2);
    if (sols.length === 1) return { ok: true, iters };
    const s2 = sols.find((s) => s.some((c, r) => c !== perm[r]));
    const moves = [];
    for (let r = 0; r < N; r++) {
      if (s2[r] === perm[r]) continue;
      const cell = r * N + s2[r], g = reg[cell];
      for (const [dr, dc] of DIRS4) {
        const rr = r + dr, cc = s2[r] + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const g2 = reg[rr * N + cc]; if (g2 !== g) moves.push([cell, g, g2]);
      }
    }
    rng.shuffle(moves);
    let done = false;
    for (const [cell, g, g2] of moves) {
      if (!regionConnectedWithout(N, reg, g, cell)) continue;
      reg[cell] = g2; done = true; break;
    }
    if (!done) return { ok: false, iters };
    iters++;
  }
  return { ok: false, iters };
}

// ---------- Human-style grader ----------
// cell status: 1 = candidate, 0 = eliminated, 2 = cat
export function makeGrader(N, reg) {
  const units = []; // each: array of cells
  for (let r = 0; r < N; r++) units.push([...Array(N).keys()].map((c) => r * N + c));
  for (let c = 0; c < N; c++) units.push([...Array(N).keys()].map((r) => r * N + c));
  const regCells = Array.from({ length: N }, () => []);
  for (let i = 0; i < N * N; i++) regCells[reg[i]].push(i);
  for (let g = 0; g < N; g++) units.push(regCells[g]);
  const unitsOf = Array.from({ length: N * N }, (_, i) => [((i / N) | 0), N + (i % N), 2 * N + reg[i]]);
  // attack set: cells eliminated by a cat at i
  const attacks = Array.from({ length: N * N }, (_, i) => {
    const r = (i / N) | 0, c = i % N; const s = new Set();
    for (let j = 0; j < N * N; j++) {
      if (j === i) continue;
      const rj = (j / N) | 0, cj = j % N;
      if (rj === r || cj === c || reg[j] === reg[i] || (Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1)) s.add(j);
    }
    return s;
  });
  return { N, reg, units, unitsOf, attacks };
}
function place(G, st, i) { st[i] = 2; for (const j of G.attacks[i]) if (st[j] === 1) st[j] = 0; }
function unitInfo(G, st, u) { let cats = 0; const cand = []; for (const i of G.units[u]) { if (st[i] === 2) cats++; else if (st[i] === 1) cand.push(i); } return { cats, cand }; }
function contradiction(G, st) {
  for (let u = 0; u < G.units.length; u++) { const { cats, cand } = unitInfo(G, st, u); if (cats > 1 || (cats === 0 && cand.length === 0)) return true; }
  return false;
}
// Each technique returns number of changes (placements or eliminations) or -1 for contradiction.
const T = {
  // L1: unit with exactly one candidate -> place
  single(G, st) {
    for (let u = 0; u < G.units.length; u++) {
      const { cats, cand } = unitInfo(G, st, u);
      if (cats === 0 && cand.length === 0) return -1;
      if (cats === 0 && cand.length === 1) { place(G, st, cand[0]); return 1; }
    }
    return 0;
  },
  // L2: candidates of unit U all inside another single unit V -> remove V's other candidates
  confinement(G, st) {
    let ch = 0;
    for (let u = 0; u < G.units.length; u++) {
      const { cats, cand } = unitInfo(G, st, u); if (cats || cand.length < 2) continue;
      for (let t = 0; t < 3; t++) {
        const v = G.unitsOf[cand[0]][t]; if (v === u) continue;
        if (!cand.every((i) => G.unitsOf[i][t] === v)) continue;
        const inU = new Set(cand);
        for (const j of G.units[v]) if (st[j] === 1 && !inU.has(j)) { st[j] = 0; ch++; }
        if (ch) return ch;
      }
    }
    return ch;
  },
  // L3: a candidate x that attacks every candidate of some other unsatisfied unit cannot be a cat
  attack(G, st) {
    let ch = 0;
    for (let x = 0; x < st.length; x++) {
      if (st[x] !== 1) continue;
      const mine = G.unitsOf[x];
      for (let u = 0; u < G.units.length; u++) {
        if (mine.includes(u)) continue;
        const { cats, cand } = unitInfo(G, st, u); if (cats) continue;
        if (cand.every((i) => G.attacks[x].has(i))) { st[x] = 0; ch++; break; }
      }
      if (ch) return ch;
    }
    return ch;
  },
  // L4: k units of type A whose candidates lie inside exactly k units of type B -> clear other cells of those B units
  pigeon(G, st) {
    const N = G.N;
    const types = [[2, 0], [2, 1], [0, 2], [1, 2], [0, 1], [1, 0]]; // (A,B): region->rows, region->cols, rows->regions, cols->regions, rows->cols, cols->rows
    const open = (t) => { const out = []; for (let k = 0; k < N; k++) { const u = t * N + k; const { cats, cand } = unitInfo(G, st, u); if (!cats) out.push({ u, cand }); } return out; };
    for (let kk = 2; kk <= Math.floor(N / 2) + 1; kk++) {
      for (const [A, B] of types) {
        const As = open(A); if (As.length <= kk) continue;
        const combo = [];
        const rec = (start) => {
          if (combo.length === kk) {
            const Bs = new Set(); const inA = new Set();
            for (const a of combo) for (const i of a.cand) { Bs.add(G.unitsOf[i][B]); inA.add(i); }
            if (Bs.size !== kk) return 0;
            let ch = 0;
            for (const b of Bs) for (const j of G.units[b]) if (st[j] === 1 && !inA.has(j)) { st[j] = 0; ch++; }
            return ch;
          }
          for (let s = start; s < As.length; s++) { combo.push(As[s]); const ch = rec(s + 1); combo.pop(); if (ch) return ch; }
          return 0;
        };
        const ch = rec(0); if (ch) return { ch, k: kk };
      }
    }
    return 0;
  },
};
function propagate(G, st, maxLevel) {
  // apply techniques up to maxLevel to fixpoint; returns false on contradiction
  for (;;) {
    if (contradiction(G, st)) return false;
    let r = T.single(G, st); if (r < 0) return false; if (r) continue;
    if (maxLevel >= 2) { r = T.confinement(G, st); if (r) continue; }
    if (maxLevel >= 3) { r = T.attack(G, st); if (r) continue; }
    if (maxLevel >= 4) { r = T.pigeon(G, st); if (r) continue; }
    return true;
  }
}
export function grade(N, reg) {
  const G = makeGrader(N, reg);
  const st = new Uint8Array(N * N).fill(1);
  const used = { single: 0, confinement: 0, attack: 0, pigeon: 0, pigeonMaxK: 0, trial: 0 };
  let maxLevel = 0;
  for (let guard = 0; guard < 10000; guard++) {
    if (st.every((v) => v !== 1)) break;
    if (contradiction(G, st)) return { solved: false, broken: true, used, maxLevel };
    let r = T.single(G, st); if (r > 0) { used.single++; maxLevel = Math.max(maxLevel, 1); continue; }
    r = T.confinement(G, st); if (r > 0) { used.confinement++; maxLevel = Math.max(maxLevel, 2); continue; }
    r = T.attack(G, st); if (r > 0) { used.attack++; maxLevel = Math.max(maxLevel, 3); continue; }
    r = T.pigeon(G, st); if (r && r.ch) { used.pigeon++; used.pigeonMaxK = Math.max(used.pigeonMaxK, r.k); maxLevel = Math.max(maxLevel, 4); continue; }
    // L5: trial with propagation up to L4 -> eliminate candidates leading to contradiction
    let found = false;
    for (let x = 0; x < N * N && !found; x++) {
      if (st[x] !== 1) continue;
      const tmp = st.slice(); place(G, tmp, x);
      if (!propagate(G, tmp, 4)) { st[x] = 0; found = true; }
    }
    if (found) { used.trial++; maxLevel = Math.max(maxLevel, 5); continue; }
    return { solved: false, used, maxLevel: 6 };
  }
  const cats = st.reduce((a, v) => a + (v === 2), 0);
  return { solved: cats === N, used, maxLevel };
}

// ---------- Encoding ----------
export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function encodeRegions(N, reg) {
  // relabel by first appearance in row-major order (canonical labels)
  const map = new Int8Array(N).fill(-1); let next = 0; let s = '';
  for (let i = 0; i < N * N; i++) { if (map[reg[i]] < 0) map[reg[i]] = next++; s += ALPHA[map[reg[i]]]; }
  return s;
}
export function regionsToString(N, reg) { let out = ''; for (let r = 0; r < N; r++) { for (let c = 0; c < N; c++) out += ALPHA[reg[r * N + c]]; out += '\n'; } return out; }

// Improved repair: targeted move that kills a 2nd solution; if stuck, make a random boundary move
// (never moving a cell that holds an intended-solution cat) and continue.
export function repairUnique2(N, reg, perm, rng, solver = solveMRV, maxIter = 400) {
  const isSolCat = new Uint8Array(N * N); for (let r = 0; r < N; r++) isSolCat[r * N + perm[r]] = 1;
  let iters = 0, escapes = 0;
  while (iters < maxIter) {
    const sols = solver(N, reg, 2);
    if (sols.length === 1) return { ok: true, iters, escapes };
    const s2 = sols.find((s) => s.some((c, r) => c !== perm[r]));
    const moves = [];
    for (let r = 0; r < N; r++) {
      if (s2[r] === perm[r]) continue;
      const cell = r * N + s2[r], g = reg[cell];
      for (const [dr, dc] of DIRS4) {
        const rr = r + dr, cc = s2[r] + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const g2 = reg[rr * N + cc]; if (g2 !== g) moves.push([cell, g, g2]);
      }
    }
    rng.shuffle(moves);
    let done = false;
    for (const [cell, g, g2] of moves) {
      if (!regionConnectedWithout(N, reg, g, cell)) continue;
      reg[cell] = g2; done = true; break;
    }
    if (!done) {
      // escape: random boundary move of a non-solution-cat cell
      const cand = [];
      for (let i = 0; i < N * N; i++) {
        if (isSolCat[i]) continue;
        const r = (i / N) | 0, c = i % N;
        for (const [dr, dc] of DIRS4) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue; const g2 = reg[rr * N + cc]; if (g2 !== reg[i]) cand.push([i, reg[i], g2]); }
      }
      rng.shuffle(cand);
      for (const [cell, g, g2] of cand) { if (!regionConnectedWithout(N, reg, g, cell)) continue; reg[cell] = g2; done = true; break; }
      escapes++;
      if (!done) return { ok: false, iters, escapes };
    }
    iters++;
  }
  return { ok: false, iters, escapes };
}
export { regionConnectedWithout, DIRS4 };
