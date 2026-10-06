// count permutations p of [0..N) with |p[i]-p[i+1]| != 1 (one cat per row/col, no touching)
for (let N = 1; N <= 12; N++) {
  const t0 = performance.now();
  let count = 0; const full = (1 << N) - 1;
  const dfs = (r, used, prev) => {
    if (r === N) { count++; return; }
    let avail = full & ~used;
    if (prev >= 0) avail &= ~((1 << (prev + 1)) | (prev > 0 ? 1 << (prev - 1) : 0));
    while (avail) { const b = avail & -avail; avail ^= b; dfs(r + 1, used | b, 31 - Math.clz32(b)); }
  };
  dfs(0, 0, -1);
  console.log(N, count, (performance.now() - t0).toFixed(0) + 'ms');
}
