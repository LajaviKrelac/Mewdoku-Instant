// Owner: G4 (Phase 2e). POST /v1/wins (spec §1.4, §1.5, §1.9): 1–10 wins (live or queued, oldest first),
// one verdict each, then my bracket after them (the panel needs no second call).
// Reads before the write: the player (auth), the stored wins of these ids (dedupe), the member's win count.
// The write is ONE guarded batch (§1.9.6); a join that lost its race left no trace and is retried at
// most 3 times, then a new bracket opens (§1.5 steps 3–4). The answer never reports points the database
// did not add.
import { MAX_WINS_PER_REQUEST, validateWinsRequest, type WinResult, type WinsResponse } from '../contract';
import { bracketTimes } from '../core/brackets';
import { newBracketId, newRowId } from '../core/ids';
import { isBelowMin } from '../core/version';
import { evaluateWins, type WinDecision } from '../core/wins';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';
import type { BracketTarget, WinWrite } from '../store/sql-store';
import { bracketView, finalizeIfDue } from './views';

const JOIN_TRIES = 3;

export async function postWins(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'wins');
  const raw = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { wins?: unknown }).wins)) {
    const n = (raw as { wins: unknown[] }).wins.length;
    if (n > Math.min(MAX_WINS_PER_REQUEST, s.cfg.api.maxWinsPerRequest)) fail('too_large', `${n} wins: at most ${MAX_WINS_PER_REQUEST} per request`);
  }
  const v = validateWinsRequest(raw);
  if (!v.ok) return fail('bad_request', v.path);
  const wins = v.value.wins;
  ctx.fields.n = wins.length;
  for (const w of wins) if (isBelowMin(w.clientVersion, s.cfg.minClientVersion)) fail('upgrade_required', `client ${w.clientVersion} below ${s.cfg.minClientVersion}`);

  // My running bracket; an ended one is finalised on the way (the next win opens or joins a new one).
  let current: string | null = player.cur_bracket !== null && (player.cur_ends_at ?? 0) > now ? player.cur_bracket : null;
  if (player.cur_bracket !== null && current === null) await finalizeIfDue(s, player.cur_bracket, now);
  const [stored, member] = await Promise.all([
    s.store.storedWins(
      player.key,
      wins.map((w) => w.winId),
      wins.map((w) => w.puzzleId),
    ),
    current === null ? Promise.resolve(null) : s.store.getMember(current, player.key),
  ]);
  if (current !== null && member === null) current = null; // (deleted meanwhile) — join anew
  const ev = evaluateWins({
    player: { listed: player.listed === 1, maxLevel: player.max_level, budgetMs: player.budget_ms, budgetAt: player.budget_at },
    wins,
    stored: stored.map((r) => ({ puzzleId: r.puzzle_id, winId: r.win_id, points: r.points })),
    memberWins: member?.wins ?? 0,
    now,
    cfg: s.cfg,
    content: s.content,
  });
  if (ev.unknownVersions.length > 0) {
    s.metrics.count('content_version_unknown', ev.unknownVersions[0]);
    ctx.fields.unknownVersions = ev.unknownVersions.join(',');
  }
  const decisions: WinDecision[] = [...ev.decisions];
  const writeIdx = decisions.map((d, i) => (d.write ? i : -1)).filter((i) => i >= 0);
  const writes: WinWrite[] = writeIdx.map((i) => {
    const d = decisions[i] as WinDecision;
    return {
      puzzleId: d.win.puzzleId,
      winId: d.win.winId,
      points: d.points,
      fish: d.win.fish,
      solveMs: d.win.solveMs,
      n: d.n,
      verdict: d.verdict === 'accepted_flagged' ? 'accepted_flagged' : 'accepted',
      playedAt: d.win.playedAt,
      clientVersion: d.win.clientVersion,
    };
  });
  const flags = decisions.flatMap((d) => d.flags).map((f) => ({ id: newRowId(now, s.rng), kind: f.kind, detail: f.detail }));
  const extras = { playerKey: player.key, nickname: player.nickname, avatar: player.avatar, now, player: ev.player, flags };
  const noExtras = { ...extras, player: { maxLevel: 0, budgetMs: ev.player.budgetMs, budgetAt: ev.player.budgetAt }, flags: [] };

  /**
   * One write: into my running bracket, or a join (≤ 3 tries into the pool's open bracket, then a new one;
   * spec §1.5). A join that lost its race left no trace (every statement is guarded); when the reason is
   * that another request of mine joined meanwhile, the wins go into that bracket instead.
   */
  let extrasDone = false;
  const writeOnce = async (pending: readonly WinWrite[], cur: string | null): Promise<{ inserted: readonly boolean[]; bracket: string | null }> => {
    const base = { ...(extrasDone ? noExtras : extras), wins: pending };
    if (cur !== null) {
      const r = await s.store.writeWins({ ...base, target: { kind: 'current', bracketId: cur } });
      extrasDone = true;
      return { inserted: r.inserted, bracket: cur };
    }
    const mine = async (): Promise<string | null> => {
      const p = await s.store.getPlayer(player.key);
      return p !== null && p.cur_bracket !== null && (p.cur_ends_at ?? 0) > now ? p.cur_bracket : null;
    };
    for (let attempt = 0; attempt < JOIN_TRIES; attempt++) {
      const open = await s.store.findOpenBracket(player.pool, now);
      if (open === null) break;
      const r = await s.store.writeWins({ ...base, target: { kind: 'join', bracketId: open } });
      // Every statement after the member insert is guarded by "I am a member of this bracket", so when
      // another request of mine joined it meanwhile, this batch still wrote my wins there: success either way.
      if (r.joinedSlot !== null || r.inserted.some((x) => x) || (await s.store.getMember(open, player.key)) !== null) {
        extrasDone = true;
        s.metrics.count('join', r.joinedSlot !== null ? 'existing' : 'already_member');
        return { inserted: r.inserted, bracket: open };
      }
      const now2 = await mine();
      if (now2 !== null) return writeOnce(pending, now2);
    }
    const t = bracketTimes(s.cfg.bracket.periodMode, now, s.cfg);
    const target: BracketTarget = {
      kind: 'create',
      bracket: { id: newBracketId(now, s.rng), pool: player.pool, mode: s.cfg.bracket.periodMode, openedAt: t.openedAt, joinUntil: t.joinUntil, endsAt: t.endsAt, maxMembers: s.cfg.bracket.maxMembers },
    };
    const r = await s.store.writeWins({ ...base, target });
    if (r.joinedSlot !== null) {
      extrasDone = true;
      s.metrics.count('join', 'new_bracket');
      return { inserted: r.inserted, bracket: target.bracket.id };
    }
    const now3 = await mine();
    if (now3 !== null) return writeOnce(pending, now3);
    // Nothing new to count (every win is stored already): no bracket to join.
    return { inserted: pending.map(() => false), bracket: null };
  };

  let pendingIdx = writeIdx;
  for (let round = 0; round < 2 && pendingIdx.length > 0; round++) {
    const cur = round === 0 ? current : await (async () => {
      const p = await s.store.getPlayer(player.key);
      return p !== null && p.cur_bracket !== null && (p.cur_ends_at ?? 0) > now ? p.cur_bracket : null;
    })();
    const r = await writeOnce(
      pendingIdx.map((i) => writes[writeIdx.indexOf(i)] as WinWrite),
      cur,
    );
    if (r.bracket !== null) current = r.bracket;
    const lost = pendingIdx.filter((_, k) => r.inserted[k] !== true);
    if (lost.length === 0) {
      pendingIdx = [];
      break;
    }
    // A win whose row did not go in: counted by a concurrent request (answer from the stored row), or its
    // bracket ended between the read and the write (try once more: it joins the next bracket).
    const again = await s.store.storedWins(
      player.key,
      lost.map((i) => (decisions[i] as WinDecision).win.winId),
      lost.map((i) => (decisions[i] as WinDecision).win.puzzleId),
    );
    const retry: number[] = [];
    for (const i of lost) {
      const d = decisions[i] as WinDecision;
      const same = again.find((x) => x.win_id === d.win.winId);
      const other = again.find((x) => x.puzzle_id === d.win.puzzleId);
      if (same) decisions[i] = { ...d, verdict: 'duplicate', points: same.points, write: false };
      else if (other) decisions[i] = { ...d, verdict: 'already_counted', points: 0, write: false };
      else retry.push(i);
    }
    pendingIdx = retry;
  }
  for (const i of pendingIdx) {
    // Still not written after the retry (a pathological race): never report points the DB did not add.
    const d = decisions[i] as WinDecision;
    decisions[i] = { ...d, verdict: 'already_counted', points: 0, write: false };
  }
  if (!extrasDone) await s.store.writeWins({ ...extras, wins: [], target: null });
  if (s.cfg.antiCheat.autoSuspendFlags > 0 && flags.length > 0 && player.flag_count + flags.length >= s.cfg.antiCheat.autoSuspendFlags) {
    await s.store.suspend(player.key, newRowId(now, s.rng), now, `auto: ${player.flag_count + flags.length} flags`);
  }

  const results: WinResult[] = decisions.map((d) => {
    const r = { winId: d.win.winId, verdict: d.verdict, points: d.verdict === 'rejected' || d.verdict === 'already_counted' ? 0 : d.points };
    return d.reason === undefined ? r : { ...r, reason: d.reason };
  });
  for (const r of results) s.metrics.count('win', r.reason ? `${r.verdict}:${r.reason}` : r.verdict);
  ctx.fields.verdicts = results.map((r) => (r.reason ? `${r.verdict}:${r.reason}` : r.verdict)).join(',');
  const view = await bracketView(s, { key: player.key, pool: player.pool, cur_bracket: current ?? player.cur_bracket }, now);
  const body: WinsResponse = {
    results,
    windowPoints: view.state === 'open' ? (view.me?.points ?? 0) : 0,
    bracket: view.state === 'none' ? null : view,
    serverTime: now,
  };
  return json(body);
}
