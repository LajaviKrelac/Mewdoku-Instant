import { makeRng, growRegions, solveMRV } from './queens.mjs';
// Region-first: N random distinct seed cells (not a valid cat placement), grow regions, count solutions (cap 2)
const TR = +process.argv[2] || 2000;
console.log('N | 0 solutions | exactly 1 | >=2   (region-first, eden growth from random seeds)');
for (let N = 5; N <= 12; N++) {
  const rng = makeRng('rf' + N);
  let z = 0, one = 0, many = 0;
  for (let t = 0; t < TR; t++) {
    const cells = rng.shuffle([...Array(N * N).keys()]).slice(0, N);
    // fake "perm": growRegions expects seeds at (r, perm[r]); write a local grower instead
    const reg = new Int8Array(N * N).fill(-1); cells.forEach((c, i) => reg[c] = i);
    let rem = N * N - N;
    while (rem) {
      const fr = [];
      for (let i = 0; i < N * N; i++) { if (reg[i] !== -1) continue; const r = (i / N) | 0, c = i % N;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue; const g = reg[rr * N + cc]; if (g !== -1) fr.push(i, g); } }
      const k = rng.int(fr.length / 2); reg[fr[2 * k]] = fr[2 * k + 1]; rem--;
    }
    const s = solveMRV(N, reg, 2).length;
    if (s === 0) z++; else if (s === 1) one++; else many++;
  }
  console.log([N, (100 * z / TR).toFixed(1) + '%', (100 * one / TR).toFixed(1) + '%', (100 * many / TR).toFixed(1) + '%'].join(' | '));
}
