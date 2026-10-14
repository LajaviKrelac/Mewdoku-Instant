# UI batch (2026-10-13): victory — the "cat celebrating" screen after a level and after the daily

Workstream: victory. Base `3067892`. The user's words for this area:

> Cat celebrating Screen after the match, there are two versions: AFTER LEVEL - remove fishes "Your total: X"
> information. Leave fishes (+1/2/3 is surplus) and leave points. Also remove access to home screen, let the default
> button be the next level. Add praising and encouraging messages/statistics (…) AFTER DAILY CHALLENGE - same as
> above. encouraging messages for challenges (…)

(The user's example sentences are the reference game's copy; none of them ships. Our lines are below.)

## 1. What changed

### 1.1 The screen (`src/ui/overlays/victory-screen.ts`, `src/styles/overlay-chunk.css`)

- **Kept-fish row = the fish alone.** `.victory__plus` ("+3"), `.victory__period` ("Your total: 14" / "This week: 42")
  and `.victory__waiting` ("+3 waiting") are gone, with their CSS. `VictoryProps.kept` is `{ fish, max } | null`
  (`gained`, `total`, `kind`, `waiting` removed). The row's name is the lives pill's own key, `game.hearts.a11y`
  ("2 of 3 fish left"). `.victory__kept[data-count]` stays (e2e selectors). The keys `ladder.waiting`, `ladder.total`,
  `a11y.fishKept.*`, `period.total.*` and `fish.plus` stay: the ranking panel, my ranking row and the win flow still
  use them.
- **No Home button.** `.victory__home`, its CSS (also the tight-step rule), `VictoryProps.onHome` and the session's
  `onHome` binding are gone; the primary is the only button in every variant. Level: "Level {N}" as before. **Daily:
  the next level** (`victory.next`, N = `progress.level`, at least 2; a daily never moves progress). Event: unchanged
  ("Play puzzle {i+1}" / "Back to event"). Tutorial replay: unchanged ("Home" primary, plan B.4).
- **Praise and statistic lines** (`.victory__lines > .victory__line[data-line]`): at most `victory.maxLines` (2) soft
  white-on-white-.1 chips under the subtitle; in the daily they sit under "Solved in 3:08" (the statistic is about
  that time), above the mistakes line. They join `aria-describedby` right after the subtitle, in the order shown.
  Text from ids (`src/ui/overlays/victory-line-text.ts`, lazy overlay chunk); `text-wrap: balance`; one size smaller
  on phones under 360 px.
- **Fit:** `FIT_LEVELS` 4 → 5. Steps 2+ tighten the lines; step 4 makes them one size smaller; the new **step 5** is
  step 4 plus "first line only" (CSS hides the rest and the description drops them, `applyDescribed`). Measured: the
  daily on a streak's day 7 at 320 × 568 with the banner band needed it (43 px over at step 4); every other harness
  view fits at step ≤ 4 (screenshots below).

### 1.2 The lines (`src/app/victory-lines.ts`, pure; `src/game/solve-time-model.ts`, pure)

`victoryFacts()` (at WON, in `session.ts`) reads only this attempt and the player's own save; `pickVictoryLines(facts,
standing)` returns ids and numbers, never keys (session/views are first-load; the overlay renders). Praise, best first:

| id | When (all facts of THIS board) | English (ours, `en/lazy.ts` `enLazyUi2b` victory block) |
|---|---|---|
| `flawless` | no wrong cat, no hint, kitty, mouse or revive (the mouse count must be known: not after a resume) | No slips, no help: pure paw-work! |
| `best` | faster than every earlier win on boards of this size (levels via the pack's sizes; dailies via `dailySlotFor`), never the first one, never a tie | New best for a {size} board: {time} |
| `hard` | the level's Hard badge (`SessionMeta.hard`) | You tamed a Hard level! |
| `revive` | `revivesUsed > 0` | Back from zero fish to the finish! |
| `retry` | solved after a Retry of this board (`attempt > 0`) | Another go, and you cracked it! |
| `noSlips` | no wrong cat (help used, or the mouse count unknown) | Not a single wrong cat on this board |
| `noHelp` | after a slip, no hint and no kitty (the mouse is never claimed) | Solved without a hint or a kitty |
| `run` | after a slip, the closing run of correct cats ≥ `victory.runMin` (5; `catStreak`, a lower bound after a resume) | {count} cats in a row to finish |
| `levels` | level mode: the player's `progress.completed` ≥ `victory.milestoneMin` (2) | {count} levels solved so far! |
| `dailies` | daily mode: the player's number of solved dailies | {count} daily puzzles solved so far! |

Statistics (spec §0.4 **H-2a**, keys `victory.stat.*` only, numbers floored to 5 and clamped 5…95, worded "about"):

| id | Source | English |
|---|---|---|
| `statTop` | daily, "faster than" ≥ `topFromPct` (75): top = 100 − pct | About the top {pct}% of today's solvers |
| `statFaster` | daily, `statMinPct` (25) ≤ pct < 75 | Faster than about {pct}% of today's solvers |
| `statLevel` | a level, the estimate only, pct ≥ `levelStatMinPct` (50) | Faster than about {pct}% of players here |

Daily source: the server's standing (`WinResult.daily`, below) when it has ≥ `victory.minSolvers` (20) other solvers;
else (fewer solvers, offline, web records mode, not listed, no answer) **our estimate**: `modelFasterThan` = 1 − Φ((ln t
− ln median)/σ), median from `victory.model.medianSec[n − 4] × gradeFactor[grade] × (hard ? hardFactor : 1)`, σ 0.55.
While the win's answer is still on its way (`'pending'`) the daily shows no statistic; `ladder:update` re-renders the
open victory when it lands. A number below the minimum is not shown at all (praise lines take the space).

Order: a daily leads with its statistic; a level leads with its best praise line, then the statistic (if ≥ 50) or
the next praise line; an event shows praise only; the tutorial nothing.

### 1.3 Session and routing (`session.ts`, `session-transitions.ts`, `views.ts`, `ladder-flow.ts`)

- `onWon` builds the facts (save before/after the win, `helpers.mouseUses()` unless the board was resumed and not
  retried, `attempt`, `deps.levelSize`); the win record keeps them. `victoryProps(w)` (one builder for open and
  re-render) picks the lines with the ladder's `dailyStanding()`; `bus.on('ladder:update')` re-renders an open daily
  victory. `openVictory` no longer reads `panelTotal()`/`panelWaiting()` (the panel still does).
- `onDailyDone` (the daily victory's primary): gate `daily_done` (analytics and pacing unchanged) → `leave('next')` →
  `start({ mode: 'level', level: max(2, progress.level) })`. The O7 `daily_result` overlay (reopened from Home) keeps
  its own Done.
- `selectVictoryView`: `opts.lines`, `kept` = fish only, daily `nextLevel`; `VictoryData` omits only `now`/`onPrimary`.
- `LadderFlow.dailyStanding()`: the win's `WinResult.daily`, `null` without one, `'pending'` while sending.

### 1.4 Server: the daily percentile (spec §0.4 H-2a)

- **Migration `server/migrations/0005_daily_times.sql`** (expand-only; the plan's number): `daily_times(puzzle_id,
  pool, bucket, n)`, PK `(puzzle_id, pool, bucket)` WITHOUT ROWID. No player key.
- **Write** (`sql-store.ts` `writeWins`): for each win with `dailyBucket` (set by the handler only for an `accepted`,
  never flagged, daily verdict while `dailyStats.enabled`), one upsert placed **before** the win row under the win
  row's own guards (no row yet for this puzzle or winId, member exists, bracket running, the token) plus `players.status
  = 'ok'`, pool read from the player row. So it counts exactly the row that goes in. `WriteWinsResult.rolled[]`.
- **Read** (`handlers/wins.ts`): for daily wins this request placed (newest first, ≤ 2 reads), one primary-key range
  read `SUM(n)`, `SUM(n) WHERE bucket > mine`; `solvers` = total − my own row (if it counted), `slower` = strictly
  slower buckets (my own bucket never counts as slower). Sent as `daily` only when `solvers ≥ dailyStats.minSolvers`.
- **Retention:** the daily sweep deletes rollup rows of dailies older than `dailyStats.keepDays` (7) in one statement
  (`puzzle_id < 'D' + date`); the dev pool reset deletes the pool's rows.
- **Config** `dailyStats: { enabled: true, bucketMs: 10_000, maxBucket: 359, minSolvers: 20, keepDays: 7 }` (new
  section after `retention`); the client's `victory.minSolvers` mirrors `minSolvers` (contract test).
- **Wire:** `WinResult.daily?: DailyStanding { solvers, slower }` (additive in v1); the client parser keeps it when
  `1 ≤ solvers` and `0 ≤ slower ≤ solvers`, else drops it from that result only. New golden fixture
  `wins.daily.json` (its `bracket` is `null`, which the shape check treats as compatible, so the profile workstream's
  row fields never touch it). `tests/fixtures/ladder-fake.ts` gains `dailyStanding` (attached to accepted daily wins).
  `preview/sample-server.ts` does not send it (the preview shows the estimate).
- **Budgets** (measured, `budget.spec.ts`, now with two dailies in the worst ten-win request): wins 42 / 50 (was 38),
  retention sweep 45 / 50 (was 44). EXPLAIN: the scenario wins a daily; `daily_times` is in `TABLES`; no scan.

## 2. Decisions beyond the plan

1. **Copy placement:** the English keys live in `enLazyUi2b`'s "Victory screen" block next to `victory.next`, not in
   `enLazyUi2e` next to the anchor: `catalogs-2e.spec.ts` bans `% of` in every 2e key, and the plan's rule asks for
   "your area's existing block". The 16 locale drafts are inserted right after the anchor `victory.streakReward`.
2. **Meta:** two new groups `victory.line.` and `victory.stat.` (max 40) next to `victory.`, and per-key notes next to
   `victory.next`. Placeholder `{pct}` already existed. de/es/fr/ru put a no-break space before `%`.
3. **`FIT_LEVELS` 5** with the one-line step (above), because the measured worst case (daily, streak day 7, banner,
   320 × 568) overflowed by 43 px with two lines. After the streak workstream turns the victory's streak row off
   (`dayStreak.victoryRow: false`) the daily needs at most step 4 again; step 5 stays as a guard.
4. **Daily statistic only when encouraging** (`statMinPct` 25; a level's from 50): a true but discouraging number is
   simply not shown; the same keys serve the server's number and the estimate (both "about").
5. **Pending answer:** no statistic until the ladder answered or gave up, so the number never flips from the estimate
   to the server's in front of the player.
6. **Flagged wins:** a soft-flagged daily win (`accepted_flagged`) never joins the rollup, but its answer still gets
   the standing (the others' times are real).
7. **"No help" is claimed only when the mouse count is known** (it is not saved in the slot); `noHelp` after a slip
   names hints and kitties only.
8. **Restored full board:** no `best` claim and no mouse claim (its records may already hold this win).
9. **Clean room:** I did **not** add the user's example sentences to `BANNED_PHRASES` (shared file; the messages
   workstream may append there too); suggested for the lead: "100% accurate", "flawless execution", "top x% of the
   challenge", "better than x% of players".
10. **e2e helpers:** with no victory Home, flows that went "victory → Home" now press the victory's primary (the next
    level) and then the game's own Home (`homeAfterVictory` in smoke/winflow, `tapThrough` in ladder). The PAR-6 "Home
    from the victory" e2e test is deleted (the primary's crossfade test still covers PAR-6).
11. **Not done (lead's call):** the first-load cost of the picker (`victory-lines.ts` + `solve-time-model.ts`, ≈ 2.8 KB
    minified of main JS). Moving them to a `game/` module the overlay chunk imports (props would then carry the facts
    and the standing instead of `lines`) would put that cost on the overlay chunk instead.

## 3. Sizes (FBIG build of this branch, `scripts/size-check.ts`; bytes; base from map/rules.md §1.6)

| Row | Base | Now | Ceiling |
|---|---|---|---|
| Main JS (index + core + coach-chunk + rich-text) | 353,731 | 356,961 (+3,230) | 360,000 |
| Lazy JS: overlay chunk | 55,416 | 56,162 (+746) | 56,200 |
| Lazy CSS: overlay chunk | 33,229 | 33,695 (+466) | 33,500 **over** |
| Lazy JS: English (`en-lazy`) | 13,590 | 14,555 (+965) | 13,600 **over** |
| Locale chunk (hi, the largest) | 41,839 | 43,417 (+1,578) | 41,900 **over** |
| Lazy JS: ladder boot | 36,195 | 36,456 (+261) | 36,600 |
| First-load total | 423,916 | 427.1 KB | 427,000 **over** |

## 4. Provenance rows (for `docs/provenance.md`, a new UI-batch section)

| Asset | File(s) | Author, date | Method |
|---|---|---|---|
| Victory praise and statistic lines (13 English strings) | `src/i18n/en/lazy.ts` (`victory.line.*`, `victory.stat.*`) | victory workstream (AI), 2026-10-13 | Written from the user's request ("praising and encouraging messages/statistics"), our own words; none of the user's example sentences |
| Their 16 locale drafts | `src/i18n/locales/*.ts` after `victory.streakReward` | same, 2026-10-13 | AI drafts from our English, `meta.ts` and `docs/i18n/glossary.md` only; unreviewed |
| The line chips and the fit step 5 | `src/styles/overlay-chunk.css` (`.victory__lines`, `.victory__line`, `[data-fit='5']`) | same | Hand-written CSS, tokens and the white/black alpha allow-list only |
| The solve-time estimate | `src/game/solve-time-model.ts`, config `victory.model` | same | Our model (log-normal, our medians); not measured from any game |
| The daily rollup | `server/migrations/0005_daily_times.sql`, `sql-store.ts`, `handlers/wins.ts` | same | Our code from spec §0.4 H-2a and this plan |

No new art (no SVG symbol).

## 5. Spec and doc lines now stale (suggested text; the lead applies them)

- `docs/phase2b/parity-spec.md:453` "Secondary | Ghost "Home"" → "Secondary | none (UI batch 2026-10-13: the victory
  has no Home; the game's own Home after the next level starts)".
- `docs/phase2b/parity-spec.md:454` Daily: "… and "Done" (orange)" → "… and "Level {N}" (the next level, orange)";
  add "Up to two praise or statistic lines under the subtitle (UI batch)".
- `docs/phase2b/parity-spec.md:465` "Daily variant (Done → gate `daily_done`)" → "Daily variant ("Level N" → gate
  `daily_done` → the next level)".
- `docs/phase2e/spec.md:1019` "… and Done (`daily_done` gate, then Home)." → "… the praise and statistic lines, and
  "Level N" (`daily_done` gate, then the next level; UI batch)".
- `docs/phase2e/spec.md:594` privacy table: add a row "Daily solve-time rollup (per daily puzzle and pool: 10 s
  buckets and counts; no player key) | The victory's daily percentile (H-2a) | `dailyStats.keepDays` (7) days".
- `docs/phase2e/spec.md` §1 schema (after `:580`): add `CREATE TABLE daily_times (puzzle_id TEXT NOT NULL, pool TEXT
  NOT NULL, bucket INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (puzzle_id, pool, bucket)) WITHOUT ROWID;
  -- 0005, UI batch`.
- `docs/phase2c/fish-lives-spec.md:241` "then "+G" (`fish.plus`) and `period.total.<kind>` "This week: 42" … `aria-label`
  = `a11y.fishKept.<kind>`" → "the fish alone (UI batch: no "+G", no total); `aria-label` = `game.hearts.a11y`";
  `:830` likewise ("the kept-fish row and "This week: 42"" → "the kept-fish row (fish only)").
- `docs/phase2e/CONTRACTS.md:176` `WinResult` → add `readonly daily?: DailyStanding` and `DailyStanding { solvers,
  slower }`; `:872` `LadderFlow` → add `dailyStanding()`.
- `docs/phase1/02-rebuild-spec.md:556` and `:703` ("Done … then Home", "Tap Done on O7") → note the UI batch: the
  daily victory's "Level N" is the `daily_done` trigger and leads to the next level.
- `docs/phase2e/research/ours.md:93`, `:191` and `docs/phase2e/gap-analysis.md:187`, `:418` (daily Done → Home) →
  "Level N → gate `daily_done` → the next level".
- `docs/i18n/glossary.md:143` ("nothing says … "N % of players"") → add "except the approximate encouragement lines
  `ticker.odds.*` and `victory.stat.*` (spec §0.4 H-2a): rounded, always "about"".
- `docs/phase2e/NEXT-SESSION.md` deploy order: `npm --prefix server run db:migrate:staging` (applies 0005) **before**
  `deploy:staging`; then smoke a daily win.
- `docs/phase1/04-architecture.md` §9 and `scripts/size-check.ts`: the rows marked over in §3.
- `docs/provenance.md`: the rows in §4.

## 6. Tests

- New: `tests/unit/app/victory-lines.spec.ts` (facts, every praise rule, the statistic's sources and thresholds, the
  order, "every number comes from the input"), `tests/unit/game/solve-time-model.spec.ts`,
  `server/test/http/daily-times.spec.ts` (minimum, strictly slower, flagged/duplicate/already-counted/level/other
  pool, switched off, no player key, the status guard, the sweep), contract fixture `wins.daily.json` + its real
  answer, the client parser cases, `ladder-session.spec.ts` (server standing, pending then late answer, estimate).
- Updated: `victory-ranking.spec.ts`, `hud-2e.spec.ts`, `review2b-fixes.spec.ts`, `review2b-css.spec.ts`,
  `palette-check.spec.ts` (+ `scripts/palette-check.ts`: the "ghost Home" row → the line chips row),
  `interstitial.spec.ts` (daily → next level), `win-flow.spec.ts`, `ladder-session.spec.ts`, `flags-views.spec.ts`,
  `sql.spec.ts`, `budget.spec.ts`, `contract.spec.ts`, `rank-api.spec.ts`.
- e2e (read and updated, not run): `winflow.spec.ts`, `smoke.spec.ts` (new 4g: the daily's "Level N"), `ladder.spec.ts`,
  `events.spec.ts`, `layout.spec.ts` (A11Y-FOCUS-1 rewritten; the B1 list gains `.victory__lines`), `visual.spec.ts`,
  `i18n.spec.ts`.
- Harnesses: `dev/ladder-harness.ts` (lines on every victory view; new `victory-lines`, `victory-no-lines`; the daily
  views' primary is "Level 38"), `dev/b-harness.ts`.
