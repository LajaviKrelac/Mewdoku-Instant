// Owner: G4 (Phase 2e). POST /v1/wins (spec §1.4, §1.5, §1.9): 1–10 wins (live or queued, oldest first),
// one verdict each, then my bracket after them (the panel needs no second call).
// Reads before the write: the player (auth; its wins token, level baseline and budget), the stored wins of
// these ids (dedupe), the member's win count. The write is ONE guarded batch (§1.9.6) carrying the token it read
// (audit A-S3): a concurrent wins request of the same player that committed first moves the token, this batch
// writes nothing and the wins are evaluated again, so the bracket cap and the budget hold under concurrency. A
// join or create that lost its race left no trace and is tried again (≤ PLACE_TRIES; §1.5 steps 3–4). The answer
// never reports a final verdict the database does not hold (audit A-S1): unplaced wins answer 503 and stay queued.
// UI batch (victory): an accepted daily win adds to the day's solve-time rollup in the same batch, and a daily win
// this request placed is answered with `daily` { solvers, slower } (H-2a) once the day has enough other solvers.
import { MAX_WINS_PER_REQUEST, validateWinsRequest, type DailyStanding, type WinResult, type WinsResponse } from '../contract';
import { bracketTimes } from '../core/brackets';
import { newBracketId, newRowId } from '../core/ids';
import { isBelowMin } from '../core/version';
import { dailyBucket, evaluateWins, type WinDecision } from '../core/wins';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';
import type { BracketTarget, WinWrite } from '../store/sql-store';
import { bracketView, finalizeIfDue } from './views';

/** Places per evaluation: each a join, a create or a write into my bracket (spec §1.5; audit A-S1). */
const PLACE_TRIES = 8;
/** Evaluations per request: a concurrent wins request of the same player committed after our read (audit A-S3). */
const EVAL_TRIES = 4;
/** retryAfterMs when a request could not be counted now (the client keeps its queue and sends it again). */
const BUSY_RETRY_MS = 2_000;
/** UI batch (victory): daily standings read per request (today's and yesterday's daily; the statement budget). */
const DAILY_READS = 2;


type Attempt =
  | { readonly kind: 'done'; readonly decisions: readonly WinDecision[]; readonly current: string | null; readonly flags: number }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unplaced' };

export async function postWins(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const authed = await authenticate(ctx, 'wins');
  const now = authed.now;
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

  // Wins this request placed (by winId), with the verdict they were placed with: an evaluation after a
  // conflict reads them back as stored ('duplicate') and the answer keeps the original verdict.
  const placedHere = new Map<string, WinDecision>();
  /** UI batch (victory): the wins of this request that added one to the daily rollup (their own row is in the totals). */
  const rolledHere = new Set<string>();
  let player = authed.player;
  let unknownLogged = false;

  /**
   * One evaluation against one read of the player (its token, level baseline and budget), my running bracket's
   * member row and the stored wins of these ids; then ONE applied batch at most (spec §1.9.6). Returns
   * 'conflict' when a concurrent wins request of this player committed after the read (the token moved), and
   * 'unplaced' when no bracket took the wins within PLACE_TRIES (a burst in the pool; never reported as counted).
   */
  const attempt = async (): Promise<Attempt> => {
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
    if (ev.unknownVersions.length > 0 && !unknownLogged) {
      unknownLogged = true;
      s.metrics.count('content_version_unknown', ev.unknownVersions[0]);
      ctx.fields.unknownVersions = ev.unknownVersions.join(',');
    }
    const decisions = ev.decisions.map((d) => (d.verdict === 'duplicate' && placedHere.has(d.win.winId) ? (placedHere.get(d.win.winId) as WinDecision) : d));
    const toWrite = decisions.filter((d) => d.write);
    const writes: WinWrite[] = toWrite.map((d) => {
      const w: WinWrite = {
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
      // UI batch (victory): an accepted (never a flagged) daily win joins the day's solve-time rollup.
      return s.cfg.dailyStats.enabled && d.verdict === 'accepted' && d.ref?.mode === 'daily' ? { ...w, dailyBucket: dailyBucket(d.win.solveMs, s.cfg) } : w;
    });
    const flags = decisions
      .filter((d) => !placedHere.has(d.win.winId))
      .flatMap((d) => d.flags)
      .map((f) => ({ id: newRowId(now, s.rng), kind: f.kind, detail: f.detail }));
    const base = {
      playerKey: player.key,
      nickname: player.nickname,
      avatar: player.avatar,
      frame: player.frame,
      bg: player.bg,
      now,
      player: ev.player,
      flags,
      wins: writes,
      cas: { expect: player.wtok, next: newRowId(now, s.rng) },
    };
    const done = (cur: string | null): Attempt => ({ kind: 'done', decisions, current: cur, flags: flags.length });
    if (writes.length === 0) {
      // Nothing to count: the baseline, budget and flags alone (rejected wins, duplicates).
      const r = await s.store.writeWins({ ...base, target: null });
      return r.applied ? done(current) : { kind: 'conflict' };
    }
    let cur = current;
    for (let tries = 0; tries < PLACE_TRIES; tries++) {
      let target: BracketTarget;
      if (cur !== null) target = { kind: 'current', bracketId: cur };
      else {
        const open = await s.store.findOpenBracket(player.pool, now);
        if (open !== null) target = { kind: 'join', bracketId: open };
        else {
          const t = bracketTimes(s.cfg.bracket.periodMode, now, s.cfg);
          target = {
            kind: 'create',
            bracket: { id: newBracketId(now, s.rng), pool: player.pool, mode: s.cfg.bracket.periodMode, openedAt: t.openedAt, joinUntil: t.joinUntil, endsAt: t.endsAt, maxMembers: s.cfg.bracket.maxMembers },
          };
        }
      }
      const r = await s.store.writeWins({ ...base, target });
      const into = target.kind === 'create' ? target.bracket.id : target.bracketId;
      if (r.applied) {
        if (target.kind !== 'current') s.metrics.count('join', target.kind === 'create' ? 'new_bracket' : 'existing');
        // Under the token every win of an applied batch goes in; anything else is a race we did not foresee:
        // evaluate again (the stored rows then answer for themselves).
        toWrite.forEach((d, k) => {
          if (r.inserted[k] === true) placedHere.set(d.win.winId, d);
          if (r.rolled[k] === true) rolledHere.add(d.win.winId);
        });
        if (r.inserted.some((x) => !x)) return { kind: 'conflict' };
        return done(into);
      }
      // Nothing of the batch was written. A moved token: another wins request of mine committed first.
      const p = await s.store.getPlayer(player.key);
      if (p === null) return fail('token_invalid', 'no such player');
      if (p.wtok !== player.wtok) return { kind: 'conflict' };
      // Same token: the join lost its race (the bracket filled), the create lost the pool guard (another
      // player's bracket opened: join it), or my bracket stopped taking wins. Look again.
      cur = p.cur_bracket !== null && (p.cur_ends_at ?? 0) > now ? p.cur_bracket : null;
    }
    return { kind: 'unplaced' };
  };

  let out: Attempt = { kind: 'conflict' };
  for (let i = 0; i < EVAL_TRIES; i++) {
    out = await attempt();
    if (out.kind !== 'conflict') break;
    s.metrics.count('wins_conflict');
    const fresh = await s.store.getPlayer(player.key);
    if (fresh === null) return fail('token_invalid', 'no such player');
    player = fresh;
  }
  // Never a final verdict for a win that was not stored (audit A-S1): the client keeps its queue and sends it
  // again; the wins this request did store then answer 'duplicate' with their points.
  if (out.kind === 'conflict') return fail('unavailable', 'other wins of this player are being counted; try again', BUSY_RETRY_MS);
  if (out.kind === 'unplaced') {
    s.metrics.count('wins_unplaced');
    return fail('unavailable', 'no bracket could take the wins now; try again', BUSY_RETRY_MS);
  }
  const { decisions, current } = out;
  if (s.cfg.antiCheat.autoSuspendFlags > 0 && out.flags > 0 && player.flag_count + out.flags >= s.cfg.antiCheat.autoSuspendFlags) {
    await s.store.suspend(player.key, newRowId(now, s.rng), now, `auto: ${player.flag_count + out.flags} flags`);
  }

  // UI batch (victory, spec §0.4 H-2a): a daily win this request placed carries how many OTHER players of my pool
  // solved that daily and how many of them were strictly slower (buckets above mine; my own bucket never counts as
  // slower), once there are dailyStats.minSolvers of them. Newest first, at most DAILY_READS reads.
  const standings = new Map<string, DailyStanding>();
  if (s.cfg.dailyStats.enabled) {
    const placed = decisions.filter((d) => d.ref?.mode === 'daily' && placedHere.get(d.win.winId) === d);
    for (const d of placed.slice(-DAILY_READS)) {
      const t = await s.store.dailyTotals(d.win.puzzleId, player.pool, dailyBucket(d.win.solveMs, s.cfg));
      const solvers = t.total - (rolledHere.has(d.win.winId) ? 1 : 0);
      if (solvers >= s.cfg.dailyStats.minSolvers) standings.set(d.win.winId, { solvers, slower: Math.max(0, Math.min(t.slower, solvers)) });
    }
  }

  const results: WinResult[] = decisions.map((d) => {
    const r = { winId: d.win.winId, verdict: d.verdict, points: d.verdict === 'rejected' || d.verdict === 'already_counted' ? 0 : d.points };
    const withReason = d.reason === undefined ? r : { ...r, reason: d.reason };
    const daily = standings.get(d.win.winId);
    return daily === undefined ? withReason : { ...withReason, daily };
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
