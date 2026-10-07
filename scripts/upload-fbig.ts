// Owner: platform
// Phase 4: Graph API upload (05 §12): app token from FB_APP_ID / FB_APP_SECRET (env only), then
// POST graph-video.facebook.com/{app_id}/assets with type=BUNDLE.
import { pathToFileURL } from 'node:url';

export async function uploadBundle(zipPath: string, comment: string): Promise<void> {
  throw new Error('not implemented: uploadBundle');
}

export async function main(argv: readonly string[]): Promise<void> {
  throw new Error('not implemented: upload-fbig main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main(process.argv.slice(2));
