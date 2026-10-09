# Phase 2c spec delta: fish are the lives, kept fish are leaderboard points, perfect-streak level points, no fish currency

Status: spec, **built and integrated 2026-10-09** ([STATUS-2c](STATUS-2c.md); integration decisions L1–L6 there) · Date: 2026-10-09 · Owner: game design + tech lead · Branch `claude/mewdoku-instant`, base `78cbad1` (Phase 2b complete: `tsc` clean, 1 941 unit tests, 153 e2e)

Inputs: the user's first-hand report (§0.1), [parity-spec](../phase2b/parity-spec.md) (2b, which this document amends), [CONTRACTS-2b](../phase2b/CONTRACTS.md), [STATUS-2b](../phase2b/STATUS-2b.md), [fb-dashboard](../phase2b/fb-dashboard.md), [01](../phase1/01-game-deconstruction.md), [differences-vs-original](../phase2/differences-vs-original.md) and the current source (read 2026-10-09: `src/game/{economy,scoring,save,save-v2,save-fields,reducer,types,events,purchases}.ts`, `src/app/{win-flow,session,session-effects,session-parts,session-transitions,session-types,shop-flow,ranking-flow,rank-hub-flow,helper-flows,group-flow,views,shell,boot,config}.ts`, `src/ui/hud/pills.ts`, `src/ui/overlays/{victory-screen,ranking-panel,shop-sheet,rewarded-prompt,fail-overlay,group-result,rank-hub,how-to-play}.ts`, `src/ui/screens/{home-screen,game-screen,event-screen}.ts`, `src/ui/fx/fish-flight.ts`, `src/ui/art/fish.ts`, `src/i18n/en.ts`, `src/i18n/en/*.ts`, `src/platform/types.ts`, `src/platform/fb/{fb-ranking,fb-probe,fb-payments}.ts`, `tests/fixtures/fbinstant-stub.js`).

**Config is already done.** The spec stage added every 2c key to `src/app/config.ts` and marked the keys 2c stops reading `@deprecated` (§8). No value of an existing key changed, so the tree is still green: `npx tsc --noEmit` clean and `npx vitest run` 1 941 / 1 941 after the edit (2026-10-09). Workstreams G1–G3 do not edit `config.ts`.

---

## 0. Read me first

### 0.1 The user's first-hand facts (2026-10-09)

The user plays the original (Play Store Meowdoku). These four facts are first-hand and **override our earlier research** (source tag in every doc: **"user, first-hand, 2026-10-09"**):

| # | Fact | What it overrides |
|---|---|---|
| F1 | **Fish are the lives.** The original shows fish everywhere, not hearts. Our build shows hearts in play and fish only at the win: wrong. | 01 §5.1 (hearts), §7.1.3 ("fish is not lives"), §17 ("lives are fish: refuted"); parity-spec §0.5, §2.9 (heart break) |
| F2 | When a level is passed, the **remaining lives (fish) are added to the leaderboard points**. The leaderboard ranks points **per period** (a total that resets). | parity-spec §2.1 ("what fish are for: unknown"), §2.8 (fish as a currency), §5.3 (all-time paw points board) |
| F3 | Separately there are **level points** that get better when you make no mistakes (streak-like). | parity-spec §5.3 (flawless and unaided bonuses) |
| F4 | **Remove our invented fish currency completely**: wallet, fish swaps for hints and kitties, fish packs, the fish pill "+" to the shop. | parity-spec §2.5 (fish pill), §2.8, §8.3 (fish packs), §9 (wallet) |

The App Store screenshots that made 01 §17 call fish-lives "refuted" show hearts; that is either the iOS build or an older version. Our parity target is the Play Store app, so F1 wins (§6 records the contradiction in 01).

### 0.2 Defaults for what the user did not say

Every row is `[DECISION: default, user may change]` and lives in config (§8).

| Question | Default | Config |
|---|---|---|
| Leaderboard period | **UTC weeks, Monday 00:00 UTC**. A local-midnight week would give every time zone its own boundary on one global board, so players in different zones would be mixing two weeks in one list for most of Monday. UTC is one boundary for everyone; the copy says so ("starts again every Monday at 00:00 UTC"). `'day'` and `'month'` are supported too | `period.kind` = `'week'` |
| Leaderboard points per win | The fish left at the win, × 1. A win always leaves 1–3 fish (a win needs ≥ 1); after a revive it is the fish actually left (1 unless more were kept, which the rules make impossible today: a revive restores 1) | `period.pointsPerFish` = 1 |
| Which wins count for the board | Every **counted** win in level, daily and event mode (§3.3) | `period.modes` |
| Level points | `10 × n` (× 2 on a Hard level) plus a **perfect-streak bonus** `10 × min(streak, 10)` | `levelPoints.*` |
| What breaks the streak | A mistake (at once, saved with the board), a revive; a fail implies mistakes. Retry neither breaks nor restores (§3.2) | — |
| Which wins move the streak | Every counted win in level, daily and event mode (§3.3) | `levelPoints.modes` |
| `daily_fastest` | Kept in code, **off**: the original's leaderboard is the period points board | `rank.dailyBoard` = false |
| Event boards | Kept (the original has an event leaderboard: parity-spec §5.1, confirmed by the event card) on the event screen and the hub; the post-win panel shows the period board in every mode | — |
| Retired fish packs | Never sold; a ledger entry or an unconsumed purchase is compensated in hints and kitties at the old swap rates (§5.3) | `iap.retired` |
| Event milestone fish | Converted to hints and kitties at the old swap rates (§5.5) | `src/data/events/events.json` |

### 0.3 What does not change

The rules, the reducer and its mistake model; 3 lives per attempt (`hearts.perAttempt`), one revive per attempt restoring 1 (`revive.*`), Continue / Retry / Home on a fail; hints, kitties, their stocks, rewarded ads and the free fallback; interstitials and banners; the board-entry wave, transitions and idle loops; the glow; the ranking panel's tap gate and FB list modes; events (dates, puzzles, themes; only milestone rewards change); 17 locales and the release-locale rule; the clean-room process (parity-spec §0.2, 06). "Golden fish" stays a banned phrase.

### 0.4 Clean room

The fish icon is ours (`src/ui/art/fish.ts`, phase2b §1.7). The empty-life outline, the fish-loss animation, the period counter and the streak chip are designed here in words and drawn by us (§1.2, §1.3), with a provenance row each. Nobody looks at or samples the original's fish, its loss effect or its leaderboard look (R6: no sampled colour, size or timing). The original's look for an empty life, its loss animation, its period length and its points numbers are unknown; every value below is ours.

### 0.5 Identifiers: what keeps its name

| Keep (renaming is not cheap or not safe) | Why |
|---|---|
| `GameState.hearts`, `RuleFlags.heartsPerAttempt` / `heartsOnRevive`, `GameEvent` `MISTAKE.heartsLeft`, `InProgressV2.hearts` | `hearts` is a **stored** save field and the reducer contract of 1 900+ tests; a rename needs a migration and buys nothing a player sees |
| Config `hearts.perAttempt`, `revive.heartsRestored`, `haptics.heartLast` | config keys are never renamed (file rule) |
| `GameView.hearts` / `maxHearts`, `PillsProps.hearts` / `maxHearts` | crosses G1 → G2; a doc comment "hearts = lives = fish (2c)" is enough |
| sfx ids `mistake`, `heart_last`, `fish_pop`, `fish_plink` | ids, not copy; the sounds stay |
| i18n key ids `game.hearts.a11y`, `howto.hearts`, `fail.*`, `a11y.mistake.*`, `a11y.lost`, `a11y.revived` | the key names a function; only the English value (and the 16 drafts) change (§1.5); renaming would touch G1 call sites and 17 catalogues for nothing |
| `glyph.9` "heart" (colour-pattern glyph) and its art | a pattern shape, not a life; do **not** remove |

| Rename (cheap and local) | Owner |
|---|---|
| CSS / DOM: `.pill--hearts` → `.pill--lives`, `.heart*` → `.life*` (`.life[data-full]`, `.life__full`, `.life__empty`, `.life--lose`, `.life--pop`), `--t-break` → `--t-life-loss` | G2 (no G1 or G3 selector uses them; checked with grep) |
| pills.ts internals (`breakHeart` → `loseLife`), the `clip-heart-l/r` clip paths (deleted when unused), `icon-heart` / `icon-heart-empty` symbols (deleted when unused after how-to-play switches to the fish) | G2 |
| win-flow inputs (`fishBefore`, `fishBase`, `fishBonus` → `periodBefore`, `kept`), `WinSummary.fish` → `kept` / `period` / `streak` | G1 |

### 0.6 Words used here

| Word | Meaning |
|---|---|
| **fish** / **life** | one of the 3 lives of an attempt (`state.hearts`) |
| **fish kept** (`kept`, N) | `state.hearts` at `WON`: 1–3 |
| **leaderboard points** / **period points** | fish kept × `period.pointsPerFish`, summed per period |
| **period** | a UTC calendar unit (`period.kind`); its **key** is its first day as `YYYY-MM-DD` (a Monday for weeks) |
| **level points** | the per-win score of §3.1 (copy: "points"), summed for life in `points.total` |
| **perfect win** / **perfect streak** | a counted win with 0 mistakes and 0 revives / the number of such wins in a row (copy: "Perfect ×4") |
| **counted win** | the existing guards: a level not counted before, a daily's first win for its date, an event puzzle once per index, the first-run tutorial once |

---

## 1. Lives as fish

### 1.1 HUD: the lives pill

| Part | Spec |
|---|---|
| Place and size | Exactly where the hearts pill is (the pills row, inline end), same pill height (`layout.pills`, compact `layout.compactPills`), same icon box as the hearts had (no layout change at 320 px). |
| Content | `maxHearts` slots, each `.life` with two `<svg><use>`: `icon-fish` (`.life__full`) and the new `icon-fish-empty` (`.life__empty`). `.life[data-full]` for slot `k < hearts`. Lives drain from the **last** slot (slot `hearts − 1` is lost first), as hearts did. |
| Last life | `.pill--lives[data-last]` when `hearts === 1`, as the hearts pill had it (2b gives it no style; 2c adds none `[DECISION]`: the last-life cue stays the `heart_last` sound and `haptics.heartLast`). |
| RTL | The pill mirrors with the row (as now); the fish icon itself is not mirrored (it faces right in both directions, like the sprite). |
| A11y | `role="img"`, `aria-label` = `t('game.hearts.a11y', { hearts, max })` → "2 of 3 fish left" (§1.5). |
| Art | `icon-fish` from `src/ui/art/fish.ts` (`fishMarkup()`); `icon-fish-empty` (§1.2). |

### 1.2 New art: `icon-fish-empty` (G2, `src/ui/art/fish.ts` + `sprite.ts`)

Our design, on the same 24-unit grid as `icon-fish`: the same silhouette (tail, top fin, `FISH_BODY`) as **one outline only**, stroke `--ink` at 30 % opacity, stroke width 1.4, fill a pale wash (the existing `--heart-empty` value works; G2 may rename the token to `--life-empty`), no eye, no sheen, no belly band. Export `fishOutlineMarkup(w = 1.4): string` beside `fishMarkup`. It must read as "a fish that is gone", not as a second fish colour. Provenance row (G2).

### 1.3 Mistake: the fish loss (replaces the heart break)

`PillsView.playEvent({ type: 'MISTAKE', heartsLeft })` animates slot `heartsLeft` (unchanged rule). Our own choreography, total `fx.lifeLossMs` (700):

| t (ms) | What happens |
|---|---|
| 0–140 | **Wriggle**: the full fish rotates −12° → +12° → −8° → 0° about its centre (two tail flicks). |
| 140–560 | **Flip out**: it hops up 6 px, then falls 22 px below the slot, turning belly-up (rotate to 180°) and shrinking to 0.8; opacity 1 → 0 from 300 ms. |
| 140–480 | **Splash**: three droplets (circles r 1.2 on the 24 grid, `--fish-hi` with a `--fish-deep` 0.6-unit outline) burst from the slot centre upward at −50°, −10°, +35° (from straight up), 12 px, fading by 480 ms. |
| 300–700 | The `icon-fish-empty` outline fades in 0 → 1. |
| 0–`fx.lifeLossPillMs` (400) | The pill shakes (`.pill--hurt`, as now). |
| Reduced motion | A `fx.reducedMotionFadeMs` (150) swap full → empty; no wriggle, no splash, no pill shake. |

Sound, vibration, sad cats, the red X and the board shake are unchanged (`mistake` / `heart_last`, `haptics.mistake` / `heartLast`). CSS-only constants (angles, distances, droplet angles) live at the top of `fx.css` (parity-spec §0.4); the two durations come from config. `fx.heartBreakMs` and `fx.heartCrackMs` are no longer read.

### 1.4 Fail at 0 fish, revive +1 fish

- At 0 fish the attempt is lost exactly as now (`LOST`, O4 after `fx.failOverlayDelayMs`). O4's title is "Out of fish" (§1.5).
- **Continue**: the "+1" badge (`fail.continue.bonus`) gets a 16 px `icon-fish` after the text (`.btn__badge .btn__badge-icon`), decorative (`aria-hidden`); the button's accessible name already says "+1 fish" (§1.5).
- **Revive** (`REVIVED`): the restored slot pops back (`.life--pop`: scale 0.4 → 1.15 → 1 over 520 ms, as the heart did) with one small splash (two droplets, 10 px, 300 ms). Reduced motion: instant.

### 1.5 Copy (17 locales)

**Policy.** Keep the key when the function is the same and only the word changes (heart → fish): change the English value, redraft all 16 locales, update `docs/i18n/drafted-from.json` (`npx tsx scripts/i18n-check.ts --write-drafted-from` after the drafts) and the translator notes in `src/i18n/meta.ts`. Add a key for a new concept. Delete the key of a removed feature from **all 17** catalogues, `meta.ts` and `drafted-from.json` (`i18n:check` errors on a missing or unknown key). The full lists are Appendix A; the English is ours.

- **Tutorial and coach** `[DECISION]`: no change. The tutorial has no mistake penalty (`mistakePenalty: false`), so no fish can be lost there and no coach line talks about lives; the tutorial board shows 3 full fish. How to play carries the explanation.
- **How to play**: the lives note uses `icon-fish` (was `icon-heart`) and the new text of `howto.hearts`; a new note `howto.points.<kind>` with `icon-trophy` follows it (Appendix A).
- **Rules copy** elsewhere (`howto.rule.*`, `tutorial.step*`) never mentions hearts: unchanged.
- **Glossary** (`docs/i18n/glossary.md`, G2): "fish" = a life and a leaderboard point; never "golden fish"; never a currency word ("coins", "money").

### 1.6 Screen-reader announcements

| When | Text (en) | Key | Who calls |
|---|---|---|---|
| Mistake | "Wrong tile. 2 fish left." | `a11y.mistake` (value change) | G1 `session-effects.ts` (unchanged call) |
| Lost | "Out of fish." | `a11y.lost` (value change) | G1 (unchanged call) |
| Revived | "One fish back. Keep going." | `a11y.revived` (value change) | G1 (unchanged call) |
| Win flow, at the "+N" label | "You kept 2 fish. Your total this week: 42." | `a11y.fishKept.<kind>` (new, plural) | G1 `win-flow.ts` (replaces `a11y.fishEarned`) |
| Victory streak chip | `aria-label` "4 perfect wins in a row" | `victory.streak.a11y` (new, plural) | G2 |

---

## 2. Win flow: the fish you kept fly to this period's points

### 2.1 Beats

Glow (unchanged) → the **period counter** pill fades in where the fish pill used to (pills row, centred) showing this period's total before the win → each **life still full** lifts off the lives pill and flies to the counter (the life icon turns empty as its fish leaves: the lives become points) → the counter counts up per arrival, "+N" rises → scrim → **ranking panel** (the period board) → tap → **victory screen** with level points, the streak, the fish kept and the period total.

### 2.2 Timeline (t = 0 at `WON`; N = fish kept, 1 ≤ N ≤ `maxHearts`; flight only when the win adds leaderboard points)

Let `L(k) = fx.win.fishAtMs + k × fishStaggerMs` (lift-off of fish k, k = 0…N−1), `A(k) = L(k) + fishHoldMs + fishFlightMs` (arrival), and
`panelAt(N) = min(fx.winOverlayDelayMs, A(N − 1) + fx.win.panelAfterLastMs)`.

| t (ms) | What happens | Config |
|---|---|---|
| 0 | Rewards committed in the critical save (unchanged rule): level points, streak, period points, progress, event record. Home and Gear `aria-disabled` until the panel (unchanged). | — |
| 300 | Glow, happy cats, win sound (unchanged) | `fx.winHappyDelayMs`, `fx.win.glow*` |
| 1 000 | Period counter fades in (200 ms) with `periodBefore` (0 after a rollover) | `fishPillInAtMs`, `fishPillFadeMs` |
| L(k) = 1 200 + 150 k | Fish k lifts off life slot `N − 1 − k` (the last full one first): `departLife(slot)` turns that slot empty at once (no loss animation), and a flying fish appears over it at scale 1 → 1.15 → 1 (`fishPopMs` 220), with `fish_pop` | `fishAtMs`, `fishStaggerMs`, `fishPopMs` |
| L(k) + 250 | Flight to the counter (800 ms, the 2b curve and easing, trail dots) | `fishHoldMs`, `fishFlightMs`, `fishArc*`, `fishTrail*`, `fishEndScale` |
| A(k) = 2 250 + 150 k | Arrival: counter + `pointsPerFish` (roll + bump), `fish_plink` (+2 semitones per fish), 8 ms haptic | `counterBumpMs`, `audio.fishPlinkStepSemitones`, `haptics.fish` |
| A(N−1) | "+G" rises from the counter (G = N × `pointsPerFish`), and the `a11y.fishKept` line is announced | `plusLabelMs`, `plusLabelRisePx` |
| A(N−1) + 360 | Safety net: any fish the flight did not deliver is counted; the counter shows `periodBefore + G` | `counterBumpMs` |
| panelAt(N) − 300 | Scrim fades in (300 ms) | `scrimLeadMs`, `scrimFadeMs` |
| **panelAt(N)** | **Ranking panel** (period board, §2.5) | `panelAfterLastMs`, cap `fx.winOverlayDelayMs` |
| tap … | Victory crossfade, button gate, next board: unchanged | `rank.*`, `fx.winButtonDelayMs` |

Resulting panel times (the "timings scale with the count" rule): **N = 1 → 4 200 ms, N = 2 → 4 350 ms, N = 3 → 4 500 ms** (the 2b value), N ≥ 4 (only an event with `rules.hearts > 3`) → 4 500 (capped). Scrim 300 ms before each.

No flight (G = 0: a win that does not count, or a mode outside `period.modes`): no counter, no lift-off; scrim at `panelAt(0) − 300` with `panelAt(0) = fx.winHappyDelayMs + glowInMs + glowSettleMs` = 1 200 (the glow has settled); the panel shows the period board with "+0" omitted (§2.5).

Removed from the 2b timeline: the cat-sourced pops, the "+2" bonus label (`bonusLabelAtMs`), the fixed scrim at 4 200 (`scrimAtMs`).

### 2.3 Flight geometry (changes to phase2b §2.3)

| Item | 2c rule |
|---|---|
| Sources | The client rects of the full life icons, in departure order: `GameScreen.lifeSlots()` (§7.4), the first N entries. |
| Target | The centre of the period counter's icon: `GameScreen.periodRect()`. |
| Size | `clamp(round(source.width), fishMinPx, fishMaxPx)`: the flying fish starts at the life icon's size (`fishSizeFraction` is no longer read). |
| Start | `FlyFishOptions.startScale = 1` (the fish is already visible as a life; 2b popped from 0). |
| Path | The 2b quadratic Bézier and lift. With N = 1 the spread is 0; with N = 2 it is ±`fishArcSpread / 2`; N = 3 as 2b. (The pills row is short, so the arc lifts the fish into the top-bar band: the fx layer is above the screen, as in 2b.) |
| Several fish | `flyFish` already takes `from.length` fish; tests cover N = 1, 2, 3 and 5. |

### 2.4 Reduced motion

| t (ms) | What happens |
|---|---|
| 300 | Static glow; when G > 0: the counter appears at once with `periodBefore + G`, the N departing slots switch to empty at once, "+G" fades in and out (`reduced.plusLabelInMs` / `OutMs`), `fish_plink` k at A(k) (audio unchanged), the `a11y.fishKept` line. |
| 1 200 | Ranking panel (`fx.win.reduced.rankingAtMs`), tap after `reduced.tapMinMs` (unchanged). |

### 2.5 Variants (replaces phase2b §2.6)

| Mode | Counter + flight | Panel | Victory |
|---|---|---|---|
| Level | yes (counted win, `'level'` ∈ `period.modes`) | period board | level variant |
| Daily | yes (first win of the date) | period board (`daily_fastest` only in the hub, when `rank.dailyBoard`) | daily variant |
| Event | yes (each index once) | period board (the event board stays on the event screen and the hub) | event variant |
| Tutorial, first run | **no** (the tutorial is not scored, §3.3) | none | "You're ready!" at `fx.win.replayVictoryAtMs` (1 200) |
| Tutorial replay | no | none | "Home" at 1 200 |
| Restored full board | no (rewards were given at the original win) | none | at once |
| Not counted / mode excluded | no | period board, no "+" part | its variant |

### 2.6 Ranking panel (changes to phase2b §2.4)

| Part | 2c |
|---|---|
| Board | Always `rank.boards.period` (`'period_points'`) after a non-tutorial win. `RankingBoardKind` gains `'period'`. |
| Title | `rank.title.period.<kind>`: "Weekly ranking" |
| Subtitle | `rank.sub.period` "+2 fish · This week: 42" (G > 0), else `period.total.<kind>` "This week: 42" |
| My line (FB, no placed list) | "Your rank: #12" (the rank inside this period's band, §4.5) and "Your score: 42 fish" (`fish.count`) |
| List (FB overlay) | The period band only (`RankListView.keep`), rows "42 fish" |
| Web / no provider / timeout | Personal period records (§4.6) + `rank.localOnly` / `rank.unavailable` (unchanged lines) |
| Live region | "Your rank: #12. 42 fish." |

### 2.7 Victory screen (changes to phase2b §2.5)

- **Removed**: the fish pill at the top (`.victory__top`) and its "+" (shop); the three-fish "+3 · 128" row; the bonus chip; `onShop`.
- **Added**, top to bottom inside the reward block (`.victory__reward`), for every scored variant (level, daily, event):

| Row | Content | Classes (e2e contract) |
|---|---|---|
| Fish kept | `maxHearts` fish icons, the kept ones full and the lost ones as `icon-fish-empty`; then "+G" (`fish.plus`) and `period.total.<kind>` "This week: 42". Hidden when G = 0. `aria-label` = `a11y.fishKept.<kind>` | `.victory__kept[data-count=N]`, `.victory__period` |
| Level points | "+120 points" (`victory.points`) and, for a perfect win, the chip "Perfect ×4" (`victory.streak`, `aria-label` `victory.streak.a11y`). No chip after a win with a mistake or a revive | `.victory__points`, `.victory__streak` |

- Tutorial variants: no reward block (as the replay had). Daily and event variants keep their own lines (time, mistakes, hints, countdown; progress bar, milestone line) above the reward block.
- Reduced motion: unchanged (crossfade, static rays); the streak chip does not animate in.
- `fit()` steps: the reward block is two rows where 2b had two (fish row, chips row), so the existing fit levels hold; G2 re-checks 320 × 568 with the banner band.

### 2.8 Home

The top bar's lead slot (after the FB safe zone) shows the **period pill**: `icon-trophy` + this period's total (`periodTotal(save, now)`, 0 after a rollover), `role="img"`, `aria-label` `period.pill.<kind>` "42 fish this week". Not a button `[DECISION]` (the trophy button already opens the rankings hub on FB). The fish pill and its "+" are removed; Home has no shop entry (§5.2).

### 2.9 Interruptions

Unchanged (teardown cancels everything; a hidden page catches up once per step with animations at their end; the win flow never shows an ad). `departLife` is idempotent and is also applied by the catch-up, so a page hidden mid-flow comes back with the right slots empty.

---

## 3. Scoring

### 3.1 Level points `[DECISION: default, user may change]`

For a counted win in a mode of `levelPoints.modes`:

```
base   = levelPoints.perSize × n                       (× levelPoints.hardMultiplier on a Hard level)
streak = the perfect streak INCLUDING this win          (0 when this win had a mistake or a revive)
bonus  = levelPoints.streakStep × min(streak, levelPoints.streakCap)
points = base + bonus                                   (tutorial: 0; a win that does not count: 0)
```

| Example | Points |
|---|---|
| 8×8, a mistake | 80 |
| 8×8, 1st perfect win in a row | 90 ("Perfect ×1") |
| 8×8, 4th perfect win in a row | 120 ("Perfect ×4") |
| 10×10 Hard, 12th perfect win in a row | 200 + 100 = 300 (bonus capped at ×10) |
| 12×12 daily, perfect, streak 3 | 120 + 30 = 150 |

Every result is a multiple of 5 (the original's points were reported in multiples of 5, parity-spec §5.1, *likely*). Hints and kitties never change level points. `points.total` (lifetime, capped at `points.max`) keeps adding them; the 2b paw-points total carries over unchanged `[DECISION]`.

### 3.2 The perfect streak

State: `save.streak = { current, best }` (§3.8).

| Event | Effect | Why |
|---|---|---|
| Counted perfect win (0 mistakes, 0 revives) in a mode of `levelPoints.modes` | `current + 1`; `best = max(best, current)` | F3 |
| `MISTAKE` in a mode of `levelPoints.modes` (any attempt with `mistakePenalty`) | `current = 0` **at once**, in the same store update as the board slot (one `touch` save) | a mistake must not be undone by Home, a reload, a fail or Retry |
| `REVIVED` | `current = 0` (already 0 after the 3 mistakes a revive needs; kept explicit) | lead default "a revive counts as a mistake" |
| Fail (`LOST`) | nothing more (the mistakes already broke it) | — |
| **Retry** `[DECISION]` | nothing: neither breaks nor restores. After a fail the streak is already 0; a perfect retried win starts a new streak at 1 | a fresh attempt is a fresh chance, and a retry can never hide a mistake because the mistake reset happened first |
| Home / leaving a board without a mistake, skipping the tutorial | nothing | not a mistake |
| Hints, kitties | nothing | not mistakes (F3 talks about mistakes) |
| Tutorial (first run or replay) | nothing | no mistake penalty there |
| A win that does not count | nothing | idempotence |

Level-mode boards are linear, a daily counts once per date, an event index once: there is no replay to farm a streak.

### 3.3 Dailies, events and the tutorial `[DECISION: default, user may change]`

**Dailies and event puzzles count for both the period board and the streak**, with the same formulas. Justification, staying close to F1–F3: lives are fish in every mode, so "the remaining lives are added to the leaderboard points when a level is passed" applies to every solved board, and in player terms a solved daily or event puzzle is "a level passed"; the original has one points leaderboard (F2), so every mode's kept fish feed it rather than being meaningless; and a mistake is a mistake wherever it happens, which keeps the streak rule one sentence long. Each mode stays individually switchable (`period.modes`, `levelPoints.modes`). **The tutorial counts for neither** (it is teaching, it cannot lose fish, and the first-run win shows no panel).

### 3.4 Leaderboard points

At a counted win in a mode of `period.modes`: `gained = state.hearts × period.pointsPerFish`; the current period's total (§3.5) += `gained`, capped at `period.max` (99 999). If the stored period key is not the current one, the total restarts at 0 first (the old total moves into `best` if it was higher). The total is saved in the win's critical save, then submitted (§4.4).

### 3.5 Periods (pure, UTC)

| Kind | Key (first day, UTC) | Index | Example for 2026-10-09 |
|---|---|---|---|
| `'week'` (default) | the Monday 00:00 UTC on or before `now` | whole weeks from `rank.periodEpoch` (2026-01-05, a Monday) | key `2026-10-05`, index 39 |
| `'day'` | the UTC date | whole days from 2026-01-05 | key `2026-10-09`, index 277 |
| `'month'` | the 1st of the UTC month | months from 2026-01 | key `2026-10-01`, index 9 |

### 3.6 Pure functions (G1, `src/game/scoring.ts`)

```ts
export const PERIOD_SPAN = 100_000; // score = index × span + total; total ≤ 99 999 for every kind
export function periodKeyAt(now: number, c?: GameConfig): string;                     // §3.5 key of the period containing `now` (UTC)
export function periodIndex(key: string, c?: GameConfig): number;                     // throws on a key that is not a period start of c.period.kind
export function encodePeriodScore(key: string, total: number, c?: GameConfig): number; // periodIndex × PERIOD_SPAN + min(total, period.max); < 2³¹ until index 21 473
export function periodTotal(save: SaveData, now: number, c?: GameConfig): number;     // save.period.total when its key is the current key, else 0
export function addPeriodPoints(save: SaveData, gained: number, now: number, c?: GameConfig): SaveData; // roll the key, add, cap, update best
export function keptPoints(mode: ModeId, kept: number, c?: GameConfig): number;        // kept × pointsPerFish when mode ∈ period.modes, else 0
export interface LevelPointsInput { readonly mode: ModeId; readonly n: number; readonly hard: boolean; readonly streak: number }
export function levelPointsFor(input: LevelPointsInput, c?: GameConfig): number;      // §3.1; 0 for tutorial and modes outside levelPoints.modes
export function streakAfterWin(save: SaveData, mode: ModeId, perfect: boolean, c?: GameConfig): SaveData; // §3.2
export function breakStreak(save: SaveData): SaveData;                                 // same object when current is already 0
// DecodedScore gains { kind: 'period'; periodIndex: number; total: number }; boardFormat(period board) = 'period'.
```

`pointsFor` (2b) is deleted once nothing calls it; `encodePointsScore` is deleted with the paw board. `encodeDailyScore`, `dayIndex`, the event encoders and `canSubmit` stay.

### 3.7 Win bookkeeping (G1, `src/app/session-effects.ts`)

`WinSummary` drops `fish` and gains:

```ts
readonly kept: number;                                   // state.hearts at WON
readonly perfect: boolean;                               // mistakes === 0 && revivesUsed === 0
readonly streak: { readonly current: number; readonly best: number }; // after this win
readonly period: { readonly kind: PeriodKind; readonly key: string; readonly gained: number; readonly before: number; readonly total: number } | null; // null: tutorial
// pointsEarned (level points, §3.1) and pointsTotal (lifetime) keep their names.
```

`WinBookkeeping.fishEarned` / `bonus` are removed. Order inside one bookkeeping call: mode bookkeeping (progress / daily / event record and milestones) → streak → level points → period points; everything in the one critical save.

### 3.8 Save v3 (G1)

```ts
export interface StreakRecord { current: number; best: number }          // 0 ≤ current ≤ best ≤ 1 000 000
export interface PeriodRecord { key: string; total: number; bestKey: string; bestTotal: number } // keys '' or a period start (YYYY-MM-DD)
export interface SaveDataV3 extends Omit<SaveDataV2, 'v' | 'wallet'> { v: 3; streak: StreakRecord; period: PeriodRecord }
export type SaveData = SaveDataV3;
```

- `SAVE_VERSION = 3`; the storage keys stay (`mewdoku.save.v1`, cloud `save`).
- **Defaults**: `streak {0, 0}`, `period {'', 0, '', 0}`.
- **`MIGRATIONS[2] = migrate_2_to_3`**: drop `wallet`; add the defaults; drop `rank.pending.paw_points`; keep everything else (purchases, `noAds`, ledger, events, groups, points, stock).
- **Retired paid packs**: after validation, when the input document's `v` was < 3, every ledger entry of a product in `iap.retired` grants its compensation once (`applyGrant` of the retired def, §5.3). Earned fish are not converted `[DECISION]` (the game never shipped publicly; only test saves hold fish).
- **Validation** (field by field, as v2): `streak` ints in range, `best ≥ current` (repair: `best = max`); `period` keys `''` or `DATE_KEY_RE` **and** a period start of the configured `period.kind` (otherwise the whole `period` record resets: a changed period kind starts fresh), totals 0…`period.max`, and `bestTotal ≥ total` when `bestKey === key`. `rank.pending` keys may now be `period_points`.
- **Merge** (04 §7.3 additions): `streak.current` from the newer document, `best = max(both)`; `period`: equal keys → `total = max`; different keys → the later key's `key`/`total`; best = the higher `bestTotal` (tie: later `bestKey`). `wallet` rows are gone; `repairPaidGrants` is unchanged and now re-applies retired compensation for entries only the older document holds.
- **Downgrade**: a v2 build reading a v3 save repairs `v`, loses the streak and period records and sees `wallet` at 0: acceptable for test builds.

Why the compensation can never apply twice: each v2 document (local and cloud) is compensated once when it is migrated; the merge takes `stock` from the newer one, and an entry both ledgers hold is never repaired.

### 3.9 Analytics (G1, `src/app/events.ts`)

- **New** `win_points: { mode: ModeId; fish: number; total: number; points: number; streak: number }` (fish kept, the period total after, level points, the streak after), logged once per counted scored win. Add it to `ANALYTICS_PARAM_KEYS` (05 §10 limits test).
- **Removed**: the bus event `wallet` (`AppEventMap`). `iap` is unchanged (a restored retired purchase logs its own id).

---

## 4. Leaderboards

### 4.1 Boards after 2c

| Key | 2c | Score |
|---|---|---|
| **`period_points`** (new, `rank.boards.period`) | THE leaderboard: the post-win panel in every scored mode, the hub's first tab | `encodePeriodScore(key, total)` |
| `paw_points` | **retired**: never submitted or read; its pending entries are dropped by the migration; not created in the dashboard | — |
| `daily_fastest` | **off** (`rank.dailyBoard: false`): not submitted, no "Today" tab. All its code (band reading, FB2B-4) stays for the flag | unchanged |
| `event_<id>` | kept: submitted at each event win (as now), read by the event screen's top list and the hub's Event tab | unchanged |

`BoardKey` (G1, `src/game/types.ts`) becomes `'period_points' | 'paw_points' | 'daily_fastest' | \`event_${string}\`` (`paw_points` stays in the union, `@deprecated`, so old saves still parse).

### 4.2 Why one global board with period bands

- A per-period reset in the App Dashboard would be simplest, but none is documented in anything we could read: a 2026-10-09 search found nothing about a reset period for Instant Games leaderboards (fb-dashboard tags: [uncertain]). If G1 (Phase 4) finds one, the band still works (the old bands simply disappear).
- One board per period would need a new dashboard board every week and a new build to know its name: rejected.
- So, as `daily_fastest` does: **one global board, the period index in the high digits** (§4.3). Both FB APIs keep a player's best score; a new period's index is higher, so the first win of a new period replaces last period's entry, and within a period the total only grows. That is the "total that resets" of F2.
- **UTC periods make the band cheap.** Every player shares one boundary, so the current period's band sits at the **top** of the board; only devices with clocks ahead could post above it. Readers still page past such entries (the FB2B-4 reader, ≤ 4 × 50).

### 4.3 Encoding

`score = periodIndex × 100 000 + min(total, 99 999)`, an integer, higher is better, below 2³¹ until period index 21 473 (year 2084 for days, far later for weeks and months). Decode: `periodIndex = floor(score / 100 000)`, `total = score mod 100 000`. The current week (index 39) with 42 points posts `3 900 042`. **Changing `period.kind` changes what an index means**: it needs a new dashboard board name (the `BoardKey` stays `period_points`; `VITE_FB_LEADERBOARDS` maps it to the new name). The dashboard doc says so (§4.8).

### 4.4 Submitting

- At a counted win with G > 0: submit `period_points` with the new total. An event win also submits its event board **in the same batch**: the client limiter (`rank.submitMinIntervalMs`) applies to a win's batch, not per board (G1: `RankingFlow.submitAll`, §7.4), so the second board is not pushed into `rank.pending` by the first.
- `rank.minSolveMs` / `maxSolveMs` still gate a submission; the total is saved locally either way and the next submission carries it.
- A pending period score from an older period is still flushed: it lands in its own (older) band and never beats a newer entry.
- The submit is G = 0 safe: a win that adds nothing submits nothing.

### 4.5 Reading

- `keep = score ⇒ floor(score / PERIOD_SPAN) === periodIndex(currentKey)` (G1 `bandFilter(board, at)`, generalising `dayFilter`): passed to `RankingProvider.top(board, n, keep)` and `RankListView.keep`, exactly like the daily.
- **My rank** (classic only): when `mine()` is in the band and the band's first entry carries its board rank (`RankEntry.boardRank`, new and additive, G3), `rank = mine.rank − (top[0].boardRank − 1)`: exact at any depth. Otherwise the 2b position search inside the read entries (≤ 200), else "Your score" without a rank. Never the board's raw rank.
- NEZP: no rank and no "me", as in 2b.

### 4.6 Web and fallback: personal period records

`PersonalRecordsView` for `board: 'period'` (records card rows, top to bottom): **This week** (period total now) · **Your best week** (`bestTotal`, hidden while 0) · **Perfect streak** (`current`, with "best N" when `best > current`) · **Levels solved**. The `rank.localOnly` / `rank.unavailable` lines are unchanged. Only facts from the save.

### 4.7 Rankings hub and event screen

Hub tabs (`RankHubTab`): **`'period'`** (label `rank.tab.period.<kind>` "This week"; default tab) · `'daily'` only when `rank.dailyBoard` · `'event'` while one is active · `'groups'` when enabled. The `'points'` tab is removed. The event screen's top list is unchanged (event board).

### 4.8 Group challenges (flag `groupChallenges`, off)

A challenge's score becomes the **fish kept** inside the challenge context (`GroupFlow.onWin(gained)` instead of the win's points); copy "Keep the most fish in {hours} hours" (Appendix A). Rank-mode non-winners get `groups.placeHints` (1) hints instead of 10 fish. Participation rewards (kitties) are unchanged.

### 4.9 `docs/phase2b/fb-dashboard.md` (G3)

- §1: `VITE_FB_LEADERBOARDS` example `{"period_points":"fish_week_v1","event_lantern_walk_2026":…}`; key rules accept `period_points`.
- §3: replace the `paw_points` row with `period_points` (suggested name `fish_week_v1`, "fish kept this UTC week", score `periodIndex × 100 000 + total`, range below 2³¹); mark `daily_fastest` "create only if `rank.dailyBoard` is turned on"; a note that a change of `period.kind` needs a new board name; the band reasoning of §4.2 in short.
- §4: three products (`remove_ads`, `hints_15`, `kitties_8`); `fish_250` / `fish_900` "do not create; if a test app has them, deactivate them; the build still recognises them in a restore and compensates them (§5.3)".
- §6: a row L6 for the period band (assumption: best-score retention per player on both APIs, as L2/L5) and the new `boardRank` field (L3).
- §8: the checklist (one period board instead of `paw_points` + `daily_fastest`).

---

## 5. Remove the fish currency

### 5.1 Inventory

| What | Where | Owner | 2c |
|---|---|---|---|
| Wallet `save.wallet` | `game/types.ts`, `save*.ts`, `purchases.ts`, `economy.ts` | G1 | removed (v3, §3.8) |
| `fishForWin`, `addFish`, `spendFish`, `canAfford`, `swapPrice`, `swapFish`, `FishAward` | `game/economy.ts` | G1 | deleted (hint/kitty ledger and fallback functions stay) |
| Fish award in the win | `session-effects.ts`, `session.ts`, `win-flow.ts` | G1 | replaced by §2, §3 |
| `emitWallet`, `walletChanged`, bus `wallet` | `session.ts`, `helper-flows.ts`, `boot.ts`, `events.ts` | G1 | deleted |
| O2 "Swap 15 fish" | `helper-flows.ts` (`askO2` swap, `doSwap`, `'swapped'`) | G1 | deleted; O2 = Watch video / Not now, free, countdown (02 §13.3) |
| `RewardedPromptProps.swap` and its button | `ui/overlays/rewarded-prompt.ts` | G2 | deleted |
| Shop swaps | `shop-flow.ts` (`swap`, `props().fish/hintPrice/kittyPrice/onSwap`) | G1 | deleted |
| Shop sheet swap section, fish pill, `PRODUCT_ICON` fish rows | `ui/overlays/shop-sheet.ts` | G2 | deleted (§5.2) |
| Fish pill "+" (Home lead, victory top) | `home-screen.ts`, `victory-screen.ts`, `pills.ts` `createFishPill` | G2 | deleted; Home lead = period pill (§2.8) |
| Home `onShop`, victory `onShop`, `SessionDeps.openShop` | `shell.ts`, `session.ts`, `session-types.ts`, `boot.ts` | G1 | deleted |
| Fish packs `fish_250`, `fish_900` | `iap.products` → `iap.catalog` / `iap.retired` (config, done) | G1 reads, G3 filters | §5.3 |
| Event milestone fish | `src/data/events/events.json`, `Reward.fish`, `checkReward`, `applyReward`, `sumRewards` | G1 | §5.5 |
| Milestone fish text and icon | `victory-screen.ts` `rewardText`, `event-screen.ts` | G2 | fish branch deleted |
| Group 10 fish | `group-flow.ts`, `group-result.ts` | G1, G2 | `groups.placeHints` hints (§4.8) |
| Strings | §1.5, Appendix A | G2 | removed keys |
| Config | `fish.*`, `shop.*`, `iap.products`, `IapProductDef.fish` | lead (done) | `@deprecated`, not read (§8) |

### 5.2 The shop after 2c

- **What it sells**: only `iap.catalog` (No Ads, Bulb Bundle, Kitty Basket), FB on facebook.com and Android (unchanged rules).
- **ShopProps** (G2): `{ buy, busy, onBuy, onRetry, onClose }`; the sheet is the Buy section with its states (loading, error + retry, unavailable, ready, "Owned").
- **Entry points** `[DECISION]`: Settings → **Shop** only when the Buy section can show something (`buyState().kind` is `loading`, `error` or `ready`): never on the web (the web build has no payments, so it has no shop at all), never on FB iOS or Messenger.com (`unavailable`). Settings → **Remove ads** unchanged. No Home, victory or O2 entry.
- Flag `shop` stays (it gates the FB shop).

### 5.3 IAP catalogue, retired products and the ledger

- `iap.catalog` (on sale) and `iap.retired` (`fish_250` → 10 hints + 3 kitties; `fish_900` → 30 hints + 15 kitties: the fish they granted at the old 15 / 30 swap rates). `iap.products` is `@deprecated` and no longer read.
- **G1** `purchases.ts`: `productDef(id)` looks in `catalog`, then `retired`; `parseLedgerEntry` accepts both (a ledger entry of a retired product stays valid: `isRecorded`, merge repair and the boot restore keep working); `applyGrant` has no fish branch, so a retired def grants its hints and kitties.
- **G1** `shop-flow.ts`: `restore()` delivers an unconsumed retired purchase (compensation + ledger + critical save + consume) exactly like a catalogue one; `products()` lists `catalog` only.
- **G3** `fb-payments.ts`: `catalog()` passes on `iap.catalog` ids only; `purchases()` passes on `catalog ∪ retired` ids (so a retired purchase reaches the restore instead of staying unconsumed forever).
- Migration compensation: §3.8.

### 5.4 O2 "Out of hints / kitties"

Back to the Phase 2 card: [Watch video] [Not now] / "Here's a free hint." [Take it] / the countdown with [OK]. No swap row, no balance.

### 5.5 Event milestone rewards (`src/data/events/events.json`, all three events)

| at | 2b | 2c |
|---|---|---|
| 3 | 2 hints | 2 hints |
| 7 | 30 fish | **2 hints** |
| 12 | 2 kitties | 2 kitties |
| 16 | 60 fish | **2 hints + 1 kitty** |
| 21 | 100 fish + 3 kitties | **3 hints + 5 kitties** |

`Reward` loses `fish` (G1 keeps it optional and `@deprecated` until integration step I-3 so G2 compiles meanwhile); `checkReward` reports `fish` as an unknown reward; `verify-levels` and `events.spec` check the new tracks.

---

## 6. Documents to update afterwards (lead, integration step I-5)

| Doc | Change |
|---|---|
| `docs/phase1/01-game-deconstruction.md` | Record F1–F4 with source **"user, first-hand, 2026-10-09"**: §5 new row 5.10 (on Play the lives are fish; 3 per level; the hearts in App Store screenshots are iOS or older) and notes on 5.1/5.7; §7.1.2–7.1.3 (the post-win fish are the lives kept; they go to the leaderboard points); §10.12 rewritten and new rows 10.13 (the leaderboard ranks points per period, a total that resets; points = fish left when a level is passed) and 10.14 (level points that grow without mistakes, streak-like); §17 the "lives are fish: refuted" row becomes "confirmed for the Play Store app (user, first-hand, 2026-10-09)"; §18 a contradiction entry (App Store hearts vs Play fish); §19 two unknowns resolved (what golden fish are; leaderboard scope) and new unknowns (period length and reset time, the points numbers, whether dailies and events count, what an empty life looks like, the fish animation's look) |
| `docs/phase2/differences-vs-original.md` | §1.0 rows 2 (win flow: lives fly to the period counter), 5 (rankings: the period points board), 8 (no fish packs); §2.5 hearts / losing / revive rows (fish; parity); §2.6 post-win reward and economy rows (no currency; period points; level points with a streak; our numbers `[DECISION]`); §2.7 leaderboard row; §2.8 monetization (three products); §3.4 mistake row (our fish loss) and level-win row; §6 unknown #1 resolved |
| `docs/phase2b/parity-spec.md` | A banner under the status line: "Phase 2c ([fish-lives-spec](../phase2c/fish-lives-spec.md)) supersedes §0.5 (hearts), §0.8 (fish rates, fish packs), §2.1 (what fish are for), §2.2–§2.3 (fish steps and sources), §2.5 (fish pill, reward row), §2.6, §2.8, §2.9 (heart break), §2.14, §5.3 (points and boards), §5.5 (board by mode), §5.6 (group scoring and fish), §8.3 (catalogue), §9 (wallet), §10 (fish, shop, points)"; one-line pointers at each of those sections |
| `docs/phase2b/STATUS-2b.md` | One line under the title: superseded in part by Phase 2c, see `docs/phase2c/STATUS-2c.md` |
| `docs/phase2c/STATUS-2c.md` (**new**) | What changed, verification (tsc, vitest, levels, palette, i18n, builds, size, zips, 3 × Playwright), screenshots, open gates |
| `docs/phase2b/CONTRACTS.md` | A pointer to §7.4 of this spec for the 2c API changes |
| `docs/phase2b/fb-dashboard.md` | G3 (§4.9) |
| `docs/provenance.md` | G2's rows from `docs/phase2c/provenance-G2.md` (empty-fish icon, fish loss, period pill, streak chip) |
| `docs/phase1/02-rebuild-spec.md`, `04-architecture.md` | 02: a note in the HUD / economy / save sections pointing here; 04 §4.3 save v3, §9 budgets if they move |

---

## 7. Implementation plan

### 7.1 Ownership (disjoint; a new file starts with `// Owner: G1|G2|G3 (Phase 2c)`)

| Workstream | Owns |
|---|---|
| **G1** game + app logic | `src/game/**`, `src/app/**` **except** `config.ts`, `src/data/**`, `scripts/**`; `tests/unit/game/**`, `tests/unit/app/**`, `tests/property/**`, `tests/unit/layering.spec.ts`, `tests/unit/build-config.spec.ts`; `tests/e2e/{smoke,winflow,events,determinism}.spec.ts` |
| **G2** UI, art, fx, audio, styles, i18n | `src/ui/**`, `src/styles/**`, `src/audio/**`, `src/i18n/**`; `tests/unit/ui/**`, `tests/unit/shell/**`, `tests/unit/i18n/**`, `tests/unit/sanity.spec.ts`; `tests/e2e/{layout,visual,i18n}.spec.ts`; `docs/i18n/**`; **new** `docs/phase2c/provenance-G2.md` |
| **G3** platform | `src/platform/**`, `tests/fixtures/**`, `tests/unit/platform/**`, `tests/e2e/fbig.spec.ts`, `docs/phase2b/fb-dashboard.md` |
| **Lead** | `src/app/config.ts` (done), `playwright.config.ts`, `vite.config.ts`, `index.html`, `src/env.d.ts`, every other doc, integration |

Running a script you do not own (`i18n-check --write-drafted-from`, `palette-check`, `size-check`) is fine; editing it is a request to its owner (§7.5).

### 7.2 Order

1. **S0, interfaces first (each workstream's first deliverable, before anything else; additive only).** G1: `BoardKey` + `'period_points'`, the `StreakRecord` / `PeriodRecord` / `SaveDataV3` types and the `SaveData` switch, `Reward.fish` made optional `@deprecated`. G2: the new English keys of Appendix A.2 (values final; the 16 drafts follow later, so `i18n:check` reports missing keys until then), the new interface members of §7.4 with working implementations or minimal ones, old members kept and marked `@deprecated` (props they will drop become optional). G3: `RankEntry.boardRank?`, `parseLeaderboardMap` accepting `period_points`. Each owner fixes the compile errors S0 causes in **its own** files (for example G3's platform tests that build a save literal with `wallet`).
2. **Parallel build** (§7.3). Consumers switch to the new members; nobody deletes a member or an i18n key another workstream may still call. G2 deletes the A.3 keys that only `src/ui/**` uses during its work; the three that G1 code calls today (`a11y.fishEarned.*`, `rank.title.points`, `shop.notEnough`) go at I-3.
3. **Integration (lead)**: I-1 `playwright.config.ts` `VITE_FB_LEADERBOARDS`: add `period_points: 'e2e_period_points'`, drop `paw_points` and `daily_fastest`; I-2 run every cross-workstream request (§7.5); I-3 delete the `@deprecated` members that nothing calls any more (old GameScreen / PillsView fish methods, `VictoryProps.fish/bonus/onShop`, `HomeView.fish`, `HomeCallbacks.onShop`, `ShopProps` swap fields, `RewardedPromptProps.swap`, `Reward.fish`, `RankHubTab 'points'`, `RankScoreView 'points'` with `rank.points` if unused, `fishSourceRows`); I-4 budgets (`npm run size`; a shrink is expected); I-5 the docs of §6; I-6 the acceptance run (§9), three full Playwright runs, screenshots.

### 7.3 Work items

**G1 (game + app)**

1. `game/types.ts`, `save.ts`, `save-v2.ts` (or a new `save-v3.ts`), `save-fields.ts`: v3 shape, defaults, `migrate_2_to_3`, retired compensation after validation, validation, merge (§3.8); `BOARD_KEY_RE` with `period_points`; `MIGRATIONS` typed `(d, c) => d` if the step needs config.
2. `game/scoring.ts`: §3.6; delete `pointsFor`, `encodePointsScore`; `DecodedScore 'period'`.
3. `game/economy.ts`: delete the fish section (§5.1); hint/kitty/fallback/ad functions unchanged.
4. `game/purchases.ts`: §5.3. `game/events.ts`: `Reward` without fish, `applyReward`, `sumRewards`, `checkReward` (§5.5). `src/data/events/events.json`: the new tracks.
5. `app/session-effects.ts`: §3.7, the `win_points` event. `app/session.ts`: `MISTAKE` / `REVIVED` → `breakStreak` in the same store update as the slot (only in `levelPoints.modes` and with `rules.mistakePenalty`); `onWon` → period board for every scored mode (event board too for event wins, one batch); `fishSources` / `emitWallet` / `openShop` removed; win-flow input (§7.4).
6. `app/win-flow.ts`: §2.2–§2.5 (`winTimeline` by N, `panelAt`, lift-off with `departLife`, counter, catch-up applying departed slots).
7. `app/ranking-flow.ts`: `bandFilter` (day and period), `submitAll`, the `boardRank` offset (§4.5), period `scoreView` / `formatBoardScore` ("42 fish"), `myScore` = `{ kind: 'fish', fish: periodTotal }`, skip `daily_fastest` unless `rank.dailyBoard`, ignore `paw_points` pending.
8. `app/rank-hub-flow.ts`: tabs §4.7 (`'period'` first, daily behind the flag), period titles and records.
9. `app/views.ts`: `selectHomeView` (`period` instead of `fish`), `selectVictoryView` (§2.7), `selectRankingView` (board `'period'`, result `'period'`), `personalRecords` (§4.6), `boardKindOf`.
10. `app/helper-flows.ts`, `app/shop-flow.ts`, `app/shell.ts`, `app/boot.ts`, `app/group-flow.ts`, `app/events.ts`, `app/session-types.ts`, `app/session-parts.ts`: §5.1–§5.4, §4.8, §3.9.
11. `scripts/verify-levels.ts`: event tracks without fish. `scripts/palette-check.ts`: only if G2 asks (§7.5).
12. Tests: `economy`, `scoring` (formula table §3.1 incl. caps and multiples of 5, period keys for day/week/month across year and DST-free UTC edges, encode/decode round trips, ordering: a newer period beats any older total, `< 2³¹`), `save` (v2 → v3 incl. retired compensation once, validation, merge rows, a kind change resets `period`), `purchases` (retired ids in ledger, restore, repair), `events` (tracks), `win-flow` (timestamps for N = 1, 2, 3, 5; panel 4 200 / 4 350 / 4 500; scrim −300; reduced; no-flight; tutorial at 1 200; catch-up departs the right slots), `session` (a mistake breaks the streak at once and survives Home + reload; retry does not restore it; a revive resets), `ranking-flow` (band filter, `boardRank` offset, batch submit, pending of an old period, no `paw_points`), `helper-flows` (no swap), `shop-flow` (catalogue only, retired restore), `group-flow` (hints), `shell-2b` (no shop row on web / iOS). e2e: `smoke` (a mistake costs a fish: the pill shows 2 full; no shop on the web; the victory rows), `winflow` (3-fish win: counter +3 and panel within 4.4–4.8 s; a 1-fish win: panel within 4.1–4.5 s; reduced: panel ≤ 1.4 s; `save.period.total` and `save.streak` after two perfect wins), `events` (milestone grants hints/kitties).

**G2 (UI, art, fx, audio, styles, i18n)**

1. Art: `icon-fish-empty` (`fish.ts` `fishOutlineMarkup`, `sprite.ts`), provenance rows; delete `icon-heart*` and `clip-heart-*` once unused (how-to-play switched).
2. `hud/pills.ts`: lives pill (§1.1), fish loss (§1.3), revive pop (§1.4), `lifeSlots` / `departLife`, the period counter (`createPeriodPill`, in-game variant: roll, bump, rising label), `fishRect` etc. kept `@deprecated` until I-3. `styles/hud.css`, `fx.css`: the renamed classes and the new keyframes (`--t-life-loss` from `fx.lifeLossMs`).
3. `screens/game-screen.ts`: the new `GameScreen` members (§7.4). `screens/home-screen.ts`: period pill in the lead slot; no fish pill, no `onShop`. `screens/event-screen.ts`: rewards without fish.
4. `fx/fish-flight.ts`: `startScale`; spread for N = 1, 2 (§2.3); `fishSourceRows` kept until I-3.
5. Overlays: `victory-screen.ts` (§2.7), `ranking-panel.ts` (§2.6, `'period'` kind, `'fish'` score view, records rows §4.6), `rank-hub.ts` (`'period'` tab, `periodKind` prop), `shop-sheet.ts` (§5.2), `rewarded-prompt.ts` (§5.4), `fail-overlay.ts` (§1.4), `group-result.ts` (hints), `how-to-play.ts` (§1.5).
6. i18n: Appendix A in `en.ts` / `en/*.ts`; the 16 drafts (AI, marked unreviewed in `docs/i18n/review-log.md` as before; release ships `en` only); `meta.ts` notes and max lengths; `drafted-from.json`; glossary.
7. Audio: unchanged ids; no new cue required.
8. Tests: `pills.spec` (loss timeline phases and reduced swap, slot order, `departLife`, counter roll), `fx-fish.spec` (N = 1, 2, 3, 5 sources, `startScale`, sizes from rects), `victory-ranking.spec` (rows, streak chip only when perfect, period titles per kind, records rows, no fish pill), `screens-2b.spec` / `screens.spec` (Home period pill, no "+"), `overlays.spec` / `rewarded-settings.spec` (no swap), `catalogs.spec` / `format.spec` / `sanity.spec` (keys; `rewarded.swap` assertion removed), `art-a11y-fx.spec` (empty-fish icon, labels). e2e: `layout` (keyboard through the win flow; the shop keyboard test moves to FB-only or is dropped on web), `visual` (re-capture: game with lives, mistake mid-loss, win flight, victory, Home), `i18n` (the shop checks become FB-only or are removed; victory rows and lives labels per locale at 320 px).

**G3 (platform)**

1. `platform/types.ts`: `RankEntry.boardRank?: number` (documented: the board's own rank, set on band reads); doc comments of `RankListView.keep` / `top(…, keep)` generalised from "the shown day" to "a band".
2. `fb/fb-probe.ts`: `BOARD_KEY` accepts `period_points`.
3. `fb/fb-ranking.ts`: band reads set `boardRank` (classic: `getRank()` of the entry; NEZP: its 1-based position in the API list); nothing else changes (paging, `LEADERBOARD_NOT_FOUND` latch).
4. `fb/fb-payments.ts`: §5.3 (catalogue ids vs purchase ids).
5. `tests/fixtures/fbinstant-stub.js`: catalogue of the three products; an `unconsumed` option that can hold a `fish_250` purchase; seeding a board with entries of several period bands (and one future-dated entry) to test the band read.
6. Tests: `fb-ranking.spec` (period band, `boardRank`, a future-dated entry above the band), `fb-payments.spec` (retired ids only in purchases), `fb-platform.spec`, `fbinstant-stub.spec`. e2e `fbig.spec.ts`: after a win the stub's `e2e_period_points` board holds `encodePeriodScore(this week, 3)` (compute it in the test from the stub clock); classic panel "Your rank: #1", NEZP "Your score: 3 fish"; the shop opens from Settings (no Home "+"), lists three products, no swap section; iOS: no Shop row; the banner + shop test re-based on Home → Settings → Shop; a boot restore of an unconsumed `fish_250` grants 10 hints + 3 kitties and consumes it.
7. `docs/phase2b/fb-dashboard.md`: §4.9.

### 7.4 Cross-workstream interfaces (exact)

**G1 → G2, G3 (types; G1 lands them in S0)**

```ts
// src/game/types.ts
export type BoardKey = 'period_points' | 'paw_points' | 'daily_fastest' | `event_${string}`; // paw_points @deprecated (old saves only)
export interface StreakRecord { current: number; best: number }
export interface PeriodRecord { key: string; total: number; bestKey: string; bestTotal: number }
export interface SaveDataV3 extends Omit<SaveDataV2, 'v' | 'wallet'> { v: 3; streak: StreakRecord; period: PeriodRecord }
export type SaveData = SaveDataV3;

// src/game/events.ts
export interface Reward { readonly hints?: number; readonly kitties?: number; /** @deprecated 2c, removed at I-3 */ readonly fish?: number }

// src/app/config.ts (lead, done): PeriodKind, ScoredMode, levelPoints, period, rank.boards.period, rank.dailyBoard,
// rank.periodEpoch, groups.placeHints, iap.catalog, iap.retired, fx.lifeLossMs, fx.lifeLossPillMs,
// fx.win.panelAfterLastMs, fx.win.scrimLeadMs.
```

**G2 → G1 (UI contracts G1 calls or fills; G2 lands them in S0)**

```ts
// src/ui/hud/pills.ts
export interface PillsView extends View<PillsProps> {
  playEvent(ev: GameEvent): void;                                  // MISTAKE → fish loss of slot heartsLeft; REVIVED → pop
  /** Full life slots in departure order (highest slot first), with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly { readonly slot: number; readonly rect: DOMRect }[];
  /** The life in `slot` leaves for the win flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /** Win flow: shows the period counter (fade in at the first call), later calls with a higher total roll + bump. */
  showPeriodCounter(total: number): void;
  /** Client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** The rising "+N" chip at the counter. */
  periodLabel(text: string): void;
  /** @deprecated 2c (removed at I-3): showFish, fishRect, fishLabel. */
}
export interface PeriodPillProps { readonly total: number; readonly kind: PeriodKind }
export function createPeriodPill(props: PeriodPillProps): View<PeriodPillProps>; // Home lead slot; role img, aria-label period.pill.<kind>

// src/ui/screens/game-screen.ts — GameScreen gains the same five members, forwarding to the pills:
lifeSlots(): readonly { readonly slot: number; readonly rect: DOMRect }[];
departLife(slot: number): void;
showPeriodCounter(total: number): void;
periodRect(): DOMRect | null;
periodLabel(text: string): void;

// src/ui/fx/fish-flight.ts
export interface FlyFishOptions { /* 2b members unchanged */ readonly startScale?: number } // default 0 (2b pop); 2c passes 1

// src/ui/screens/home-screen.ts
export interface HomeView { /* … */ readonly period: { readonly kind: PeriodKind; readonly total: number }; /** @deprecated 2c */ readonly fish?: number }
export interface HomeCallbacks { /* … */ /** @deprecated 2c */ onShop?(): void }

// src/ui/overlays/victory-screen.ts
export interface VictoryProps {
  /* variant, praise, level, nextLevel, daily, event, buttonDelayMs, reducedMotion, bannerReserved, now, onPrimary, onHome: unchanged */
  readonly pointsEarned: number | null;                       // unchanged: level points (+120)
  /** "Perfect ×N" for a perfect win (N = streak after it, ≥ 1); null otherwise. */
  readonly streak: number | null;
  /** The fish-kept row; null when the win added no leaderboard points (tutorial, not counted, mode excluded). */
  readonly kept: { readonly fish: number; readonly max: number; readonly gained: number; readonly total: number; readonly kind: PeriodKind } | null;
  // The 2b members `fish`, `bonus` and `onShop` keep their types, become optional and @deprecated; I-3 deletes them.
}

// src/ui/overlays/ranking-panel.ts
export type RankingBoardKind = 'period' | 'points' | 'daily' | 'event';            // 'points' @deprecated (I-3)
export type RankScoreView = /* 2b kinds */ | { readonly kind: 'fish'; readonly fish: number };
export type RankingResultView = /* 2b kinds */ | { readonly kind: 'period'; readonly gained: number; readonly total: number; readonly periodKind: PeriodKind };
export interface PersonalRecordsView { /* 2b fields */
  readonly period?: { readonly kind: PeriodKind; readonly total: number; readonly best: number };
  readonly streak?: { readonly current: number; readonly best: number };
}
export interface RankingPanelProps { /* 2b */ readonly periodKind?: PeriodKind } // required for board 'period'

// src/ui/overlays/rank-hub.ts
export type RankHubTab = 'period' | 'points' | 'daily' | 'event' | 'groups';      // 'points' @deprecated (I-3)
export interface RankHubProps { /* 2b */ readonly periodKind: PeriodKind }

// src/ui/overlays/shop-sheet.ts
export interface ShopProps { readonly buy: ShopBuyState; readonly busy: boolean; onBuy(id: ProductId): void; onRetry(): void; onClose(): void;
  /** @deprecated 2c (I-3) */ readonly fish?: number; readonly hintPrice?: number; readonly kittyPrice?: number; onSwap?(item: 'hint' | 'kitty'): void }

// src/ui/overlays/rewarded-prompt.ts — RewardedPromptProps.swap: @deprecated, ignored (I-3 deletes it)
// src/ui/overlays/group-result.ts — the 'place' outcome:
| { readonly kind: 'place'; readonly place: number; readonly count: number; readonly hints: number }   // was fish

// i18n keys G1 calls (G2 adds them in S0, Appendix A): a11y.fishKept.{day|week|month} (plural), rank.title.period.*,
// rank.tab.period.*, rank.sub.period (plural), period.total.*, fish.count, fish.plus. G1 maps PeriodKind → key with a
// switch (keys are typed literals; never a template string).
```

DOM contract for e2e (G2 keeps these names): `.pill--lives`, `.life[data-full]`, `.period-pill` (Home and in game, `[data-in-game]` in the pills row), `.period-pill__n`, `.victory__kept[data-count]`, `.victory__period`, `.victory__points`, `.victory__streak`, `[data-overlay="shop"] .shop__section--buy`.

**G3 → G1**

```ts
// src/platform/types.ts
export interface RankEntry { readonly rank: number; readonly score: number; readonly isMe: boolean;
  /** [2c, additive] The board's own rank of this entry, set on band reads (top(…, keep)); absent otherwise. */
  readonly boardRank?: number }
// PaymentsProvider.purchases(): also returns purchases of iap.retired ids (catalog() never lists them).
// parseLeaderboardMap: accepts the key 'period_points'.
```

**G1-internal (no other workstream calls them)**: `WinFlowInput { variant, screen, catCells, kept, perFish, periodBefore, periodKind, reducedMotion }`, `winTimeline`, `panelAt(N, c)`, `RankingFlow.submitAll(entries: readonly { board: BoardKey; score: number }[], solveMs: number): Promise<void>`, `RankingFlow.fetch(board, band?: { day?: string; periodKey?: string })`, `bandFilter(board, band, c)`, `WinSummary` (§3.7).

### 7.5 Requests between workstreams

Write them to `docs/phase2c/requests-<ws>.md` (one line each: from → to, what, why); the lead runs I-2. Known now: G2 → G1 only if a new colour token needs a `palette-check` row; G3 → lead: `playwright.config.ts` (I-1).

---

## 8. Config (done at the spec stage, `src/app/config.ts`)

| Key | Value | Status |
|---|---|---|
| `PeriodKind`, `ScoredMode` (types) | `'day' \| 'week' \| 'month'`, `'level' \| 'daily' \| 'event'` | new |
| `levelPoints` | `{ perSize: 10, hardMultiplier: 2, streakStep: 10, streakCap: 10, modes: ['level', 'daily', 'event'] }` | new |
| `period` | `{ kind: 'week', pointsPerFish: 1, modes: ['level', 'daily', 'event'], max: 99_999 }` | new |
| `rank.boards.period` | `'period_points'` | new |
| `rank.dailyBoard` | `false` | new |
| `rank.periodEpoch` | `'2026-01-05'` (a Monday) | new |
| `groups.placeHints` | `1` | new |
| `iap.catalog` | `remove_ads`, `hints_15` (15 hints), `kitties_8` (8 kitties) | new |
| `iap.retired` | `fish_250` → 10 hints + 3 kitties; `fish_900` → 30 hints + 15 kitties | new |
| `fx.lifeLossMs`, `fx.lifeLossPillMs` | 700, 400 | new |
| `fx.win.panelAfterLastMs`, `fx.win.scrimLeadMs` | 1 950, 300 | new |
| `fish.*`, `shop.*`, `iap.products`, `IapProductDef.fish` | unchanged values | `@deprecated` (not read after 2c) |
| `points.perSize`, `hardMultiplier`, `flawless`, `unaided`, `daily`, `event` | unchanged values | `@deprecated` (`levelPoints`); `points.max` stays (lifetime cap) |
| `fx.heartBreakMs`, `fx.heartCrackMs`, `fx.win.bonusLabelAtMs`, `fx.win.scrimAtMs`, `fx.win.fishSizeFraction`, `fx.win.tutorialVictoryAtMs` | unchanged values | `@deprecated` |
| `fx.win.fishPillInAtMs`, `fishPillFadeMs`, `fishAtMs` | unchanged | re-documented (period counter, lift-off) |
| `ProductId` | unchanged union | `fish_250` / `fish_900` documented as retired |

Verified after the edit: `npx tsc --noEmit` clean; `npx vitest run` 107 files, 1 941 passed.

---

## 9. Acceptance checklist (Phase 2c done)

**Lives**
- [ ] The lives pill shows 3 fish (`icon-fish`) where the hearts were, same size at 390 and 320 px, in Arabic too; no heart icon anywhere except the colour-pattern glyph.
- [ ] A mistake plays the fish loss (§1.3; reduced: a 150 ms swap); slot order unchanged; sounds and vibration unchanged.
- [ ] 0 fish → "Out of fish"; Continue shows "+1" with a fish; a revive pops one fish back.
- [ ] Every lives string in 17 catalogues says fish (Appendix A); `i18n:check` (and `--release`) passes with 0 errors; the banned-phrase test passes.

**Win flow**
- [ ] Only the fish left fly (N = 1, 2, 3), from the lives pill to the period counter; each life empties as its fish leaves; the counter ends at `before + N`.
- [ ] Panel at 4 200 / 4 350 / 4 500 ms for N = 1 / 2 / 3 (± one frame in unit tests; e2e windows §7.3); scrim 300 ms before; reduced motion: panel at 1 200 ms.
- [ ] Tutorial: no counter, no flight, victory at 1 200 ms; restored board: victory at once, nothing granted twice.
- [ ] The panel shows the period board ("Weekly ranking", "+2 fish · This week: 42"), my rank inside this week's band on the classic stub, "Your score: 42 fish" on NEZP, personal period records on the web.
- [ ] The victory shows "+120 points", "Perfect ×4" only after a perfect win, the kept-fish row and "This week: 42"; no fish pill, no "+", no bonus chip.

**Scoring and save**
- [ ] Level points follow §3.1 (unit table); a mistake breaks the streak at once and Home, reload, fail and Retry cannot restore it; a revive resets it.
- [ ] Dailies and event puzzles add their kept fish and move the streak; the tutorial does neither.
- [ ] The period total restarts at 0 on Monday 00:00 UTC (fake clock), `best` keeps the higher week; the Home pill follows.
- [ ] Save v3: a v2 save with a wallet, a `paw_points` pending score and a `fish_250` ledger entry migrates to v3 without the wallet and the pending score, with +10 hints +3 kitties exactly once (also after a merge with its v2 cloud copy).

**Leaderboards**
- [ ] Every scored win submits `period_points` = `periodIndex × 100 000 + total`; an event win also submits its event board in the same batch; `paw_points` and (by default) `daily_fastest` are never submitted.
- [ ] The band read ignores older periods and a future-dated entry; `boardRank` gives the exact rank past 200 entries (stub).
- [ ] The hub's first tab is "This week"; no "Paw points" tab; "Today" only with `rank.dailyBoard`.
- [ ] `fb-dashboard.md` lists one period board, the three products and the retired ones.

**No fish currency**
- [ ] No wallet in the save, no `wallet` bus event, no swap in O2 or the shop, no fish products for sale, no fish pill "+" anywhere; the shop exists only on FB where it can sell, with three products.
- [ ] A boot restore of an unconsumed `fish_250` grants 10 hints + 3 kitties once and consumes it.
- [ ] Event milestones grant only hints and kitties (§5.5); `verify-levels` passes.

**Release hygiene**
- [ ] `npx tsc --noEmit` clean; `npx vitest run` green; `levels:verify`, `palette:check`, `i18n:check` (and `--release`) pass; every build and both zips build; `npm run size` within the 2b ceilings (no ceiling raised); Playwright green three times in a row with no flaky test.
- [ ] Provenance rows for every new drawing and animation; no source of 06 §4 opened.
- [ ] The docs of §6 updated; `STATUS-2c.md` written; screenshots re-captured (Home, mid-play, mistake mid-loss, win flight, panel, victory, fail, shop on FB) and looked at.

---

## Appendix A. Strings (English, ours)

### A.1 Changed values (key kept; redraft all 16 locales)

| Key | 2b | 2c |
|---|---|---|
| `game.hearts.a11y` | {hearts} of {max} hearts left | {hearts} of {max} fish left |
| `howto.hearts` | A cat on the wrong tile costs a heart. Lose all three and you can try the level again. | Your fish are your lives. A cat on the wrong tile costs a fish. Lose all three and you can try the level again. |
| `fail.title` | Out of hearts | Out of fish |
| `fail.continue.a11y.video` | Watch a video to continue with one more heart | Watch a video to continue with one more fish |
| `fail.continue.a11y.free` | Continue with one more heart | Continue with one more fish |
| `fail.continue.a11y.videoLabel` | Continue +1 heart, after a short video | Continue +1 fish, after a short video |
| `fail.continue.a11y.freeLabel` | Continue +1 heart | Continue +1 fish |
| `a11y.mistake.one` / `.other` | Wrong tile. {count} heart left. / … hearts left. | Wrong tile. {count} fish left. (both) |
| `a11y.lost` | Out of hearts. | Out of fish. |
| `a11y.revived` | One heart back. Keep going. | One fish back. Keep going. |
| `group.body.rank` | Earn the most paw points in {hours} hours. The winner gets {kitties} kitties. | Keep the most fish in {hours} hours. The winner gets {kitties} kitties. |
| `group.participation` | Thanks for playing: +{count} fish | Thanks for playing: +{count} ({count} = "1 hint", from `event.reward.hints`) |

`meta.ts`: the `hearts` / `max` placeholder notes say "fish (lives) left" / "fish at the start (3)"; the `fail.*` notes say fish.

### A.2 New keys (`{kind}` = `day` | `week` | `month`; every row exists for all three kinds)

| Key | day | week | month |
|---|---|---|---|
| `period.total.{kind}` | Today: {total} | This week: {total} | This month: {total} |
| `period.pill.{kind}.one` / `.other` | {count} fish today | {count} fish this week | {count} fish this month |
| `rank.title.period.{kind}` | Daily ranking | Weekly ranking | Monthly ranking |
| `rank.tab.period.{kind}` (also the records row label) | Today | This week | This month |
| `rank.records.best.{kind}` | Your best day | Your best week | Your best month |
| `a11y.fishKept.{kind}.one` / `.other` | You kept {count} fish. Your total today: {total}. | You kept {count} fish. Your total this week: {total}. | You kept {count} fish. Your total this month: {total}. |
| `howto.points.{kind}` | The fish you keep when you solve a puzzle go to the daily ranking, which starts again every day at 00:00 UTC. Solve without a mistake to build a perfect streak and earn more points. | The fish you keep when you solve a puzzle go to the weekly ranking, which starts again every Monday at 00:00 UTC. Solve without a mistake to build a perfect streak and earn more points. | The fish you keep when you solve a puzzle go to the monthly ranking, which starts again on the 1st of every month at 00:00 UTC. Solve without a mistake to build a perfect streak and earn more points. |

| Key | English |
|---|---|
| `rank.sub.period.one` / `.other` | +{count} fish · {total} ({total} = `period.total.{kind}`) |
| `rank.records.streak` | Perfect streak |
| `victory.streak` | Perfect ×{count} |
| `victory.streak.a11y.one` / `.other` | {count} perfect win in a row / {count} perfect wins in a row |

33 new keys. Keep: `fish.count` (the noun with a number: lives and points), `fish.plus`, `victory.points`, `rank.records.total`, `rank.records.solved`.

### A.3 Removed keys (all 17 catalogues, `meta.ts`, `drafted-from.json`)

`a11y.fishEarned.one`, `a11y.fishEarned.other`, `victory.bonus.hard`, `victory.bonus.daily`, `rank.title.points`, `shop.swap`, `shop.swap.hint`, `shop.swap.kitty`, `shop.swap.action`, `shop.notEnough`, `shop.swap.done`, `shop.swap.a11y`, `rewarded.swap`, `shop.product.fish_250.name`, `shop.product.fish_250.desc`, `shop.product.fish_900.name`, `shop.product.fish_900.desc`, `event.reward.fish.one`, `event.reward.fish.other` (19), plus `rank.points` at I-3 if nothing uses it.

## Appendix B. Decisions in this spec

| # | Decision | Kind |
|---|---|---|
| D1 | UTC weekly period, Monday 00:00 UTC; day and month supported | default, user may change (`period.kind`) |
| D2 | Leaderboard points = fish kept × 1, at counted wins in level, daily and event | default (`period.*`) |
| D3 | Level points = 10 × n (× 2 Hard) + 10 × min(streak, 10) | default (`levelPoints.*`) |
| D4 | Streak breaks at the mistake itself (saved), and on a revive; retry neither breaks nor restores; hints never matter | default |
| D5 | Dailies and events count for both; the tutorial for neither | default (`*.modes`) |
| D6 | One global board with period bands; `paw_points` retired; `daily_fastest` off; event boards kept | default (`rank.dailyBoard`) |
| D7 | The post-win panel shows the period board in every scored mode | ours |
| D8 | Home shows a non-interactive period pill in the fish pill's place | ours |
| D9 | No shop on the web or where nothing can be sold; the Settings Shop row only when the Buy section can show something | ours |
| D10 | Retired fish packs compensated in hints and kitties (ledger and restore); earned fish dropped without conversion | ours |
| D11 | Milestone fish converted at the old swap rates | ours |
| D12 | Keep `hearts` identifiers (stored, reducer); rename only UI-internal classes | ours |
| D13 | Group challenges rank fish kept; rank-mode non-winners get 1 hint | ours (flag off) |
| D14 | The 2b paw-points total carries over as the lifetime level-points total | ours |
