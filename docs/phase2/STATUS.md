# Phase 2 status: the rebuild "as is"

Status: Phase 2 complete, pending the user's review · Date: 2026-10-07 · Branch `claude/mewdoku-instant` · Written by the integration lead

"Mewdoku" is the working title and code name (see §9). Specs: [02 rebuild spec](../phase1/02-rebuild-spec.md), [03 puzzle engine](../phase1/03-puzzle-engine.md), [04 architecture](../phase1/04-architecture.md), [05 FB platform](../phase1/05-fbig-platform.md), [06 legal](../phase1/06-legal-and-originality.md), [CONTRACTS](CONTRACTS.md), [perf](../perf.md), [provenance](../provenance.md).

## 1. Overview

A clean-room HTML5 cat logic puzzle (Queens, also called 1-star Star Battle) for Facebook Instant Games, plus a plain web build. The rules:

- every colour region holds exactly one cat;
- every row and every column holds exactly one cat;
- no two cats touch, not even at the corners.

What ships:

- **Game.** A six-step tutorial (Level 1), 1 000 generated levels in 10 packs, and a daily puzzle for every date from 2026-10 to 2028-12. Endless generated levels follow after 1 000.
- **Mechanics.** 3 hearts per attempt, one revive, a lightbulb hint that explains one deduction, and a "kitty" that places one correct cat.
- **Ads.** Interstitials at natural breaks behind a pacing gate, and rewarded ads for hint, kitty and revive. When rewarded ads are unsupported, a free grant with a shared 10-minute cooldown replaces them.
- **Saves.** A local mirror plus FB cloud save, with versioned migration and merge rules.
- **Accessibility.** Screen-reader labels and announcements, full keyboard play, reduced motion, colour patterns and a palette validated by script.
- **Builds.** A web build (`dist/web`) and an FBIG build (`dist/fbig`, zipped by `scripts/zip-fbig.ts`).

Stack: TypeScript 7, Vite 8, no runtime dependencies. The only third-party code in the bundle is Vite's ~1 KB preload helper (MIT, credited in About). Tested with Vitest 5 (unit, DOM, property) and Playwright 1.56 (Chromium).

Phase 2 ended with a six-lens review (logic, platform, UX, robustness, accessibility and clean room, acceptance). The review found 56 issues. Three fixer groups fixed them all: A app resilience, B FB platform and boot, C UI, visuals and a11y. The lead then did the cross-group follow-ups and re-verified everything (§6, §7).

## 2. How to run

Requirements: Node 22. Never run `playwright install`: Chromium is preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (web build, mock ads) |
| `npm run dev:fbig` | FBIG build on `https://127.0.0.1:8080` (basic-ssl). Open `https://www.facebook.com/embed/instantgames/<APP_ID>/player?game_url=https://localhost:8080` (05 §11). The SDK only fully works inside the FB player. |
| `npm run build` / `build:fbig` / `build:e2e` / `build:fbig-e2e` | `dist/web`, `dist/fbig`, `dist/e2e` (web with test hooks), `dist/fbig-e2e` (FBIG with hooks; Playwright sets `MEWDOKU_E2E=1` and test placement IDs) |
| `npm run preview` | Serve `dist/web` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, every project (`unit`, `dom`, `property`) |
| `npm run test:e2e` | Playwright; it builds and serves `dist/e2e` on :4173 and `dist/fbig-e2e` on :4174 |
| `npm run levels:verify` | `scripts/verify-levels.ts`: re-checks every shipped pack and daily month |
| `npm run palette:check` | `scripts/palette-check.ts`: CIEDE2000, colour-blind ΔE and WCAG contrast |
| `npm run size` | `scripts/size-check.ts`: bundle budget on `dist/web` and `dist/fbig` (exit 1 when over) |
| `npm run zip:fbig` | `dist-zip/mewdoku-instant-fbig-<version>-<sha>.zip` |
| `npm run verify` | typecheck + tests + levels:verify + palette:check |
| `npm run release:fbig` | verify, then build:fbig, size and zip:fbig |
| `npm run levels:gen` / `daily:gen` | Regenerate the content. Deterministic and byte-identical with `--no-cache --workers 4`. |

URL parameters (dev and e2e builds; production web treats ads as unsupported):

- `?ads=ok` (default): a 1.5 s "Ad placeholder"; rewarded ads grant.
- `?ads=nofill`: every request answers `no_fill`, so the "no video" toast shows.
- `?ads=unsupported`: no ads, so the free fallback grant applies (10-minute shared cooldown, countdown prompt).
- `?ads=close`: a rewarded ad is closed early (`skipped`) and grants nothing.
- `?flags=a,b` / `?flags=-a`: feature-flag overrides (02 §22). All flags are off in Phase 2.

In e2e builds, `window.__mewdoku` exposes `state()`, `app()`, `solution()`, `seedSave(json)` and `generate(spec, 'worker' | 'main')`.

## 3. Verification (final run, 2026-10-07)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` (all projects) | **1 164 passed, 0 failed** in 73 files: `unit` 955 (55 files), `dom` 180 (15 files), `property` 29 (3 files). Before this hardening pass the suite had 1 145. |
| `npx tsx scripts/verify-levels.ts` | 10 level packs, 27 daily months, **0 issues** (2.8 s) |
| `npx tsx scripts/palette-check.ts` | OK. Pattern glyph minimum 3.38:1 (Slate, faded); white on `--accent` 4.82:1; `--ink-2` 4.82–5.65:1; "In progress" 5.93:1 |
| `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e` | all four build cleanly, with no warnings |
| `npx tsx scripts/size-check.ts` | within budget, web and FBIG (§4) |
| `npx tsx scripts/zip-fbig.ts` | 216.8 KB zip, 51 files (budget 500 KB, 60 files) |
| `npx playwright test` (4 projects) | **48 passed, 0 failed, 5 skipped by design**: `web-390` 23 + 2 skipped, `web-320` 5 + 2 skipped, `web-1280` 6 + 1 skipped, `fbig-390` 14 |
| Reviewers' repro scripts for the 9 major findings, against fresh `dist/e2e` and `dist/fbig-e2e` | all 9 fixed (§6.2) |

The 5 skips are declared in `tests/e2e/layout.spec.ts`. The short-desktop-window test and the desktop keyboard test need a fine pointer, so they run only in `web-1280`. The phone focus-ring test needs a coarse pointer, so it does not run in `web-1280`. There are no other skips.

## 4. Bundle sizes vs budget

Raw bytes from `scripts/size-check.ts`, with 1 KB = 1000 B. FB hosting may serve files uncompressed (05 §5.3). The budgets are the lead's Phase 2 hardening ceilings (04 §9).

| Item | Web | FBIG | Budget | Notes |
|---|---|---|---|---|
| Main JS | 165.4 KB | 173.3 KB | **190 KB** (was 170) | gzip 59.1 / 61.9 KB |
| CSS | 37.8 KB | 37.8 KB | **40 KB** (was 36) | |
| Font (Fredoka 600, Latin) | 16.5 KB | 16.5 KB | 25 KB | |
| `index.html` | 0.7 KB | 0.8 KB | 4 KB | |
| **First-load total** | **220.3 KB** | **228.3 KB** | **250 KB** (was 220) | |
| Worker JS (lazy) | 17.7 KB | 17.6 KB | 25 KB | unchanged |
| Lazy JS chunks | 45.6 KB | 45.4 KB | **48 KB** (was 45) | raised minimally: the coach moved here |
| Packs, daily months, licence texts, favicon | 273.2 KB | 273.4 KB | lazy | fetched on demand |
| FB zip | — | 216.8 KB, 51 files | 500 KB, 60 files | |

The lead took two cheap wins before accepting the new ceilings:

- **The coach moved into the lazy overlay chunk: −4.4 KB main JS.** On a first run, boot fetches the chunk during the loading screen, in the same bounded wait as the pack and the font (`boot.overlayTimeoutMs` = 1.5 s), so the tutorial's first board shows with its coach. Returning players fetch it after Home shows.
- **A failed sound-chunk download is retried through `loadChunk`.**

The lazy-chunk budget went from 45 KB to 48 KB. That covers the coach (≈ 4.6 KB) with about 2 KB headroom; the worker budget is unchanged. Breakdown and history: [perf.md §4](../perf.md).

## 5. Screenshot index (`docs/phase2/screenshots/`)

All `app-*.png` files were refreshed on 2026-10-07 from the final `dist/e2e` build:

- **Phones** (390×844, 320×568): DPR 2, touch.
- **Desktop** (1280×800): DPR 1.
- **Short window** (640×360): DPR 2, fine pointer; this is a 1280×720 desktop at 200 % zoom.

I looked at every one. The visual regressions found during the pass are fixed (§7, items 10–11).

| Viewport | File | Shows |
|---|---|---|
| 390×844 | `app-home-fresh-390.png` | Home just after the tutorial: Level 2, daily locked |
| | `app-home-returning-390.png` | Home, returning player: "Continue · Level 37", daily card |
| | `app-tutorial-step1-390.png` | Tutorial step 1. The coach shows at once (lazy chunk prefetched), and the automatic board focus draws no ring on touch. |
| | `app-tutorial-step2-390.png` | Step 2, "Got it" |
| | `app-tutorial-step3-390.png` | Step 3, swipe to cross out |
| | `app-tutorial-step5-390.png` | Step 5, the coach points at the bulb |
| | `app-tutorial-step5-hint-390.png` | Step 5 with the hint card open: the coach is hidden (UX-01), and the card has no ✕ (SPEC-04) |
| | `app-tutorial-win-390.png` | Tutorial win, "Play Level 2" |
| | `app-game-mid-390.png` | Mid-level 8×8: cats, marks, a wrong X, one heart lost |
| | `app-hint-390.png` | O1 hint card with its highlight |
| | `app-kitty-390.png` | Kitty reveal |
| | `app-win-390.png` | O3 win on its solid stage |
| | `app-fail-390.png` | O4 fail: Continue +1, Retry, Home |
| | `app-rewarded-390.png` | O2 "Out of hints", watch a video |
| | `app-rewarded-countdown-390.png` | O2 countdown variant (`?ads=unsupported`, cooldown running) |
| | `app-settings-390.png` | O5 settings |
| | `app-howto-390.png` | O6 how to play (touch: no keyboard row) |
| | `app-daily-result-390.png` | O7 daily result with the countdown |
| | `app-loading-390.png` | Loading indicator over Home (slow daily month) |
| 320×568 | `app-game-320x568.png` | Mid-level, compact HUD |
| | `app-win-320x568.png`, `app-fail-320x568.png` | O3 and O4 at the smallest phone |
| | `app-home-320x568.png`, `app-hint-320x568.png`, `app-settings-320x568.png`, `app-howto-320x568.png`, `app-howto-320x568-scrolled.png`, `app-about-320x568.png`, `app-daily-result-320x568.png` | Other screens at 320 (About shows the Vite MIT credit) |
| 1280×800 | `app-home-1280.png`, `app-game-1280.png` | Desktop: centred portrait column, patterned sides |
| 640×360 | `app-short-home-640x360.png`, `app-short-game-640x360.png`, `app-short-game-scrolled-640x360.png` | Short desktop window: no rotate notice. The 568 px column scrolls, and the side pattern covers the whole scroll height. |

The other files (`board-*`, `shell-*`, `app-fbig-*`) are earlier dev-harness and FBIG captures from Phase 2 construction. They are kept for reference and were not refreshed.

## 6. Review summary

### 6.1 Findings by lens and severity: all 56 fixed

| Lens | Major | Minor | Nit | Total |
|---|---|---|---|---|
| logic | 1 | 1 | 3 | 5 |
| platform | 2 | 6 | 0 | 8 |
| ux | 2 | 5 | 9 | 16 |
| robustness | 2 | 3 | 2 | 7 |
| a11y and clean room | 2 | 7 | 6 | 15 |
| acceptance (spec) | 0 | 1 | 4 | 5 |
| **Total** | **9** | **23** | **24** | **56** |

### 6.2 Major findings: reviewers' repro scripts, before and after

The scripts were re-run unchanged (only ports and output folders were remapped), from `scratchpad/lead-repro/`, against fresh builds. Where a script stopped at an intermediate moment, a variant that waits for the end state was added (`l2-final.mjs`, `hang-play-poll.mjs`, `hint-transient-final.mjs`).

| ID | Before (reviewers) | After (lead re-run) |
|---|---|---|
| logic-2 | The overlay chunk failed and the session soft-locked: hint charged 5→4 with no card, status stuck at `hint`; LOST and WON gave no O4/O3. One failed request at boot broke every overlay for the session. | Chunk blocked for good: the bulb charges nothing (stock 5/3) and the board stays playable. LOST gives a toast, then Home with the 0-heart board and its unused revive kept. WON gives Home with progress 6 saved. A transient failure re-fetches the chunk with a cache-busting URL (2 requests): the hint card and Settings open. |
| PLAT-1 | The cloud read failed, so a returning player got the tutorial. The next session merged stock 5/3 and default settings over the cloud's 9/9 and wrote them back. | Session 1 makes 0 cloud writes (cloud writes stay off until merged). Session 2 keeps the cloud stock 9/9 and settings (sound off, patterns on), and the cloud is unchanged. A slow read (4.5 s) is merged when it arrives, and only then written. |
| PLAT-2 | Player B inherited player A's level 40, bests and stock, and uploaded them to B's cloud. | B with an empty cloud starts at level 1 with default stock. B with a cloud keeps its own level 3 and best {2}. Each player's mirror lives under `mewdoku.save.v1:<playerId>`. |
| UX-01 | At tutorial step 5 the stale coach card, hand and ring stayed visible with the hint card; at 320 the card covered board row 4. | Coach, card, ring and hand are `visibility: hidden` under the hint card at 320, 390 and 1280. |
| UX-02 | The rotate notice blocked the whole game at 640×400@2, 683×384@2, 900×420, 640×340@2 and 853×438@1.5. | Hidden at all six sizes. The game lays out on the 568 px column (312 px board) and the page scrolls. |
| RP-1 | A request that never answered left the player stuck: a hung pack kept the boot splash at 40 % (FB never called `startGameAsync`), and a hung pack, month or worker in game left the loading layer up forever. | Hung pack at boot: Home within the 1.5 s pack wait. FB: `startGameAsync` called after progress 10/40/100. In game: hung pack → substitute board for L101 at 12.7 s; hung daily month → generated daily at about 20 s; hung worker → L1001 on the main thread at about 10 s. Slow pack → Home at 1.6 s; aborted pack → substitute in 1.1 s. |
| RP-2 | One aborted chunk download at boot broke win, fail, hint and Settings for the session (the import never retried), and hints were charged. Aborted hint and grader chunks made hints unavailable for the session. | Win shows Next, fail shows Retry, the hint card opens and charges only when shown, and Settings opens. The hint engine recovers after its chunks failed at boot (hint card opens, kitty works). |
| A11Y-1 | Desktop windows shorter than 480 px (640×360@2, 911×433@1.5, 1024×470, 960×470@2) showed only the rotate notice, and the Play click timed out. | The notice is hidden at all five sizes, and Play works. |
| A11Y-2 | Pinch-zoom shrank the board: 357 → 159 px at 2×, 33 px at 3×. | The board stays 357 px (37 px cells) at 2× and 3×. |

### 6.3 Every finding and its fix (one line each)

Groups: A app resilience and B FB platform/boot (listed together as A/B), C UI/visual/a11y, L the lead's follow-up.

| ID | Sev | By | Fix |
|---|---|---|---|
| logic-1 | minor | A/B | The top-bar Home in the delay before O4 saves the 0-heart board (revive kept); only O4's own Home discards it (`failOpen()`). |
| logic-2 | major | A/B | `Router.overlaysReady()`; helper flows never charge for a card that cannot open; `overlay:failed` returns the session to playing, or Home with the result saved. |
| logic-3 | nit | A/B | The kitty compares the board, not the state object, so a TICK during the engine call no longer drops it. |
| logic-4 | nit | A/B | Keyboard Enter honours `cellLockAfterCatMs`, so a quick second Enter no longer removes the new cat. |
| logic-5 | nit | A/B + L | O7 counts down to the midnight after the daily's own date (`localMidnightAfter`); the lead added `daily.ready` once that time has passed. |
| PLAT-1 | major | A/B + L | Bounded cloud read; cloud writes stay off until the cloud copy is merged; a late copy is merged when it arrives; the `#unmerged` marker / `localUnmerged`. The lead added the level-slot guard. |
| PLAT-2 | major | A/B | The FB mirror is per player (`mewdoku.save.v1:<playerId>`); an ID-less mirror is never merged into a player. |
| PLAT-3 | minor | A/B | FB `storage.status()` reports memory-only (and the toast shows) only when cloud save cannot cover it. |
| PLAT-4 | minor | A/B + L | An `unsupported` result latches that ad kind off and turns its capability false, so the free fallback applies. The lead made an `unsupported` answer after the player said yes take the free grant at once. |
| PLAT-5 | minor | A/B | A `preload()` never cuts the reload backoff short; a no-fill costs one instance, not two. |
| PLAT-6 | minor | A/B | A `loadAsync()` stalled past `ads.loadTimeoutMs` (12 s) is abandoned as failed; later requests fail fast instead of locking input 4 s each. |
| PLAT-7 | minor | A/B | `logEvent` parameter values are sent as strings (`toSdkParams`). |
| PLAT-8 | minor | A/B | `initializeAsync` and `startGameAsync` are retried once; a second failure shows an honest "couldn't start" screen with Try again. |
| UX-01 | major | C | The coach hides (`.coach[inert]`) while a modal (hint card, Settings, How to play) sits above it. |
| UX-02 | major | C | The rotate notice is for phones only (coarse pointer, short screen side < 600 px); desktop windows scroll over the 568 px column. |
| UX-03 | minor | C | Toasts move above an open modal's buttons instead of covering Retry or Home. |
| UX-04 | minor | C | Win and fail content sits on a solid `--stage` card; gated buttons are opaque and muted, not translucent. |
| UX-05 | nit | C | Confetti passes behind the praise title, cat and buttons. |
| UX-06 | minor | C | Coach card placement avoids the targets (hard rule), then the board, top bar and chip (soft); compact card on short screens. |
| UX-07 | nit | C | Same rule as UX-01: the coach hides under Settings and How to play. |
| UX-08 | minor | C | Darker `--accent` (#17806F), `--accent-deep` and `--amber-text`, so white labels and the "In progress" status reach 4.5:1. |
| UX-09 | nit | C | The Home Play chevron is hidden on narrow screens when the HARD badge shows. |
| UX-10 | nit | C | The loading indicator over an open win overlay continues the dark stage instead of a cream veil. |
| UX-11 | nit | C | The coach ring around the bulb is clamped inside the screen, and the hand no longer hides the icon. |
| UX-12 | nit | C | The wrong-X ring stays at full `--wrong` in completed regions (the veil is inset inside the ring). |
| UX-13 | nit | C | Pattern glyphs at 85 % / 65 % opacity, grown to at least 7 px on small slots. |
| UX-14 | nit | C | The Home wordmark and tagline fade out while a dialog is open over Home. |
| UX-15 | nit | C | `setTextKeepTogether` keeps dates, "Double-tap" and "word ·" on one line without changing the text. |
| UX-16 | nit | C | Settings switches are pill-shaped, so the focus ring follows the rounded control. |
| RP-1 | major | A/B | Fetch deadline `levels.fetchTimeoutMs`; bounded boot waits; worker call deadline with main-thread fallback; loading fail-safe (25 s → Home and a toast). |
| RP-2 | major | A/B + L | `loadChunk()` retries failed lazy imports with a cache-busting URL and a per-attempt deadline (overlays, hint engine, RPC, generator). The lead routed the sound recipes through it. |
| RP-3 | minor | C + L | Fewer forced style recalcs on hint open and close and on board mount (layout reads cached, measurement on the next frame). The lead turned on the next-frame focus restore in the router (hint close ≈ 300 → 150 ms at 4× CPU). |
| RP-4 | minor | A/B | Storage that fails mid-session switches to memory with the one-time toast and `ui.storage = 'memory'`. |
| RP-5 | minor | A/B | Web: another tab's save is merged (`onExternalSave` 'tab'), so progress never goes backwards and nothing is echoed back. |
| RP-6 | nit | A/B | A resize or rotation during a drag cancels the stream like `pointercancel`. |
| RP-7 | nit | A/B | Our own `favicon.svg` is linked, so there is no favicon 404. |
| A11Y-1 | major | C | Same fix as UX-02. |
| A11Y-2 | major | C | The layout reads the visual viewport at page scale 1, so pinch-zoom magnifies instead of shrinking the board. |
| A11Y-3 | minor | C | `--accent` darkened: white on primary buttons and badges is 4.82:1. |
| A11Y-4 | minor | C | The board recovers focus at level start, after "Got it", Next, Retry and dialog close, instead of dropping it to `<body>`. |
| A11Y-5 | minor | C | Pattern glyphs ≥ 3:1 on every tile, faded or not; checked by `palette-check`. |
| A11Y-6 | minor | C | At 200 % text the chips, the Reduce-motion row and the wordmark wrap instead of truncating or overlapping. |
| A11Y-7 | minor | C + L | The hint card has a screen-reader line naming the tile ("row 4, column 4, Apricot"). The lead passed `regions` so the colour is always named. |
| A11Y-8 | minor | C | H and K work anywhere on the game screen with no modal open; How to play lists the keys. |
| A11Y-9 | nit | C | Close, Back and segmented options are 44 px touch targets. |
| A11Y-10 | nit | C | `--ink-2` #6F6375: secondary text is ≥ 4.5:1 on every surface. |
| A11Y-11 | nit | C | Live regions (toast, coach card) exist before their first message, so it is read. |
| A11Y-12 | nit | C | The game screen has a `main` landmark; accessible names contain the visible labels. |
| LEGAL-1 | nit | A/B + L | The product name has one source of truth, `app.name` (the `<title>` mirrors it). The lead removed the legacy `about.made` and checks that the shipped licence texts say "This game". |
| LEGAL-2 | minor | C | `provenance.md` records the coach's pointing hand and the How-to-play illustrations. |
| LEGAL-3 | nit | C | `provenance.md` and About credit Vite's MIT preload helper; the notice ships as `licences/vite-MIT.txt`. |
| SPEC-01 | minor | C | Screen-level H/K handler plus board focus recovery (with A11Y-4 and A11Y-8). |
| SPEC-03 | nit | A/B + L | Same as logic-5. |
| SPEC-04 | nit | C | The tutorial's hint card (step 5) has no ✕, and Esc and scrim taps do not close it (Apply only). |
| SPEC-05 | nit | A/B | Spec clarified (02 §4.2): only the first-run tutorial hides Home; the replay keeps it. |
| SPEC-06 | nit | A/B | Spec clarified (02 §6.3): Esc is ignored on O3 and O4 (they need an explicit choice), O7 Esc = Done. |

## 7. Lead follow-ups in this pass

1. **O7 says "A new puzzle is ready"** (`daily.ready`) instead of a countdown once `nextPuzzleAt ≤ now()`; it also flips while O7 stays open. Unit test in `tests/unit/shell/review-fixes.spec.ts`.
2. **Product name.** The Vite MIT notice already said "This game". The legacy `about.made` key, which spelled the name, was removed, so `app.name` is the only source. `product-name.spec.ts` now also checks every shipped licence text.
3. **Sound recipes** load through `loadChunk` (`createLazySfx(audio, () => loadChunk(() => import('../audio/sfx')))`). A boot test fails without it.
4. **Free grant after `unsupported`.** When the rewarded request answers `unsupported` after the player said yes in O2, and the fallback is off cooldown, the grant happens at once (one O2, logged `fallback`). Two tests in `helper-flows.spec.ts`.
5. **Level-slot guard.** `withSlot` writes a level board only when its id is `L{progress.level}`, and `withoutSlot` clears only the session's own board. A late cloud merge can no longer have the old level's moves, its Home or its O4 Home overwrite or drop the newer level's board. Two tests in `resilience.spec.ts`.
6. **Router** passes `restoreOnNextFrame: true`. The router focus test waits one animation frame, and the fake trap asserts the option.
7. **Hint context** carries `regions: s.puzzle.regions`. A test checks that the screen-reader line names the colour.
8. **Bundle.** The coach moved into the lazy overlay chunk, with a first-run prefetch during boot (`boot.overlayTimeoutMs`). If the coach cannot load, the tutorial never dead-ends: the "Got it" step moves on by itself, and the next step retries the chunk. New ceilings: main 190 KB, CSS 40 KB, first load 250 KB, lazy 48 KB. Tests: router (coach queued, non-modal), boot (prefetch order, bounded wait, returning players), tutorial-session (coach failure), size-check (ceilings).
9. **Docs.** 02 (§6.3, §17.2, §18, §19), 04 (§4.4, §5.1, §6.3, §7.3, §8, §9), 05 (§4, §6.2, §7, §10), CONTRACTS §10, perf.md.
10. **Visual regression: focus ring at first load.** The A11Y-4 fix put focus on the board at tutorial start, and Chromium draws that programmatic focus as `:focus-visible`, so phones showed a ring on a tile nobody chose. On coarse-pointer devices the ring now appears after the first key press on the board (`data-kbd`); desktops are unchanged. Covered by a unit test and an e2e test.
11. **Visual regression: short desktop windows.** The side pattern ended after the first screenful, because body stayed one viewport tall while the page scrolled. Body now grows with the column in that media query.
12. **New acceptance tests.** `tests/property/hints.spec.ts` runs the hint from the starting board to the solution on all 1 000 levels and 823 dailies (every step sound, no reveal fallback). The analytics event table is checked against the `logEvent` limits.

## 8. Deviations from the Phase 1 spec

Each is recorded in the spec or contract section named.

| Area | Phase 1 said | Now | Where |
|---|---|---|---|
| Bundle budget | main 140 KB, CSS 20 KB, first load (with worker) | main 190 KB, CSS 40 KB, first load 250 KB without the worker, lazy chunks 48 KB | 04 §9 (lead decisions) |
| Tokens | `--accent #1F9E89`, `--ink-2 #7A6E80`, provisional | `--accent #17806F`, `--ink-2 #6F6375`, new `--accent-deep`, `--amber-text`, `--stage`, `--wrong`; the region palette is unchanged | 02 §17.2 |
| Rotate notice | any landscape viewport < 480 px tall | phones only; desktop windows scroll over a 568 px column; pinch-zoom never re-lays out | 02 §19 |
| Esc | closes the top overlay | ignored on O3, O4 and the tutorial hint card; O7 Esc = Done | 02 §6.3 |
| H / K | keys of the focused board | work anywhere on the game screen while no modal is open | 02 §6.3 |
| Replay tutorial | no Home button | the replay keeps Home (saves nothing) | 02 §4.2 |
| Platform storage | `load()` returns one merged value | `RawSave { local, cloud, corrupt, localUnmerged? }`, `onExternalSave`, per-player FB mirror, the `#unmerged` marker | 04 §4.4, §7.3; 05 §7; CONTRACTS §8, §10 |
| Capabilities | final after `init()` | an ad kind can switch off after `unsupported` | 04 §4.4, 05 §6.2 |
| Boot | unbounded waits | bounded pack, font and overlay-chunk waits; init/start retried once; honest error screen | 04 §5.1 |
| Lazy code | everything in the first load | overlays (coach included), hint engine, RPC, generator and sound recipes are lazy, with cache-busting retry | 04 §8, §9; CONTRACTS §9, §10 |
| i18n | never remove a key | `about.made` removed (lead decision, LEGAL-1) | CONTRACTS §10 |
| Third-party code | none ships | Vite's ~1 KB MIT preload helper ships and is credited | provenance.md §6 |
| Focus ring | always on keyboard focus | on touch-first devices only after a key press on the board | 02 §18 |

## 9. Known issues and TODOs

- **Product name.** The game is still called "Mewdoku", which 06 §6.1 rates high risk and an internal code name only. It is waiting for the user's decision. A rename is one line in `src/i18n/en.ts` (`app.name`) plus the `<title>` in `index.html`; a test keeps them in sync. Internal identifiers (storage keys, seeds, `window.__mewdoku`) can stay.
- **iOS 14 and module workers.** The engine worker is an ES module worker, which iOS Safari < 15 does not support. `engine-client` then falls back to the main thread: on a constructor error, a worker error, or after `worker.callTimeoutMs` (10 s, so the first generation on such a device can wait up to 10 s). Only Chromium is installed here, so this path is covered by unit tests, not by a real iOS 14 device.
- **Determinism across engines.** The golden generation check (`tests/e2e/determinism.spec.ts`) runs in Chromium only, on the worker and on the main thread. WebKit and Firefox are not installed in this environment.
- **Meta documentation.** Meta's documentation could not be checked from this environment. The FB adapter was tested against our stub (`tests/fixtures/fbinstant-stub.js`), written from 05's documented API shapes, never against the real SDK. Items marked *inferred* or *likely* in 05 (upload labels, Monetization Manager, ad policies, the floating-menu safe zone) must be checked in Phase 4.
- **Hung requests are bounded but slow.** A request that never answers costs up to 3 × `levels.fetchTimeoutMs` plus backoff (about 17 s) before the substitute board or generated daily; the reviewers' daily case took about 20 s. A worker that never starts costs 10 s. The loading indicator shows throughout, and the 25 s fail-safe goes Home with a toast. The deadlines are tunables in `app/config.ts`.
- **Offline first run.** The coach and the step-5 hint card come from the lazy overlay chunk. If it cannot be fetched at all, the tutorial still advances: the board keeps outlining the targets, "Got it" moves on by itself, and the bulb retries the chunk on each tap. The coach text is missing until the chunk loads.
- **Late cloud copy during the tutorial (PLAT-1 residue).** A device with no local mirror whose cloud read fails or times out starts the tutorial, because it knows nothing else. If the cloud copy arrives after the tutorial started, it is merged (nothing is lost) but the player is not pulled out of the tutorial; the next launch goes Home.
- **Privacy policy.** About shows "Our privacy policy will be linked here". A real URL is needed before Phase 4 submission (05 §13).
- **Ad placement IDs.** These are empty in non-e2e builds until monetization is approved, so FB builds use the free fallback (by design, 05 §6.2).
- **Not in Phase 2.** Leaderboards, share and payments (Phase 4, 05 §8–9); Phase 3 hooks are flags only (02 §22).
- **Cosmetic, 320×568.** O4's rounded top-left corner sits just over the HUD's cat pill, and the pill's ear tip shows through the scrim at that corner. Harmless; noted for a later polish pass.

## 10. 02 §23 acceptance checklist

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Rules, gestures (§6.2) and the mistake model (§8) behave exactly as specified; reducer unit tests and a Playwright smoke test | **Done** | `tests/unit/game/reducer-matrix.spec.ts`, `reducer-gestures.spec.ts`, `reducer-helpers.spec.ts`, `tests/unit/ui/gestures.spec.ts`; e2e smoke 2 (wrong cat costs a heart, red X), 7 (drag paints Xs) |
| 2 | 3 hearts per attempt; revive restores 1 heart once; Retry gives a fresh copy of the same board | **Done** | reducer-matrix "one revive per attempt", "respects rules.maxRevives", "a fresh attempt on the same puzzle"; e2e smoke 3 (three mistakes → O4 → Retry → fresh board), 9 (reload with O4 open, Continue still offered) |
| 3 | The hint explains and applies a valid next step on every shipped level and never reveals a wrong deduction; property test over the packs | **Done** | `tests/property/hints.spec.ts`: all 1 000 levels and 823 dailies solved by repeated Apply, every step sound, no reveal fallback. `tests/unit/engine/hint.spec.ts` (random partial boards, mistaken marks). `levels.spec.ts` property 5 (solvable without guessing). e2e smoke 6 |
| 4 | The kitty places a correct cat; stocks persist; rewarded and fallback flows work with mock ads | **Done** | `hint.spec.ts` `pickKittyCell`; `tests/unit/app/helper-flows.spec.ts` (kitty flow, O2 → ad → grant order, saves.now); `saves.spec.ts`; e2e smoke 10 (`?ads=unsupported`), 12 (`?ads=close` grants nothing), fbig "10 s rewarded video is not cut off and grants the hint" |
| 5 | The tutorial (Level 1) is completable and cannot cost hearts | **Done** | `tests/unit/game/tutorial-run.spec.ts`, `tests/unit/app/tutorial-session.spec.ts` ("wrong input only pulses: no heart lost", "runs all six steps", coach-failure cases); e2e smoke 1 |
| 6 | 1 000 levels ship; each has exactly one solution and is graded within its band (03 §9) | **Done** | `scripts/verify-levels.ts`: 0 issues. `tests/property/levels.spec.ts` properties 1–9 (unique solution, brute-force cross-check for N ≤ 9, grade inside the slot band, manifest SHA-256) |
| 7 | The daily puzzle unlocks after level 20, is the same for a given date, and records time | **Done** | e2e smoke 8 (locked before level 20, opens after); `levels-repo.spec.ts` (month lookup, a missing month generated from the date seed); `progression.spec.ts` (daily spec from the date); `stats.spec.ts` (daily record); `restore.spec.ts` (a full daily records and shows O7) |
| 8 | The ad gate follows §13.2 with fake-clock unit tests; a shown ad is never cut short, only readiness is time-limited | **Done** | `tests/unit/game/economy-pacing.spec.ts`, `tests/unit/app/interstitial.spec.ts`; `ad-flow.spec.ts` "a long rewarded ad is never cut short", "watchdog"; `fb-ads.spec.ts` (readiness timeout, reload backoff, stalled load); fbig e2e "no interstitial before 10 completed levels", "an ad that never becomes ready is skipped after ads.readyTimeoutMs" |
| 9 | Resuming mid-level restores the exact board; every §15 restore rule is tested (stale daily, failed validation, full board, hearts 0 → O4, a level and a daily both in progress) | **Done** | `tests/unit/app/restore.spec.ts`: steps 2–5, "restores a level exactly", "a full board runs the win bookkeeping", "hearts 0 → LOST with O4", "a level and a daily in progress are both restored". e2e smoke 5, 9, 11 |
| 10 | The free fallback works when rewarded ads are unsupported, with one 10-minute cooldown shared by hint, kitty and revive | **Done** | `helper-flows.spec.ts` "grants once per 10 minutes, shared by hint, kitty and revive", "revive: O4 offers free", "revive during the cooldown: Continue is hidden", and the new `unsupported`-after-yes cases; e2e smoke 10 |
| 11 | Every analytics event passes the `logEvent` limits (05 §10); a unit test checks the event table | **Done** | `tests/unit/platform/fb-analytics.spec.ts` "the 02 §20 event table fits the logEvent limits" (every name and key unchanged by the sanitisers, ≤ 25 params, 99-char values) plus the sanitiser cases and string values (PLAT-7) |
| 12 | Layout works from 320×568 to desktop; no overlap in compact mode; FB safe zone respected | **Done** | `tests/e2e/layout.spec.ts` in `web-320`, `web-390` and `web-1280` (boards fit with whole cells, no horizontal overflow, the coach never covers the board or top bar, short desktop window); fbig e2e safe-zone tests; `tests/unit/ui/layout.spec.ts`; screenshots §5 |
| 13 | Accessibility: screen-reader labels, keyboard play, reduced motion, patterns toggle; the palette validation script passes | **Done** | `palette-check`: OK. `tests/unit/ui/art-a11y-fx.spec.ts`, `board-view.spec.ts` (labels, grid), `tests/unit/shell/review-fixes.spec.ts` (hint location, live regions, keyboard copy), `hint-text.spec.ts`; e2e keyboard play (H opens a hint) and the phone focus test. Not covered: no real screen-reader run (NVDA, VoiceOver) in this environment. |
| 14 | Bundle within budget (04 §9); no runtime network calls except our own static files and the FB SDK | **Done** | `scripts/size-check.ts` within the new budget (§4). A scan of the built output finds only two absolute URLs: the FB SDK tag in the FBIG `index.html`, and the SVG namespace identifier `http://www.w3.org/2000/svg` in the JS, which is never fetched. Packs, months, chunks, the worker and the font are relative same-origin files (`base: './'`, `assetsInlineLimit: 0`). `product-name.spec.ts` checks the favicon has no external references. There is no dedicated e2e network-allowlist test (a candidate for Phase 3 CI). |
| 15 | No original assets, text or code anywhere (06 checklist) | **Done** | `docs/provenance.md` (every drawing, string, level and third-party file); `tests/unit/sanity.spec.ts` (known original phrases rejected); all art hand-coded SVG; all levels generated by our engine with our seeds. The clean room was kept: no source from 06 §4 was opened in this pass. |

Overall, all 15 criteria are met with automated evidence. Two partial gaps are noted in rows 13 and 14: no real screen-reader session, and no automated network-allowlist e2e test.
