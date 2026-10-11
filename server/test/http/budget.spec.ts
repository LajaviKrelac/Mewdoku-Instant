// Owner: G4 (Phase 2e). The per-invocation statement budget (spec §1.2): Workers Free allows 50 D1 queries
// per invocation and we assume every statement of a batch counts. Each request, the hourly cron and the
// daily sweep are measured at their worst case with FULL brackets of 50: a ten-win request that lazily
// finalises the old bracket and joins a new one, the hourly run finalising cron.finalizePerRun (6) brackets,
// and the sweep with every chunk loop running to its limit.
import { describe, expect, it } from 'vitest';
import { RETENTION_CRON } from '../../src/cron';
import { DAY, HOUR, T0, TestPlayer, admin, makeTestApp, makeWin, playersWithWins } from '../helpers/harness';

const FREE_QUERIES_PER_INVOCATION = 50;

describe('statements per invocation (Workers Free: 50; spec §1.2)', () => {
  it('every request and both cron triggers stay inside the budget, full brackets included', async () => {
    const t = makeTestApp({
      overrides: {
        // retention of one day and chunks of one row: every sweep loop runs to cron.sweepChunksPerRun
        retention: { winsDays: 1, bracketsDays: 1, rewardsDays: 1, flagsDays: 1, inactivePlayerDays: 1, adminLogDays: 1 },
        cron: { sweepChunk: 1 },
      },
    });
    const used: Record<string, number> = {};
    const measure = async <T>(name: string, f: () => Promise<T>): Promise<T> => {
      const before = t.rec.prepared;
      const out = await f();
      used[name] = Math.max(used[name] ?? 0, t.rec.prepared - before);
      return out;
    };

    // Round 1 at T0: six full brackets (m and 299 others).
    const m = new TestPlayer(t, 'm');
    await measure('session (new player)', () => m.signIn());
    await measure('wins: 1, joining', () => m.win('L2'));
    await measure('wins: 10', () => m.wins(Array.from({ length: 10 }, (_, i) => makeWin(`L${i + 3}`, { playedAt: t.clock.now() }))));
    const early = await playersWithWins(t, 299, 'a', 2);
    for (const p of early.slice(0, 4)) await p.win('L90'); // four level_jump flags for the sweep
    expect(t.count('SELECT COUNT(*) FROM brackets')).toBe(6);
    expect(t.count('SELECT MIN(members) FROM brackets')).toBe(50);
    const view = await measure('bracket (50 rows)', () => m.bracket());
    expect(view.rows.length).toBe(50);
    const other = view.rows.find((r) => !r.me);
    await measure('heart', () => m.heart(view.bracketId as string, other?.slot ?? 0));
    await measure('profile (name, avatar, listed)', () => m.profile({ nickname: { adj: 3, noun: 5, num: 42 }, avatarId: 3, listed: true }));
    await measure('me', () => m.me());

    // Round 2 one hour later: three more full brackets, which end an hour after the first six.
    t.clock.advance(HOUR);
    const late = await playersWithWins(t, 150, 'b', 2);
    expect(t.count('SELECT COUNT(*) FROM brackets')).toBe(9);

    // The hourly cron once the first six are due: exactly cron.finalizePerRun (6) full brackets.
    t.clock.set(T0 + DAY + 60_000);
    const hourly = await measure('cron: hourly, 6 full brackets', () => t.app.scheduled());
    expect(hourly.finalized).toBe(6);
    expect(hourly.swept).toBeNull();

    // Returning session with a result to show, then the claim.
    const s = await measure('session (returning, results)', () => m.signIn());
    const reward = s.results[0]?.reward;
    expect(reward).toBeTruthy();
    await measure('claim', () => m.claim(reward?.rewardId as string, true));

    // The late brackets: three players with live tokens whose bracket becomes due under them.
    const inBracket = (p: TestPlayer): string => t.rows<{ cur_bracket: string }>('SELECT cur_bracket FROM players WHERE code = ?', p.code())[0]?.cur_bracket ?? '';
    const pick: TestPlayer[] = [];
    for (const p of late) if (!pick.some((q) => inBracket(q) === inBracket(p))) pick.push(p);
    expect(pick.length).toBe(3);
    t.clock.set(T0 + HOUR + DAY - 5 * 60_000);
    for (const p of pick) await p.signIn(); // their brackets are not due yet
    t.clock.set(T0 + HOUR + DAY + 60_000);
    const [x, y, z] = pick as [TestPlayer, TestPlayer, TestPlayer];
    await measure('session (returning, lazy finalise of 50)', () => x.signIn());
    const r = await measure('bracket (lazy finalise of 50)', () => y.bracket());
    expect(r.final).toBe(true);
    const w = await measure('wins: 10, lazy finalise of 50, new bracket', () =>
      z.wins(Array.from({ length: 10 }, (_, i) => makeWin(`L${400 + i}`, { playedAt: t.clock.now() }))),
    );
    expect(w.results.filter((v) => v.verdict === 'accepted' || v.verdict === 'accepted_flagged').length).toBe(10);
    expect(t.count('SELECT COUNT(*) FROM brackets WHERE finalized_at IS NULL AND ends_at < ?', t.clock.now())).toBe(0);

    // Admin and deletion.
    for (const p of late.slice(0, 4)) await measure('admin: suspend', async () => expect((await admin(t, 'POST', `players/${p.code()}/suspend`)).status).toBe(200));
    await measure('admin: flags', async () => expect((await admin(t, 'GET', 'flags')).status).toBe(200));
    await measure('admin: player', async () => expect((await admin(t, 'GET', `players/${late[5]?.code()}`)).status).toBe(200));
    await measure('admin: stats', async () => expect((await admin(t, 'GET', 'stats?days=7')).status).toBe(200));
    await measure('delete me', async () => expect((await m.rawMe('DELETE')).status).toBe(204));

    // The daily sweep, its own trigger, a month later: every chunk loop at its limit.
    t.clock.advance(40 * DAY);
    const sweep = await measure('cron: retention sweep, every loop at its limit', () => t.app.scheduled(t.clock.now(), RETENTION_CRON));
    const chunks = 4; // DEFAULT_CONFIG.cron.sweepChunksPerRun
    expect(sweep.swept).toMatchObject({ wins: chunks, brackets: chunks, rewards: chunks, flags: chunks, players: chunks, admin_log: chunks });
    expect(sweep.finalized).toBe(0);

    if (process.env.BUDGET_REPORT) console.log(used);
    for (const [name, n] of Object.entries(used)) expect(n, name).toBeLessThanOrEqual(FREE_QUERIES_PER_INVOCATION);
  }, 120_000);
});
