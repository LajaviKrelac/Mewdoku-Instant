// Owner: G4 (Phase 2e). PUT /v1/me/profile (spec §1.8, §2.7): a word pick (first change free, then once per
// `nickname.changeCooldownMs`, guarded in SQL), the avatar (no cooldown), "Show me in rankings" (bit 2 of my
// rows in OPEN brackets only). Free text only with `nickname.freeText`. Copied to my open-bracket rows.
import { AVATAR_COUNT, validateProfileRequest, type ProfileResponse } from '../contract';
import { newRowId } from '../core/ids';
import { checkFreeText, checkPick } from '../core/nickname';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';
import type { ProfileUpdate } from '../store/sql-store';
import { playerView } from './views';

export async function putProfile(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'profile');
  const v = validateProfileRequest(await readJson(ctx.req, s.cfg.api.maxBodyBytes));
  if (!v.ok) return fail('bad_request', v.path);
  const req = v.value;
  const update: ProfileUpdate = {};
  if (req.nickname !== undefined) {
    let text: string;
    let nick: { adj: number; noun: number; num: number } | null;
    if ('text' in req.nickname) {
      if (!s.cfg.nickname.freeText) return fail('nickname_invalid', 'names are picked from the word lists');
      const c = checkFreeText(req.nickname.text);
      if (!c.ok) {
        if (c.code === 'nickname_blocked') await s.store.addFlags(player.key, [{ id: newRowId(now, s.rng), kind: 'nickname_blocked', detail: 'free text' }], now);
        return fail(c.code, c.code === 'nickname_blocked' ? 'nickname blocked' : 'nickname');
      }
      text = c.text;
      nick = null;
    } else {
      const c = checkPick(req.nickname, player.nick_num ?? 1, s.words, s.retired);
      if (!c.ok) return fail(c.code, c.code === 'nickname_blocked' ? 'nickname blocked' : 'nickname');
      nick = c.nick;
      text = `${s.words.adj[nick.adj]} ${s.words.noun[nick.noun]} ${nick.num}`;
    }
    const same = text === player.nickname && (nick === null ? player.nick_adj === null : nick.adj === player.nick_adj && nick.noun === player.nick_noun && nick.num === player.nick_num);
    if (!same) {
      const cooldown = s.cfg.nickname.changeCooldownMs;
      if (player.nick_changed_at !== null && player.nick_changed_at + cooldown > now) {
        return fail('nickname_cooldown', 'nickname changed recently', player.nick_changed_at + cooldown - now);
      }
      update.nickname = { text, nick, changedAt: now, cooldownBefore: now - cooldown };
    }
  }
  if (req.avatarId !== undefined) {
    if (req.avatarId < 0 || req.avatarId >= AVATAR_COUNT) return fail('avatar_invalid', 'avatarId');
    update.avatar = req.avatarId;
  }
  if (req.listed !== undefined) update.listed = req.listed;
  const applied = await s.store.updateProfile(player.key, update);
  if (!applied) return fail('nickname_cooldown', 'nickname changed recently', s.cfg.nickname.changeCooldownMs);
  if (update.nickname) s.metrics.count('nickname', 'changed');
  if (update.listed !== undefined) s.metrics.count('listed', update.listed ? 'on' : 'off');
  const fresh = await s.store.getPlayer(player.key);
  if (!fresh) return fail('token_invalid', 'no such player');
  const body: ProfileResponse = { player: playerView(fresh, s.cfg, now), serverTime: now };
  return json(body);
}
