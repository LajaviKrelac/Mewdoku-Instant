// Owner: D (Phase 2b); G3 (Phase 2c: period bands, RankEntry.boardRank, docs/phase2c/fish-lives-spec.md §4.5)
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
// Bands (review FB2B-4; generalised in Phase 2c, docs/phase2c/fish-lives-spec.md §4.2–§4.5): a board
// can hold several bands, each in the high digits of the score. daily_fastest is one board for every
// day (a newer day outranks any older one, phase2b §5.3, so later time zones that already posted the
// next day's daily sit above the shown day); period_points (2c) is one board for every UTC period (the
// current period sits at the top; only devices whose clocks run ahead post above it). With a `keep`
// filter (RankListView.keep, top(…, keep)) the reader pages past the entries above the band (classic:
// getEntriesAsync(fetchCount, offset), at most BAND_MAX_PAGES pages; NEZP: one read, it has no
// offset) and stops once it holds the entries it needs, the band ends or the board ends. The band's
// rows are numbered by their position inside it (`rank`) and carry the board's own rank (`boardRank`,
// 2c: classic getRank(), NEZP the position in the API list). My row (classic) is pinned with my rank
// inside the band: its position when it was read, else my board rank minus the entries above the band
// (`mine.rank − (band[0].boardRank − 1)`, exact at any depth); never when the band was read to its
// end without me, and never the board's raw rank (which counts the other bands).
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

/** Pages of rank.fetchCount entries a `keep` (band) read goes through at most (FB2B-4). */
export const BAND_MAX_PAGES = 4;

/** An entry as read from the SDK, with the id the overlay binds names to. Internal. */
interface RawEntry {
  readonly entry: RankEntry;
  readonly id: string;
}

/** A band read: its entries (renumbered, with boardRank) and whether the band's end was seen. Internal. */
interface BandRead {
  readonly entries: readonly RawEntry[];
  /** true when the read saw where the band ends (an entry below it, or the end of the board). */
  readonly complete: boolean;
}

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
const isRank = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

/**
 * My entry placed inside a band read without it (phase2c §4.5): my board rank minus the entries above
 * the band, from the band's first entry's boardRank. null when the band was read to its end (I am not
 * in it), when nothing anchors it, or when the result would land inside the rows read (they did not
 * hold me, so the numbers disagree: never guess).
 */
export function placeInBand(mine: RankEntry, band: readonly RankEntry[], complete: boolean): number | null {
  const first = band[0]?.boardRank;
  if (complete || first === undefined || !isRank(first) || !isRank(mine.rank)) return null;
  const rank = mine.rank - (first - 1);
  return rank > band.length ? rank : null;
}

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
   * The entries `keep` accepts, best first, renumbered 1… by position inside the band (FB2B-4), each
   * with its board rank (`boardRank`, phase2c §4.5): read from the top, past the entries above the
   * band, until `want` band entries are in, the band ends, the board ends or BAND_MAX_PAGES pages were
   * read. No entries on any failure.
   */
  const bandRaw = async (board: BoardKey, keep: (score: number) => boolean, want: number): Promise<BandRead> => {
    const none: BandRead = { entries: [], complete: false };
    const name = nameOf(board);
    const page = clampCount(c.rank.fetchCount);
    const limit = clampCount(want);
    if (!name || page === 0 || limit === 0) return none;
    const run = async (): Promise<BandRead> => {
      await settled(board);
      const band: RawEntry[] = [];
      let complete = false;
      /** Adds the kept entries of one page; true once the read can stop (enough entries, or the band ended). */
      const take = (list: readonly RawEntry[]): boolean => {
        for (const r of list) {
          if (keep(r.entry.score)) {
            band.push(r);
            if (band.length >= limit) return true;
          } else if (band.length > 0) {
            complete = true;
            return true;
          }
        }
        return false;
      };
      if (api === 'classic') {
        const lb = await leaderboard(name);
        for (let i = 0; i < BAND_MAX_PAGES; i++) {
          const raw: unknown = await lb.getEntriesAsync(page, i * page);
          if (take(readAll(raw, page))) break;
          if (!Array.isArray(raw) || raw.length < page) {
            complete = true; // the end of the board
            break;
          }
        }
      } else {
        const raw: unknown = await sdk.globalLeaderboards!.getTopEntriesAsync(name, page);
        if (!take(readAll(raw, page)) && (!Array.isArray(raw) || raw.length < page)) complete = true;
      }
      return {
        entries: band.map((r, i) => ({ ...r, entry: { rank: i + 1, score: r.entry.score, isMe: r.entry.isMe, boardRank: r.entry.rank } })),
        complete,
      };
    };
    try {
      return await within(timers, run(), deadline, (): BandRead => none);
    } catch (err) {
      note(name, err);
      return none;
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
      // RankListView.keep (a band: daily_fastest's shown day, phase2b §5.3; period_points' shown
      // period, phase2c §4.5): read past the entries above it and numbered inside it (FB2B-4); fewer
      // rows, never padded.
      const keep = view.keep;
      const count = clampCount(view.count);
      const [read, myEntry] = await Promise.all([
        keep ? bandRaw(board, keep, count) : topRaw(board, count).then((entries): BandRead => ({ entries, complete: false })),
        view.highlightMe ? mineRaw(board) : Promise.resolve(null),
      ]);
      const listed = read.entries;
      const top = listed.slice(0, count);
      const ownEntry = myEntry && (!keep || keep(myEntry.entry.score)) ? myEntry : null;
      // My own entry's id also marks me in the top list (in case the list's ids could not be compared).
      const sameAsMe = (r: RawEntry): boolean => r.entry.isMe || (ownEntry !== null && ownEntry.id !== '' && r.id === ownEntry.id);
      // A band: my row as found inside it (its position there), else placed by the band's board rank
      // (phase2c §4.5); the board's own rank would count the other bands' entries (never shown, §5.1).
      const placed = (own: RawEntry | null): RawEntry | null => {
        if (!own) return null;
        const rank = placeInBand(own.entry, listed.map((r) => r.entry), read.complete);
        return rank === null ? null : { ...own, entry: { ...own.entry, rank, boardRank: own.entry.rank } };
      };
      const mine = keep ? (listed.find(sameAsMe) ?? placed(ownEntry)) : ownEntry;
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
      if (keep) return (await bandRaw(board, keep, n)).entries.map((r) => r.entry);
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
    scoreText = r.entry.isMe && view.formatMine ? view.formatMine(r.entry.score) : view.formatScore(r.entry.score);
  } catch {
    scoreText = formatNumber(r.entry.score);
  }
  return { id: r.id, rankText: `#${formatNumber(r.entry.rank)}`, scoreText, isMe: r.entry.isMe };
}
