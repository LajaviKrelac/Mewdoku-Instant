// Owner: C (Phase 2b; was app). Helper flows in the exact 04 §5.7 order: stock check → O2 → ad or fallback →
// (+1, saves.now) → engine → debit + saves.now → dispatch (02 §9, §10.2, §13.3).
import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import { createHarness, loseGame, slice, startLevel, NOW, WRONG5, type Harness } from './harness';

const FLOW = /^(open:rewarded|close:rewarded|ad:|save:|engine:|status:|open:hint|toast:)/;

function withStock(hints: number, kitties: number): (s: SaveData) => SaveData {
  return (s) => ({ ...s, stock: { hints, kitties } });
}

async function playing(h: Harness): Promise<void> {
  await startLevel(h);
  h.log.length = 0;
}

describe('hint flow (02 §9.1)', () => {
  it('with stock: engine → debit + saves.now → HINT_OPEN (charged)', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await playing(h);
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['engine:getHint', 'save:now:h4k3', 'status:hint', 'open:hint']);
    expect(h.game().hintsUsed).toBe(1);
    expect(h.analytics.filter((e) => e.name === 'hint_used').map((e) => e.params)).toEqual([
      expect.objectContaining({ level: 5, charged: 1 }),
    ]);
  });

  it("O1 gets the board's regions, so its screen-reader line names the tile's colour (A11Y-7)", async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await playing(h);
    await h.session.onBulb();
    const props = h.router.props.hint;
    expect(props?.regions).toBe(h.game().puzzle.regions);
    const { hintLocation } = await import('../../../src/ui/overlays/hint-card');
    expect(props && hintLocation(props.step, props)).toMatch(/^Highlighted tile: row \d+, column \d+, [A-Z]\w+\.$/);
  });

  it('reopening the same board is free; any board change clears the cache', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await playing(h);
    await h.session.onBulb();
    h.session.onHintClose();
    expect(h.router.isOpen('hint')).toBe(false);
    h.log.length = 0;
    await h.session.onBulb(); // same board → cached step, uncharged
    expect(slice(h.log, FLOW)).toEqual(['status:hint', 'open:hint']);
    expect(h.save().stock.hints).toBe(4);
    expect(h.game().hintsUsed).toBe(1);
    h.session.onHintClose();
    h.session.onCellTap(WRONG5[3] as number); // a mark changes the board
    h.log.length = 0;
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['engine:getHint', 'save:now:h3k3', 'status:hint', 'open:hint']);
  });

  it('at stock 0 with rewarded ads: O2 → ad → +1 saved → engine → debit saved → open', async () => {
    const h = createHarness({ save: withStock(0, 3) });
    await playing(h);
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual([
      'open:rewarded',
      'close:rewarded',
      'ad:rewarded:hint',
      'save:now:h1k3',
      'engine:getHint',
      'save:now:h0k3',
      'status:hint',
      'open:hint',
    ]);
    expect(h.router.props.rewarded?.variant).toBe('video');
    expect(h.save().ads.lastAdAt).toBe(NOW + h.config.fx.boardEntryMs); // rewarded resets the interstitial clock
  });

  it('"Not now" on O2: no ad, no grant, no engine call', async () => {
    const h = createHarness({ save: withStock(0, 3) });
    await playing(h);
    h.router.rewardedAnswer = 'decline';
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['open:rewarded', 'close:rewarded']);
    expect(h.save().stock.hints).toBe(0);
    expect(h.game().status).toBe('playing');
  });

  it('a failed rewarded ad shows the toast and grants nothing', async () => {
    const h = createHarness({ save: withStock(0, 3) });
    await playing(h);
    h.platform.rewardedResults.push({ ok: false, reason: 'no_fill' });
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['open:rewarded', 'close:rewarded', 'ad:rewarded:hint', `toast:${t('rewarded.noVideo')}`]);
    expect(h.save().stock.hints).toBe(0);
  });

  it('an engine failure toasts "Hint unavailable" and charges nothing', async () => {
    const h = createHarness({ save: withStock(2, 3), failHint: true });
    await playing(h);
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['engine:getHint', `toast:${t('hint.unavailable')}`]);
    expect(h.save().stock.hints).toBe(2);
    expect(h.game().status).toBe('playing');
    expect(h.store.get().ui.inputLocked).toBe(false);
  });
});

describe('free fallback when rewarded ads are unsupported (02 §13.3)', () => {
  it('grants once per 10 minutes, shared by hint, kitty and revive', async () => {
    const h = createHarness({ save: withStock(0, 0), caps: { rewarded: false, interstitial: false } });
    await playing(h);
    await h.session.onBulb();
    expect(h.router.props.rewarded?.variant).toBe('free');
    expect(slice(h.log, FLOW)).toEqual([
      'open:rewarded',
      'close:rewarded',
      'save:now:h1k0',
      'engine:getHint',
      'save:now:h0k0',
      'status:hint',
      'open:hint',
    ]);
    const grantedAt = h.save().ads.lastFallbackGrantAt;
    expect(grantedAt).toBeGreaterThan(0);
    expect(h.analytics).toContainEqual({ name: 'ad_rewarded', params: { placement: 'hint', result: 'fallback' } });
    h.session.onHintClose();

    // Within the cooldown the kitty only gets the countdown variant.
    h.log.length = 0;
    await h.session.onPaw();
    expect(h.router.props.rewarded?.variant).toBe('countdown');
    expect(h.router.props.rewarded?.nextFreeAt).toBe(grantedAt + 600_000);
    expect(slice(h.log, FLOW)).toEqual(['open:rewarded', 'close:rewarded']);
    expect(h.save().stock.kitties).toBe(0);

    // After 10 minutes the kitty is free again.
    await h.settle(600_000);
    h.log.length = 0;
    await h.session.onPaw();
    expect(h.router.props.rewarded?.variant).toBe('free');
    expect(slice(h.log, /^(engine:|save:|status:)/)).toEqual(['save:now:h0k1', 'engine:pickKittyCell', 'save:now:h0k0', 'status:kitty']);
  });

  it('revive: O4 offers "free" and Continue grants without O2', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false } });
    await startLevel(h);
    await loseGame(h);
    expect(h.router.props.fail?.continueOffer).toBe('free');
    h.log.length = 0;
    await h.session.onContinue();
    expect(slice(h.log, /^(open:|close:|ad:|status:)/)).toEqual(['close:fail', 'status:playing']);
    expect(h.game().hearts).toBe(1);
    expect(h.game().revivesUsed).toBe(1);
    expect(h.save().ads.lastFallbackGrantAt).toBeGreaterThan(0);
  });

  it("a rewarded ad that answers 'unsupported' after the yes takes the free grant at once (PLAT-4)", async () => {
    const h = createHarness({ save: withStock(0, 3) });
    await playing(h);
    h.platform.rewardedResults.push({ ok: false, reason: 'unsupported' });
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual([
      'open:rewarded',
      'close:rewarded',
      'ad:rewarded:hint',
      'save:now:h1k3',
      'engine:getHint',
      'save:now:h0k3',
      'status:hint',
      'open:hint',
    ]);
    expect(h.router.props.rewarded?.variant).toBe('video'); // asked once, not again as "free"
    expect(h.save().ads.lastFallbackGrantAt).toBe(h.clock.now());
    expect(h.analytics).toContainEqual({ name: 'ad_rewarded', params: { placement: 'hint', result: 'fallback' } });
    expect(h.log).not.toContain(`toast:${t('rewarded.noVideo')}`);
  });

  it("'unsupported' during the fallback cooldown: the no-video toast, nothing granted", async () => {
    const h = createHarness({ save: (s) => ({ ...withStock(0, 3)(s), ads: { lastAdAt: 0, lastFallbackGrantAt: NOW - 60_000 } }) });
    await playing(h);
    h.platform.rewardedResults.push({ ok: false, reason: 'unsupported' });
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['open:rewarded', 'close:rewarded', 'ad:rewarded:hint', `toast:${t('rewarded.noVideo')}`]);
    expect(h.save().stock.hints).toBe(0);
  });

  it('revive during the cooldown: Continue is hidden', async () => {
    const h = createHarness({
      caps: { rewarded: false, interstitial: false },
      save: (s) => ({ ...s, ads: { lastAdAt: 0, lastFallbackGrantAt: NOW - 60_000 } }),
    });
    await startLevel(h);
    await loseGame(h);
    expect(h.router.props.fail?.continueOffer).toBeNull();
  });
});

describe('kitty flow (02 §9.2)', () => {
  it('pickKittyCell → debit + saves.now → KITTY → KITTY_DONE after kitty.revealMs', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await playing(h);
    await h.session.onPaw();
    expect(slice(h.log, FLOW)).toEqual(['engine:pickKittyCell', 'save:now:h5k2', 'status:kitty']);
    expect(h.game().kittiesUsed).toBe(1);
    expect(h.game().catsPlaced).toBe(1);
    await h.settle(h.config.kitty.revealMs - 1);
    expect(h.game().status).toBe('kitty');
    await h.settle(1);
    expect(h.game().status).toBe('playing');
    expect(h.analytics).toContainEqual({ name: 'kitty_used', params: { level: 5 } });
  });

  it('at stock 0: O2 → ad → +1 saved → pick → debit saved → KITTY', async () => {
    const h = createHarness({ save: withStock(5, 0) });
    await playing(h);
    await h.session.onPaw();
    expect(slice(h.log, FLOW)).toEqual([
      'open:rewarded',
      'close:rewarded',
      'ad:rewarded:kitty',
      'save:now:h5k1',
      'engine:pickKittyCell',
      'save:now:h5k0',
      'status:kitty',
    ]);
  });

  it('a failed kitty pick toasts kitty.unavailable and charges nothing (lead decision)', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await playing(h);
    h.engine.pickKittyCell = () => Promise.reject(new Error('engine failure'));
    await h.session.onPaw();
    expect(slice(h.log, FLOW)).toEqual([`toast:${t('kitty.unavailable')}`]);
    expect(h.save().stock.kitties).toBe(3);
    expect(h.game().status).toBe('playing');
    expect(h.store.get().ui.inputLocked).toBe(false);
  });

  it('is ignored outside PLAYING', async () => {
    const h = createHarness();
    await h.session.start({ mode: 'level', level: 5 }); // still READY
    await h.session.onPaw();
    await h.session.onBulb();
    expect(slice(h.log, /^(engine:|save:now)/)).toEqual([]);
  });
});

describe('revive flow (02 §10.2)', () => {
  it('Continue → rewarded ad (no O2) → REVIVE with 1 heart', async () => {
    const h = createHarness();
    await startLevel(h);
    await loseGame(h);
    expect(h.game().status).toBe('lost');
    expect(h.router.props.fail).toMatchObject({ continueOffer: 'video', buttonDelayMs: h.config.fx.failButtonDelayMs });
    h.log.length = 0;
    await h.session.onContinue();
    expect(slice(h.log, /^(open:|close:|ad:|status:)/)).toEqual(['ad:rewarded:revive', 'close:fail', 'status:playing']);
    expect(h.game().hearts).toBe(1);
  });

  it('an early-closed ad keeps O4 open with the toast', async () => {
    const h = createHarness();
    await startLevel(h);
    await loseGame(h);
    h.platform.rewardedResults.push({ ok: false, reason: 'skipped' });
    await h.session.onContinue();
    expect(h.game().status).toBe('lost');
    expect(h.router.isOpen('fail')).toBe(true);
    expect(h.router.props.fail?.busy).toBe(false);
    expect(h.router.toasts).toContain(t('rewarded.noVideo'));
  });

  it('no second revive in one attempt', async () => {
    const h = createHarness();
    await startLevel(h);
    await loseGame(h);
    await h.session.onContinue();
    h.session.onCellDoubleTap(WRONG5[3] as number);
    await h.settle(h.config.fx.failOverlayDelayMs);
    expect(h.game().status).toBe('lost');
    expect(h.router.props.fail?.continueOffer).toBeNull();
  });
});

describe('fish swap in O2 (phase2b §2.8)', () => {
  const rich = (fish: number, hints = 0, kitties = 0) => (s: SaveData): SaveData => ({ ...s, stock: { hints, kitties }, wallet: { fish, earned: fish } });

  it('the swap is offered at ≥ the price (15 for a hint) and hidden below it', async () => {
    const h = createHarness({ save: rich(15) });
    h.router.rewardedAnswer = null;
    await playing(h);
    void h.session.onBulb();
    await h.settle(0);
    expect(h.router.props.rewarded?.swap).toMatchObject({ price: 15, balance: 15 });
    const poor = createHarness({ save: rich(14) });
    poor.router.rewardedAnswer = null;
    await playing(poor);
    void poor.session.onBulb();
    await poor.settle(0);
    expect(poor.router.isOpen('rewarded')).toBe(true);
    expect(poor.router.props.rewarded?.swap).toBeUndefined();
  });

  it('Swap spends exactly the price, grants one hint, saves at once, makes no ad call, then the hint opens', async () => {
    const h = createHarness({ save: rich(40) });
    h.router.rewardedAnswer = 'swap';
    await playing(h);
    await h.session.onBulb();
    expect(slice(h.log, FLOW)).toEqual(['open:rewarded', 'close:rewarded', 'save:now:h1k0', 'engine:getHint', 'save:now:h0k0', 'status:hint', 'open:hint']);
    expect(h.log.some((l) => l.startsWith('ad:'))).toBe(false);
    expect(h.save().wallet.fish).toBe(25);
    expect(h.save().ads.lastFallbackGrantAt).toBe(0); // no fallback cooldown
  });

  it('a kitty swap costs 30 and works on the web without ads too', async () => {
    const h = createHarness({ save: rich(30), caps: { rewarded: false } });
    h.router.rewardedAnswer = 'swap';
    await playing(h);
    await h.session.onPaw();
    expect(h.save().wallet.fish).toBe(0);
    expect(h.game().kittiesUsed).toBe(1);
    expect(h.save().stock.kitties).toBe(0);
    expect(h.log.some((l) => l.startsWith('ad:'))).toBe(false);
  });

  it('the swap is offered in the countdown variant too (no video, no free grant)', async () => {
    const h = createHarness({ save: (s) => ({ ...rich(20)(s), ads: { lastAdAt: 0, lastFallbackGrantAt: NOW - 1000 } }), caps: { rewarded: false } });
    h.router.rewardedAnswer = 'swap';
    await playing(h);
    await h.session.onBulb();
    expect(h.save().wallet.fish).toBe(5);
    expect(h.game().status).toBe('hint');
  });

  it('a revive is never for sale (O4 has no swap)', async () => {
    const h = createHarness({ save: rich(999), caps: { rewarded: false } });
    h.router.rewardedAnswer = 'swap';
    await startLevel(h);
    await loseGame(h);
    await h.session.onContinue(); // free fallback revive, no fish spent
    expect(h.save().wallet.fish).toBe(999);
  });
});
