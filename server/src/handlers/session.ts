// Owner: G4 (Phase 2e). POST /v1/session/nonce and POST /v1/session (spec §1.3, D-2e-2, D-2e-5).
// FB: our stateless nonce → getSignedPlayerInfoAsync(nonce) → verify the signature (CPU only), then the
// nonce's MAC and expiry, then its single use (the first DB write). The raw FB id lives in memory during
// this request only: the player key is HMAC(ID_PEPPER, pool + ":" + id).
// Web (anon mode only): a device id + secret (SHA-256 stored), its own pool, a per-IP daily quota on new
// devices. Records mode answers 403 `web_disabled`.
import { DEV_POOL_RE, validateSessionRequest, type SessionResponse } from '../contract';
import { utcDateKey, DAY, utcDayStart } from '../core/clock';
import { b64urlEncode, sha256, timingSafeEqual } from '../core/crypto';
import { verifySignedPlayerInfo } from '../core/fb-signature';
import { ipDayHash, newPlayerCode, playerKey, poolFor } from '../core/ids';
import { generateNick, renderNick } from '../core/nickname';
import { checkNonce, makeNonce, nonceHash } from '../core/nonce';
import { makeToken } from '../core/token';
import { isBelowMin } from '../core/version';
import { devAllowed, type Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { limitByIp } from '../http/auth';
import { readJson } from '../http/json';
import { rivalsNoteFor } from '../services';
import type { PlayerRow } from '../store/sql-store';
import { joinOnSession } from './join';
import { bracketView, finalizeIfDue, playerView, resultsFor, rulesView, summaryOf } from './views';

export async function postNonce(ctx: Ctx): Promise<Response> {
  limitByIp(ctx, 'session');
  const key = await ctx.s.keys.session();
  if (key === null) return fail('unavailable', 'server not configured', 60_000);
  const now = ctx.s.clock.now();
  const { nonce, expiresAt } = await makeNonce(key, now, ctx.s.cfg.nonce.ttlMs, ctx.s.rng);
  return json({ nonce, expiresAt, serverTime: now });
}

async function createPlayer(ctx: Ctx, key: string, pool: string, trust: 'signed' | 'anon', secretHash: string | null, clientVersion: string, now: number): Promise<PlayerRow> {
  const s = ctx.s;
  // A suspended player who deleted their data keeps a tombstone: delete-and-return does not lift the
  // suspension, and nothing is created while it lasts (spec §1.9.7, §1.11).
  const tomb = await s.store.tombstoneUntil(key);
  if (tomb !== null && tomb > now) return fail('suspended', 'ranking paused for this player');
  const status = 'ok';
  // The first name is seeded with the key AND the creation time (requests-G1 R3, lead I-2; spec §1.11): a player
  // re-created after "Delete my ranking data" (same key) gets a new name as well as a new code, not the old one.
  const seed = await sha256(`nick:${key}:${now}`);
  const { nick, avatarId } = generateNick(seed, s.words, s.retired);
  let created = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await s.store.insertPlayer(
      {
        key,
        code: newPlayerCode(s.rng),
        pool,
        trust,
        secretHash,
        nickname: renderNick(s.words, nick),
        nick,
        avatar: avatarId,
        status,
        budgetMs: s.cfg.antiCheat.budget.initialMs,
        clientVersion,
      },
      now,
    );
    created = r === 'created';
    if (r !== 'code_taken') break;
  }
  const p = await s.store.getPlayer(key);
  if (!p) return fail('unavailable', 'could not create the player', 5000);
  if (created) s.metrics.count('session', 'new');
  return p;
}

export async function postSession(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  limitByIp(ctx, 'session');
  const sessionKey = await s.keys.session();
  const pepper = await s.keys.pepper();
  if (sessionKey === null || pepper === null) return fail('unavailable', 'server not configured', 60_000);
  const raw = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
  const v = validateSessionRequest(raw, { devPools: devAllowed(ctx) });
  if (!v.ok) return fail('bad_request', v.path);
  const body = v.value;
  const devPool = body.devPool !== undefined && DEV_POOL_RE.test(body.devPool) ? body.devPool : null;
  if (isBelowMin(body.clientVersion, s.cfg.minClientVersion)) fail('upgrade_required', `client ${body.clientVersion} below ${s.cfg.minClientVersion}`);

  let pool: string;
  let id: string;
  let trust: 'signed' | 'anon';
  let secretHash: string | null = null;
  if (body.platform === 'fb') {
    if (s.cfg.deployEnv === 'production' && s.env.FB_APP_SECRET_ALT) {
      // C-15: the production Worker refuses to run sessions while a test secret is set.
      s.log({ level: 'error', msg: 'FB_APP_SECRET_ALT is set on a production deploy: sessions refused' });
      return fail('unavailable', 'server misconfigured', 60_000);
    }
    const keys = await s.keys.fb();
    if (keys.length === 0) return fail('unavailable', 'server not configured', 60_000);
    // Real time: FB's issued_at and our nonces never move with a dev test pool's clock (only game logic does).
    const now0 = s.clock.now();
    let sig = await verifySignedPlayerInfo(body.signature, body.nonce, now0, keys, s.cfg.signature);
    if (!sig.ok && sig.code === 'signature_stale' && devPool !== null) {
      // Dev test pools only (DEV_ROUTES on a loopback host; `devPool` is a 400 anywhere else): an e2e browser
      // whose clock was moved (Playwright's page.clock) signs issued_at on that clock, so the issued_at
      // window is also checked against the pool's clock (/dev/clock keeps both in step). The MAC, the
      // algorithm and the single-use nonce are checked exactly as always.
      const poolNow = s.nowFor(poolFor('fb', devPool, false));
      if (poolNow !== now0) sig = await verifySignedPlayerInfo(body.signature, body.nonce, poolNow, keys, s.cfg.signature);
    }
    if (!sig.ok) {
      s.metrics.count('session', sig.code);
      ctx.fields.why = sig.why;
      return fail(sig.code, sig.code === 'signature_stale' ? 'issued_at outside the window' : 'signature does not verify');
    }
    if (sig.playerId !== body.playerId) return fail('bad_signature', 'player id does not match the signature');
    const n = await checkNonce(sessionKey, body.nonce, now0, s.cfg.nonce.ttlMs);
    if (!n.ok) {
      s.metrics.count('session', 'nonce_invalid');
      return fail('nonce_invalid', `nonce ${n.why}`);
    }
    if (!(await s.store.useNonce(await nonceHash(body.nonce), n.expiresAt))) {
      s.metrics.count('session', 'nonce_replay');
      return fail('nonce_replay', 'nonce already used');
    }
    const synthetic = sig.keyIndex > 0; // signed with FB_APP_SECRET_ALT (staging/dev): never the real pool (H-1)
    pool = poolFor('fb', devPool, synthetic);
    id = sig.playerId;
    trust = 'signed';
    ctx.fields.fields = sig.fields.join(',');
    // G-SRV-1: the origin each FB surface really sends (a host, never personal data), for the production allow-list.
    ctx.fields.origin = (ctx.req.headers.get('Origin') ?? 'none').slice(0, 200);
  } else {
    if (s.cfg.web.mode !== 'anon') return fail('web_disabled', 'web ranking is off');
    pool = poolFor('web', devPool, false);
    id = body.device.id;
    trust = 'anon';
    secretHash = b64urlEncode(await sha256(`device:${body.device.secret}`));
  }

  const key = await playerKey(pepper, pool, id);
  const now = s.nowFor(pool);
  ctx.serverTime = now;
  ctx.fields.pool = pool;
  let player = await s.store.getPlayer(key);
  if (player) {
    if (trust === 'anon' && !timingSafeEqual(player.secret_hash ?? '', secretHash ?? '')) return fail('bad_signature', 'device credential does not match');
    if (player.status === 'suspended') {
      ctx.fields.code = player.code;
      return fail('suspended', 'ranking paused for this player');
    }
    await s.store.touchPlayer(key, now, body.clientVersion);
  } else {
    if (trust === 'anon') {
      const day = utcDateKey(now);
      const n = await s.store.bumpIpQuota(day, await ipDayHash(pepper, day, ctx.ip));
      if (n > s.cfg.web.newDevicesPerIpPerDay) {
        s.metrics.count('session', 'anon_burst');
        return fail('rate_limited', 'new devices per IP per day', utcDayStart(now) + DAY - now);
      }
    }
    player = await createPlayer(ctx, key, pool, trust, secretHash, body.clientVersion, now);
    if (player.status === 'suspended') {
      ctx.fields.code = player.code;
      return fail('suspended', 'ranking paused for this player');
    }
  }
  ctx.fields.code = player.code;
  if (player.cur_bracket !== null && (player.cur_ends_at ?? 0) <= now) await finalizeIfDue(s, player.cur_bracket, now);
  // Leaderboard update: the auto-join (`join`), else "Online now" on my row of my running bracket.
  let joined = false;
  if (body.join === true) ({ player, joined } = await joinOnSession(s, player, now));
  if (!joined && s.cfg.presence.enabled && player.listed === 1 && player.cur_bracket !== null && (player.cur_ends_at ?? 0) > now) {
    await s.store.setPresence(key, player.cur_bracket, now, false);
  }
  if (joined) ctx.fields.joined = 1;
  const [results, view] = await Promise.all([resultsFor(s, key, now), bracketView(s, player, now)]);
  const expiresAt = now + s.cfg.session.ttlMs;
  const token = await makeToken(sessionKey, { k: key, c: player.code, p: pool, t: trust, v: body.clientVersion, iat: now, exp: expiresAt });
  s.metrics.count('session', 'ok');
  const res: SessionResponse = {
    token,
    expiresAt,
    player: playerView(player, s.cfg, now),
    // D-2e-24, H-9: the disclosure line for this player's pool (a test pool by its /dev/rivals switch).
    rules: rulesView(s.cfg, rivalsNoteFor(s, player.pool)),
    results,
    bracket: summaryOf(view),
    limits: { maxWinsPerRequest: s.cfg.api.maxWinsPerRequest, queueMax: s.cfg.api.queueMax },
    serverTime: now,
  };
  return json(res);
}
