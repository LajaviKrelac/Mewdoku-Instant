// Owner: lead (Phase 2e, spec §8.2 step 4, §11.6). The ranking probe's page: starts the Instant Game (SDK 8.0:
// initializeAsync → setLoadingProgress → startGameAsync), runs the six steps of ./run-probe.ts against the staging
// server baked in at build time (scripts/rank-probe.ts), shows each result and offers "Copy results" / "Run again".
/// <reference path="./probe-env.d.ts" />
import { reportText, runProbe, type ProbeReport, type ProbeSdk } from './run-probe';

type Sdk = ProbeSdk & { initializeAsync(): Promise<void>; setLoadingProgress(p: number): void; startGameAsync(): Promise<void> };

const sdk = (window as unknown as { FBInstant?: Sdk }).FBInstant ?? null;
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function render(r: ProbeReport | null, note = ''): void {
  const list = $('lines');
  list.textContent = '';
  if (r) {
    for (const l of r.lines) {
      const li = document.createElement('li');
      li.dataset.state = l.state;
      const tag = document.createElement('b');
      tag.textContent = `${l.state === 'ok' ? 'OK' : l.state === 'fail' ? 'FAIL' : l.state === 'skip' ? 'SKIP' : 'INFO'} ${l.step}`;
      li.append(tag, document.createTextNode(` ${l.text}`));
      list.appendChild(li);
    }
  }
  ($('text') as HTMLTextAreaElement).value = r ? reportText(r) : note;
  $('status').textContent = note || (r ? `${r.lines.filter((l) => l.state === 'ok').length} of 5 steps OK` : '');
}

async function run(): Promise<void> {
  ($('again') as HTMLButtonElement).disabled = true;
  render(null, 'Running…');
  const r = await runProbe({
    baseUrl: __PROBE_URL__,
    sdk,
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    origin: typeof self !== 'undefined' && 'origin' in self ? String(self.origin) : location.origin,
    referrer: document.referrer,
    probeVersion: __PROBE_VERSION__,
    clientVersion: __PROBE_CLIENT_VERSION__,
    contentVersion: __PROBE_CONTENT_VERSION__,
  });
  render(r);
  (window as unknown as { __probe?: ProbeReport }).__probe = r;
  ($('again') as HTMLButtonElement).disabled = false;
}

$('copy').addEventListener('click', () => {
  const ta = $('text') as HTMLTextAreaElement;
  const done = (): void => {
    $('copy').textContent = 'Copied';
    setTimeout(() => ($('copy').textContent = 'Copy results'), 1500);
  };
  const fallback = (): void => {
    ta.select();
    document.execCommand('copy');
    done();
  };
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, fallback);
  else fallback();
});
$('again').addEventListener('click', () => void run());
$('target').textContent = `Server: ${__PROBE_URL__}`;

async function start(): Promise<void> {
  if (sdk) {
    try {
      await sdk.initializeAsync();
      sdk.setLoadingProgress(100);
      await sdk.startGameAsync();
    } catch (err) {
      $('status').textContent = `FBInstant start failed: ${String((err as { code?: string; message?: string } | null)?.code ?? (err as Error | null)?.message ?? err)}`;
    }
  }
  await run();
}
void start();
