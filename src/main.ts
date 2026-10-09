// Owner: C (Phase 2b; was app)
// Entry (04 §3, §8): window.onerror / unhandledrejection → js_error analytics + a non-blocking toast
// (the game keeps running), create the platform from '@platform', run boot(). boot() mounts the SVG
// sprite right after platform.init() (04 §5.1).
// If boot fails (no SDK, or init / start rejected twice, PLAT-8) nothing is playable, so the page
// says so plainly and offers a reload; it never shows the "you can keep playing" toast copy.
import './styles/tokens.css';
import './styles/base.css';
import './styles/board.css';
import './styles/hud.css';
import './styles/overlays.css';
import './styles/fx.css';
// phase2b F0: new stylesheets, each filled by its owner (A art.css, B screens.css, E i18n.css).
import './styles/art.css';
import './styles/screens.css';
import './styles/i18n.css';
import { createPlatform } from '@platform';
import { boot, showBootFailure, type AppHandle } from './app/boot';
import { t } from './i18n';

let app: AppHandle | null = null;
let lastToastAt = -Infinity;
const TOAST_GAP_MS = 5000; // at most one error toast per few seconds

function reportError(where: string, error: unknown): void {
  console.error(`[mewdoku] ${where}`, error);
  if (!app) return;
  app.bus.emit('analytics', { name: 'js_error', params: { where } });
  const now = Date.now();
  if (now - lastToastAt >= TOAST_GAP_MS) {
    lastToastAt = now;
    app.router.toast(t('toast.error'));
  }
}

function describe(source: unknown): string {
  if (source instanceof Error) return source.name || 'Error';
  return typeof source === 'string' ? 'message' : 'unknown';
}

window.addEventListener('error', (ev) => {
  if (!(ev.error ?? ev.message)) return; // resource load errors carry neither
  reportError(`onerror:${describe(ev.error ?? ev.message)}`.slice(0, 40), ev.error ?? ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  reportError(`rejection:${describe(ev.reason)}`.slice(0, 40), ev.reason);
});

const root = document.getElementById('app');
if (root) {
  root.dataset.platform = __PLATFORM__;
  boot(createPlatform(), root, { search: window.location.search })
    .then((handle) => {
      app = handle;
    })
    .catch((err: unknown) => {
      console.error('[mewdoku] boot failed', err);
      showBootFailure(root);
    });
}
