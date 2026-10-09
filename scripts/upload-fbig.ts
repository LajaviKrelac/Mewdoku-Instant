// Owner: D (Phase 2b; was platform)
// Phase 4: Graph API upload (05 §12): app token from FB_APP_ID / FB_APP_SECRET (env only), then
// POST graph-video.facebook.com/{app_id}/assets with type=BUNDLE.
//
// Usage: tsx scripts/upload-fbig.ts [zip] [--comment "text"] [--dry-run] [--preview]
//   zip       defaults to the newest release zip, dist-zip/*-fbig-<version>-<sha>.zip (phase2b: never a
//             *-fbig-preview-* zip unless --preview is given)
//   env       FB_APP_ID (required); FB_UPLOAD_TOKEN, or FB_APP_SECRET to mint an app token.
// Secrets are read from the environment only and are never printed. The resumable flow in Meta's
// uploader is unverified and not used (05 §12). After the upload, the build sits in Web Hosting as
// "Standby" until it is pushed to production by hand.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GRAPH_TOKEN_URL = 'https://graph.facebook.com/oauth/access_token';
export const GRAPH_UPLOAD_URL = (appId: string): string => `https://graph-video.facebook.com/${encodeURIComponent(appId)}/assets`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface UploadEnv {
  readonly appId: string;
  readonly appSecret?: string;
  readonly token?: string;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): UploadEnv {
  const appId = (env.FB_APP_ID ?? '').trim();
  if (!appId) throw new Error('upload-fbig: FB_APP_ID is not set');
  const token = (env.FB_UPLOAD_TOKEN ?? '').trim();
  const appSecret = (env.FB_APP_SECRET ?? '').trim();
  if (!token && !appSecret) throw new Error('upload-fbig: set FB_UPLOAD_TOKEN, or FB_APP_SECRET to mint an app token');
  return { appId, ...(token ? { token } : {}), ...(appSecret ? { appSecret } : {}) };
}

/** App access token via the client-credentials grant (05 §12). */
async function appToken(env: UploadEnv, fetchFn: typeof fetch): Promise<string> {
  if (env.token) return env.token;
  const url = new URL(GRAPH_TOKEN_URL);
  url.searchParams.set('client_id', env.appId);
  url.searchParams.set('client_secret', env.appSecret ?? '');
  url.searchParams.set('grant_type', 'client_credentials');
  const res = await fetchFn(url, { method: 'GET' });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !body.access_token) throw new Error(`upload-fbig: token request failed (${res.status}) ${body.error?.message ?? ''}`.trim());
  return body.access_token;
}

/** The newest release zip (dist-zip/*-fbig-*.zip that is not a preview), or with `preview` the newest preview zip; null if none. */
export function latestZip(dir = join(ROOT, 'dist-zip'), opts: { preview?: boolean } = {}): string | null {
  if (!existsSync(dir)) return null;
  const want = opts.preview ? /-fbig-preview-.*\.zip$/ : /-fbig-(?!preview-).*\.zip$/;
  const zips = readdirSync(dir)
    .filter((f) => want.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return zips[0] ?? null;
}

export async function uploadBundle(
  zipPath: string,
  comment: string,
  deps: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {},
): Promise<void> {
  if (!existsSync(zipPath)) throw new Error(`upload-fbig: ${zipPath} not found (run "npm run zip:fbig")`);
  const env = readEnv(deps.env);
  const fetchFn = deps.fetch ?? fetch;
  const token = await appToken(env, fetchFn);

  const form = new FormData();
  form.set('access_token', token);
  form.set('type', 'BUNDLE');
  form.set('comment', comment);
  form.set('asset', new Blob([readFileSync(zipPath)], { type: 'application/zip' }), basename(zipPath));

  const res = await fetchFn(GRAPH_UPLOAD_URL(env.appId), { method: 'POST', body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload-fbig: upload failed (${res.status}): ${text.slice(0, 500)}`);
  let ok = true;
  try {
    ok = (JSON.parse(text) as { success?: boolean }).success !== false;
  } catch {
    /* non-JSON success body */
  }
  if (!ok) throw new Error(`upload-fbig: upload rejected: ${text.slice(0, 500)}`);
}

function defaultComment(zipPath: string): string {
  // <name>-fbig-<version>-<sha>.zip → "<version> <sha>" (05 §12)
  const m = /-fbig-(.+)-([^-]+)\.zip$/.exec(basename(zipPath));
  return m ? `${m[1]} ${m[2]}` : basename(zipPath);
}

export async function main(argv: readonly string[]): Promise<void> {
  try {
    const flagIdx = argv.indexOf('--comment');
    const comment = flagIdx >= 0 ? argv[flagIdx + 1] : undefined;
    const positional = argv.filter((a, i) => !a.startsWith('--') && (flagIdx < 0 || i !== flagIdx + 1));
    const preview = argv.includes('--preview');
    const zip = positional[0] ? resolve(positional[0]) : latestZip(undefined, { preview });
    if (!zip) {
      throw new Error(
        preview
          ? 'upload-fbig: no dist-zip/*-fbig-preview-*.zip found (run "npm run zip:fbig -- --preview")'
          : 'upload-fbig: no release zip dist-zip/*-fbig-*.zip found (run "npm run build:release", then "npm run zip:fbig")',
      );
    }
    const text = comment ?? defaultComment(zip);
    if (argv.includes('--dry-run')) {
      const env = readEnv();
      console.log(`would upload ${zip} (${statSync(zip).size} bytes) to app ${env.appId} with comment "${text}"`);
      return;
    }
    await uploadBundle(zip, text);
    console.log(`uploaded ${basename(zip)}; push it from Standby to production in the App Dashboard (05 §12)`);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main(process.argv.slice(2));
