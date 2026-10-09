// Owner: C (Phase 2b; was app). The 1 s TICK (02 §7.2, 04 §5.2): runs while visible and playing / hint / kitty; stops
// (with a final partial TICK) when hidden, on FB onPause, while O5/O6 is open and while an ad shows.
import { describe, expect, it } from 'vitest';
import { createHarness, SOL5, startLevel, WRONG5, type Harness } from './harness';

async function playingFor(h: Harness, ms: number): Promise<void> {
  await startLevel(h);
  await h.settle(ms);
}

describe('session timer', () => {
  it('does not run in READY; ticks once per second while playing', async () => {
    const h = createHarness();
    await h.session.start({ mode: 'level', level: 5 });
    await h.settle(h.config.fx.boardEntryMs - 1);
    expect(h.game().elapsedMs).toBe(0);
    await h.settle(1);
    await h.settle(3000);
    expect(h.game().elapsedMs).toBe(3000);
  });

  it('page hidden: final partial TICK, then stops; resumes on return', async () => {
    const h = createHarness();
    await playingFor(h, 1500);
    expect(h.game().elapsedMs).toBe(1000);
    h.bus.emit('pause', { reason: 'hidden' });
    expect(h.game().elapsedMs).toBe(1500);
    expect(h.store.get().ui.paused).toBe(true);
    expect(h.muted.has('hidden')).toBe(true);
    await h.settle(10_000);
    expect(h.game().elapsedMs).toBe(1500);
    h.bus.emit('resume', { reason: 'hidden' });
    expect(h.store.get().ui.paused).toBe(false);
    expect(h.muted.has('hidden')).toBe(false);
    await h.settle(2000);
    expect(h.game().elapsedMs).toBe(3500);
  });

  it('FB onPause pauses and mutes like hidden', async () => {
    const h = createHarness();
    await playingFor(h, 1000);
    h.session.pause('fb_pause');
    await h.settle(5000);
    expect(h.game().elapsedMs).toBe(1000);
    expect(h.muted.has('pause')).toBe(true);
    h.session.resume('fb_pause');
    await h.settle(1000);
    expect(h.game().elapsedMs).toBe(2000);
  });

  it('pause reasons stack: the timer resumes only when all are gone', async () => {
    const h = createHarness();
    await playingFor(h, 0);
    h.session.pause('hidden');
    h.session.pause('ad');
    h.session.resume('hidden');
    await h.settle(3000);
    expect(h.game().elapsedMs).toBe(0);
    h.session.resume('ad');
    await h.settle(1000);
    expect(h.game().elapsedMs).toBe(1000);
  });

  it('stops while Settings or How to play is open (O5/O6), not for other overlays', async () => {
    const h = createHarness();
    await playingFor(h, 1000);
    h.router.open('settings', {} as never);
    await h.settle(5000);
    expect(h.game().elapsedMs).toBe(1000);
    h.router.open('how_to_play', {} as never);
    h.router.close('settings');
    await h.settle(5000);
    expect(h.game().elapsedMs).toBe(1000);
    h.router.close('how_to_play');
    await h.settle(1000);
    expect(h.game().elapsedMs).toBe(2000);
  });

  it('stops while an ad is showing (ad-flow pause on the bus)', async () => {
    const h = createHarness({ save: (s) => ({ ...s, stock: { hints: 0, kitties: 3 } }) });
    await playingFor(h, 1000);
    let finish: () => void = () => undefined;
    h.platform.rewardedResults.push(() => new Promise((resolve) => (finish = () => resolve({ ok: true }))));
    const flow = h.session.onBulb();
    await h.settle(0);
    expect(h.store.get().ui.adShowing).toBe(true);
    await h.settle(8000); // a long ad is never cut short
    expect(h.game().elapsedMs).toBe(1000);
    finish();
    await flow;
    expect(h.store.get().ui.adShowing).toBe(false);
    expect(h.game().status).toBe('hint');
    await h.settle(1000);
    expect(h.game().elapsedMs).toBe(2000); // hint status keeps the timer running
  });

  it('keeps running in hint and kitty; stops at WON, crediting the partial second', async () => {
    const h = createHarness();
    await playingFor(h, 1000);
    await h.session.onPaw();
    expect(h.game().status).toBe('kitty');
    await h.settle(h.config.kitty.revealMs);
    expect(h.game().status).toBe('playing');
    await h.settle(1000 - h.config.kitty.revealMs + 400); // 400 ms past the TICK at 2 s
    const before = h.game().elapsedMs;
    expect(before).toBe(2000); // the kitty reveal counted
    for (const c of SOL5) if (h.game().cells[c] !== 2) h.session.onCellDoubleTap(c);
    expect(h.game().status).toBe('won');
    expect(h.game().elapsedMs).toBe(before + 400);
    await h.settle(5000);
    expect(h.game().elapsedMs).toBe(before + 400);
  });

  it('stops at LOST', async () => {
    const h = createHarness();
    await playingFor(h, 0);
    for (const c of WRONG5.slice(0, 3)) h.session.onCellDoubleTap(c);
    expect(h.game().status).toBe('lost');
    const at = h.game().elapsedMs;
    await h.settle(5000);
    expect(h.game().elapsedMs).toBe(at);
  });
});
