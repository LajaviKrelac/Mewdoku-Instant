// Owner: lead (Phase 2d.1 integration I-4, 2026-10-10)
// The tutorial coach (O8) as its own small lazy chunk. A first run shows the tutorial board with its
// coach, so boot waits for the coach before startGameAsync (boot.overlayTimeoutMs). Until 2d.1 that
// wait fetched the whole overlay chunk (every overlay, about 52 KB of JS and 29 KB of CSS) after the
// main bundle; on Slow 4G with FB serving files uncompressed that serial download was about 1 s of the
// first run (STATUS-2d §5). Now boot waits for this chunk only (the coach, the rich-text styles it
// shares with the hint card and How to play), and the overlay chunk loads after the first screen
// (boot step 8). The router's default overlay loader loads both chunks together, so every overlay
// that prints rich text finds its styles here (router.ts loadOverlayChunk).
// Its stylesheet comes with it (cssCodeSplit, as the overlay chunk's): src/styles/coach-chunk.css.
import '../styles/coach-chunk.css';

export { createCoach } from '../ui/overlays/coach';
