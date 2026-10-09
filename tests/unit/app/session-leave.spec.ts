// Owner: R (2b review fixes). PERF-1: a session start answers the tap before the board is built —
// it asks the router to begin leaving the current screen (the outgoing half of the §2.9 transition),
// loads, then builds the board only once that frame is drawn.
import { describe, expect, it } from 'vitest';
import { createHarness, startLevel, tapRanking, winGame } from './harness';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('session start: the tap is answered before the build (PERF-1)', () => {
  it('begins leaving at once, and builds the board only after the router says the frame is drawn', async () => {
    const h = createHarness();
    const gate = deferred();
    h.router.leaveWait = () => gate.promise;
    const started = h.session.start({ mode: 'level', level: 5 });
    expect(h.router.leaves).toEqual(['game']); // synchronously, in the tap's own task
    await h.settle(0);
    expect(h.log.some((l) => l.startsWith('screen:game:'))).toBe(false); // the build waits for that frame
    gate.resolve();
    await started;
    expect(h.log).toContain('screen:game:L5');
  });

  it('a newer start while waiting wins; the stale one never builds', async () => {
    const h = createHarness();
    const gate = deferred();
    h.router.leaveWait = () => gate.promise;
    const first = h.session.start({ mode: 'level', level: 5 });
    h.router.leaveWait = null;
    await h.session.start({ mode: 'level', level: 6 });
    gate.resolve();
    await first;
    expect(h.log.filter((l) => l.startsWith('screen:game:'))).toEqual(['screen:game:L6']);
  });

  it('nothing to wait for (null) keeps the start synchronous after the load (the first-run tutorial from boot)', async () => {
    const h = createHarness();
    void h.session.start({ mode: 'tutorial', replay: false });
    expect(h.log.some((l) => l.startsWith('screen:game:'))).toBe(true);
  });

  it('victory → next level begins leaving at the tap too (the victory is what fades, PAR-6)', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    winGame(h);
    await h.settle(h.config.fx.winOverlayDelayMs + h.config.rank.panelTapMinMs);
    await tapRanking(h);
    await h.settle(h.config.fx.winButtonDelayMs);
    h.router.leaves.length = 0;
    h.router.props.victory?.onPrimary();
    await h.settle(0);
    expect(h.router.leaves).toEqual(['game']);
    expect(h.log).toContain('screen:game:L6');
  });
});
