// Owner: lead. Build modes and platform selection (04 §6.1, §10; phase2b §6.7, §11, §12.1 F0 item 10).
//
// Modes:
//   (default) / production / development  → web build, dist/web, mock ads in dev
//   fbig                                  → Facebook Instant Games build, dist/fbig (+ fbapp-config.json)
//   e2e                                   → web build with test hooks (__E2E__), dist/e2e
//   release                               → web RELEASE build, dist/release-web (public web deploy)
//   release-fbig                          → FBIG RELEASE build, dist/release-fbig (the FB production zip)
// MEWDOKU_E2E=1 also turns the test hooks on in any mode (used by the fbig e2e build).
// Release builds bundle only cfg.i18n.releaseLocales; every other mode bundles all of cfg.i18n.locales
// that have a catalogue (scripts/locale-loaders.ts, the `virtual:mewdoku-locales` module).
//
// First load: assets/index-*.js (the entry) + assets/core-*.js (2d.1 I-4: the first-load modules that lazy
// chunks share, preloaded by index.html; see codeSplitting below) + the first-load stylesheet.
// Lazy chunks (phase2b §11) keep stable names for scripts/size-check.ts:
//   assets/overlay-chunk-*.js   core overlays (O1–O7 + ranking, victory, shop, rank hub, group result)
//   assets/coach-chunk-*.js     O8, the tutorial coach (2d.1 I-4: a first run waits for this one only)
//   assets/celebrate-*.js       the fx chunk (points flight, cat burst, labels, tickers; 2d.1) + its .css
//   assets/board-mouse-*.js     the board's lazy motion (mouse visits, cat sequence, wave; 2d.1) + its .css
//   assets/lazy-art-*.js        the symbols only those two draw (2d.1)
//   assets/events-*.js          src/app/events-chunk.ts: the event screen + event art (C/B/A)
//   assets/fb-social-*.js       src/platform/fb/fb-social.ts: ranking, overlay views, groups, payments (D)
//   assets/social-flows-*.js    src/app/social-flows.ts: rankings hub, event top list, group flows (C)
//   assets/overlay-chunk-*.css, assets/events-chunk-*.css, assets/coach-chunk-*.css, assets/celebrate-*.css,
//   assets/board-mouse-*.css: those chunks' own stylesheets (cssCodeSplit)
//   assets/locale-<id>-*.js     one per bundled non-English catalogue (E)
// Each is reached through ONE dynamic import of its barrel module; nothing in the main bundle may
// import those modules statically (that would pull them into the first load).
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { chunkFileName, isReleaseMode, localeLoaderPlugin } from './scripts/locale-loaders.ts';

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
  const release = isReleaseMode(mode);
  const fb = mode === 'fbig' || mode === 'release-fbig';
  const e2e = mode === 'e2e' || process.env.MEWDOKU_E2E === '1';
  const platformEntry = fb ? './src/platform/fb/index.ts' : './src/platform/web/index.ts';
  const outDir = release ? (fb ? 'dist/release-fbig' : 'dist/release-web') : fb ? 'dist/fbig' : mode === 'e2e' ? 'dist/e2e' : 'dist/web';
  const plugins: Plugin[] = [platformHtml(fb), localeLoaderPlugin(mode, rootDir)];
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
      // 2b integration (04 §9): the overlay and events chunks bring their own stylesheets
      // (src/styles/overlay-chunk.css, events-chunk.css), loaded with the chunk; index.html links
      // only the first-load stylesheet.
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
      rolldownOptions: {
        output: {
          chunkFileNames: (chunk) => chunkFileName(chunk.facadeModuleId),
          // Phase 2d.1 integration I-4 (lead): the first-load modules that lazy chunks share (config, i18n,
          // the sprite, the engine's bit and rng helpers) go into ONE chunk, assets/core-*.js, that
          // index.html preloads next to the entry. Without this group rolldown split them into six small
          // modulepreload chunks (a lazy chunk that needs only i18n or config must not import the whole
          // entry), which cost five extra first-load requests and pushed index.html over its 1 KB row.
          // Only modules of the first load ($initial) are captured, so no lazy code moves into it.
          codeSplitting: { groups: [{ name: 'core', tags: ['$initial'], minShareCount: 2 }] },
        },
      },
    },
    preview: { host: '127.0.0.1' },
    plugins,
  };
});
