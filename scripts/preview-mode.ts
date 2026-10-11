// Owner: lead (preview link, 2026-10-11). The PREVIEW build mode (`npm run build:preview` → dist/preview): the owner's
// review link, a static page that shows every Phase 2e feature with honest stand-ins (preview/platform.ts). What
// vite.config.ts does differently in this mode, as pure helpers (tests/unit/build-config.spec.ts):
//   - '@platform' → preview/platform.ts (the only way into preview/; no other build can reach it);
//   - the ranking origin is the in-page sample server's reserved address (`.invalid` never resolves) in the
//     anonymous web mode, whatever the environment says;
//   - __PREVIEW_BUILD__ (when and from which commit it was built: the menu shows it);
//   - the page title says "Preview" and asks search engines to stay away.
// Never a release mode: scripts/release-check.ts fails any other dist that carries the preview's strings.
import { ladderDefine } from './ladder-env.ts';

export const PREVIEW_MODE = 'preview-link';
/** The in-page sample ranking server's origin (preview/sample-server.ts answers it; nothing on the network does). */
export const PREVIEW_SAMPLE_ORIGIN = 'https://sample-ranking.preview.invalid';
export const PREVIEW_PLATFORM_ENTRY = './preview/platform.ts';
export const PREVIEW_OUT_DIR = 'dist/preview';

export function isPreviewMode(mode: string): boolean {
  return mode === PREVIEW_MODE;
}

export interface PreviewBuildStamp {
  readonly at: string;
  readonly sha: string | null;
  readonly version: string;
}

/** The `define` entries of the preview build. */
export function previewDefine(stamp: PreviewBuildStamp): Record<string, string> {
  return {
    ...ladderDefine({ url: PREVIEW_SAMPLE_ORIGIN, web: 'anon', warnings: [] }),
    __PREVIEW_BUILD__: JSON.stringify(stamp),
  };
}

/** index.html of the preview: "Mewdoku · Preview" and noindex (the link is private). */
export function previewHtml(html: string): string {
  return html
    .replace(/<title>([^<]*)<\/title>/, '<title>$1 · Preview</title>')
    .replace('<!--PLATFORM_HEAD-->', '<meta name="robots" content="noindex, nofollow" />\n    <!--PLATFORM_HEAD-->');
}
