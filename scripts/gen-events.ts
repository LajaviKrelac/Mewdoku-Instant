// Owner: C
// Generates the event packs (phase2b §4.2): for each def in src/data/events/events.json, `count`
// LevelRecords with our engine, seeds `mewdoku:event:v1:<id>:<i>`, the def's size weights and grade
// band, a duplicate check against the shipped level and daily packs; writes src/data/events/<id>.json.
// Deterministic. Run with `npm run events:gen`. scripts/verify-levels.ts verifies the output.
// F0 stub: exits 1 until C implements it.
import { pathToFileURL } from 'node:url';

export interface GenEventsOptions {
  readonly ids?: readonly string[];
  readonly workers?: number;
  readonly noCache?: boolean;
}

export async function genEvents(opts: GenEventsOptions = {}): Promise<void> {
  void opts;
  throw new Error('not implemented: genEvents (C, phase2b §4.2)');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  genEvents().catch((err: unknown) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
