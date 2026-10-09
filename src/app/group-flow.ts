// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §4.8): a challenge's score is the
// FISH KEPT at each counted win (not level points), and rank-mode non-winners get groups.placeHints
// hints (there are no fish to give).
// Group challenges (phase2b §5.6; FB only, flag groupChallenges, off until §14 G2): start a challenge
// (GroupProvider.create, groups.durationH), add each win's fish kept to save.groups[id] in a challenge's
// context and post the total, and on the first launch after endsAt resolve the reward — participation
// mode (default): wins ≥ groups.minWinsForReward → 2 kitties, or 4 with the `group_double` video (not
// 2 + 4), copy says "finished", never "won"; rank mode: standings or fall back to participation. One
// claim per challenge; no rank or result is ever guessed; rewards are for playing, never for inviting.
// C-internal module. platform.groups is read at call time (the FB social chunk adds it after start()).
import { grant } from '../game/economy';
import { capGroups } from '../game/save-v2';
import type { GroupRecord, SaveData } from '../game/types';
import type { GroupProvider } from '../platform/types';
import type { GroupResultOutcome } from '../ui/overlays/group-result';
import type { Clock } from './clock';
import { cfg, type GameConfig } from './config';
import type { AnalyticsEvent } from './events';
import { isFlagOn } from './flags';

export interface GroupFlowDeps {
  /** The provider at call time (undefined on the web and until the FB social chunk lands). */
  readonly groups: () => GroupProvider | undefined;
  /** capabilities().groups. */
  readonly supported: () => boolean;
  /** Whether a rewarded video can be offered for the double (capabilities().rewarded). */
  readonly rewardedAvailable: () => boolean;
  /** Plays the `group_double` rewarded video; true when watched to the end. */
  readonly watchDouble: () => Promise<boolean>;
  save(): SaveData;
  updateSave(fn: (s: SaveData) => SaveData): void;
  /** saves.now() after a grant or a new challenge. */
  persist(): void;
  log(e: AnalyticsEvent): void;
  readonly clock: Clock;
  readonly config?: GameConfig;
}

/** A finished challenge's reward to show (group_result), with how to claim it. */
export interface PendingGroupResult {
  readonly id: string;
  readonly outcome: GroupResultOutcome;
  /** Rank mode only. */
  readonly place: number | null;
}

export interface GroupFlow {
  /** Whether group challenges are on here (flag, provider, capability). */
  enabled(): boolean;
  /** Rankings hub → "Start a group challenge". Never rejects. */
  start(title: string): Promise<boolean>;
  /** After a counted win: add its fish kept in the current challenge's context and post the total. Never rejects. */
  onWin(fish: number): Promise<void>;
  /** Launch: the first ended, unclaimed challenge's result to show (group_result), or null. Never rejects. */
  pendingResult(): Promise<PendingGroupResult | null>;
  /**
   * Claims a pending result once: `doubled` plays the video first (participation / won only); when the
   * video fails nothing is claimed and false is returned (the dialog stays). Never rejects.
   */
  claim(result: PendingGroupResult, doubled: boolean): Promise<boolean>;
  /** The running challenge in the current context, for the hub's Groups tab. */
  active(): Promise<{ readonly id: string; readonly endsAt: number; readonly wins: number } | null>;
}

const HOUR_MS = 3_600_000;

export function createGroupFlow(deps: GroupFlowDeps): GroupFlow {
  const c = deps.config ?? cfg;
  const { clock } = deps;
  const provider = (): GroupProvider | null => {
    if (!isFlagOn('groupChallenges')) return null;
    try {
      return deps.supported() ? (deps.groups() ?? null) : null;
    } catch {
      return null;
    }
  };
  const setGroup = (id: string, rec: GroupRecord): void =>
    deps.updateSave((s) => ({ ...s, groups: capGroups({ ...s.groups, [id]: rec }, c.groups.keep) }));

  async function current(p: GroupProvider): Promise<{ id: string; endTimeMs: number } | null> {
    try {
      return await p.current();
    } catch {
      return null;
    }
  }

  const flow: GroupFlow = {
    enabled: () => provider() !== null,
    async start(title) {
      const p = provider();
      if (!p) return false;
      try {
        const endsAt = clock.now() + c.groups.durationH * HOUR_MS;
        const made = await p.create(endsAt, title);
        if (!made) return false;
        setGroup(made.id, { endsAt, total: 0, wins: 0, claimed: 0 });
        deps.persist();
        deps.log({ name: 'group_create', params: {} });
        return true;
      } catch {
        return false;
      }
    },
    async onWin(fish) {
      const p = provider();
      if (!p || fish <= 0) return;
      const cur = await current(p);
      if (!cur) return;
      const now = clock.now();
      const prev = deps.save().groups[cur.id];
      const endsAt = prev?.endsAt ?? cur.endTimeMs;
      if (now >= endsAt) return; // fish after the end never count
      const rec: GroupRecord = {
        endsAt,
        total: (prev?.total ?? 0) + Math.max(0, Math.floor(fish)),
        wins: (prev?.wins ?? 0) + 1,
        claimed: prev?.claimed ?? 0,
      };
      setGroup(cur.id, rec);
      deps.persist();
      try {
        await p.post(rec.total); // a failed post is not retried: the next win posts the higher total
      } catch {
        // ignored by design
      }
    },
    async pendingResult() {
      const p = provider();
      if (!p) return null;
      const now = clock.now();
      const groups = deps.save().groups;
      const ended = Object.keys(groups)
        .filter((id) => {
          const g = groups[id] as GroupRecord;
          return g.claimed === 0 && g.endsAt <= now;
        })
        .sort((a, b) => (groups[a] as GroupRecord).endsAt - (groups[b] as GroupRecord).endsAt);
      for (const id of ended) {
        const g = groups[id] as GroupRecord;
        const withAd = deps.rewardedAvailable() ? c.groups.rewardKittiesWithAd : null;
        const participation = (): PendingGroupResult | null =>
          g.wins >= c.groups.minWinsForReward
            ? { id, outcome: { kind: 'participation', kitties: c.groups.rewardKitties, kittiesWithAd: withAd }, place: null }
            : null;
        let result: PendingGroupResult | null = null;
        if (c.groups.rewardMode === 'rank' && p.standings) {
          let st: Awaited<ReturnType<NonNullable<GroupProvider['standings']>>> = null;
          try {
            st = await p.standings(id);
          } catch {
            st = null;
          }
          if (st === null) result = participation(); // no standings: the participation rule, never a guess
          else if (st.myRank === 1 || st.tiedFirst) result = { id, outcome: { kind: 'won', kitties: c.groups.rewardKitties, kittiesWithAd: withAd }, place: 1 };
          else if (g.wins >= 1) result = { id, outcome: { kind: 'place', place: st.myRank, count: st.count, hints: c.groups.placeHints }, place: st.myRank };
        } else result = participation();
        if (result) return result;
        // Nothing earned: close it quietly so it is never asked about again.
        setGroup(id, { ...g, claimed: 1 });
        deps.persist();
      }
      return null;
    },
    async claim(result, doubled) {
      const g = deps.save().groups[result.id];
      if (!g || g.claimed === 1) return false;
      const o = result.outcome;
      let doubledOk = false;
      if (doubled && o.kind !== 'place' && o.kittiesWithAd !== null) {
        try {
          doubledOk = await deps.watchDouble();
        } catch {
          doubledOk = false;
        }
        if (!doubledOk) return false;
      }
      const latest = deps.save().groups[result.id];
      if (!latest || latest.claimed === 1) return false;
      deps.updateSave((s) => {
        let out = s;
        if (o.kind === 'place') out = grant(out, 'hints', o.hints, c);
        else out = grant(out, 'kitties', doubledOk && o.kittiesWithAd !== null ? o.kittiesWithAd : o.kitties, c);
        return { ...out, groups: { ...out.groups, [result.id]: { ...latest, claimed: 1 } } };
      });
      deps.persist();
      deps.log({
        name: 'group_result',
        params: {
          mode: c.groups.rewardMode === 'rank' && o.kind !== 'participation' ? 'rank' : 'participation',
          ...(result.place !== null ? { place: result.place } : {}),
          wins: latest.wins,
          doubled: doubledOk ? 1 : 0,
        },
      });
      return true;
    },
    async active() {
      const p = provider();
      if (!p) return null;
      const cur = await current(p);
      if (!cur) return null;
      const rec = deps.save().groups[cur.id];
      const endsAt = rec?.endsAt ?? cur.endTimeMs;
      if (clock.now() >= endsAt) return null;
      return { id: cur.id, endsAt, wins: rec?.wins ?? 0 };
    },
  };
  return flow;
}
