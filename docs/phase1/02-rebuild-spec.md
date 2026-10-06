# 02 · Rebuild spec: Phase 2 "as is"

Status: Phase 1 deliverable · Date: 2026-10-06 · Applies to: Phase 2 (rebuild) and Phase 4 (Facebook Instant Games)

This is the functional spec for rebuilding the original game "as is", using **our own code, art, sound and text**. Wherever the original is unknown, we make a concrete choice and tag it **[DECISION]** with the reason. The evidence comes from [01-game-deconstruction.md](01-game-deconstruction.md), which this document cites as `01 §x.y`. Engine details are in [03](03-puzzle-engine.md), the code structure is in [04](04-architecture.md) and platform rules are in [05](05-fbig-platform.md).

## 0. Baseline policy

When sources disagree, we follow them in this order:

1. **confirmed** facts about Meowdoku.
2. **likely** facts about the Oakever app.
3. **likely** facts about the Yandex web build, which is the best-observed version, used where the app is unknown.
4. **[DECISION]**: our own choice. It must be small and reversible, it must suit Facebook Instant Games (FBIG), and every number lives in `GameConfig` (§3).

Two kinds of departure from the original are allowed in Phase 2:

- **Platform adaptations**: changes FBIG requires or strongly favours, such as SDK lifecycle, ad pacing within platform rules, and a small bundle.
- **Accessibility minimums**: non-colour region cues, screen-reader labels, reduced motion.

Everything else that is "new" belongs to Phase 3, which the user will decide later (§22).

## 1. Glossary

| Term | Meaning |
|---|---|
| N | Board size (N×N), also the number of regions and the number of cats. Supported range: 4 to 12. |
| Region / colour | A connected group of cells that shares one colour. There are N regions. |
| Cat | A placed piece. Every cat on the board is correct, because wrong attempts are rejected. |
| Mark / X | The player's own "no cat here" note. It is never validated. |
| Wrong | A cell where a cat attempt failed. It is shown as a red X, locked, and is revealed information. |
| Given | A pre-placed, locked cat. The data format (03 §9.1) and the reducer support givens, but **no Phase 2 board uses any**, the tutorial included (§11.5). |
| Hint | The lightbulb helper. It explains one deduction and can apply it. |
| Kitty | The paw helper. It reveals and places one correct cat. |
| Attempt | One play-through of a level, from load or retry until a win or a loss. |
| Unit | A row, a column or a region. |

## 2. Rules and validation

**Rules shown to the player** (all confirmed, 01 §3):

1. Each colour gets exactly one cat.
2. Each row and each column gets exactly one cat.
3. Cats never touch, not even at the corners.

**Validation model** (likely, 01 §5.3): every level ships with its **unique** solution `sol[r] = c` (see 03). When the player tries to place a cat at `(r, c)`:

- `sol[r] === c` → the cat is placed. It can never conflict with another cat.
- otherwise → **mistake**: the cell becomes Wrong (a red X), and the player loses 1 heart. This happens **even if the cell breaks no visible rule**, and also if it does, for example when its row already has a cat. **[DECISION]** We keep the solution-check model in both cases because it is simple and matches "guess wrong, lose a heart". A gentler variant that refuses visibly illegal taps without a penalty is listed as a Phase 3 hook.

**Win**: `catsPlaced === N`. Because every placed cat is correct, a full board is always a solved board.

**Lose**: `hearts === 0`.

Marks (X) have **no** rule effect. The game never auto-marks cells, except the tutorial's scripted marks and the effect cells of a hint the player applies (likely, 01 §4.7; §6.2).

## 3. Tunables (`GameConfig`)

Every number below is a single constant in `src/app/config.ts` (see 04). Changing one needs no other code change.

| Key | Value | Basis |
|---|---|---|
| `hearts.perAttempt` | **3** | confirmed (01 §5.1) |
| `input.doubleTapMs` | **300** | [DECISION] Uses the common OS double-tap timeout. It is deliberately **not** taken from any teardown constant. |
| `input.dragStartPx` | **max(8, 0.2 × cellPx)** | [DECISION] Large enough to ignore finger jitter, small enough that a swipe starts quickly. |
| `input.cellLockAfterCatMs` | **300** (= doubleTapMs) | [DECISION] Stops a triple tap from removing a cat that was just placed. |
| `hints.startStock` | **5** | likely, web build (01 §6.6) |
| `hints.perRewardedAd` | **1** | likely, web build (01 §6.6) |
| `kitty.startStock` | **3** | [DECISION] The app's stock is unknown (01 §6.3). Fewer than the 5 hints because a kitty is more powerful. |
| `kitty.perRewardedAd` | **1** | [DECISION] Mirrors hints. |
| `revive.maxPerAttempt` | **1** | [DECISION] The app offers revives (likely, 01 §5.7) but their limit is unknown. One per attempt keeps the logic challenge, since every wrong attempt reveals information. |
| `revive.heartsRestored` | **1** | [DECISION] A "second chance", not a full reset. |
| `ads.enabled` | **true** | [DECISION] Master switch. When false, no ad is ever requested and rewarded prompts use the free fallback (§13.3). |
| `ads.readyTimeoutMs` | **4000** | [DECISION] The longest the game waits for an ad to become **ready** (loaded) after it is requested. It does not limit the ad itself, because `showAsync()` only resolves when the ad is finished (05 §6.2). |
| `ads.showWatchdogMs` | **120000** | [DECISION] Safety net only. If a shown ad's promise never settles, input is unlocked and an `ad_*` event with `result = watchdog` is logged. |
| `ads.interstitial.minCompletedLevels` | **10** | likely, "about level 10–12" (01 §11.5). The tutorial counts as a completed level. |
| `ads.interstitial.cooldownSec` | **120** (tenure days 0–2), **100** (days 2–7), **90** (day 7+) | likely, single origin (01 §11.4) |
| `ads.interstitial.sessionGraceSec` | **60** | [DECISION] No interstitial in the first minute of a session. This avoids an ad at game open, which platforms dislike (see 05). |
| `ads.interstitial.triggers` | `next_level`, `retry`, `daily_done` | likely: ads appear between levels and on restart (01 §11.3) |
| `ads.rewarded.resetsInterstitialClock` | **true** | [DECISION] Prevents back-to-back ads. |
| `ads.banner.enabled` | **false** | [DECISION] Evidence for banners is weak (01 §11.12), they contradict "zero interruptions", and FBIG banner support is uncertain. |
| `ads.unsupportedFallback.cooldownSec` | **600** | [DECISION] If the platform **cannot** show rewarded ads at all (not merely "no fill"), the reward is granted free at most once every 10 minutes, so players are never stuck. See §13. |
| `daily.unlockAfterLevel` | **20** | [DECISION] A fan site says about 21 (inferred, 01 §10.10). The player needs the basics first. Unlocked iff `save.progress.level > 20`. |
| `levels.shipped` | **1000** | [DECISION] The app has at least 428 levels and players report 1 000+ (01 §10.4). Beyond 1 000, levels are generated on the device (§11.4). |
| `levels.hardEvery` | **10** | [DECISION] Based on inferred "hard levels" every 10th (01 §10.8). |
| `levels.hardFrom` | **30** | [DECISION] Level L is Hard iff `L >= 30 && L % 10 === 0`. |
| `levels.prefetchAhead` | **20** | [DECISION] Pack `k` is fetched when the player reaches level `pack.first − 20` (03 §9.3). |
| `kitty.revealMs` | **600** | [DECISION] Length of the KITTY_REVEAL state (§9.2). |
| `fx.boardEntryMs` | **250** | [DECISION] Length of the READY state (§7.2). |
| `fx.winOverlayDelayMs` | **800** | [DECISION] Shorter than the web build's ~4 s forced wait, which reviewers called a friction (01 §15). |
| `fx.winButtonDelayMs` | **1000** (after the overlay) | [DECISION] |
| `fx.failOverlayDelayMs` | **800** | [DECISION] |
| `fx.failButtonDelayMs` | **600** (after the overlay) | [DECISION] |
| `fx.sadCatsMs` | **1500** | [DECISION] |
| `save.localDebounceMs` | **400** | [DECISION] |
| `save.cloudDebounceMs` | **3000** | [DECISION] Our own value. Meta's reference text only says `flushDataAsync` is "expensive" and should be kept for critical changes (05 §7); it gives no debounce figure. |

## 4. Screens and navigation

### 4.1 Screen inventory

| ID | Screen / overlay | Original basis |
|---|---|---|
| S0 | Boot / loading | FBIG shows its own loading screen while we report progress (05). The web build shows our minimal splash. |
| S1 | Home | App main menu with a level button (likely, 01 §7.1.1). |
| S2 | Game (level / daily / tutorial) | confirmed and likely HUD (01 §8) |
| O1 | Hint card | likely (01 §6.5) |
| O2 | Rewarded-ad prompt | likely (01 §6.6) |
| O3 | Win overlay | likely (01 §7) |
| O4 | Fail overlay ("Out of hearts") | likely (01 §5.7–5.8) |
| O5 | Settings modal | likely (01 §14.1) plus accessibility additions |
| O6 | How-to-play card | [DECISION] A static rules card that can be reopened from Settings |
| O7 | Daily result card | [DECISION] |
| O8 | Tutorial coach overlay | likely (01 §9) |
| O9 | Toast layer | likely ("ads unavailable" message, 01 §6.6) |
| O10 | Rotate-device notice | likely (portrait only, 01 §12.11) |

Leaderboard screens are **Phase 4**. They need FBIG leaderboards or overlay views (05 §8). In Phase 2 the trophy button is **hidden** whenever the platform adapter has no leaderboard capability.

### 4.2 Navigation map

```
            ┌──────────┐ first run (tutorial not done)
  S0 Boot ──┤          ├────────────────────────────► S2 Game[tutorial = Level 1] ──win──► S2 Game[Level 2]
            └──────────┘ returning
                 │
                 ▼
             S1 Home ──[Level L]──────────────► S2 Game[level L]
               │  ▲ ──[Daily] (unlocked) ─────► S2 Game[daily D] ──win──► O7 Daily result ──[Done]──► S1
               │  │ ──[Gear]──► O5 Settings ──► O6 How to play
               │  └──────────[Home] from S2 (progress kept)
               │
  S2 Game ──win──► O3 Win ──[Next]──► (interstitial gate) ──► S2 Game[level L+1]
          ──0 hearts──► O4 Fail ──[Continue +1]──► (rewarded) ──► S2 (same board, 1 heart)
                               ──[Retry]──────► (interstitial gate) ──► S2 (fresh board, 3 hearts)
          ──[Bulb]──► O1 Hint (or O2 if stock 0)
          ──[Paw]───► kitty reveal (or O2 if stock 0)
```

[DECISION] Returning players land on **Home**, not straight into the level as in the web build. The app has a main menu (likely), and Home is where the Daily puzzle is found.

Routing rules that the map does not show:

- "Returning" means `save.tutorialDone === true`. Until then, every boot goes straight into the tutorial, which restarts at step 1 (tutorial progress is not saved).
- During the tutorial the top bar shows **no Home button**; Gear is available. Gear → How to play offers **"I know how to play"** only while the first-run tutorial is running. It applies the tutorial-win bookkeeping (§10.1) without an overlay and loads Level 2.
- "Replay tutorial" (from How to play, after the tutorial is done) runs the same script. Its win returns to **Home** and changes no progress, stock or stats.
- Leaving the game with Home always saves the in-progress board first (§15). The fail overlay's Home is the exception: it discards the attempt (§10.2).

## 5. Screen wireframes

All screens are portrait. The wireframes show a 390×844 CSS-px phone. Legend: `<3` = full heart, `--` = lost heart, `[x]` = button, `X` = player mark, `#` = wrong (red X), `@` = cat. All on-screen text is **our own placeholder copy**; final copy is written in Phase 2 (§21).

### S0 Boot / loading (web build only; FBIG uses its own loader with our progress %)

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│            <wordmark TBD>            │
│           (sleeping cat SVG)         │
│                                      │
│          ▓▓▓▓▓▓▓▓░░░░░░  62%         │
│                                      │
└──────────────────────────────────────┘
```

### S1 Home

```
┌──────────────────────────────────────┐
│ ░FB safe░           [Trophy*] [Gear] │  56 px top bar (*only if leaderboards are available)
│                                      │
│            <wordmark TBD>            │
│        (our cat mascot, idle)        │
│                                      │
│  ┌────────────────────────────────┐  │
│  │          Level 37   >          │  │  primary button (accent colour, 64 px)
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ [Cal] Daily puzzle · Tue 6 Oct │  │  secondary card (72 px)
│  │       9×9 · Not played yet  >  │  │  states: locked / not played / in progress / solved 4:12
│  └────────────────────────────────┘  │
│                                      │
│      [Bulb] 5        [Paw] 3         │  stock readout (not buttons)
└──────────────────────────────────────┘
```

- Locked daily card: "Unlocks after level 20", greyed out with a lock icon. Tapping it shows a toast.
- The primary button reads "Level L" with a "Hard" badge when level L is a hard level (§11.3), or "Continue · Level L" when `inProgress.level` holds a board. (L is the level number; N is always the board size.)

### S2 Game

```
┌──────────────────────────────────────┐
│ ░FB safe░    Level 37   [Home][Gear] │  top bar 56 px; "Hard" badge sits beside the title
│                                      │
│   ( @  3 / 8 )         ( <3 <3 -- )  │  pills 44 px: cat counter · hearts
│ ┌──────────────────────────────────┐ │
│ │ [■] colours │[≡] lines │[⁘] space│ │  rule chips 40 px (icon + short text; placeholder words, final copy is ours and must not echo the original's chip wording, 06 §3)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │  a a b b b c c c                 │ │
│ │  a @ b b # c c c                 │ │  board card: white, rounded, square
│ │  a a X X X d d c                 │ │  tiles = region colours, small gaps
│ │  e a a X d d d c                 │ │  (letters stand in for colours here)
│ │  e e f f d g g c                 │ │
│ │  e f f f g g h h                 │ │
│ │  e e f g g h h h                 │ │
│ │  e e f g h h h h                 │ │
│ └──────────────────────────────────┘ │
│                                      │
│        ( [Bulb] 5 )   ( [Paw] 3 )    │  tool buttons 64 px, count badges
└──────────────────────────────────────┘
```

- Mode differences:
  - The **daily** title reads "Daily · Tue 6 Oct".
  - The **tutorial** title reads "Level 1", and the coach overlay (O8) is on top.
- The board is centred in the space left between the chips and the tools (§19).

### O1 Hint card

```
┌──────────────────────────────────────┐
│  (board dimmed 55 %, focus cells     │
│   un-dimmed with a bright outline;   │
│   effect cells show ghost Xs or a    │
│   ghost cat)                         │
│ ┌──────────────────────────────────┐ │
│ │ [Bulb] Every open Lavender tile  │ │  bottom sheet over the tool row
│ │ is in row 3, so no other colour  │ │
│ │ can use row 3.                   │ │
│ │            [ Apply ]        [×]  │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### O2 Rewarded prompt

```
┌──────────────────────────────┐
│        Out of hints          │
│  Watch a short video for     │
│  1 hint?                     │
│   [ Watch video ]  [Not now] │
└──────────────────────────────┘
```

The same dialog serves the kitty ("1 kitty").

Variants, chosen when the dialog opens:

| Condition | Body and buttons |
|---|---|
| `capabilities.rewarded` and `ads.enabled` | As drawn: [Watch video] [Not now] |
| Rewarded unsupported (or `ads.enabled = false`) and the fallback cooldown has passed (§13.3) | "Here's a free hint." [Take it] [Not now] |
| Rewarded unsupported and the fallback cooldown has not passed | "Next free hint in m:ss" (live countdown), [OK] only |

### O3 Win overlay

```
┌──────────────────────────────────────┐
│░░░░░░░░ dark scrim 75 % ░░░░░░░░░░░░░│
│          *   Clever cat!   *         │  praise word (random from our own list)
│      (celebrating cat SVG, confetti) │
│          Level 37 complete           │
│                                      │
│     ┌────────────────────────────┐   │
│     │       Next: Level 38  >    │   │  enabled 1 000 ms after the overlay appears
│     └────────────────────────────┘   │
│                [Home]                │
└──────────────────────────────────────┘
```

No stars, score or visible timer in level mode. [DECISION] No source shows a visible timer in the app, but none rules one out (inferred, 01 §10.11). The solve time is still recorded internally. The app's post-win "golden fish" are **not** rebuilt because their meaning is unknown (01 §7.1.3). That is a Phase 3 hook.

Variants: the **tutorial** win shows "You're ready!" with one button, **Play Level 2** (or **Home** when the tutorial was replayed from How to play).

### O4 Fail overlay

```
┌──────────────────────────────────────┐
│░░░░░░░░ dark scrim 75 % ░░░░░░░░░░░░░│
│            Out of hearts             │
│      (sad cat with a bandage SVG)    │
│   ┌──────────────────────────────┐   │
│   │ [▶ video]  Continue  +1 <3   │   │  only if revive unused and rewarded ads are available
│   └──────────────────────────────┘   │
│   ┌──────────────────────────────┐   │
│   │          Retry level         │   │
│   └──────────────────────────────┘   │
│                [Home]                │
└──────────────────────────────────────┘
```

### O5 Settings

```
┌──────────────────────────────┐
│ Settings                 [×] │
│ Sound               [ on  ●] │
│ Vibration           [ on  ●] │  hidden where vibration is unsupported
│ Colour patterns     [● off ] │  accessibility (§18)
│ Reduce motion       [● sys ] │  System / On / Off
│ How to play               >  │
│ About & credits           >  │  version, licences (fonts), privacy link (Phase 4)
└──────────────────────────────┘
```

[DECISION] The web build has a Sound toggle only (likely). Vibration, patterns and reduced motion are accessibility minimums. There is no reset-progress option in Phase 2.

### O7 Daily result

```
┌──────────────────────────────┐
│   Daily puzzle · Tue 6 Oct   │
│        (happy cat SVG)       │
│     Solved in 4:12           │
│     Mistakes 1 · Hints 0     │
│  Next puzzle in 7 h 48 min   │
│          [ Done ]            │
└──────────────────────────────┘
```

### O8 Tutorial coach

```
┌──────────────────────────────────────┐
│ ░ dim everything except the focus ░  │
│        ┌────┐                        │
│        │ ◎  │  ← pulsing outline     │
│        └────┘  ☚ animated hand       │
│ ┌──────────────────────────────────┐ │
│ │ Every colour hides one cat. This │ │
│ │ Lavender colour is a single tile │ │
│ │ — double-tap it.                 │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

## 6. Interactions

### 6.1 Gesture recognition (board)

Pointer Events are attached to the board container. Hit-testing uses the grid geometry, and the **gap belongs to the nearest cell**. Only one primary pointer is tracked; extra pointers are ignored, and `pointercancel` ends a drag without a tap.

| Gesture | Recognised when | Emits |
|---|---|---|
| **Tap** | pointerup with movement < `dragStartPx` | `tap(cell)` |
| **Double-tap** | a second tap on the **same cell** whose pointerup comes within `doubleTapMs` of the first tap's pointerup. A tap on a different cell starts a new pending tap. | `doubleTap(cell)`. The first tap's effect has already been applied (§6.2). |
| **Drag** | movement ≥ `dragStartPx` from pointerdown | `dragStart(cell, mode)`, then `dragEnter(cell)` for every cell the path crosses, then `dragEnd`. The path is interpolated cell by cell so fast swipes don't skip cells. A drag cancels any pending double-tap. |

Drag mode is chosen by the **start cell**: Mark → `erase`; any other state → `mark`. likely, web build (01 §4.6).

### 6.2 Cell state × gesture table

| State ↓ / gesture → | Tap | Double-tap (2nd tap) | Drag `mark` | Drag `erase` |
|---|---|---|---|---|
| Empty | → Mark (instant) | → **cat attempt** | → Mark | — |
| Mark | → Empty (instant) | → **cat attempt** | — | → Empty |
| Cat (placed) | pulse, no change | → Empty (cat removed, no penalty) | skip | skip |
| Wrong (red X) | pulse | pulse | skip | skip |
| Given | pulse | pulse | skip | skip |

Notes:

- A double-tap on Empty runs as tap 1 (Empty → Mark) and then tap 2 (cat attempt from Mark). A double-tap on Mark runs as Mark → Empty and then a cat attempt from Empty. Either way, **a double-tap means "place a cat"**. This matches the app's "cross first, cat second" cycle (likely, 01 §4.2).
- [DECISION] A **slow** second tap (after `doubleTapMs`) on an X clears it instead of placing a cat. Whether the app's two-tap cycle is timed is not known (01 §4.2). We chose the timed version because a wrong cat costs a heart and the store copy says "a quick double tap".
- Tapping an X clears it (likely, 01 §4.4).
- A double-tap on a placed cat removes it (likely, web build, 01 §4.5). [DECISION] We keep this because it is faithful and harmless: the cat was correct, so removing it never costs anything.
- After any cat attempt or cat removal, the cell ignores taps for `cellLockAfterCatMs`.
- Wrong cells are **locked**. [DECISION] They are revealed information, and allowing them to be cleared would only hide it again.
- **Auto-X: none in normal play.** Placing a cat does **not** cross out its row, column, region or neighbours (likely, 01 §4.7). This holds for cats placed by the player, by a hint's Apply and by the kitty. Outside the tutorial's scripted marks (§11.5), the only X's the game ever adds are the effect cells of a hint the player chose to Apply (§9.1). An optional auto-X setting is a Phase 3 hook, not a Phase 2 feature.
- **No undo** (likely, 01 §4.8). The move log (§22) keeps the door open for it.
- The cat-attempt outcome is described in §8.

### 6.3 Desktop and keyboard

| Input | Action | Basis |
|---|---|---|
| Mouse click / double-click / drag | Same as touch | Same model |
| Right-click | Suppressed (no context menu, no action) | [DECISION] Prevents accidental cat attempts. Right-click-to-place is a clone feature. |
| Arrow keys | Move the focused cell (roving tabindex) | [DECISION] Accessibility (§18) |
| Space | Tap the focused cell | [DECISION] |
| Enter | Double-tap the focused cell (cat attempt or removal) | [DECISION] |
| H / K | Hint / Kitty | [DECISION] |
| Esc | Close the top overlay or card | [DECISION] |

### 6.4 Other controls

- Home button: saves the in-progress board and goes to S1.
- Hint and Kitty buttons: §9.
- While an ad, a kitty animation or an overlay is active, board input is **locked**. Input still waiting in the queue is discarded.

## 7. State machines

### 7.1 App (screens)

```
BOOT ─► LOADING ─► (tutorialDone ? HOME : GAME[tutorial])
HOME ─► GAME[level|daily]          GAME ─► HOME
GAME ─► AD_INTERSTITIAL ─► GAME     (gate on next / retry / daily-done)
GAME ─► AD_REWARDED ─► GAME         (hint / kitty / revive)
any  ─► PAUSED (visibility hidden or FB onPause) ─► previous
```

### 7.2 Level session

```
                      ┌─────────────── revive ok: hearts = 1 ────────────────┐
                      ▼                                                      │
 LOAD ──► READY ──► PLAYING ──(catsPlaced == N)──► WON ──► (O3 / O7)         │
           (board     │  ▲                                                   │
            entry     │  │ apply / close                                     │
            anim)     ├──┴──► HINT_OPEN                                      │
                      ├─────► KITTY_REVEAL ──► PLAYING (or WON)              │
                      └─(hearts == 0)──► LOST ──► (O4) ──retry──► READY (fresh board)
                                                     └──continue──► AD ──────┘
```

| State | Board input | Timer runs | Leaves by |
|---|---|---|---|
| READY | no | no | `START`, dispatched by the session `fx.boardEntryMs` (250 ms) after the board mounts |
| PLAYING | yes | yes, only while the page is visible | cat attempts, hint, kitty, win, loss |
| HINT_OPEN | no | yes | `HINT_APPLY` or `HINT_CLOSE` |
| KITTY_REVEAL | no | yes | `KITTY_DONE`, dispatched `kitty.revealMs` (600 ms) after the kitty cat lands. If the kitty cat completes the board, the state goes straight to WON instead. |
| WON | no | stopped | terminal for the attempt. The overlay follows after `fx.winOverlayDelayMs`. |
| LOST | no | stopped | `REVIVE` → PLAYING, or `RETRY` → READY with a fresh board. The overlay follows after `fx.failOverlayDelayMs`. |

Pausing (page hidden, or FB `onPause`) is not a reducer state. The session stops sending `TICK`, mutes audio and saves (§15). It resumes on return. [DECISION] The timer also stops while Settings (O5) or How to play (O6) is open over the game, and while an ad is showing, so these never count toward a daily's solve time.

### 7.3 Reducer contract

Game logic is a **pure reducer**: `(state, action) → { state, events }`. Events such as `CAT_PLACED`, `MISTAKE` (which carries `heartsLeft`), `REGION_DONE`, `WON` and `LOST` drive audio, haptics, animations, saving and analytics through an effects layer. The types and the full **status × action matrix** are in 04 §4.2. Any action that is not allowed in the current status returns the same state and no events.

## 8. Mistake model

On a cat attempt at `(r, c)`:

1. If `sol[r] === c`:
   - The cell becomes Cat, `catsPlaced++`, and `CAT_PLACED` fires.
   - If this cat completes its region, `REGION_DONE` fires and the region's tiles **fade** toward the background (likely, 01 §12.8; we use our own fade values, §17.4).
   - If `catsPlaced === N`, the state becomes **WON**.
2. Otherwise:
   - The cell becomes Wrong (red X), `hearts--`, `mistakes++`, and `MISTAKE { cell, heartsLeft }` fires.
   - Feedback: the tile flashes, the board shakes, the heart cracks, all placed cats look sad for `fx.sadCatsMs`, and the error sound and vibration play (likely, 01 §5.5).
   - If `hearts === 0`, the state becomes **LOST**.

Other rules:

- Hearts reset to 3 on every new attempt, whether that is a new level, a retry or the next daily (likely, 01 §5.9). There is **no** lives pool and **no** energy.
- **Revive** (§10.2) sets `hearts = revive.heartsRestored` (1) and keeps the board, including Wrong cells, marks, cats and the timer.
- **Retry** resets everything: no marks, no wrong cells, no cats (givens stay), 3 hearts, timer at 0, `mistakes`, `hintsUsed` and `kittiesUsed` at 0, revive available again. Hint and kitty **stock** spent in the failed attempt is not refunded. The board is the **same puzzle** (likely for the web build, 01 §5.10).
- Invariants, which save validation relies on (04 §7.2): the number of Wrong cells equals `mistakes`, and `hearts = 3 + revivesUsed × heartsRestored − mistakes`.

## 9. Hints and kitty

### 9.1 Lightbulb hint

Basis: the app's hint **teaches** one step and can auto-place X's (confirmed and likely, 01 §6.4–6.5). The stock starts at 5 and is topped up by rewarded ads (likely, 01 §6.6).

**Flow:**

1. Tap the Bulb (only in PLAYING). First check the **free-reopen cache**: the session keeps `{boardHash, step}` for the last charged hint, where `boardHash` is the `cells` string. If the cache matches the current board, open O1 with the cached step, uncharged (`HINT_OPEN { charged: false }`). [DECISION] The explanation is what has value, so reopening it is free. The cache is in memory only: it is cleared by any board change, Retry, Revive, leaving the game, or a reload.
2. Otherwise, if `hints > 0`, compute the step (03 §6; a few ms on desktop, with board input locked while it runs). If it succeeds, debit `save.stock.hints -= 1`, save it immediately (§15), and dispatch `HINT_OPEN { step, charged: true }`. If the computation throws, nothing is charged and a toast says "Hint unavailable".
3. If `hints === 0`, show O2. After the rewarded ad completes (or the free fallback is taken): `hints += 1`, then continue as in step 2, which spends that hint at once.
4. **Apply** commits the step's effects:
   - eliminations: only cells in `effectCells` that are **Empty** become Marks (X). Marks and Wrong cells stay as they are.
   - `mistaken_mark`: the one Mark in `effectCells` becomes Empty.
   - a forced cat (`placeCell`) is placed as a Cat. This can never be wrong, and no heart is at risk. It can complete a region or win the level.
5. ✕, Esc or a tap on the dimmed area closes the card (`HINT_CLOSE`). Input stays locked while the card is open.

**Step selection** (details in 03 §6):

- The hint reasons only from what is known for sure: placed cats, givens and Wrong cells. **The player's own X marks are not trusted.**
- If a player X covers a **solution cell**, the hint first points at that X (the lowest cell index if there are several) and offers to clear it. Copy: "This X rules out a tile that can't be ruled out yet." Apply removes the X.
- Otherwise, the deductions are generated in technique order: shadow, single, confinement, shadow-conflict, pigeonhole, trial. The **first step whose effect is not already on the board** is shown.
- If the grader finds nothing, which should never happen for shipped puzzles, the hint falls back to a kitty-style reveal (`reveal_fallback`, same target rule as §9.2). Only the hint is charged, and the kitty stock is not touched.

**Explanation copy** (our own templates). Colour names come from the palette (§17.2), and rows and columns are numbered from 1.

| Step kind | Template |
|---|---|
| Shadow | "This cat claims its row, column, colour and every tile touching it. Cross those out." |
| Single (unit) | "{Unit} has just one open tile left, so its cat goes here." |
| Confinement (region → line) | "Every open {Colour} tile is in {line}. So no other colour can use {line}." |
| Confinement (line → region) | "All open tiles of {line} are {Colour}. So the rest of {Colour} is out." |
| Shadow conflict | "A cat here would cross out every open tile of {unit}. So no cat can go here." |
| Pigeonhole (k units) | "{S} only fit in {T}. Those {T-kind} are taken, so clear their other tiles." `{S}` lists the k focus units of kind A, `{T}` the k units of kind B, joined as "Lavender and Mint" or "rows 2, 4 and 5". `{T-kind}` is "rows", "columns" or "colours". The template covers all six kind pairs (03 §5.2). |
| Trial | "Imagine a cat here: {unit} would have no tile left. So this tile is out." `{unit}` is the first unit, in scan order, that the propagation emptied. |
| Mistaken X | "This X rules out a tile that can't be ruled out yet." |
| Reveal fallback | "Here's a cat to get you going." |

Unit names: rows are "row 3", columns are "column 5", and regions use their palette colour name (§17.2). Lists of two are joined with "and", and longer lists with commas and a final "and".

### 9.2 Kitty (paw)

Basis: the app's "kitty button … pinpoint[s] exactly where you'll find a cat" (confirmed, 01 §6.1). Its exact behaviour is unknown.

- **[DECISION]** The kitty **places** one correct cat. Target (`pickKittyCell`, 03 §6): build the known state K (03 §6 step 2) and apply the shadow of every cat in K. Among regions without a cat, pick the one with the **most candidate cells** (ties go to the lowest region label), so the reveal helps as much as possible. The cat goes on that region's solution cell. If the player has an X on that cell, the X is replaced by the cat.
- The cat appears with a sparkle animation (KITTY_REVEAL, `kitty.revealMs`). It counts as a normal placement, so region fade and the win check apply. **No heart is at risk.**
- Order of operations: debit `save.stock.kitties -= 1` and save it immediately, then dispatch `KITTY { cell }`. Stock starts at 3 (§3). At 0, the O2 prompt appears, and the granted kitty is used at once.
- The kitty button is disabled outside PLAYING.

### 9.3 Tutorial exception

In the tutorial, the hint and its auto-X effects are **free** and are not charged to the stock.

## 10. Win and lose flows

### 10.1 Win (level mode)

| t (ms) | What happens |
|---|---|
| 0 | The last cat lands (280 ms drop) |
| 300 | All cats switch to happy, the win sound plays, haptic pattern |
| 800 | O3 fades in: praise word, celebrating cat, confetti (CSS) |
| 1 800 | **Next** button enabled. Home is always enabled. |
| on Next | Interstitial gate (§13.2), then load level L+1 (board entry 250 ms) |

Here L is the **level number** (N stays the board size). Saving at the moment of a level win, as one `critical` save (§15):

- `progress.level = L + 1`
- `progress.completed += 1`
- `progress.best[L] = [elapsedMs, mistakes]` (levels cannot be replayed in Phase 2, so this is the only record)
- `inProgress.level = null`

Mode differences:

- **Daily win**: `daily[date] = [elapsedMs, mistakes, hintsUsed, kittiesUsed]`, `inProgress.daily = null`, as one `critical` save. O7 replaces O3 and shows the solve time, mistakes and hints. Its **Done** button is the gate trigger `daily_done`, then Home.
- **Tutorial win** (first run): `tutorialDone = true`, `progress.level = 2`, `progress.completed = 1`, as one `critical` save, with no stats record and no gate. "You're ready!" leads to Level 2.
- **Tutorial replay** win: no save at all; the button leads to Home.

### 10.2 Lose

| t (ms) | What happens |
|---|---|
| 0 | Third wrong attempt: red X, heart breaks, shake, sad cats |
| 800 | O4 fades in |
| 1 400 | Buttons enabled |
| Continue | Shown only if `revivesUsed < revive.maxPerAttempt` **and** either (a) `ads.enabled` and `capabilities.rewarded`, or (b) the free fallback is currently allowed (§13.3). When rewarded ads are supported, the button is shown even if no ad is loaded yet; tapping it waits up to `ads.readyTimeoutMs`. Rewarded ad completed, or fallback taken → dispatch `REVIVE` (`hearts = 1`, `revivesUsed++`, PLAYING). Ad closed early, failed or no fill → stay on O4 with the toast "No videos right now — try again soon." |
| Retry | Interstitial gate (`retry`), then `RETRY` (a fresh attempt on the same board) |
| Home | Discards the attempt: `inProgress.level` (or `inProgress.daily`) = null. The level or daily starts fresh next time. |

If the app is closed while O4 is showing, the board is restored into LOST with O4 shown at once (§15), so an unused revive is not lost.

[DECISION] Offering both Continue and Retry merges the app's revive (likely) with the web build's Retry (likely).

## 11. Progression

### 11.1 Structure

- **One linear sequence of numbered levels.** There is no level select and no difficulty select (likely, 01 §10.1). Completed levels cannot be replayed in Phase 2.
- **Level 1 is the tutorial** on a 4×4 board (likely, 01 §10.2). Level 2 onward are normal levels.
- Each level number always maps to the **same board**. [DECISION] Whether the app's boards are fixed or generated is unknown (01 §19). Per-level fan walkthroughs (01 §2) suggest fixed boards, but that is only inferred. Retry replays the same board. The only exception is the substitute board used when a pack cannot be loaded (§11.4).

### 11.2 Size and difficulty ramp: [DECISION]

Evidence used:

- Level 1 is 4×4 (likely).
- Fan ramp: about 7×7 by level 10 and about 8×8 by level 20 (inferred).
- Sizes are mixed rather than monotonic (likely): Level 351 is 8×8 and Level 428 is 10×10.
- The maximum is 12×12 (likely).
- Intermediate techniques appear by levels 20–30 (likely).
- Measured supply of puzzles at each grade (03 §5).

Grades: **G1** singles, **G2** confinement, **G3** shadow-conflict, **G4** pigeonhole, **G5** one-step trial (definitions in 03 §5).

| Levels | Board sizes N (weights) | Grade band (normal / hard) | Notes |
|---|---|---|---|
| 1 | 4 | G1 | Tutorial board (§11.5) |
| 2–3 | 5 | G1–G2 | — |
| 4–6 | 5 (2), 6 (1) | ≤ G2 | — |
| 7–10 | 6 (2), 7 (1) | ≤ G3 | First G3 at about level 8 |
| 11–20 | 6 (1), 7 (2), 8 (1) | G2–G3 | — |
| 21–40 | 7 (2), 8 (2), 9 (1) | G3 / G3–G4 | Hard from level 30 |
| 41–100 | 7 (1), 8 (2), 9 (2), 10 (1) | G3–G4 / G4 | — |
| 101–200 | 8 (2), 9 (2), 10 (2), 11 (1) | G3–G4 / G4–G5 | — |
| 201–1000 | 8 (2), 9 (2), 10 (2), 11 (2), 12 (1) | G3–G4 / G4–G5 | 12×12 is rare: 12×12 boards with ≤ G3 are scarce (03 §5.3) |

How to read the table: "≤ G2" means G1–G2. Where only one grade column is given, it is the normal band; hard levels start at level 30. G5 is allowed only in a hard band (from level 101), and then in at most one step per puzzle (03 §5.3).

Size sequencing rules, applied by `scripts/level-schedule.ts` with the RNG seeded by `mewdoku:schedule:v1` (03 §8.2). For each level L from 2 to 1000, in order:

1. `pool` = the row's sizes with their integer weights. `band` = the hard column if L is Hard (§11.3), otherwise the normal column.
2. **Breather**: if L − 1 was Hard, keep only the smallest ⌈k/2⌉ of the pool's k sizes, and narrow the band to its lowest grade (e.g. G3–G4 → G3).
3. **No three in a row**: if levels L − 2 and L − 1 have the same N and the pool contains another size, remove that N from the pool.
4. Pick N by weight: `rng.int(sum of weights)`.

Example: levels 2–3 can only be 5×5, so level 4 is forced to 6×6.

Ordering inside a band (03 §8.3): the generator fills every slot, and then reorders only the **sortable** slots (normal levels that are not breathers) of each table row by effort score (03 §5.4) with ±10 % seeded noise. Difficulty therefore rises inside each band, while hard levels and breathers stay where the schedule put them. A final repair pass restores the no-three-in-a-row rule.

### 11.3 Hard levels

Every 10th level from level 30 onward (30, 40, 50, …) is **Hard** [DECISION, based on inferred 01 §10.8]. A Hard level:

- uses the band's hard grade column;
- shows a **"Hard"** badge on the Home button and next to the title;
- otherwise plays exactly like a normal level.

### 11.4 Endless beyond the shipped packs

For levels L > `levels.shipped` (1 000), the board is generated on the device in a Web Worker:

- The RNG is seeded with `mewdoku:level:v1:<L>`. Its **first** draw picks N by weight from the 201–1000 pool, and the generator then continues on the same stream (03 §7).
- Hard (`L % 10 === 0`) uses the hard band G4–G5; the level after a hard one is a breather (§11.2, step 2). The no-three-in-a-row rule is **not** applied, because it would need the previous levels' boards.
- The same shape filters apply (03 §4.5). There is no duplicate check against the shipped packs; a collision is astronomically unlikely.
- If 5 000 attempts fail, generation retries once with seed `<seed>:r1` and the band widened to G1–G5 (still at most one G5 step).
- Level L + 1 is generated in the background while L is being played, and is kept in memory only. After a reload it is regenerated, which gives the same board because generation is deterministic.

This covers the "Endless levels" claim (01 §10.4).

**Substitute boards.** If a shipped pack cannot be fetched after two retries (04 §8), the level gets a substitute board, generated in the worker with seed `mewdoku:fallback:v1:<L>` and the slot's size pool and band from the ramp table. The substitute is **not** saved as `inProgress`, so a reload falls back to the shipped board once the pack loads.

### 11.5 Tutorial board (Level 1): our own design

Labels are canonical (first appearance in row-major order, 03 §2). Coordinates in this section are 1-based (row, column).

```
row 1:  A B C C       Regions: A, B (1 tile), C, D
row 2:  A A C C       Solution (column per row): 2, 4, 1, 3
row 3:  A D D C       Record: r = "ABCCAACCADDCDDDD", s = "1302", g = 1, tut = 1, gv = ""
row 4:  D D D D       Unique and grade G1 (checked: engine-prototype/checks/tut.mjs)
```

**Fixed colours.** The tutorial does not use the colour-assignment algorithm (03 §8.5). `tutorial.ts` fixes the colours as A = Mint (4), B = Lavender (7), C = Lemon (2) and D = Strawberry (0), so the coach text can name "Lavender".

| Step | Coach text (our copy, draft) | Accepted input. Anything else only pulses the cell, with no state change and no heart lost. | Advances when | Scripted effect on advance |
|---|---|---|---|---|
| 1 | "Every colour hides exactly one cat. This Lavender colour is a single tile — double-tap it." | TAP or DOUBLE_TAP on (1,2). A lone TAP just toggles its X. | A cat is on (1,2) | — |
| 2 | "A cat claims its whole row and column." | The coach card's **Got it** button; the board is locked | Button pressed | X's on row 1 and column 2 |
| 3 | "Cats need space — they can't touch, not even at the corners. Swipe across these tiles to cross them out." | Mark-mode PAINT over (2,1)–(2,3) (cells outside the three are ignored), or a TAP on one of them that is still **Empty**. A TAP on an X there only pulses, so (2,2), already X from step 2, cannot be cleared. Keyboard users can Space-tap the cells. | (2,1), (2,2) and (2,3) are all X | — |
| 4 | "Row 2 has one open tile left. Double-tap it." | TAP or DOUBLE_TAP on (2,4) | A cat is on (2,4) | X's on every still-Empty cell in that cat's shadow |
| 5 | "Stuck? Tap the bulb for a hint." | The Bulb (free, §9.3), then Apply only. The hint engine returns the "single" step for (3,1). | Apply | Cat at (3,1), then X's on its shadow |
| 6 | "Place the last cat." | TAP or DOUBLE_TAP on (4,3) | Win | O3 "You're ready!" |

Rules for the tutorial:

- `RuleFlags.mistakePenalty = false`. Wrong targets cannot be attempted because the input filter blocks them, and the flag is a second safety net.
- The tutorial is never saved as `inProgress`. A reload restarts it at step 1.
- Skipping works as described in §4.2 ("I know how to play").

## 12. Daily puzzle

Existence is confirmed (01 §10.10). Everything else is [DECISION]:

| Aspect | Spec |
|---|---|
| Unlock | After completing level 20: unlocked iff `save.progress.level > daily.unlockAfterLevel` |
| Cadence | One puzzle per **calendar date** in the player's local time zone. "Today" = `YYYY-MM-DD` built from the local `Date` getters at the moment Home or the daily card is shown. ID = `D` + `YYYY-MM-DD`. The puzzle is a pure function of the date string, so every player gets the same board for the same date. |
| Source | Pre-generated monthly files `daily/YYYY-MM.json` (03 §8). If a month is missing, the record is generated deterministically in a worker from seed `mewdoku:daily:v1:YYYY-MM-DD`. |
| Size and grade by weekday | The weekday comes from the **date string**, `new Date(Date.UTC(y, m − 1, d)).getUTCDay()`, never from the device clock. Mon 8×8 ≤G3 · Tue 8×8 G3 · Wed 9×9 ≤G3 · Thu 9×9 G4 · Fri 10×10 ≤G3 · Sat 10×10 G4 · Sun 11×11 G4. The app's dailies can be 12×12 (likely); 12×12 is reserved for Phase 3 events. |
| Rules | 3 hearts, the shared hint and kitty stock, 1 revive, same controls |
| Timer | Measured in the background (only while visible and playing). **Not shown while playing**; shown on O7. |
| Home card states | **locked** (level ≤ 20) · **not played** (no record for today, no in-progress daily for today) · **in progress** (`inProgress.daily.id === 'D' + today`) · **solved m:ss** (`daily[today]` exists; tapping opens O7) |
| In-progress daily | Kept in its own save slot, `inProgress.daily` (§15), so playing a level never discards it. When Home is shown and the slot holds an **earlier** date, the slot is cleared. |
| Failing a daily | O4 works as in levels. Retry gives the same daily, fresh. Home discards the attempt, and the card shows "not played". |
| Replay | A solved daily shows O7 again. No replay and no past days in Phase 2. A calendar and streaks are Phase 3 hooks. |
| Midnight rollover during play | The current board continues and is credited to its **original** date. Leaving to Home after midnight clears it (row above). |
| Leaderboard | Phase 4: submit the solve time if FBIG leaderboards are available (05 §8) |

## 13. Monetization (Phase 2 behaviour)

### 13.1 Ad placements

| Placement | Type | Trigger | Basis |
|---|---|---|---|
| `next_level` | Interstitial | Tap Next on O3 | likely (01 §11.3) |
| `retry` | Interstitial | Tap Retry on O4 | likely (01 §11.4, fail-retry) |
| `daily_done` | Interstitial | Tap Done on O7 | [DECISION] It is a level transition |
| `hint` | Rewarded | Hint at stock 0 | likely (01 §6.6) |
| `kitty` | Rewarded | Kitty at stock 0 | likely (01 §6.3) |
| `revive` | Rewarded | Continue on O4 | likely (01 §5.7) |

No ads ever appear during play, on game open, or in the tutorial. No banners (`ads.banner.enabled = false`). No IAP in Phase 2. The original launched ad-only (likely, 01 §11.1), and FBIG payments are not available on iOS (05 §9).

### 13.2 Interstitial gate

```text
canShowInterstitial(trigger):                      // pure; lives in game/ad-pacing.ts
  return cfg.ads.enabled
     and capabilities.interstitial
     and trigger in cfg.ads.interstitial.triggers
     and save.progress.completed >= cfg.ads.interstitial.minCompletedLevels      // 10
     and now - session.startedAt >= cfg.ads.interstitial.sessionGraceSec × 1000   // 60 s
     and now - save.ads.lastAdAt >= cooldownSec(tenureDays) × 1000

cooldownSec(d) = d < 2 ? 120 : d < 7 ? 100 : 90           // cfg.ads.interstitial.cooldownSec
tenureDays     = floor((now - save.firstSeenAt) / 86 400 000)

after an interstitial resolves ok, or a rewarded ad completes
(and cfg.ads.rewarded.resetsInterstitialClock):  save.ads.lastAdAt = now
```

- `session.startedAt` is the clock time when `platform.start()` resolved in this page load (04 §5.1). `save.progress.completed` counts levels only, including the tutorial; dailies do not count.
- If the gate passes, `ad-flow.ts` asks the adapter to show the preloaded interstitial. If no instance is ready within `ads.readyTimeoutMs` (4 s), or it fails or does not fill, the ad is **skipped silently** and the transition goes ahead. A skipped ad is never shown later.
- Once `showAsync()` has started, the game waits for it to settle: it resolves when the ad is closed or finished (05 §6.2). `ads.showWatchdogMs` is only a safety net.
- **Our** audio is muted while any ad shows and restored afterwards. This is platform hygiene (05 §6.2). It is not taken from the original; the claim that the original's interstitials are muted by default concerns the ads' own sound (01 §11.4).

### 13.3 Rewarded flow and fallback

- Rewarded ads are preloaded at level start and after each show.
- The reward is granted **only when the ad completes**, that is, when `showAsync()` resolves (05 §6). Closing it early rejects, and nothing is granted.
- If no rewarded instance is ready within `ads.readyTimeoutMs`, or it fails or does not fill, O2 closes and a toast says: "No videos right now — try again soon." On O4 the overlay stays, with the same toast.
- [DECISION] **Free fallback.** If rewarded ads are **unsupported** (`capabilities.rewarded === false`, or `ads.enabled === false`), the reward is granted free, at most once every `ads.unsupportedFallback.cooldownSec` (600 s). The cooldown is **shared** by hint, kitty and revive, and is stored as `save.ads.lastFallbackGrantAt`. This applies to the production web build. It also applies to FBIG builds made without placement IDs: the FB adapter reports `interstitial` and `rewarded` as false when `VITE_FB_PLACEMENT_*` is empty (04 §6.3), so builds made before monetization is approved fall back cleanly. "No fill" on a supported platform does **not** trigger the fallback. Players must never be hard-blocked by ad availability.

## 14. Settings

| Setting | Default | Stored | Notes |
|---|---|---|---|
| Sound | on | yes | Mutes all sound effects |
| Vibration | on | yes | Hidden if neither `navigator.vibrate` nor platform haptics exist |
| Colour patterns | off | yes | Adds a small glyph per region (§18) |
| Reduce motion | System | yes | System / On / Off |
| How to play | — | — | Opens O6: three illustrated rules, plus "Replay tutorial" (replays Level 1 without changing progress) |
| About | — | — | Version, licences (font OFL), privacy link (Phase 4) |

## 15. Persistence

Save schema and adapters are in 04 §7.

Save modes (04 §7.1):

- `touch`: local write debounced by `save.localDebounceMs` (400 ms), cloud write debounced by `save.cloudDebounceMs` (3 s);
- `now`: local and cloud writes at once, with no cloud flush;
- `critical`: `now` plus `flushDataAsync` on FBIG.

| What | When saved | Mode |
|---|---|---|
| Progress (current level, completed count, per-level best time and mistakes) | On level win | `critical` |
| Tutorial done (plus level 2, completed 1) | On first-run tutorial win or skip | `critical` |
| Daily records `{date: [ms, mistakes, hints, kitties]}` | On daily win | `critical` |
| Stock (hints, kitties) | On every change (debit or grant) | `now` |
| In-progress board, one slot each for level and daily (mode, puzzle ID, cell states, hearts, revives used, mistakes, hints and kitties used, elapsed) | After each reducer change to cells, hearts or revives | `touch` |
| In-progress board | On page hide, FB `onPause`, or Home | `now` |
| Settings | On change | `touch` |
| Ad pacing (`lastAdAt`, `lastFallbackGrantAt`) | After an ad or a fallback grant | `touch` |
| `sessions += 1` (and `firstSeenAt` on the very first boot) | At boot | `touch` |

**Restoring on launch**, applied in this order:

1. A tutorial is never restored (it is never saved).
2. `inProgress.daily` for a date before today is cleared.
3. A slot that fails validation against its puzzle (04 §7.2) is cleared, and the level starts fresh.
4. A slot whose cats already fill the board (a crash between the last cat and the win save) is completed: the win bookkeeping (§10.1) runs and O3 or O7 is shown.
5. A slot with `hearts === 0` is restored into LOST with O4 shown at once (no delay), so an unused revive stays available.
6. Otherwise the board is restored **exactly** into READY → PLAYING. Hint and kitty overlays are closed, and anything already charged stays charged. Home shows "Continue · Level L", and the daily card shows "in progress".

Where a cloud copy exists (FBIG), local and cloud copies are merged first, as described in 04 §7.3.

## 16. Audio and haptics

All sound effects are **synthesised at runtime with WebAudio**: no audio files, and fully original. That keeps the download tiny (04 §5.6). There is no music in Phase 2, matching the web build (likely, 01 §13.3).

| Event | Sound (our design) | Vibration (ms) |
|---|---|---|
| Mark placed (tap or drag; throttled to 1 per 40 ms) | Soft high "tick", random pitch ±3 % | 6 |
| Mark removed | Lower "tock" | — |
| Cat placed | Rounded "pop" plus a rising two-note chirp | 14 |
| Region done | Short bright chime, pitch rises with each region | — |
| Mistake | Dull thud plus a short downward buzz | 30, 40, 30 |
| Heart lost (last one) | The mistake sound, then a slow descending three-note figure | 60 |
| Win | Upward five-note arpeggio plus sparkle noise | 20, 30, 20, 30, 40 |
| Hint open / apply | Soft bell / "whoosh" | — |
| Kitty reveal | Sparkle plus pop | 14 |
| UI button | Click | 4 |

- The AudioContext is unlocked on the first `pointerdown`, suspended on hide or FB `onPause`, and resumed when the game returns.
- Master volume is -12 dBFS peak.
- The FBIG adapter uses platform haptics where they exist (05 §4), and `navigator.vibrate` otherwise. iOS web has no vibration, which is acceptable.

## 17. Visual design (our own)

### 17.1 Style goals

The character of the original, in words (01 §12): cute, calm, minimal; flat rounded tiles with gaps on a white card over a warm page; saturated pastels against muted chrome; heavy rounded type.

Our expression of that character must be **visibly our own**: our own palette values, our own cat character, our own icon set, our own layout proportions and a different accent colour (06 §5).

### 17.2 Tokens and region palette (provisional; validate in Phase 2)

| Token | Value | Use |
|---|---|---|
| `--page` | `#FBF6EE` | Page background (warm paper) |
| `--card` | `#FFFFFF` | Board card, pills, sheets |
| `--ink` | `#3B3044` | Text, X glyph, cat outline |
| `--ink-2` | `#7A6E80` | Secondary text |
| `--accent` | `#1F9E89` | Primary buttons (deliberately **not** orange) |
| `--danger` | `#D33A4A` | Wrong X, lost heart, error flash |
| `--heart` | `#E8506A` | Hearts |
| `--scrim` | `rgba(30,22,36,.75)` | Win and fail overlays |

Region colours (12, named for hint copy):

| # | Name | Hex | # | Name | Hex |
|---|---|---|---|---|---|
| 0 | Strawberry | `#F49AAE` | 6 | Sky | `#9BBDF0` |
| 1 | Apricot | `#F7B98B` | 7 | Lavender | `#B9A7EC` |
| 2 | Lemon | `#F2DC7C` | 8 | Orchid | `#E3A6DF` |
| 3 | Lime | `#BFDB86` | 9 | Cocoa | `#C7A58C` |
| 4 | Mint | `#8FD6B8` | 10 | Slate | `#9AA9BC` |
| 5 | Lagoon | `#7CC6D6` | 11 | Moss | `#A3B57F` |

Phase 2 must validate this palette with a script:

- pairwise CIEDE2000 ≥ 10;
- simulated deuteranopia, protanopia and tritanopia ΔE reported, with the patterns option compensating where it falls short;
- `--ink` X glyph at ≥ 3:1 contrast against every tile (WCAG 1.4.11).

The values may then be adjusted. **Colour assignment per puzzle** is deterministic: choose N of the 12 colours and assign them so that **adjacent regions** get the most different colours (03 §8.3).

### 17.3 Cat character (our own)

- **[DECISION]** A round "loaf" cat head:
  - **ginger fur** (`#F29A4A`) with a cream muzzle (`#FFE9CF`);
  - a 2 px `--ink` outline so it reads on every tile;
  - two rounded triangular ears, oval eyes, a tiny pink nose and three whiskers per side.
- This is deliberately **not** a tuxedo (black and white) cat, which is the original's look (01 §12.4).
- The cat is drawn as an inline SVG `<symbol>` at 0.82 × cell size.
- Moods are made by swapping the eye and ear paths:

| Mood | Look | When |
|---|---|---|
| idle | Eyes open; a blink every 3–7 s, randomised per cat | Default |
| happy | Eyes become arcs, small hop | Win |
| sad | Ears drop, eyes become droopy arcs | Mistake, for `fx.sadCatsMs` |
| surprised | Round eyes | Kitty reveal |

- Larger illustrations (win, fail, home mascot, tutorial) use the same character in new poses: party hat on win, small bandage on fail, sleeping on boot. We do **not** use a trumpet cat or a crying cat hugging a broken heart.

### 17.4 Board rendering

- The board card has 12 px padding and 16 px corner radius. Tiles have a corner radius of 18 % of cell size.
- **Region-aware gaps** (accessibility, §18). Each tile is inset from its grid slot by 1.5 px on sides that face the **same** region and 3.5 px on sides that face a **different** region. Region boundaries therefore read as wider channels, while the "tiles with gaps" look is kept.
- Mark (X): two strokes in `--ink` at 70 % opacity, round caps, 52 % of cell size, stroke width 10 % of cell.
  - **[DECISION]** A dark X instead of the original's white X, for contrast on light tiles.
- Wrong: a `--danger` X at full opacity on the tile, plus a 2 px inner ring in `--danger`.
- A region whose cat is placed is mixed 45 % toward `--page`, over 400 ms.

### 17.5 Animation list (our values)

| Animation | Duration | Easing |
|---|---|---|
| X stroke draw-in | 120 ms | ease-out |
| Cat drop with overshoot | 280 ms | cubic-bezier(.2, 1.4, .4, 1) |
| Wrong flash + shake (±6 px, 3 decaying cycles) | 300 ms | linear |
| Heart crack and fade | 400 ms | ease-in |
| Region fade | 400 ms | ease |
| Board entry (tiles scale 0.9 → 1, staggered 8 ms/row) | ≤ 250 ms | ease-out |
| Overlay fade | 200 ms | ease |
| Confetti (CSS particles, 40 pieces) | 1 600 ms | gravity curve |

With reduced motion on: no shake, no confetti, no stagger. Fades are kept at ≤ 150 ms.

### 17.6 Type and icons

- Headings and buttons use one bundled **OFL-licensed rounded display font**, subset to Latin, one weight, ≤ 25 KB woff2. The candidate is Fredoka; check its licence in Phase 2. Body text uses `system-ui`.
- All icons are drawn by us as SVG: house, gear, bulb, paw, heart, trophy, lock, calendar, play-video, close.

## 18. Accessibility

| Requirement | Spec |
|---|---|
| Not colour-only (WCAG 1.4.1) | Region-aware gaps (§17.4) are **always on**. The optional **Colour patterns** setting adds a 22 %-size glyph in each tile's corner. There are 12 glyphs (dot, ring, triangle, square, diamond, star, plus, bar, chevron, heart, drop, moon), one per palette index. |
| Non-text contrast (WCAG 1.4.11) | X, cat outline and wrong-X are ≥ 3:1 against every tile colour (validated by script). |
| Screen reader | The board is `role="grid"`; each cell is a `button` with `aria-label`, e.g. "Row 3, column 5, Lavender, marked". A polite live region announces "Cat placed. 4 of 8.", "Wrong tile. 2 hearts left.", "Lavender done." Hint text names colours and, when patterns are on, glyphs. |
| Keyboard | Full play via §6.3. Visible focus ring (3 px `--accent`). |
| Motion | Respect `prefers-reduced-motion` plus the setting (§17.5). |
| Touch targets | The whole cell, including half of each gap, is hittable. A 12×12 board on a 360 px phone gives about 26 px cells. This is a known limit of the format, also present in the original. Drag-to-mark and the double-tap model reduce mis-taps. |
| Text | rem-based sizes; supports 200 % browser zoom on the web build without overlap (FB webview may cap this). |
| No time pressure | No visible timer and no time limits. |

## 19. Responsive portrait layout

Layout reference: CSS px, `visualViewport` dimensions, safe-area insets included.

```text
W, H        = visualViewport width/height
gutter      = 16
colW        = min(W − 2·gutter, 480)              // centred column (desktop FB: portrait column)
topBar      = 56 ;  pills = 44 ; chips = 40 ; tools = 64 + 16 + safeBottom
vGaps       = 12 × 4
boardMax    = min(colW, H − safeTop − topBar − pills − chips − tools − vGaps)
pad         = 12 ;  slot = floor((boardMax − 2·pad) / N)   // each cell's slot, insets drawn inside
board       = slot·N + 2·pad
compact     = H < 640 → pills and chips at 36 px, chip text hidden (icons only)
```

- **FB safe zone**: reserve the top-left 64 × 64 px in the FBIG build. Place no controls there because the platform's floating menu may overlap it (05 §5, inferred). The Home and Gear buttons sit top-right.
- Desktop and landscape (facebook.com): a centred portrait column on `--page`, with the remaining width filled by a soft pattern.
- A landscape phone with height < 480 px shows O10 "Please rotate your device". FBIG portrait orientation config normally prevents this.
- Minimum supported viewport: 320 × 568.

## 20. Analytics events

Sent through `platform.analytics.log`. FBIG uses `logEvent`: event names are 2–40 chars from `[A-Za-z0-9 _-]`, there are at most 25 params, **param keys are 2–40 chars**, and values are under 100 chars (confirmed, Meta's reference text, 05 §10). That is why the board size is sent as `size`, not `n`. The web build does not log.

| Event | Params |
|---|---|
| `tutorial_step` | `step` |
| `tutorial_done` | `ms`, `skipped` (0/1) |
| `level_start` | `level`, `size`, `grade`, `hard`, `mode` |
| `level_win` | `level`, `size`, `ms`, `mistakes`, `hints`, `kitties`, `revives` |
| `level_fail` | `level`, `size`, `ms`, `cats` |
| `mistake` | `level`, `size`, `cats` |
| `hint_used` | `level`, `kind`, `charged` (0/1) |
| `kitty_used` | `level` |
| `ad_interstitial` | `trigger`, `result` (an `AdResult` reason, `ok`, `gated` or `watchdog`) |
| `ad_rewarded` | `placement`, `result` (as above, plus `fallback`) |
| `daily_start` / `daily_win` | `date`, `size`, `ms`, `mistakes` |
| `save_corrupt` / `pack_fallback` / `js_error` | `where` |

For a daily, `level` is sent as 0 and `mode` as `daily`.

## 21. Localization and copy

- Phase 2 ships **English only**. The original reportedly has 62 languages (likely, 01 §1.7); that is for Phase 3 or 4.
- All strings live in `src/i18n/en.ts` with named placeholders. Colour names are translatable keys.
- The locale is read from the platform adapter **after** `startGameAsync` on FBIG (05 §4).
- All copy is written by us. Never paste or paraphrase the original's store text, tutorial lines, hint sentences or praise words (06 §3).

Praise words (draft, ours): "Clever cat!", "Whisker-perfect!", "Purr-fection!", "Nailed it!", "Brilliant!", "Paws up!".

## 22. Phase 3 hooks (extension points only, no designs)

Phase 2 must keep these seams clean. **What goes into Phase 3 is the user's decision.**

| Hook | Where | What it enables |
|---|---|---|
| `GameMode` registry (`tutorial`, `level`, `daily`) | `src/game/modes.ts` | New modes plug in with their own puzzle source, HUD title, win flow and rules flags |
| `RuleFlags` (`mistakeModel: 'solution'`, `mistakePenalty`, `autoX: false`, `heartsPerAttempt`) | `GameState.rules`, set per mode by `modes.ts` (04 §4.2) | Alternative rule settings without forking the reducer |
| Feature flags | `src/app/flags.ts` | Ship hidden features dark |
| Move log (every applied move, timestamped) | `GameState.moves` | Undo, replay, share, anti-cheat |
| Typed event bus | `src/app/events.ts` | Achievements, stats, quests, analytics |
| Economy ledger with a currency map (`hints`, `kitties`, reserved `coins`) | `src/game/economy.ts` | Rewards, a shop, IAP |
| Win reward slot (empty in Phase 2) | O3 (`ui/overlays/win-overlay.ts`) | The app's golden fish or other rewards |
| Home cards array | `HomeScreen` | Extra entry points (events, calendar, collection) |
| Theming via CSS tokens and an SVG symbol registry | `styles/tokens.css`, `ui/art/` | Dark theme, cat skins, palettes |
| Save schema `v` and migrations, `ext` bag | `src/game/save.ts` | New persistent data without breaking old saves |
| Platform capabilities (`leaderboards`, `share`, `tournaments`, `payments`, `shortcut`) | `PlatformAdapter` | FB social and IAP features |
| Hint step kinds (extensible union) | `engine/hint.ts` | New teaching steps |
| Engine parameter `k` (cats per unit, fixed at 1) | engine types | Variant puzzles |
| i18n catalogue | `src/i18n` | More languages |

For the user's later choice, research surfaced these ideas, **listed only and not designed**:

- dark mode;
- undo and an optional auto-X;
- a forgiving mistake rule and a hypothesis or pencil mode;
- colour-blind palettes;
- a daily calendar and streaks;
- cat collection and skins;
- a no-lives Zen mode;
- friends leaderboards and tournaments, and a shareable result card;
- lighter ad pacing;
- golden-fish-style rewards;
- more languages.

## 23. Phase 2 acceptance criteria

- [ ] Rules, gestures (§6.2) and the mistake model (§8) behave exactly as specified. Covered by reducer unit tests and a Playwright smoke test.
- [ ] Hearts are 3 per attempt; revive restores 1 heart once; Retry gives a fresh copy of the same board.
- [ ] The hint explains and applies a valid next step on every shipped level and never reveals a wrong deduction. Covered by a property test over the packs.
- [ ] The kitty places a correct cat; stocks persist; rewarded and fallback flows work with mock ads.
- [ ] The tutorial (Level 1) is completable and cannot cost hearts.
- [ ] 1 000 levels ship. Every one has exactly one solution and is graded within its band (03 §9).
- [ ] The daily puzzle unlocks after level 20, is the same for a given date, and records time.
- [ ] Ad gate logic follows §13.2. Unit tests use a fake clock. A shown ad is never cut short by a timeout; only readiness is time-limited.
- [ ] Resuming mid-level restores the exact board. Every restore rule in §15 is covered by a test: stale daily, failed validation, a full board, hearts 0 → O4, and a level and a daily both in progress.
- [ ] The free fallback works when rewarded ads are unsupported, with one 10-minute cooldown shared by hint, kitty and revive.
- [ ] Every analytics event passes the `logEvent` limits (05 §10). A unit test checks the event table.
- [ ] Layout works from 320 × 568 to desktop; no overlap in compact mode; FB safe zone respected.
- [ ] Accessibility: screen-reader labels, keyboard play, reduced motion, patterns toggle; palette validation script passes.
- [ ] Bundle within budget (04 §9); no runtime network calls except our own static files and the FB SDK.
- [ ] No original assets, text or code anywhere (06 checklist).
