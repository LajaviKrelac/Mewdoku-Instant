// Owner: D
// RankingProvider for FBIG (phase2b §5.2, §5.4). The probe, in order (exact getSupportedAPIs strings
// are [uncertain], so it also checks typeof at runtime; see fb-probe.ts):
//   1. getLeaderboardAsync → api 'classic' (mine = getPlayerEntryAsync, top = getEntriesAsync(n, 0));
//   2. globalLeaderboards.setScoreAsync + getTopEntriesAsync → api 'nezp' (myRank false, isMe false);
//   3. otherwise api 'none': every call answers 'unsupported' / null / [].
// Board ids come from VITE_FB_LEADERBOARDS (a JSON map BoardKey → dashboard name or id); a board
// without an id is 'unsupported'. Every call has the rank.fetchTimeoutMs deadline and never rejects.
// LEADERBOARD_SCORE_NOT_IMPROVED → 'not_improved'. Lazy `fb-social` chunk.
//
// Reads after a write: mine() / top() / showList() on a board first wait for a submit to that board
// that is still in flight (inside the same deadline), so a panel fetched right after a win sees the
// new score.
//
// Never fabricated (§5.1): every RankEntry and overlay row comes from an entry the API returned;
// entries with a missing or invalid score are dropped, never patched. A NEZP entry without a rank
// takes its 1-based position in the API's ordered top list.
//
// daily_fastest (review FB2B-4): one board for every day, and a newer day outranks any older one
// (§5.3), so players in later time zones who already posted the next day's daily sit above the shown
// day. With a `keep` filter (RankListView.keep, top(…, keep)) the reader pages past them (classic:
// getEntriesAsync(fetchCount, offset), at most BAND_MAX_PAGES pages; NEZP: one read, it has no
// offset) until the shown day's band ends, and numbers the band's rows by their position inside it.
// My row is pinned only when it was found inside that band, with that position.
//
// LEADERBOARD_NOT_FOUND from any call (an id in VITE_FB_LEADERBOARDS the dashboard lacks) latches the
// board as missing for the session (review FB2B-6): every later call answers unsupported / null / []
// without an SDK call, and supports(board) is false, so the app shows personal records.
//
// [uncertain: §14 G1] which API 8.0 serves (Meta's 2026 search results call the NEZP
// globalLeaderboards the older way and point zero-permissions games at their own backend); classic
// setScoreAsync answering the stored (better) entry when the new score does not beat it (7.1
// behaviour: we report 'not_improved' when the returned score differs); LEADERBOARD_NOT_FOUND for
// a board missing in the dashboard ('unsupported'); NEZP entry shape (getScore, getPlayer().
// getSessionID(), [search: Meta docs]; getRank is optional here).
import { cfg, type GameConfig } from '../../app/config';
import { formatNumber, t } from '../../i18n';
import { within } from '../shared/timers';
import type { BoardKey, PlatformTimers, RankEntry, RankingCaps, RankingProvider, RankListView } from '../types';
import { fbErrorCode } from './fb-errors';
import type { FbOverlayViews } from './fb-overlay-views';
import { overlayViewsSupported, probeRankingApi as probeApi, rankingCaps } from './fb-probe';
import type { FBInstantSDK, FBLeaderboard, FBLeaderboardEntry } from './fbinstant';
import { rankListData, rankListTemplate, type RankListRow } from './views/rank-list';

export { parseLeaderboardMap } from './fb-probe';

export interface FbRankingOptions {
  /** parseLeaderboardMap(import.meta.env.VITE_FB_LEADERBOARDS). */
  readonly boards: Partial<Record<BoardKey, string>>;
  readonly timers: PlatformTimers;
  /** null when overlay views are unsupported. */
  readonly overlays: FbOverlayViews | null;
  readonly config?: GameConfig;
}

/** Which leaderboard API this SDK serves (the §5.4 probe order). */
export function probeRankingApi(sdk: FBInstantSDK): RankingCaps['api'] {
  return probeApi(sdk);
}

/** Largest score a board takes (int32, §5.3: every encoded score < 2³¹). */
const MAX_SCORE = 2_147_483_647;

/** Pages of rank.fetchCount entries a `keep` (daily) read goes through at most (FB2B-4). */
export const BAND_MAX_PAGES = 4;

/** An entry as read from the SDK, with the id the overlay binds names to. Internal. */
interface RawEntry {
  readonly entry: RankEntry;
  readonly id: string;
}

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
const isRank = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

/** Calls `fn` defensively: a missing method or a throw is `undefined`. */
function safe<T>(fn: (() => T) | undefined): T | undefined {
  if (!fn) return undefined;
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** submit() errors → result (§5.2). */
export function mapSubmitError(err: unknown): 'not_improved' | 'unsupported' | 'error' {
  switch (fbErrorCode(err)) {
    case 'LEADERBOARD_SCORE_NOT_IMPROVED':
      return 'not_improved';
    case 'LEADERBOARD_NOT_FOUND':
    case 'CLIENT_UNSUPPORTED_OPERATION':
      return 'unsupported';
    default:
      return 'error';
  }
}

export function createFbRanking(sdk: FBInstantSDK, opts: FbRankingOptions): RankingProvider {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const boards = opts.boards;
  const api = probeApi(sdk);
  const overlays = opts.overlays && opts.overlays.supported() && overlayViewsSupported(sdk) ? opts.overlays : null;
  const caps: RankingCaps = Object.freeze(rankingCaps(api, boards, overlays !== null, c.rank.overlayPlacement));
  const deadline = c.rank.fetchTimeoutMs;
  /** Classic Leaderboard objects by dashboard name (a failed lookup is retried next time). */
  const classic = new Map<string, Promise<FBLeaderboard>>();
  /** Submits still in flight, by board: reads on that board wait for them (never reject). */
  const writing = new Map<BoardKey, Promise<unknown>>();
  const settled = (board: BoardKey): Promise<unknown> => writing.get(board) ?? Promise.resolve();

  /** Dashboard names the platform answered LEADERBOARD_NOT_FOUND for: unsupported for the session. */
  const missing = new Set<string>();
  const note = (name: string, err: unknown): void => {
    if (fbErrorCode(err) === 'LEADERBOARD_NOT_FOUND') missing.add(name);
  };

  const nameOf = (board: BoardKey): string | null => {
    const name = caps.global ? (boards[board] ?? null) : null;
    return name !== null && !missing.has(name) ? name : null;
  };

  const myId = (): string | null => safe(() => sdk.player.getID()) ?? null;

  const leaderboard = (name: string): Promise<FBLeaderboard> => {
    let p = classic.get(name);
    if (!p) {
      p = (sdk.getLeaderboardAsync as (n: string) => Promise<FBLeaderboard>)(name);
      classic.set(name, p);
      p.catch((err: unknown) => {
        note(name, err);
        if (classic.get(name) === p) classic.delete(name);
      });
    }
    return p;
  };

  /** One SDK entry → RawEntry, or null when it carries no valid score (never patched). */
  const read = (e: FBLeaderboardEntry | null | undefined, index: number, me: string | null): RawEntry | null => {
    if (!e || typeof e !== 'object') return null;
    const score = safe(() => e.getScore());
    if (!isScore(score)) return null;
    const apiRank = safe(e.getRank ? () => e.getRank!() : undefined);
    const rank = isRank(apiRank) ? apiRank : api === 'nezp' ? index + 1 : null;
    if (rank === null) return null; // classic entries always carry a rank; one without is unreadable
    const player = safe(e.getPlayer ? () => e.getPlayer!() : undefined) ?? null;
    const playerId = player ? (safe(player.getID ? () => player.getID!() : undefined) ?? null) : null;
    const sessionId = player ? (safe(player.getSessionID ? () => player.getSessionID!() : undefined) ?? null) : null;
    const id = api === 'classic' ? (playerId ?? '') : (sessionId ?? '');
    const isMe = api === 'classic' && me !== null && playerId !== null && playerId === me;
    return { entry: { rank, score, isMe }, id };
  };

  const readAll = (list: unknown, n: number): RawEntry[] => {
    if (!Array.isArray(list)) return [];
    const me = api === 'classic' ? myId() : null;
    const out: RawEntry[] = [];
    list.forEach((e, i) => {
      const r = read(e as FBLeaderboardEntry, i, me);
      if (r) out.push(r);
    });
    return out.slice(0, n);
  };

  const clampCount = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), c.rank.fetchCount)) : 0);

  /** Raw top entries (with ids), [] on any failure. */
  const topRaw = async (board: BoardKey, n: number): Promise<RawEntry[]> => {
    const name = nameOf(board);
    const count = clampCount(n);
    if (!name || count === 0) return [];
    const run = async (): Promise<RawEntry[]> => {
      await settled(board);
      if (api === 'classic') return readAll(await (await leaderboard(name)).getEntriesAsync(count, 0), count);
      return readAll(await sdk.globalLeaderboards!.getTopEntriesAsync(name, count), count);
    };
    try {
      return await within(timers, run(), deadline, (): RawEntry[] => []);
    } catch (err) {
      note(name, err);
      return [];
    }
  };

  /**
   * The entries `keep` accepts, best first, renumbered 1… by position inside the band (FB2B-4): read
   * from the top, past the entries above the band, until the band ends, the board ends or
   * BAND_MAX_PAGES pages were read. [] on any failure.
   */
  const bandRaw = async (board: BoardKey, keep: (score: number) => boolean): Promise<RawEntry[]> => {
    const name = nameOf(board);
    const page = clampCount(c.rank.fetchCount);
    if (!name || page === 0) return [];
    const run = async (): Promise<RawEntry[]> => {
      await settled(board);
      const band: RawEntry[] = [];
      /** Adds the kept entries of one page; true once the band has ended. */
      const take = (list: readonly RawEntry[]): boolean => {
        for (const r of list) {
          if (keep(r.entry.score)) band.push(r);
          else if (band.length > 0) return true;
        }
        return false;
      };
      if (api === 'classic') {
        const lb = await leaderboard(name);
        for (let i = 0; i < BAND_MAX_PAGES; i++) {
          const raw: unknown = await lb.getEntriesAsync(page, i * page);
          if (take(readAll(raw, page))) break;
          if (!Array.isArray(raw) || raw.length < page) break; // the end of the board
        }
      } else {
        take(readAll(await sdk.globalLeaderboards!.getTopEntriesAsync(name, page), page));
      }
      return band.map((r, i) => ({ ...r, entry: { ...r.entry, rank: i + 1 } }));
    };
    try {
      return await within(timers, run(), deadline, (): RawEntry[] => []);
    } catch (err) {
      note(name, err);
      return [];
    }
  };

  /** My entry (classic only), null otherwise or on any failure. */
  const mineRaw = async (board: BoardKey): Promise<RawEntry | null> => {
    const name = nameOf(board);
    if (!name || !caps.myRank) return null;
    const run = async (): Promise<RawEntry | null> => {
      await settled(board);
      const e = await (await leaderboard(name)).getPlayerEntryAsync();
      const r = read(e, 0, myId());
      // The player's own entry is "me" by definition, whatever its player id reads.
      return r ? { entry: { ...r.entry, isMe: true }, id: r.id || (myId() ?? '') } : null;
    };
    try {
      return await within(timers, run(), deadline, (): RawEntry | null => null);
    } catch (err) {
      note(name, err);
      return null;
    }
  };

  const submit = async (board: BoardKey, score: number): Promise<'ok' | 'not_improved' | 'unsupported' | 'error'> => {
    const name = nameOf(board);
    if (!name) return 'unsupported';
    if (!isScore(score)) return 'error';
    const run = async (): Promise<'ok' | 'not_improved'> => {
      if (api === 'classic') {
        const entry = await (await leaderboard(name)).setScoreAsync(score);
        const kept = entry ? safe(() => entry.getScore()) : undefined;
        // The board keeps the better score: an answer that is not ours means ours did not improve it.
        return isScore(kept) && kept !== score ? 'not_improved' : 'ok';
      }
      await sdk.globalLeaderboards!.setScoreAsync(name, score);
      return 'ok';
    };
    const attempt = run();
    const mark = attempt.catch(() => undefined);
    writing.set(board, mark);
    void mark.then(() => {
      if (writing.get(board) === mark) writing.delete(board);
    });
    try {
      return await within(timers, attempt, deadline, (): 'error' => 'error');
    } catch (err) {
      note(name, err);
      return mapSubmitError(err);
    }
  };

  const showList = async (board: BoardKey, view: RankListView, rect?: DOMRect): Promise<{ close(): void } | null> => {
    try {
      if (!overlays || !nameOf(board)) return null;
      // RankListView.keep (daily_fastest: only the shown day's entries, phase2b §5.3): the day's band,
      // read past the later time zones' next-day entries and numbered inside it (FB2B-4); fewer rows,
      // never padded.
      const keep = view.keep;
      const count = clampCount(view.count);
      const [listed, myEntry] = await Promise.all([
        keep ? bandRaw(board, keep) : topRaw(board, count),
        view.highlightMe ? mineRaw(board) : Promise.resolve(null),
      ]);
      const top = listed.slice(0, count);
      const ownEntry = myEntry && (!keep || keep(myEntry.entry.score)) ? myEntry : null;
      // My own entry's id also marks me in the top list (in case the list's ids could not be compared).
      const sameAsMe = (r: RawEntry): boolean => r.entry.isMe || (ownEntry !== null && ownEntry.id !== '' && r.id === ownEntry.id);
      // A day's band: my row only as found inside it, with its position there; the board's own rank
      // would count the other days' entries (never shown, §5.1).
      const mine = keep ? (listed.find(sameAsMe) ?? null) : ownEntry;
      const isMine = (r: RawEntry): boolean => sameAsMe(r);
      const rows: RankListRow[] = top.map((r) => toRow(isMine(r) ? { ...r, entry: { ...r.entry, isMe: true } } : r, view));
      // Pin my row at the bottom when I am outside the list (§2.4); only an entry the API returned.
      if (mine && !top.some(isMine)) rows.push(toRow({ ...mine, entry: { ...mine.entry, isMe: true } }, view));
      const { xml, css } = rankListTemplate();
      const inRect = rect !== undefined && caps.overlayInRect;
      const data = rankListData(
        { title: view.title, rows, highlightMe: view.highlightMe },
        { emptyText: t('rank.noEntries'), closeText: t('common.close'), closable: !inRect },
      );
      return await overlays.show(xml, css, data, inRect ? rect : undefined);
    } catch {
      return null;
    }
  };

  return {
    caps: () => caps,
    submit,
    async mine(board) {
      return (await mineRaw(board))?.entry ?? null;
    },
    async top(board, n, keep) {
      if (keep) return (await bandRaw(board, keep)).slice(0, clampCount(n)).map((r) => r.entry);
      return (await topRaw(board, n)).map((r) => r.entry);
    },
    showList,
    supports: (board) => nameOf(board) !== null,
  };
}

/** An overlay row from an entry the API returned; numbers are formatted here and by the app. */
function toRow(r: RawEntry, view: RankListView): RankListRow {
  let scoreText: string;
  try {
    scoreText = view.formatScore(r.entry.score);
  } catch {
    scoreText = formatNumber(r.entry.score);
  }
  return { id: r.id, rankText: `#${formatNumber(r.entry.rank)}`, scoreText, isMe: r.entry.isMe };
}
