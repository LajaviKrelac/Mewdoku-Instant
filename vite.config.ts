// Owner: foundation. Build modes and platform selection (04 §6.1, §10).
//
// Modes:
//   (default) / production / development  → web build, dist/web, mock ads in dev
//   fbig                                  → Facebook Instant Games build, dist/fbig (+ fbapp-config.json)
//   e2e                                   → web build with test hooks (__E2E__), dist/e2e
// MEWDOKU_E2E=1 also turns the test hooks on in any mode (used by the fbig e2e build).
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** Pinned FB SDK (05 §2). */
export const FB_SDK_URL = 'https://connect.facebook.net/en_US/fbinstant.8.0.js';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { version: string };

/** Injects the platform head (FB SDK tag in fbig mode) and copies fbapp-config.json after an fbig build. */
function platformHtml(fb: boolean): Plugin {
  let outDir = '';
  return {
    name: 'platform-html',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      const head = fb ? `<script src="${FB_SDK_URL}"></script>` : '';
      return html.replace('<!--PLATFORM_HEAD-->', head);
    },
    closeBundle() {
      if (!fb) return;
      const src = resolve(rootDir, 'platform-assets/fbig/fbapp-config.json');
      if (existsSync(src) && existsSync(outDir)) copyFileSync(src, resolve(outDir, 'fbapp-config.json'));
    },
  };
}

export default defineConfig(({ mode, command, isPreview }) => {
  const fb = mode === 'fbig';
  const e2e = mode === 'e2e' || process.env.MEWDOKU_E2E === '1';
  const platformEntry = fb ? './src/platform/fb/index.ts' : './src/platform/web/index.ts';
  const outDir = fb ? 'dist/fbig' : mode === 'e2e' ? 'dist/e2e' : 'dist/web';
  const plugins: Plugin[] = [platformHtml(fb)];
  // HTTPS for the FB embed player (05 §11), dev server only (preview stays HTTP for Playwright).
  if (fb && command === 'serve' && !isPreview) plugins.push(basicSsl());

  return {
    base: './', // relative URLs: required inside the FB zip
    define: {
      __PLATFORM__: JSON.stringify(fb ? 'fbig' : 'web'),
      __E2E__: JSON.stringify(e2e),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: { '@platform': fileURLToPath(new URL(platformEntry, import.meta.url)) },
    },
    worker: { format: 'es' },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: !fb, // no maps in the FB zip
      assetsInlineLimit: 0, // keep packs and the font as files
      cssCodeSplit: false,
      modulePreload: { polyfill: false },
    },
    preview: { host: '127.0.0.1' },
    plugins,
  };
});
