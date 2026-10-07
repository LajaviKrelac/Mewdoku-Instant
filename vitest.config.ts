// Owner: foundation. Test projects (04 §3, §11).
//   unit     → tests/unit/** in Node (engine, game, platform, app, layering)
//   dom      → tests/unit/ui/** and tests/unit/shell/** in jsdom
//   property → tests/property/** in Node (slow: every shipped record)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@platform': fileURLToPath(new URL('./src/platform/web/index.ts', import.meta.url)) },
  },
  define: {
    __PLATFORM__: JSON.stringify('web'),
    __E2E__: JSON.stringify(false),
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.spec.ts'],
          exclude: ['tests/unit/ui/**', 'tests/unit/shell/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/unit/ui/**/*.spec.ts', 'tests/unit/shell/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'property',
          environment: 'node',
          include: ['tests/property/**/*.spec.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
