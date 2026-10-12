// Owner: G1 (Phase 2e). The ranking in the session (docs/phase2e/spec.md §2.3, §2.4, §2.10): a counted, scored
// win is queued in save.ladder.pending in the SAME critical save as the win (a crash after WON loses
// nothing) and sent at once; the post-win panel shows the ladder's list (loading, then the server's rows)
// with "+n fish · Your total"; the tutorial and a restored win are never queued; the retired FB weekly board
// is never read (rank.fbPeriodBoard false); without the ranking origin the 2c records path stays.
import { describe, expect, it } from 'vitest';
import { createLadderClient } from '../../../src/app/ladder-client';
import { createLadderFlow, type LadderChunk, type LadderFlow } from '../../../src/app/ladder-flow';
import type { SessionLadder } from '../../../src/app/session-types';
import { createLadderFake, type LadderFake } from '../../fixtures/ladder-fake';
import { createHarness, startLevel, tapRanking, winGame, type Harness } from './harness';

const drain = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setImmediate(r));
};

const CHUNK: LadderChunk = {
  createBracketList: (() => ({})) as unknown as LadderChunk['createBracketList'],
  NICK_WORDS_V1: { adj: ['A'], noun: ['B'] },
  RETIRED_V1: { adj: [], noun: [] },
};

function setup(o: { inUse?: boolean } = {}) {
  let fake: LadderFake | null = null;
  let flow: LadderFlow | null = null;
  let n = 0;
  const h: Harness = createHarness({
    save: (s) => ({ ...s, progress: { level: 15, completed: 14, best: {} } }),
    extra: (p) => {
      const f = createLadderFake({ now: () => p.clock.now() });
      fake = f;
      const client = createLadderClient({
        baseUrl: 'https://rank.test',
        platformId: 'web',
        device: () => ({ id: 'q2Vx8LmN4pRt6WyZ0aBc1D', secret: 'k9Jf3Hs7Ld2Qw5Er8Ty1Ui4Op6As0Df3Gh5Jk7Lz9Xa' }),
        clock: p.clock,
        clientVersion: '0.2.0',
        contentVersion: 'content-test',
        fetch: f.fetch,
      });
      flow = createLadderFlow({
        client,
        store: p.store,
        saves: p.saves,
        router: p.router as never,
        bus: p.bus,
        clock: p.clock,
        platformId: 'web',
        rewardedAvailable: () => true,
        watchDouble: async () => true,
        loadChunk: async () => CHUNK,
        storage: null,
        records: () => ({ rows: [] }) as never,
        canOpenCard: () => false,
      });
      const ladder: SessionLadder = {
        inUse: () => o.inUse ?? true,
        flow: () => flow,
        contentVersion: 'content-test',
        clientVersion: '0.2.0',
        newWinId: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`,
      };
      return { ladder };
    },
  });
  return {
    h,
    fake: () => fake as unknown as LadderFake,
    flow: () => flow as unknown as LadderFlow,
  };
}

describe('the win is queued with the win (spec §2.3, critic C-25)', () => {
  it('queued in the same critical save as WON, then sent; the panel shows the server rows and the total', async () => {
    const s = setup();
    await s.flow().start();
    s.fake().addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    await startLevel(s.h, 15);
    s.fake().hold = true;
    s.h.log.length = 0;
    winGame(s.h);
    // At WON: the queued win is in the critical write (before any answer).
    const critical = s.h.platform.writes.at(-1)?.data;
    expect(critical?.ladder.pending.map((w) => w.puzzleId)).toEqual(['L15']);
    expect(critical?.ladder.pending[0]).toMatchObject({ source: 'pack', fish: 3, contentVersion: 'content-test', cats: '02413' });
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    expect(s.h.router.props.ranking?.list).toEqual({ kind: 'loading' });
    // audit B9 / A-H1 (H-4): unanswered, the total is the server's (none yet) and the queued fish wait apart
    expect(s.h.router.props.ranking?.result).toEqual({ kind: 'ladder', gained: 3, total: 0, waiting: 3 });
    s.fake().hold = false;
    s.fake().release();
    await drain();
    await s.h.settle(0);
    const props = s.h.router.props.ranking;
    expect(props?.list.kind).toBe('bracket');
    const rows = props?.list.kind === 'bracket' ? props.list.view.rows.map((r) => [r.rank, r.name, r.points]) : [];
    expect(rows).toEqual([
      [1, 'Sleepy Whisker 27', 31],
      [2, 'Velvet Pounce 27', 3],
    ]);
    expect(props?.result).toEqual({ kind: 'ladder', gained: 3, total: 3, waiting: 0 });
    expect(s.h.save().ladder.pending).toEqual([]);
    // requests-G3 R4: the counter names my bracket's fish, and so does the victory's kept-fish row.
    const g = s.h.router.game;
    expect(g?.counterKinds.filter((k) => k !== undefined)).toEqual(['ladder']);
    expect(g?.counters[0]).toBe(0); // my bracket's points before this win (none yet)
    await tapRanking(s.h);
    expect(s.h.router.props.victory?.kept).toEqual({ fish: 3, max: 3, gained: 3, total: 3, kind: 'ladder', waiting: 0 });
  });

  it('the ladder not active (not listed): the counter and the victory keep this week\'s records (no ladder kind)', async () => {
    const s = setup();
    await s.flow().start();
    s.h.store.update((st) => ({ ...st, save: { ...st.save, ladder: { ...st.save.ladder, listed: false } } }));
    await startLevel(s.h, 15);
    winGame(s.h);
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    await drain();
    expect(s.h.router.game?.counterKinds.filter((k) => k !== undefined)).toEqual([s.h.config.period.kind]);
    expect(s.h.router.props.ranking?.list).toMatchObject({ kind: 'records', reason: 'opted_out' });
    expect(s.h.router.props.ranking?.result.kind).toBe('period');
    await tapRanking(s.h);
    expect(s.h.router.props.victory?.kept?.kind).toBe(s.h.config.period.kind);
  });

  it('the retired FB weekly board is never read (rank.fbPeriodBoard false)', async () => {
    const s = setup();
    await s.flow().start();
    await startLevel(s.h, 15);
    winGame(s.h);
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    expect(s.h.log.some((l) => l.startsWith('rank:fetch'))).toBe(false);
    expect(s.h.config.rank.fbPeriodBoard).toBe(false);
  });

  it('without the ranking origin (web-prod): nothing queued, the 2c records path', async () => {
    const s = setup({ inUse: false });
    await startLevel(s.h, 15);
    winGame(s.h);
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    expect(s.h.save().ladder.pending).toEqual([]);
    expect(s.h.router.props.ranking?.list.kind).not.toBe('loading');
    expect(s.fake().calls).toEqual([]);
  });

  it('consecutive offline wins (2026-10-12, verify C7): the counter starts from my earlier queued fish too, as the panel shows them waiting', async () => {
    const s = setup();
    await s.flow().start();
    const win = async (level: number): Promise<void> => {
      await startLevel(s.h, level);
      winGame(s.h);
      await drain();
      await s.h.settle(s.h.config.fx.winOverlayDelayMs);
      await drain();
    };
    await win(15); // answered: my bracket has 3
    expect(s.h.router.game?.counters[0]).toBe(0);
    await tapRanking(s.h);
    s.fake().offline = true;
    await win(16);
    expect(s.h.router.game?.counters[0]).toBe(3);
    await s.h.settle(s.h.config.ladder.panelWaitMs);
    await drain();
    await tapRanking(s.h);
    await win(17);
    expect(s.h.router.game?.counters[0]).toBe(6); // before: 3 again (the HUD restarted from the server's last number)
    await s.h.settle(s.h.config.ladder.panelWaitMs);
    await drain();
    // The panel: the server's 3 and the 6 queued fish apart (3 + 6 = the counter's 6 + this win's 3).
    expect(s.h.router.props.ranking?.result).toEqual({ kind: 'ladder', gained: 3, total: 3, waiting: 6 });
  });

  it('2026-10-12 (compare §D1, verify C6): an answer after the panel\'s tap reaches the open victory (reduced motion: the gate opens at 1.8 s)', async () => {
    const s = setup();
    await s.flow().start();
    s.fake().addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.h.store.update((st) => ({ ...st, ui: { ...st.ui, reducedMotion: true } }));
    await startLevel(s.h, 15);
    s.fake().hold = true;
    winGame(s.h);
    const w = s.h.config.fx.win;
    await s.h.settle(w.reduced.rankingAtMs + w.reduced.tapMinMs);
    expect(s.h.router.props.ranking?.list).toEqual({ kind: 'loading' });
    await tapRanking(s.h);
    expect(s.h.router.isOpen('ranking')).toBe(false);
    expect(s.h.router.props.victory?.kept).toEqual({ fish: 3, max: 3, gained: 3, total: 0, kind: 'ladder', waiting: 3 });
    const opened = s.h.router.props.victory;
    s.fake().hold = false;
    s.fake().release();
    await drain();
    await s.h.settle(0);
    // The server's total, nothing waiting; the rest of the victory stays as opened.
    expect(s.h.router.props.victory?.kept).toEqual({ fish: 3, max: 3, gained: 3, total: 3, kind: 'ladder', waiting: 0 });
    expect(s.h.router.props.victory).toEqual({ ...opened, kept: s.h.router.props.victory?.kept });
    expect(s.h.router.props.victory?.onPrimary).toBe(opened?.onPrimary);
  });

  it('2026-10-12 (compare §D2): a win the server did not count claims no "+3 fish": the panel shows the total alone, the victory no kept row', async () => {
    const s = setup();
    await s.flow().start();
    s.fake().addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    const win = async (level: number): Promise<void> => {
      await startLevel(s.h, level);
      winGame(s.h);
      await drain();
      await s.h.settle(s.h.config.fx.winOverlayDelayMs);
      await drain();
    };
    await win(15); // accepted: my bracket has 3
    expect(s.h.router.props.ranking?.result).toEqual({ kind: 'ladder', gained: 3, total: 3, waiting: 0 });
    await tapRanking(s.h);
    expect(s.h.router.props.victory?.kept).toMatchObject({ gained: 3, total: 3 });
    // The second win is rejected (its answer before the panel).
    s.fake().verdict('00000000-0000-4000-8000-000000000002', 'rejected', 'too_fast');
    await win(16);
    expect(s.h.save().ladder.pending).toEqual([]);
    expect(s.h.router.props.ranking?.list.kind).toBe('bracket');
    expect(s.h.router.props.ranking?.result).toEqual({ kind: 'ladder', gained: 0, total: 3, waiting: 0 });
    await tapRanking(s.h);
    expect(s.h.router.props.victory?.kept).toBeNull();
    expect(s.h.router.props.victory?.pointsEarned).toBeGreaterThan(0); // the level's points row stays
    // The third, already counted, answers after the tap: the open victory drops its row then (no error text anywhere).
    s.fake().verdict('00000000-0000-4000-8000-000000000003', 'already_counted');
    await startLevel(s.h, 17);
    s.fake().hold = true;
    winGame(s.h);
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    expect(s.h.router.props.ranking?.result).toEqual({ kind: 'ladder', gained: 3, total: 3, waiting: 3 }); // not answered yet
    await tapRanking(s.h);
    expect(s.h.router.props.victory?.kept).toEqual({ fish: 3, max: 3, gained: 3, total: 3, kind: 'ladder', waiting: 3 });
    s.fake().hold = false;
    s.fake().release();
    await drain();
    await s.h.settle(0);
    expect(s.h.router.props.victory?.kept).toBeNull();
    expect(s.h.router.toasts).toEqual([]);
  });

  it('offline at WON: the win stays queued (saved), the panel falls back after ladder.panelWaitMs', async () => {
    const s = setup();
    await s.flow().start();
    s.fake().offline = true;
    await startLevel(s.h, 15);
    winGame(s.h);
    await s.h.settle(s.h.config.fx.winOverlayDelayMs);
    await drain();
    await s.h.settle(s.h.config.ladder.panelWaitMs);
    await drain();
    expect(s.h.save().ladder.pending).toHaveLength(1);
    expect(s.h.router.props.ranking?.list.kind).toBe('records');
  });
});
