// Owner: C (Phase 2b; was app). Loading indicator (lead decision, Phase 2 integration): opening a level or daily that
// takes longer than cfg.loading.indicatorDelayMs (pack fetch, on-device generation) shows it until
// the board is ready; a fast load never shows it; a superseded or failed load hides it. A load that
// never settles ends on Home with a toast after cfg.loading.failSafeMs (RP-1, 04 §8).
import { describe, expect, it } from 'vitest';
import { delay } from '../../../src/app/clock';
import type { LoadedPuzzle } from '../../../src/game/levels-repo';
import { t } from '../../../src/i18n';
import { createHarness, dailyPuzzle, levelPuzzle, slice, SOL5, startLevel, TODAY, type Harness } from './harness';

const LOADING = /^(loading:|screen:game)/;

function slowLevels(ms: number, fail = false) {
  const ref: { h: Harness | null } = { h: null };
  const wait = (): Promise<void> => delay((ref.h as Harness).clock, ms);
  const h = createHarness({
    levels: {
      getLevel: async (level): Promise<LoadedPuzzle> => {
        await wait();
        if (fail) throw new Error('pack fetch failed');
        return { puzzle: levelPuzzle(level), source: 'pack' };
      },
      getDaily: async (date): Promise<LoadedPuzzle> => {
        await wait();
        return { puzzle: dailyPuzzle(date), source: 'generated' };
      },
    },
  });
  ref.h = h;
  return h;
}

describe('loading indicator', () => {
  it('shows after the delay while a level loads, and hides before the board mounts', async () => {
    const h = slowLevels(1000);
    const started = h.session.start({ mode: 'level', level: 5 });
    await h.settle(h.config.loading.indicatorDelayMs - 1);
    expect(slice(h.log, LOADING)).toEqual([]);
    await h.settle(1);
    expect(slice(h.log, LOADING)).toEqual(['loading:on']);
    await h.settle(1000);
    await started;
    expect(slice(h.log, LOADING)).toEqual(['loading:on', 'loading:off', 'screen:game:L5']);
  });

  it('also covers a daily generated on the device', async () => {
    const h = slowLevels(600);
    const started = h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(600);
    await started;
    expect(slice(h.log, LOADING)).toEqual(['loading:on', 'loading:off', `screen:game:D${TODAY}`]);
  });

  it('a load faster than the delay never shows it', async () => {
    const h = slowLevels(100);
    const started = h.session.start({ mode: 'level', level: 5 });
    await h.settle(100);
    await started;
    await h.settle(1000);
    expect(slice(h.log, LOADING)).toEqual(['screen:game:L5']);
  });

  it('the tutorial (bundled) never shows it', async () => {
    const h = slowLevels(1000);
    await h.session.start({ mode: 'tutorial', replay: true });
    await h.settle(1000);
    expect(slice(h.log, LOADING)).toEqual(['screen:game:T1']);
  });

  it('a failed load hides it and goes Home with a toast', async () => {
    const h = slowLevels(500, true);
    const started = h.session.start({ mode: 'level', level: 5 });
    await h.settle(500);
    await started;
    expect(slice(h.log, /^(loading:|goHome|toast:)/)).toEqual(['loading:on', 'loading:off', expect.stringMatching(/^toast:/), 'goHome']);
  });

  it('fail-safe (RP-1): a load that never settles goes Home with a toast after loading.failSafeMs', async () => {
    const h = createHarness({ levels: { getLevel: () => new Promise<LoadedPuzzle>(() => undefined) } });
    const errors: string[] = [];
    h.bus.on('error', ({ where }) => void errors.push(where));
    const started = h.session.start({ mode: 'level', level: 5 });
    await h.settle(h.config.loading.failSafeMs - 1);
    expect(slice(h.log, /^(loading:|goHome|toast:)/)).toEqual(['loading:on']);
    await h.settle(1);
    await started;
    expect(slice(h.log, /^(loading:|goHome|toast:)/)).toEqual(['loading:on', 'loading:off', expect.stringMatching(/^toast:/), 'goHome']);
    expect(errors).toEqual(['load']);
    expect(h.store.get().game).toBeNull();
    expect(h.store.get().session).toBeNull();
  });

  it('fail-safe from O3 Next: the hung next level ends on Home, and a late board never mounts', async () => {
    let release: (p: LoadedPuzzle) => void = () => undefined;
    const h = createHarness({
      levels: {
        getLevel: (level) =>
          level === 6 ? new Promise<LoadedPuzzle>((r) => (release = r)) : Promise.resolve({ puzzle: levelPuzzle(level), source: 'pack' }),
      },
    });
    await startLevel(h, 5);
    for (const cell of SOL5) {
      h.session.onCellDoubleTap(cell);
      await h.settle(h.config.input.cellLockAfterCatMs);
    }
    expect(h.game().status).toBe('won');
    await h.settle(h.config.fx.winOverlayDelayMs);
    const next = h.session.onNext();
    await h.settle(h.config.loading.failSafeMs + 10);
    await next;
    expect(h.homeCalls).toBe(1);
    expect(h.router.toasts).toEqual([t('toast.error')]);
    expect(h.save().progress.level).toBe(6); // the win was kept
    release({ puzzle: levelPuzzle(6), source: 'pack' });
    await h.settle(1000);
    expect(h.store.get().game).toBeNull();
    expect(slice(h.log, /^screen:game/)).toEqual(['screen:game:L5']);
  });

  it('a load that settles in time clears the fail-safe timer', async () => {
    const h = slowLevels(1000);
    const started = h.session.start({ mode: 'level', level: 5 });
    await h.settle(1000);
    await started;
    await h.settle(h.config.loading.failSafeMs * 2);
    expect(h.homeCalls).toBe(0);
    expect(h.store.get().game?.puzzle.id).toBe('L5');
  });

  it('a second start hides the first one’s indicator', async () => {
    const h = slowLevels(1000);
    void h.session.start({ mode: 'level', level: 5 });
    await h.settle(400);
    const second = h.session.start({ mode: 'tutorial', replay: true });
    await second;
    await h.settle(2000);
    expect(slice(h.log, LOADING)).toEqual(['loading:on', 'loading:off', 'screen:game:T1']);
  });
});
