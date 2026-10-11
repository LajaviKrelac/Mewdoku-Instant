// Owner: G4 (Phase 2e). The server's tests (spec §10.2): Node, node:sqlite in memory with the real
// migrations, a fake clock, test secrets. `npm --prefix server test -- nick` runs the name blocklist test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
});
