# Phase 2d.1: the three helpers, the tickers and the palette, from the user's recordings (2026-10-10)

Status: **built, integrated and accepted** (G1–G3, then integration I-1 to I-6 on 2026-10-10: [STATUS-2d](STATUS-2d.md) Part 2; the final interfaces and the members added at integration are in [CONTRACTS-2d1](CONTRACTS-2d1.md) §11; I-4 moved the board's lazy motion, the cat sequence and the tutorial coach into lazy chunks, §7.9 numbers in STATUS-2d §11) · Date: 2026-10-10 · Owner: game design + tech lead · Branch `claude/mewdoku-instant`. Code read at HEAD `f9c0b8d` (`git show f9c0b8d:<path>`; the working tree was being edited by the 2d builders). The names 2d adds (`game-bar.ts`, the heads pill, `pickMouseCells`, `playStartToast`, …) are taken from [look-spec](look-spec.md) / [CONTRACTS](CONTRACTS.md) and, for spelling only, from the WIP checkpoint `b607247`.

Inputs: the user's message and material (§0.1); the measurement notes `mouse-cat.md` (mouse and cat, Level 114 region map) and `hint-stills.md` (bulb, stills, tickers, palette), both in `scratchpad/2d1/` (not in the repo), with their crops and scripts; the first recording's notes `scratchpad/2d/measure.md`; [look-spec](look-spec.md) and [CONTRACTS](CONTRACTS.md) (Phase 2d, read in full); the source at `f9c0b8d`: `src/game/{types,reducer,modes,economy}.ts`, `src/engine/{hint,techniques,geometry,types}.ts` (read-only), `src/app/{helper-flows,session,session-effects,views}.ts`, `src/ui/overlays/{hint-card,hint-text}.ts`, `src/ui/board/{board-view,board-cells,board-highlight,board-fx,board-types}.ts`, `src/ui/hud/{pills,tool-bar,top-bar}.ts`, `src/audio/sfx.ts`, `scripts/palette-check.ts`, `src/app/config.ts`. The interfaces of §7 are repeated, copy-paste ready, in [CONTRACTS-2d1.md](CONTRACTS-2d1.md). The palette numbers of §6 come from `scratchpad/2d1/palette/de00.py` and `contrast2.py` (the same colour math as `scripts/palette-check.ts`).

---

## 0. Read me first

### 0.1 The user's message and the decision record

The user's message, verbatim (three uploaded files, then the text): **`@"…b501f338-ScreenRecording_10-10-2026_08-55-01_1.mp4" @"…93bfb1bb-ScreenRecording_10-10-2026_08-56-09_1.mov" @"…06e028e5-ScreenRecording_10-10-2026_08-56-27_1.mov"` "In the screenshots (see the messages) and videos (3 videos to see and replicate 3 in game helpers - cat, hint, mouse)"**.

| File (ours) | What it is | Shows |
|---|---|---|
| `v1.mp4` (08-55-01, 5.4 s) | iPhone recording at 3× (1206 × 2622, CSS viewport 402 × 874), 60 fps, silent audio | the **mouse** helper on Level 114 (9 × 9); the last 1.7 s are the iOS control centre (ignored) |
| `v2.mov` (08-56-09, 3.7 s) | same device | the **cat (kitty)** helper on the same board |
| `v3.mov` (08-56-27, 6.0 s) | same device | the **bulb (hint)** helper on the same board, then Apply |
| `still-a.png` (08:53:38), `still-b.png` (08:53:46) | screenshots (still-a in Display P3, converted; still-b sRGB) | Level 114 at its start: two level-start tickers, the kitty at 0 with the video badge, the bulb at 1, no banner |

**Decision D-2d1-0 (user, 2026-10-10).** Phase 2d.1 replicates the original's three helpers (mouse, cat, bulb), the level-start tickers and the palette as these recordings show them, with our own art and our own copy. The terms of D-2d-0 apply unchanged (look-spec §0.1): measuring sizes, positions, timings, sequences and sampling colours is allowed; no tracing; no file of the original enters the repo; our own words. Facts the recordings show are recorded in [01](../phase1/01-game-deconstruction.md) as **"first-hand (user recordings, 2026-10-10)"** (done at this spec stage: the update paragraph, rows 6.10–6.14 and 12.22–12.29, §18 entries 15–17, §19).

### 0.2 Clean room in 2d.1

- **Allowed:** the numbers in this file (positions, sizes, scale curves, timings, orders, colours). They are measurements, not expression.
- **Not written here, never copied:** the original's hint sentence, its confirm button's label, the exclamation word it shows when a line or colour is complete, and the two ticker sentences. They are described by **role, length and placement** only. Every string in this file is ours (Appendix A). Our confirm button keeps the label it has had since Phase 2 (`hint.apply`, 02 §9.1; 01 row 6.5), a one-word generic command treated like "Level" and "Score" (D-2d-0 e); the spec calls the control "Apply" after our label.
- **Not used:** the original's level layouts. Level 114's region map was rebuilt by the analysts only to check what the helpers did; it never enters the repo, a test fixture or the visual acceptance (06 §3 "Level content"). Tests build their own boards with the same properties (e.g. a one-tile region in the top-right corner).
- **Art** is drawn by us from the words in this file and Appendix C (G2, one provenance row each). The mouse on the board, the tracker's found face, the four-point star, the shards, the paw cap and the ticker icons are our own drawings; where a shape can only come out one way (a four-point star, a paw print) it is drawn with our own proportions on our grid.
- **Reference material** stays in the scratchpad (`orig-ref2`, `2d1/`). Scripts that read it take the folder from `MEWDOKU_ORIG_REF2` and write only to a scratch folder.

### 0.3 Sources and confidence

- **Times** are milliseconds from the frame in which the finger is **released** (the action fires on release, §4.5), read from the 60 fps container timestamps, ± 8 ms. Where an app hitch merged frames (v3 after Apply: one frame held for 67 ms) the onset is extrapolated from the 33 ms steps around it.
- **Sizes** are CSS px at s = 1 (402 px viewport), image px ÷ 3. **T** is the tile edge (39.0 on 9 × 9, 35.0 on 10 × 10); sprite sizes are given in % of T because every board-level measurement scales with the tile (the X does: 61 % of T on both boards).
- **Colours:** "(PNG)" = exact sRGB from still-b (or still-a converted from Display P3; they agree within 1 unit). "(cc)" = a video value corrected with the 2d curve (`2d/measure/out/video2still.json`, which matches still-b's tiles within 3 units). Dark or very saturated video colours fall outside that curve and are given as a range or rounded. No colour in this file is a raw video value.
- **Sound:** all three audio tracks are digital silence. **No sound was measured**; every sound in this file is ours.
- **One sample each.** Each helper was seen once. Where a single sample cannot separate two rules, the rule we build is marked `[DECISION]` and listed in §8.

### 0.4 First-hand facts vs the 2d provisional decisions

| 2d item | 2d decision (provisional) | What the recordings show | 2d.1 |
|---|---|---|---|
| **D-2d-12** mouse (look-spec §1.12) | 3 X's on empty non-solution tiles; they pop 90 ms apart; one video per use | **Rule confirmed**: three empty, non-solution tiles, random-looking (an early, a middle and a late deduction: rounds 1, 2–3 and 5 depending on the rule set; not reading order); no score, label, head, badge or dim change; the video badge stays. **Motion differs**: a mouse **visits** each tile in turn (≈ 0.94 s each), and its X pops in under it as it leaves | Keep the rule; replace the stagger with the visiting mouse (§1); visit order = pick order (D-2d1-1) |
| **D-2d-9** found head (§1.6) | the head fills with the full colour and pops | The silhouette is **replaced by the cat's face** with a **small dot** in the colour's 50 % tint at its lower right; pop 0.56 → 1.20 → 1.0 over ≈ 280 ms | Face + dot (D-2d1-5, §2.7) |
| **D-2d-10** extra colours (§1.9) | Mint and Cocoa (ours) for 11 × 11 / 12 × 12; n ≤ 10 boards use only the 10 measured colours | An **11th measured colour**: a slate/denim blue `#5B75B2` (PNG), the darkest so far, on a **9 × 9** board that drops two of the ten. The original picks a per-level subset of ≥ 11 colours | Denim replaces Mint at index 4; n ≤ 11 draws from the 11 measured colours; Cocoa only on 12 × 12 (D-2d1-10, §6) |
| **D-2d-11** which helper pulses (§1.11) | `'auto'`: the kitty on an untouched board, else the bulb | **No pulse anywhere**: both level-start stills (untouched board, kitty at 0 with the video badge, bulb at 1, ≥ 8 s apart) and ≈ 15 s of video. The 2d rule would have pulsed the kitty in the stills. v2 and v3 also show **no bulb pulse after long idle times** (the board did not change for ≈ 63 s between v1's end and v2's start, and for ≈ 17 s between the kitty and v3's start, bulb at 1 both times), after a helper had been used in the level | Pulse only after an **idle time**, only on a helper **with stock**, and only while **no helper has been used in this attempt** (D-2d1-9, §4.6; the last condition added by the critic) |
| **D-2d-13** level-start toast (§1.14) | one cream pill sliding in from the inline start, holding, drifting out at 100 px/s; our encouraging line | **Two stacked tickers**, each a cream pill with a **paw-shaped left cap** and an emoji-like icon at its end, both moving **right → left** (enter at the right edge, leave past the left), each crossing in the **same time T** (so different px/s), line 2 ≈ 0.086 T ahead; content = social-proof statistics | Two tickers with our honest lines from the player's real data (D-2d1-12, §5) |
| §1.10 X appearing | a pop 0.6 → 1.06 → 1 (140 ms) for every new X; ghost X = white rects at 0.4 | Hint-applied X's **draw in stroke by stroke** on all new tiles at once, with a 0.90 tile squish: "\" **grows out of the X's centre** (length and thickness together, ≈ 0.45 → 1 in ≈ 60–70 ms), then "/" is **revealed from its top-right tip to its bottom-left tip** (≈ 130 ms), the whole X overshooting to ≈ 1.10 and settling by ≈ 270 ms (critic re-measure, §4.4); the mouse's X **pops** from 1.15 to 1 (170 ms). Ghost X = **white outline** (1.5 px) with ≈ 10 % white inside, spring pop, 60 ms stagger | Draw-in for player and hint X's, pop for the mouse (D-2d1-8, §4.4); new ghost (§3.3) |
| §1.13 points | the Score rolls 360 ms and bumps; "+576" chip at the number's inline end | "+576" (orange, white outline) pops **one pitch above the placed tile**; a **yellow star** flies from it to the Score (quadratic Bézier, ≈ 530 ms); the Score then **counts up** 0 → 576 in 350 ms (quadratic ease-out, every frame, **no bump**) in a sparkle burst | Over-the-tile "+N", star flight, count-up (D-2d1-4, §2.5) |
| (new) completion feedback | — | When a **colour** (v2) or a **row / column** (v3) is complete: a short gold exclamation label with a dark-brown outline under the anchor tile; for lines also a bump + glow wave along the line, 33 ms per tile | Our own label word and the wave (D-2d1-6, §4) |
| (new) the hint's presentation | O1: a bottom sheet with a clear scrim; the board dims itself, outlines the focus, shows faint ghost X's | A **modal walkthrough**: a 75 % black dim over the whole screen with **cut-outs** (the cat's tile and the tiles to cross), a white card over the rule cards, an orange **confirm pill** (one short verb; our Apply) over the helper row, the banner hidden; closes in one frame | New O1 look (D-2d1-7, §3) |
| 02 §9.2 kitty target | the cat-less region with the **most** candidates | The kitty placed the cat of the **one-tile region** (the fewest candidates; forced in round 1) | Fewest candidates (D-2d1-2, §2.3) |
| look-spec §1.8 done veil | a found colour's tiles fade 45 % toward the page | The found cat's **own tile keeps its full colour** (a one-tile region, so the other tiles could not be seen) | The veil skips the cat's own tile (D-2d1-15, §4.7) |
| look-spec §1.16 banner | not hidden by O1 | **Hidden** while the hint overlay is open; a new ad after it closes. Absent in both level-start stills | Hide during the hint (D-2d1-13) |
| look-spec §1.11 badges | count; video badge at 0 | Confirmed live: the kitty's red "1" **swaps instantly** (no fade, no bump) to the green video badge on the action frame; the bulb's likewise after the hint | No change |

### 0.5 What does not change

The rules and the reducer's mistake model; hint and kitty stocks and charging (`hints.startStock` 5, `kitty.startStock` 3; the hint is charged when it opens, a reopen of the same board is free, 02 §9.1); O2 (the rewarded prompt) before any video; the hint engine and its explanation texts (`hint.*`, already ours); the scoring (576 + 96 per cat in a run); fish, revive and the win flow's times; the 2d layout, top bar, pills, rule cards, board geometry and X geometry; saves (still v3, nothing new stored).

### 0.6 Config the lead adds at 2d.1 L0 (`src/app/config.ts`; G1–G3 do not edit it)

Every value JS reads goes into `GameConfig`; keyframe stops and sizes no JS reads stay as custom properties at the top of the owning stylesheet (parity-spec §0.4, as in 2d).

| Key | Value | Use |
|---|---|---|
| `fx.helperPulse` | + `idleMs: 5000`, + `needsStock: true`, + `untilHelperUsed: true` (`target`, `periodMs`, `peakScale` unchanged; `'auto'` changes meaning, §4.6) | §4.6 |
| `fx.headFoundMs` | 300 → **280** | §2.7 |
| `fx.markPopMs` | 140 → **170** (now the mouse's X only, from 1.15 to 1) | §1.5 |
| `fx.markDraw` (new) | `{ squishMs: 80, stroke1Ms: 70, stroke2Ms: 130, overshoot: 1.1, settleMs: 250 }` (the 2b key `fx.markDrawMs`, `@deprecated` since 2d, stays unread; this is a new group) | §4.4 |
| `fx.mouse` (new) | `{ appearMs: 115, dwellMs: 850, exitMs: 85 }` | §1.5 |
| `fx.catPlaced` (new) | `{ celebrateUntilMs: 816, settleMs: 1400, shards: 10, shardLifeMs: 650 }` | §2.4 |
| `fx.points` (new) | `{ starAtMs: 783, flightMs: 530, countMs: 350, burstMs: 650 }` | §2.5 |
| `fx.unitDone` (new) | `{ waveStepMs: 33, labelMs: 720 }` | §4.1–§4.3 |
| `fx.hint` (new) | `{ dimMs: 300, ghostFirstMs: 333, ghostStaggerMs: 60, ghostPopMs: 500 }` | §3 |
| `fx.tickers` (new) | `{ enabled: true, delayMs: 150, crossMs: 9000, lead: 0.086, reducedHoldMs: 3000 }` | §5 |
| `layout.hint` (new) | `{ cardW: 334.4, cardMinH: 70.3, cardGap: 5.9, applyW: 278.7, applyH: 59.3, applyGap: 31 }` (× s) | §3.2 |
| `kitty.revealMs` | 600 → **820** (the board stays locked while the cat celebrates) | §2.4 |
| `ads.banner.hideDuringHint` (new) | `true` | §3.2 |
| `@deprecated phase2d.1` | `fx.mouseStaggerMs`, `fx.startToast` (unread once 2d.1 is built); `fx.levelPoints.rollMs`, `plusMs`, `plusRisePx` are no longer read by the Score column (the period counter keeps its own `fx.win` keys; `reducedPlusInMs` / `reducedPlusOutMs` stay in use, §2.5) | §7.2 |

### 0.7 Conventions

As look-spec §0.5: s is the game screen's scale; sizes are CSS px at s = 1 and multiplied by s unless marked "fixed"; "slot" = tile + gap; "pitch" = slot in px. **New** marks a file that does not exist yet. Decisions are `D-2d1-N` (§9).

---

## 1. The mouse

### 1.1 What the recording shows (v1)

The recording begins after the tap and any video: a grey mouse head already sits on tile (2,4) of an otherwise empty board. It then **visits three tiles in turn**: (2,4) → (8,6) → (0,5), far apart and not in reading order. On each tile it sits for 0.75–1.0 s with a moving face (a blink, sideways glances, a grin with the mouth open). When it leaves, the tile's **X pops in under it** at about 1.15× and settles to 1× over ≈ 170 ms, while the mouse shrinks to ≈ 0.77× and fades over ≈ 85–100 ms. **In the same frame** the mouse appears on the next tile, which does a short "press" bump (≈ 0.88× back to 1× in ≈ 70 ms; 0.85–0.90 measured) while the mouse grows from 0.5× to 1× over ≈ 115 ms. There is no flight path and no trail. Three tiles take ≈ 3 s. Nothing else on screen reacts (Score, labels, heads, badges, dim, pulse all unchanged; the mouse keeps its green video badge). All three tiles were empty and are not in the solution.

### 1.2 Flow (unchanged from 2d up to the dispatch)

| Step | Rule |
|---|---|
| Tap | The mouse disc presses to 0.90 and fires on release (§4.5). O2 opens with placement `'mouse'` (2d): Watch video / Not now on FBIG; the free grant or the countdown on the web (the shared fallback cooldown). No stock: one video (or one free grant) per use. |
| Grant | `pickMouseCells(state, cfg.mouse.cells, mouseSeed(id, uses))` → `MOUSE { cells }` (2d). **Change:** `pickMouseCells` returns the cells **in pick order** (the order of the seeded partial shuffle), not sorted: that order is the visit order. |
| Reducer | Unchanged (2d): every listed tile that is still Empty and not in the solution becomes a Mark at once; `MARKED { cells, source: 'mouse' }`; then **`UNITS_DONE`** when a mark completes a unit (§4.1). |
| Board | Plays the visits (§1.5). The state already holds the marks; each X stays hidden (`.fx-pend`, 2d) until the mouse leaves its tile. |
| Lock | **New:** the board and the tools stay locked for the whole run: `helper-flows.onMouse` keeps its `runBusy` open for `mouseRunMs(cells.length, reduced)` after the dispatch (`GameView.inputLocked`, so taps, paints, the keys H/K/M and the tool buttons are ignored; `HelperHost` gains `reducedMotion(): boolean`, G1-internal). Ending the session or leaving the board ends the run (`alive()` false). `[DECISION]` (not seen; a tap during the run could otherwise unmark a tile whose X is still hidden). **The tools keep their look while locked** (critic): the original's discs and badges do not change during the mouse run (v1) or the kitty's celebration (v2), so a busy tool row (`inputLocked`, or status `kitty` or `hint`) makes the tools inert without the 2d disabled fade (`.tool:disabled` opacity 0.45): G3 sets `data-busy` on `.tool-bar` from `GameView` and `.tool-bar[data-busy] .tool:disabled { opacity: 1 }`. The board gets `aria-busy="true"` for the run. |

### 1.3 Cells and order

- **Which tiles** (2d rule, confirmed): Empty tiles (no mark, no cat, not wrong, not given) outside the solution, `min(cfg.mouse.cells, candidates)` of them, uniformly at random with the engine's seeded RNG.
- **Order** (new): the visit order is the pick order. Consecutive tiles are not forced apart (the three observed tiles were in different rows, columns and colours and did not touch, which happens in about one random draw in three: 32.6 % of the 59 640 triples of the 72 non-solution tiles, critic's exact count; one sample cannot show a spreading rule).
- **Fewer than 3 candidates:** the mouse visits the 1 or 2 there are (the video was still the price; the button is disabled at 0 candidates, 2d). The run time scales with the count.

### 1.4 The sprite (our drawing, G2)

| Item | Spec |
|---|---|
| Art | `board-mouse` (new symbol set, G2): **our** `tool-mouse` face (2d: a grey round head `#B8B4BC` with a lighter muzzle `#D9D6DC`, two large round ears with pink insides `#F2A3B4`, black bead eyes with a catchlight, a small pink nose, two white front teeth, three thin whiskers per side), built from parts so the eyes and mouth can move: an eyelid pair (blink), the pupils (glance), an open-mouth variant (grin). No outline, no shadow. Drawn by us; never from a frame. |
| Size | **0.88 T wide × 0.77 T tall** (ears included), centred horizontally, its centre **1 % T above** the tile centre; the same size as the icon in the helper disc. It never leaves its tile at rest. |
| Layer | one element per board, `.board__mouse`, absolutely positioned over the visited tile (above the tile and its X, below the hint dim and every overlay); `aria-hidden`, `pointer-events: none`. |
| Face per visit `[DECISION]` | visit k plays face `k mod 3`: 0 = **blink** (eyes close from +130 ms, closed +180 to +280, open by +420), 1 = **glance** (pupils left at +450, right at +620, centre at +780), 2 = **grin** (mouth opens at +200, eyes narrow, a 2° head tilt, back at +760). Our timings, shaped on the observed ones. |

### 1.5 Per-visit timeline (t = 0: the mouse appears on the tile)

| t (ms) | What happens | Measured on |
|---|---|---|
| 0 | **Tile press bump**: the tile drops to scale **0.88** in the first frame and returns to 1.0 over `0 → 70` ms, ease-out, about its centre; its colour does not change (critic: 0.87–0.90 on both measured arrivals, at their second frame; the analysts' 0.85). **Mouse in**: scale 0.5 → 1.0 over `fx.mouse.appearMs` (115), ease-out, no overshoot; opacity 0 → 1 over the first 50 ms. Origin: the sprite's centre. | B 242–375, C 1108–1192 |
| 115 → `dwellMs` | Idle face (§1.4). Scale and position stay still. | B blink 375–660, glances 690–960; C grin 1192–2075 |
| `dwellMs` (850) | **X in**: the tile's X becomes visible **under** the mouse at scale **1.15** (opaque at once) and eases to 1.0 over `fx.markPopMs` (170), ease-out. **Mouse out**, starting in the same frame: scale 1.0 → 0.77 over `fx.mouse.exitMs` (85), ease-in; opacity 1 until +35, then → 0 at +85. No tile bump on exit. | A 158–242, B 992–1075, C 2075–2192 (dwell 750 and 975) |
| `dwellMs + exitMs` (935) | The mouse is gone; **the next visit starts in the same frame** at its tile (t = 0 again). | A→B 0 ms gap, B→C 16–33 |

`mouseVisitMs = dwellMs + exitMs` (935). `mouseRunMs(k, reduced) = k × mouseVisitMs + markPopMs` (2 975 for 3 tiles), or `fx.reducedMotionFadeMs` with reduced motion. The first visit starts when the board receives `MARKED { source: 'mouse' }` (the O2 card and any video have closed by then). (Critic re-measure at 60 fps: arrivals at 242 and 1 108 ms, so one full visit took 866 ms on B and ≈ 1 084 ms on C; 935 is their rounded mean minus the idle-face variation.)

**Safety finaliser (critic):** whatever the animation state (a hidden page throttles timers and pauses CSS animations), when `mouseRunMs` has passed since the `MARKED` event the board removes every remaining `.fx-pend` and the sprite, so no X stays hidden after the lock ends; a props render (restore, Retry, new board) does the same at once.

### 1.6 Sound, haptics, screen readers, reduced motion

- **Sound (ours; none measured):** a new `mouse` sfx (two short high squeaks, ≈ 120 ms) at each arrival; the existing `mark` tick and the mark haptic when each X lands. G1 schedules them from the session (`timers.later(k × mouseVisitMs …)`), since the board plays no sound.
- **Screen readers:** unchanged (2d): one utterance at the dispatch, "The mouse crossed out 3 tiles." (`a11y.mouse`). The tiles' names say "crossed out" at once (the state holds the marks). The sprite is `aria-hidden`.
- **Reduced motion** `[DECISION]`: no sprite; the X's fade in together over `fx.reducedMotionFadeMs` (150) (2d's "all at once"), and the lock lasts that long.
- **Pause:** the run keeps going if the page is hidden (CSS animations and the timers of the board; the session's lock timer uses the same clock). A restore of the board (a reload) shows the X's without motion.

### 1.7 What changes vs 2d

`fx.mouseStaggerMs` and the 90 ms stagger are retired; the visiting mouse replaces them (G2, board). `pickMouseCells` returns pick order (G1). The run locks the board (G1). New `mouse` sound (G3 audio, G1 schedules). Completion effects caused by a mouse X wait for that X to land (§4.1).

---

## 2. The cat (kitty)

### 2.1 What the recording shows (v2)

The board holds the mouse's three X's; Score 0; kitty badge "1". The finger presses the kitty disc (it dips to 0.905×) and lifts at **t = 0**. In that same frame:

- the kitty's red "1" **swaps instantly** to the green video badge (stock 1 → 0);
- the green head in the tracker is **replaced by a cat face** with a small dot in the green tint, and pops;
- the target tile (0,8) flashes with white light rays and turns pale; 8–13 two-tone green shards burst out of it and fall;
- an orange **"+576"** with a white outline pops **one pitch above** the tile;
- a yellow-to-gold **completion label** with a dark-brown outline pops **0.83 pitch below** the tile (the colour is complete: green is a one-tile region).

Then a cat head grows out of the tile, overshoots to 1.56× its resting size, holds at 1.25× with a **wink**, and settles to its resting size with a small undershoot. A **yellow four-point star** grows out of the fading "+576" and flies on a curve to the **Score**, where the number **counts up 0 → 576** inside a burst of sparkles. The tile ends in its own region colour; **no X is added** around the cat.

### 2.2 Press and badge

| Item | Spec |
|---|---|
| Press | §4.5 (disc, art and badge scale to 0.90 while pressed; the action fires on release; a 1.04 spring back over ≈ 300 ms). |
| Badge | Unchanged from 2d (look-spec §1.11): with stock the red count; at 0 the video badge when `videoRefill`, else a muted "0". The change is **instant**, in the action's frame (no fade, no bump; 2b's bump stays for increases only). |
| At 0 stock | Unchanged: the tap opens O2 (video / free / countdown); a granted kitty is used at once (02 §9.2). One video gives one kitty (`kitty.perRewardedAd` 1). The original's 0-stock tap was not recorded (§8 Q14). |

### 2.3 Which tile (D-2d1-2)

**Observed:** the kitty placed the cat of a **one-tile region** in the top row: the most constrained cell on the board (forced at once by any deduction), also the smallest region and the first row's solution cell. Our 2b rule (02 §9.2: the cat-less region with the **most** candidates) would have chosen the 14-tile region instead (critic's own solver of the sampled map: one solution; the magenta region has 14 candidates because `knowledgeFromBoard` counts marks as candidates, the mustard 13; without that rule they would tie at 13).

**Ours `[DECISION]`:** the cat-less region with the **fewest** candidate tiles after every known cat's shadow (the same knowledge as 02 §9.2: cats and wrong tiles from the board, marks are candidates); ties go to the region whose solution cell comes **first in reading order**. The cat goes on that region's solution cell (an X there is replaced, as today). On the observed board this gives the same tile; "most constrained", "smallest region" and "first row" agree on it.

Implementation (G1): `src/engine/**` is read-only, so the new picker lives in **new** `src/workers/hint-chunk.ts` (pure; imports `knowledgeFromBoard` from `engine/hint`, `shadowStep`, `applyStep`, `KnowledgeStatus` from `engine/techniques`, `solutionCell` from `engine/geometry`) and re-exports `getHintStep`. `engine-client.ts`'s lazy import and `engine.worker.ts` load this module instead of `engine/hint` directly, so the hint chunk and the worker carry it and the main bundle does not grow. `engine/hint.ts`'s `pickKittyCell` stays (golden tests, `reveal_fallback`). 02 §9.2 is updated at integration (Appendix B). Accepted consequence (critic): a `reveal_fallback` hint (no deduction left to teach) still places its cat in the region with the **most** candidates, while the kitty uses the fewest; both are correct cats, and `src/engine/**` stays read-only.

### 2.4 The cat-placed sequence on the board (every correct cat; G2)

`[DECISION]` D-2d1-3: the same sequence plays for **every** correct cat: the kitty's, a hint's `placeCell`, and the player's double tap (the recordings show only the kitty's; one celebration for one meaning). It never blocks input for player cats (status stays `playing`); the kitty's cat keeps the board locked through `kitty.revealMs` (820, the end of the celebration) as today.

**Resting cat** (§4.7): ear tips to chin **0.77 T** tall, **0.78 T** wide, centre **2 % T above** the tile centre (2d draws it at 0.84 × the slot ≈ 0.91 T: smaller now). Our Tux art; idle moods unchanged.

| t (ms) | Cat (scale × the resting size F; origin 50 % 80 % of the sprite box, near the chin) | Tile and around it |
|---|---|---|
| 0 | not drawn yet | **Flash**: white light rays from the tile centre (a conic burst inside the tile, our drawing) and the tile lightens strongly (0 → 50 ms); a pale yellow-green halo spills ≈ 0.25 T into the gaps (`#FEFFEA`, 33 → 83 ms) |
| 16 | appears at **0.30 F** over the flash | |
| 116–133 | **1.56 F** (peak, ease-out from 0.30; ≈ 1.2 T wide: it overflows its tile, drawn above the neighbours) | |
| 133 → 600 | | **Light** on the neighbours: a soft white radial glow ≈ 1.5 T around the tile lightens the 8 neighbours by up to 25 % (peak at 300, gone by 600) `[DECISION]` (the recording shows the left neighbour glowing lavender; the others were off-screen or covered) |
| 133 → 733 | | **Twinkles**: 6 four-point sparkles (3–7 s px; white, pink, light cyan) twinkle within 1.5 T |
| 200 → 366 | | the tile holds a pale tint (the region colour mixed ≈ 65 % toward white; measured `#E2FFC8` (cc) on green) |
| 300 | **1.25 F** (from 1.56, ≈ 170 ms) | |
| 300 → 816 | **celebration**: held at 1.25 F (ears ≈ 7 % T above the tile's top edge), **winks** from ≈ 350 to ≈ 780 (one eye a closed arc; our new mood `wink`) | |
| 366 → 733 | | the tile returns to its own region colour; **no lasting change** (no tint, ring or badge) |
| 816 → 950 | shrinks 1.25 → **0.89 F** (ease-in-out) | |
| 950 → 1 400 | recovers to **1.0 F** (slow ease-out); then the 2b idle (blink, breathe) | |

**Shards** (G3, screen fx layer, because they leave the board): `fx.catPlaced.shards` (10; 8–13 measured) irregular rounded chunks, **two-tone** (lit face = the tile's region colour, shaded face = that colour × 0.82, a small light highlight), 9–16 s px across (the first few up to 22). At t = 0 they burst radially from the tile centre (speed 0.3–0.5 px/ms × s, mostly up and sideways), then fall under **gravity ≈ 900 px/s² × s**; from ≈ 430 ms they shrink and fade; all gone by `shardLifeMs` (650). Drawn above the board and the HUD, below the labels and overlays; `aria-hidden`.

**Final audit (B3, B4; re-measured on (0,8) in v2):** the flash's rays and halo are no longer children of the fading wash (they rendered at ≈ 0–0.18 of their opacity): the wash is its own layer under the rays, the rays show at full strength from the first frame to +50 (near-white share of the tile 10 / 7 / 16 / 20 % at +0 / +16 / +33 / +50 against the recording's 12 / 18 / 23 / 22 %; was 0 / 0 / 0.6 / 4.7), and the halo is the measured near-white `#FEFFEA` (no tile colour in it). The shards are drawn 9–22 s px (their boxes 1.2 × that), start 0.25–0.5 T out along their way at ≥ 0.9 of their size, fly all round but straight down (measured: "mainly up, left and down"), and for their first 150 ms fly inside the cat's cell, over its flash and **under the popping cat** (measured draw order), then in the fx layer.

**Reduced motion:** the cat appears at F (2b's reduced cat), no flash, shards, light or twinkles.

**Interrupted (critic):** a player cat can be taken back while its sequence runs (`CAT_REMOVED` after `input.cellLockAfterCatMs`): the board cancels that cell's sequence at once (sprite, flash, tint and light end; the tile shows its new state); the shards, "+N" and star already in the fx layer finish (the points were scored). A props render (restore, Retry, new board, language change) cancels every running sequence.

### 2.5 "+N", the star and the Score count-up (G3)

Played on **`POINTS`** (2c.1; only when the cat scored: gained > 0), anchored at the cat's tile. A cat that does not score (its row already scored) gets the board sequence of §2.4 but no "+N".

| t (ms) | "+N" | Star | Score |
|---|---|---|---|
| 0 | pops in centred **one pitch above** the tile's centre: scale 0.53 / opacity 0.44 → 1.0 at 83 (opacity 1 by 33) → **1.15** at 166–216 → 1.0 at 350; no drift | — | shows the total **before** this cat (unchanged) |
| 683 → 916 | fades in place (opacity 1 → 0.4 by 900, then removed) | — | |
| 783 | | **born** low on the "+N", at **P0 = the "+N" centre + (−4, +9.5) s** (near the digits' baseline; critic re-measure: born at (363, 244) under the label centred at (367, 234.5)), 5 → 22 s px by 850 | |
| 800 → 1 330 | | **flies** to the Score number's centre on a **quadratic Bézier** from that P0, **C = (P2.x + (P0.x − P2.x) / 3, P0.y)**, P2 = the Score number's centre (in RTL the bar mirrors and P2 moves with it; the formula holds both ways); the curve parameter is linear in time over `fx.points.flightMs` (530). A trail of small four-point sparkles (3–7 s px) fades behind it in ≈ 150 ms | |
| 1 330 | | lands: becomes the **burst** | **count-up** from the displayed value to the new total over `fx.points.countMs` (350): each frame shows `round(from + (total − from) × (1 − (1 − u)²))`, u = elapsed / 350 (for 0 → 576 at 60 fps exactly the measured 0, 54, 104, 153 … 575, 576). **No scale bump, no colour change**; the number stays centred in its column. |
| 1 330 → 1 980 | | **burst**: 8–12 four-point sparkles (4–15 s px) spread ≤ 30 s px around the number and the "Score" label, drift outward, shrink and fade; a warm yellow glow behind the digits peaks at 1 400–1 500 | |

| Item | Spec |
|---|---|
| "+N" look | `fish.plus` ("+{count}", 2c.1 key, ours) in our display face; **digit height 18.3 s px** (≈ 26 s px font); fill **`--plus` `#FB8515`** (measured (cc)); a **2 s px white outline** (SVG text, `paint-order: stroke`, stroke 4 s px white) and a soft warm drop shadow (`0 2px 3px` of `#E8D7D6`, × s). Clamped so its outer edge stays ≥ 3 px inside the viewport (the measured one ends 3 px from the right edge). |
| Star look | our four-point star (`fx-star4`, G2 art): core **`#FFFD79`** (cc) fading to `--gold` at the tips, a soft glow 1.5× its size; while climbing fast the glow stretches into a short streak along the path (CSS `scaleY` up to 1.6 on the glow only). |
| Queue | Display = the total of the last star that **landed**. A star landing while a count-up runs restarts it from the number on screen to its own total; a newer POINTS never lowers the number. A props render (first render, restore, Retry, new board, language change) sets the number to `GameView.points` at once and cancels flights and count-ups. |
| Win | The last cat's sequence plays during the win flow (it ends at ≈ 2 s; the period counter appears in the heads pill at t = 1 000 and does not collide); `[data-final]` turns the number `--accent-text` when the board is full (2d). |
| Accessibility | All of it is `aria-hidden`. The POINTS announcement (2c.1, "… 576 points.") and the Score's `role="img"` name (`game.points.a11y`) take the new total **at once**. |
| Sound (critic) | a new `points` sfx (ours: a soft bright "ting") when the star lands. Sounds are played by the app layer, never by `ui/` (as 2b's fish plink, `win-flow.ts`): **G1** schedules it with the session's timers at `fx.points.starAtMs + 17 + fx.points.flightMs` (1 330) after `POINTS`, cancelled by a props render; with reduced motion it plays with `POINTS`. One per landing star. |
| Reduced motion | the "+N" fades in and out in place over the tile (`fx.levelPoints.reducedPlusInMs` / `reducedPlusOutMs`, 2c.1); no star, burst or count-up; the Score changes at once. |
| Where | the game screen's fx layer (`.game-fx`, above the board and the HUD rows, below every overlay; 2d's toast layer). The Score's count-up is a game-bar method (§7). |

**Final audit (B5, B6):** the star is a plump lemon star (body `--star-core`, a lighter lemon ring, gold only on the points' outer fifth; measured `#FFFD78` body); its streak is 2.2 × its size and its own layer under the trail's sparkles, which are 4–8 s px with a cream body so they read over it (5–8 visible, as measured); the landing burst has no glow over the digits: the Score column shows a near-white halo **behind** the number and its label while it counts (`.points-pill[data-counting]::before`, `--score-halo-rgb`; measured `#FFF5F0` 22 px out, ours `#FDF5F1`), and its ten sparkles are spaced all round the number and label. The star lands at +1 330 (the recording's arrival frame +1 316, its count-up from +1 333): one frame, inside §7.8's tolerance; the count-up's frames match the recording's.

**Contrast:** the orange "+N" is 2.23:1 on the page (white outline aside). It is decorative and transient and its number is announced and shown in the Score column, so it joins the parity exceptions of D-2d-6 as **D-2d1-16** (§8 Q13 offers the darker `--accent-title`).

### 2.6 Completion label

The kitty's cat completed its colour (a one-tile region), so the label of §4.3 showed with it, anchored at the cat's tile. The rule for when and where is shared with the hint (§4.1–§4.3).

### 2.7 The tracker head (D-2d1-5; G3 with G2 art)

| Item | Spec |
|---|---|
| Found state | When a colour gets its cat (`REGION_DONE`, unchanged trigger), its head's silhouette is **replaced by our cat face** (the board's Tux face, front view, eyes open: `cat-idle`, already drawn; G2 may add a simplified `cat-face-small` if it reads poorly at 21 px) about the head's size (**21 × 20 s px**; black fur ≈ 19.7 × 16.7 s), plus a **colour dot**: a circle **8 s px** in that colour's **50 % tint** (`mix(region, #fff, .5)`, the same tint as the silhouette) with a **1 s px white rim**, centred at the head centre **+ (7.8, 6.6) s** (inline-end, lower), slightly outside the face. |
| Pop | in the `REGION_DONE` frame: scale **0.56 → 1.20 at 83 ms → 1.0 at 280 ms** (`fx.headFoundMs` 280), origin the head centre; no fade, no glow. |
| Lost | `CAT_REMOVED` that undoes the region: back to the tinted silhouette with a 150 ms cross-fade (2d), no pop. |
| Restore, Retry, new board | set without motion (2d). Reduced motion: swap in place. |
| Others | the other heads never move (the star passing over the pill leaves them untouched). |
| DOM | `.pill--heads > .head[data-color][data-done]`, where `.head` becomes a `span` holding `svg.head__shape` (the silhouette) and, while done, `svg.head__face` + `span.head__dot` (§7.5). |

### 2.8 Stock rules

Unchanged: 3 kitties to start (`kitty.startStock`); one per use, debited before the dispatch and saved at once (02 §9.2); at 0 the video badge (`videoRefill`) and O2; one video or free grant = one kitty, used at once. The recordings show "1 → video badge" live and "kitty 0 with the video badge" at a level start, both matching 2d.

### 2.9 What changes vs 2d

The kitty's target rule (G1); the cat-placed sequence for every correct cat (G2 board, G3 shards); the "+N" / star / count-up instead of the roll, bump and inline chip (G3); the tracker face and dot instead of the full-colour head (G3, D-2d-9 replaced); `kitty.revealMs` 820 (lead); the 2b kitty sparkle (`sparkle()`) and the `surprised` mood on the kitty's cat are replaced by this sequence.

---

## 3. The bulb (hint)

### 3.1 What the recording shows (v3)

The board holds a cat on (0,8) and three X's. The finger presses the bulb (0.895×) and lifts at **t = 0**:

- the overlay opens **at once**: a white **explanation card** over the rule cards and an orange **confirm pill** (one short verb, 5 glyphs; our Apply) over the helper row, at full opacity with no entrance animation; the **banner disappears**;
- a **black dim** fades in linearly over ≈ 0.30 s to ≈ 75 %, over everything (top bar, pills, rule-card strip, board, helpers) **except** the cat's tile and the 16 tiles the hint will cross, which stay bright and unchanged (no ring, glow or scale; the gaps between them are dimmed; an existing X in the same row stays dimmed);
- from +333 ms, **ghost X's** pop in one by one, 60 ms apart: the cat's **row left → right**, then its **column top → bottom**, then the one remaining neighbour. Tiles already marked, and the cat, take no time slot.

The card's sentence (one sentence, ≈ 13 words, two lines) names the deduction: the placed cat rules out its row, its column and the tiles touching it, so those tiles should be crossed out. It does not name tiles. The screen stays still until Apply.

On the confirm pill (pressed to 0.90, fires on release): dim, card, pill and ghosts vanish **in one frame**; the 16 tiles squish to 0.90 and their **real X's draw in stroke by stroke, all at once** ("\" grows out of the centre, then "/" is revealed from its top-right tip, the X overshooting to ≈ 1.1; ≈ 0.25 s, §4.4); row 0 and column 8 are now complete, so each gets a **bump + glow wave** (33 ms per tile) and a **completion label**; the bulb's "1" has become the video badge; Score and tracker do not change.

### 3.2 The open overlay (O1, rebuilt; G3)

| Part | Spec (sizes × s; positions relative to the board card's rect from `GameScreen.boardRect()`) |
|---|---|
| Trigger | unchanged (`helper-flows.onBulb`: stock check → O2 if 0 → engine → debit → `HINT_OPEN` → `router.open('hint', …)`), on the bulb's **release** (§4.5). |
| Dim | `svg.hint-dim`: one full-viewport path filled **`rgba(0,0,0,.75)`** with **holes** (even-odd) at the **tile rects** of the cut-out cells (`cellRect(i)`, the tile without the gap), each a rounded rect with the tile radius. It fades in **linearly over `fx.hint.dimMs` (300)** from the open frame (critic re-measure: linear, ≈ 297 ms, extrapolated start one frame before the first dimmed frame). No fade-out (§3.4). It covers the whole screen, the top bar and the helper row included. Rebuilt on resize, and **once more at `dimMs`** (critic): `cellRect` is a transformed client rect, so a tile still squishing or waving from the player's last X when the bulb is released would give a hole ≈ 10 % off for those first frames. |
| Cut-outs | `hintCutouts(step, cells)`: the step's `focusCells`, its `effectCells` that are **Empty** on the board at open, and its `placeCell`; for `mistaken_mark` the mark to clear. The tiles under the holes are the board's own (their ghosts show through, §3.3); no ring, glow or scale. Existing marks in the effect list are not cut out (the measured (0,5) stayed dim). |
| Card | `.hint-card`: width **334.4**, min-height **70.3**, centred on the column, its **bottom 5.9 above the board card's top** (it covers the rule cards; at 402 × 874 it spans y 174.0–244.3 as measured); it grows **upward** when the text needs more lines, never above y0 + bar height; text that still does not fit (a long translation at 320 × 568, 2× text) scrolls inside the card (`max-height`, `overflow-y: auto`), never covering the board (critic). Radius **15**; fill **`--hint-card` `#FFFCFA`** (measured (cc)); no border; shadow `0 2px 8px rgba(0,0,0,.25)`. No icon, no title on screen (the visually hidden title stays). |
| Card text | our `hint.*` sentence (unchanged keys and words; rich text with colour swatches, PAR-7), **left-aligned** (inline start), `max(10px, 14.5 s px)`, line-height **17 s**, `--ink` (5.34:1 on the card), padding-inline **18.3**, the block centred vertically (≥ 12 s above and below). The shadow step's sentence (`hint.shadow`) has the same role as the original's. **Final audit B9:** in the display face (as the original's rounded face), thinned like the rule text (a 0.05 em stroke in the card's colour), measured stroke ≈ 1.1 px; **B13:** the colour name's underline scales with the text (`max(1.5px, 0.16em)`, offset `max(1.5px, 0.14em)`), so on three lines at 320 px it clears the next line. |
| Apply | `button.hint-apply`: a pill **278.7 × 59.3**, radius half its height, its **top 31 below the board card's bottom**, **centred on the column** `[DECISION]` (the original's sits 6.9 px right of centre, an anchoring quirk). Fill **`--apply` `#D38025`** (the measured `#F0912A` darkened along its own hue until white reaches 3.05:1 for large text; ΔE00 6.5; D-2d1-16, §8 Q12); label `hint.apply` (ours since Phase 2, a one-word generic command; D-2d-0 e) white, **28 s px**, Fredoka 600 + the 0.04 em text stroke (D-2d-7); no shadow. It covers the helper discs and their badges, so the bulb's badge change under it is hidden (as in the original). Final audit B15 (accepted with this `[DECISION]`): centred, Apply leaves the mouse's dimmed video badge 7 px past its right end (the original's, 6.9 px further right, leaves 1.4 px). |
| Banner | **hidden** while the overlay is open (`ads.banner.hideDuringHint`, D-2d1-13; FB: `hideBannerAdAsync`); after close it shows again at once if `ads.banner.minReloadSec` has passed since the last load (a new `loadBannerAdAsync`), else **one timer** re-shows it when that window ends, if the same game screen is still up with no modal open and the board not won (critic: the original showed a new ad in the frame after close; 2d's "next eligible screen mount" would leave the band empty for the rest of the level. One timer per close, never a retry loop, so Meta's window is never hit early). This is the only modal whose close re-shows the banner on the game screen (`banner-flow.ts`'s 2d `modalClosed` rule changes for O1 only). The band stays reserved, so nothing moves. |
| Bulb under the dim | it springs back from its press (§4.5) under the dim. |
| Placement fallback | The 2b sheet placement (`sheetPlacement`, `avoidRect`, `data-placement`, the FB top inset) is retired: the card and Apply are anchored to the board, which always leaves room for them (layout check at 320 × 568 FBIG with the band: card y ≈ 80–130, Apply y ≈ 434–476, banner from 509). |
| Tutorial (step 5) | the same look; not closable (2b: Apply only); the coach card hides while the hint overlay is open (no second dim). |

### 3.3 Ghost X's (G2, board)

| Item | Spec |
|---|---|
| Where | each **Empty** effect cell (`.cell[data-ghost=x][data-s=e]`, 2b selector kept). |
| Look | the X's **outline only**: one path `path.cell__xo` = the **union outline** of the two X bars (no inner crossing lines), **outer tip-to-tip 77 % of the tile** (the real X is 74–75 %), stroke **1.5 px white** (`vector-effect: non-scaling-stroke`), fill **`rgba(255,255,255,.10)`** over the tile; no shadow. G2 computes the path once from `layout.mark` (`xOutlinePath()`), the real X grown by 0.8 px per side at T = 39. With Colour patterns on, the outline gets the X edge colour underneath (a 3 px `--xe` stroke below the white one). Replaces 2d's "white rects at 0.4" and 2b's `ghost-pulse`. |
| Order | `ghostOrder(step, cells, n)`: for a `shadow` step, the focus cat's **row left → right**, then its **column top → bottom**, then the remaining cells in **reading order**; for every other kind, reading order. Only Empty effect cells are listed (marked tiles and the cat take no slot). |
| Timing | ghost i appears at **`fx.hint.ghostFirstMs` + i × `ghostStaggerMs`** (333 + 60 i) after the open, set as `--gd` per cell; each pops over `ghostPopMs` (500): `0 % scale .25 opacity .3 → 12 % opacity 1 → 13 % scale 1 → 27 % 1.22 → 47 % 1 → 60 % .92 → 100 % 1`, origin the tile centre. Then still (no idle pulse). |
| Ghost cat, ghost clear | the `placeCell` ghost cat (0.6 opacity, 2b) appears at `ghostFirstMs` with the same pop, then keeps 2b's bob; the mistaken-mark "clear" ghost keeps 2b's fade. `[DECISION]` (only the shadow step was recorded). |
| Board hint dim | the board's own hint styling is removed: `.board[data-hl='hint'] .cell { opacity: var(--hint-dim) }`, the focus ring on `[data-f]` and the `z-index` lift (the overlay dims now; the focus tile shows unchanged, as measured). The coach highlight is unchanged. |
| Reduced motion | the ghosts appear together at `ghostFirstMs` without the pop. |

### 3.4 Apply and after

| t (ms, from Apply's release) | What happens |
|---|---|
| 0 | `HINT_APPLY` (unchanged reducer) → `MARKED` (the Empty effect cells) / `CAT_PLACED` … `UNITS_DONE`. The overlay closes **in this frame**: `[data-instant]` on the hint overlay skips the shell's exit transition; the dim, card, Apply and the board's ghosts go together. |
| 0 → 250 | every new X plays the **shared draw-in** (§4.4) at the same time (no stagger), with its tile's 0.90 squish. |
| 0 → ≈ 600 | each completed unit's **wave** (§4.2); the **labels** (§4.3) from 0 to 720. |
| — | Score and tracker unchanged unless the step placed a cat (then §2.4–§2.7 play). The bulb's badge already shows the new stock (charged at open). |

### 3.5 Closing without Apply, charging, reopening

- The original shows no close control and the recording does not try one. **Ours** `[DECISION]`: no visible ×. A tap on the dim outside the card and Apply, **Esc**, and the system back close it (`HINT_CLOSE`, as today); a visually hidden, focusable **"Close hint"** button (`hint.close`) stays in the dialog for keyboard and screen-reader users (it becomes visible while focused, as a 44 × 44 round button on the card's top inline-end corner, so it never lands in the FB top-left safe zone: the card always starts below the top bar). In the tutorial nothing closes it (2b).
- Charging is unchanged: the stock is spent when the hint opens; reopening on an unchanged board is free (the 2b cache). The original's moment of charging is hidden under Apply (unknown, §8 Q6).

### 3.6 Mapping onto O1 and the engine (what changes, what stays)

| Piece | Stays | Changes |
|---|---|---|
| Engine (`getHintStep`, `HintStep`) | everything: kinds, `focusCells`, `effectCells`, `placeCell`, the order of steps, the worker / lazy chunk | — (read-only) |
| `hint-text.ts` | every sentence and key (`hint.*`), the rich-text colour swatches, `unitName` | new pure `hintCutouts(step, cells)` |
| `hint-card.ts` (O1, lazy chunk) | `createHintCard`, `OverlayView<HintCardProps>`, modal, `onApply` / `onClose`, `closable`, focus on Apply, the language watcher, `hintLocation` (the screen-reader tile line; it lives here, not in `hint-text.ts`) | the sheet becomes the dim + card + Apply of §3.2; `HintCardProps` gains `cells`, `boardRect()`, `cellRect(i)`; `avoidRect`, `sheetPlacement`, `fbTopInset` and the bulb icon row retire; the × becomes visually hidden |
| `session.ts` `openHint` | the dispatch, sound (`hint_open`), announcement, analytics | passes `cells`, `boardRect`, `cellRect`; asks the banner flow to hide (D-2d1-13) |
| Board highlight | `BoardHighlight { kind: 'hint', step }`, `data-f`, `data-ghost` | ghost look, order and stagger (§3.3); no board dim |
| Reducer | `HINT_OPEN`, `HINT_APPLY`, `HINT_CLOSE` | `UNITS_DONE` after the marks (§4.1) |
| Sounds | `hint_open` on open, `hint_apply` (whoosh) on Apply, `mark` throttled; no sound per ghost (critic: stated so nobody adds one) | `unit_done` chime per action that completes units (§4.3) |

### 3.7 Accessibility and keyboard

The dialog keeps its name ("Hint"), description (the sentence + the screen-reader tile line) and modality; the board stays inert behind it. Apply has the initial focus; Enter / Space applies; Esc closes. The dim, ghosts, waves and labels are `aria-hidden`; the result is announced as today (`a11y.hintApplied`, the marks) plus the completed units (§4.3). Reduced motion: the dim appears at once (no 300 ms fade), the ghosts without the pop, the X's without the draw-in (the 150 ms fade).

---

## 4. Shared: completion, waves, the X's appearance, presses, the pulse

### 4.1 When a unit is complete (D-2d1-6; G1)

- **Observed:** after the hint, **row 0** and **column 8** each got a wave and a label: both had their cat (the kitty's, placed earlier) and every other tile crossed. Row 0 had held its cat since v2 without a label, so a cat alone does not complete a line. In v2 the **green colour** (one tile) completed with its cat.
- **Rule (ours, one rule for all three kinds):** a unit (row, column or colour region) is **complete** when it holds its cat (`Cat` or `Given`) and **every other tile is crossed** (`Mark` or `Wrong`). A unit completes in an action when it was not complete before the action and is after it.
- **Event:** the reducer emits **`UNITS_DONE { units }`** after the action's `MARKED` / `CAT_PLACED` / `POINTS` / `REGION_DONE` and before `WON`, listing each newly complete unit once, rows first (ascending), then columns, then regions. Unmarking never emits it. No state is stored: unmarking a tile and crossing it again completes the unit again (§8 Q5). `HINT_APPLY` keeps its 2b order (`HINT_APPLIED` first, then `MARKED`, `CAT_PLACED` …), and `UNITS_DONE` goes after them; `WON` is pushed inside the cat placement today, so G1 inserts `UNITS_DONE` before it. **A mistake** (a wrong cat attempt turns the tile `Wrong`) may complete a unit and emits it like any action, **except an action that ends in `LOST`**, which never emits `UNITS_DONE` (no cheer under the fail card; critic).
- **Anchor:** for each unit, the **last tile in reading order among the tiles this action changed** in that unit (observed: row 0's anchor was (0,7), its last crossed tile, not the cat's (0,8); column 8's was (8,8); the green colour's was the cat's own tile).
- **Mouse X's:** a unit completed by a mouse X waits until that X lands (§1.5); the game screen defers the unit's wave and label to the anchor's landing time, and the session (G1) defers the `unit_done` sound to the same time (`mouseLandMs(indexOf(anchor))`); the announcement is not deferred (screen readers get the state at the dispatch, with `a11y.mouse`).

### 4.2 The wave (G2, board)

For each completed unit: every tile of the unit (its cat's tile and old marks included; a tile in two complete units bumps twice) plays, starting **k × `fx.unitDone.waveStepMs`** (33 ms) after the action, where k counts from the start of the wave:

- **Lines:** the wave starts at the line's **end nearer the anchor** and runs to the other end (observed: row 0 right → left from (0,8); column 8 bottom → top from (8,8)).
- **Regions** `[DECISION]` (not observed with more than one tile): k = the king-step distance from the anchor inside the region.
- **Per tile:** scale **0.93** at +33, **1.10** at +67, held to ≈ +167, back to **1.0** by +270 (ease-out); a **pale yellow glow** around the tile from 0 to ≈ +100 (peak at +50): `box-shadow: 0 0 6px 3px rgba(255,236,150,.85), inset 0 0 6px rgba(255,255,255,.55)` (× s; the edge measured `#FFF2C0`–`#FFF6C7` (cc)). The X on the tile scales with it.
- **Reduced motion:** no wave.

### 4.3 The completion label (G3)

| Item | Spec |
|---|---|
| Word | **ours**: `fx.done` "**Done!**" (Appendix A). One short exclamation; ≤ 8 characters in every locale (meta.ts) so it fits the measured box. The original's word is not used. |
| Look | our display face, heavy (Fredoka 600 + the outline), glyph height **17.7 s px** (≈ 24.5 s px font); **vertical gradient fill `--done-top` `#EFDA25` → `--done-bottom` `#FECF3D`**; a **2.2 s px dark-brown outline `--done-line` `#813800`** that is a little heavier at the bottom (a 1 s px drop of the same colour). Drawn as SVG text (`paint-order: stroke`; stroke 4.4 s px) so the outline sits outside the fill in every engine. Box ≈ 67 × 21.4 s for six glyphs. Contrast: the outline 7.56:1 on the page, the fill 5.7–5.9:1 on the outline. |
| Position | centred at the **anchor tile's centre + (0, 0.82 × pitch)** (34.7 px below at pitch 42.1; 0.83 pitch in v2), over the tiles below it or the page under the board; **clamped** so the label's outer edge stays **≥ 2 px** inside the viewport (both measured labels near the right edge were shifted 3.2–3.3 px). **One label per anchor tile**: units with the same anchor share one label. Above the tiles, X's and shards; not clipped by the board. |
| Motion | opacity 0.3 → 1 over the first 60 ms; scale **0.78 → 1.07 at 83 ms → 1.0 at 170 ms** (back-out); no rise or drift; holds; **fades out linearly from 560 to 720 ms** (`fx.unitDone.labelMs`). (v2: hold to 583, fade 120 ms; v3: hold to 552, fade 183 ms.) |
| Sound | a new `unit_done` chime (ours: a bright two-note rise), once per action that completes units; its pitch steps up with the number of units in the action. **Skipped when the same action already plays the region chime** (`REGION_DONE`): a one-tile colour would otherwise stack `kitty` + `region` + `unit_done` in one frame (critic). Played by G1 (the session), like every sound. |
| Screen readers | the action's one utterance gains "{unit} complete." per unit (`a11y.unitDone`, `{unit}` = `unitName()`: "row 1", "column 9", "Violet"; joined with `joinList`). A region whose `REGION_DONE` is in the same action is left out of that list ("Green done." already says it; critic). |
| Reduced motion | the label fades in and out in place (150 ms each, same hold), no scale. |
| Final audit (A-1, B10) | **Overlap:** a label whose box would overlap one the same action already placed (at the pop's peak) is left out; the first (rows, then columns, then regions) says "Done!" for both — e.g. a colour lying inside one row completed with it, whose anchors are adjacent (the recordings only showed far-apart labels). **Shadow:** under the 1 s brown drop, a soft warm shadow ≈ 4 px (`drop-shadow(0 2s 2s rgba(150, 90, 70, .32))`; measured `#E1CBC3` → `#F2ECEA` → the page under the column-8 label). |

### 4.4 X marks appearing: one draw-in for player and hint X's, a pop for the mouse (D-2d1-8; G2)

- **Observed:** hint-applied X's **draw in** (§3.4); the mouse's X **pops** under the leaving mouse (§1.5). A player's own X was **not** recorded in 2d.1 (the first recording had no mark being placed).
- **Ours** `[DECISION]`: the hint's draw-in is the game's X animation: **every new X from a tap, a paint or Apply** plays it; the mouse keeps its own pop. This reverses look-spec §1.10's pop for player marks (2d's `x-pop` stays only as the mouse's pop, retimed to 1.15 → 1 over 170 ms).
- **Measured (critic re-measure, v3 at 60 fps, all 16 tiles; times from Apply's release, after the app's 67 ms hitch):** bar **"\"** first shows as a short, **thin** bar centred ≈ 2 px up-left of the X's centre, then grows **in length and thickness together** (length × thickness ≈ 0.45 × 0.53 of the final bar at +66, 0.72 × 0.79 at +83, 1.05 × 1.0 at +116): a **scale-in about the centre**, not a reveal from its top-left tip (the analysts' reading). Bar **"/"** then appears as a sliver at its **top-right tip** (+116) and is **revealed toward its bottom-left tip** at full thickness (reaches the centre at ≈ +166–183, the tip at ≈ +250; ease-out). From the end of "\" the **whole X is ≈ 1.10–1.12 ×** its rest size (both bars, length and thickness; measured on (0,0) before its wave and on (1,7), which has none) and settles back to 1.0 by ≈ +270. Tiles whose wave starts at once ((0,6)–(0,8), (7,8), (8,8)) were one frame ahead; all tiles finish together.
- **Draw-in (per tile, all new tiles of an action together; t from the action):** the tile **squishes** 0.90 → 1.0 over `fx.markDraw.squishMs` (80), ease-out; bar **"\"** scales **uniformly about the X's centre** from 0.3 to 1 over `stroke1Ms` (70), ease-out; bar **"/"** is then revealed from its **top-right** tip to its bottom-left tip over `stroke2Ms` (130), ease-out (70 → 200); the X group (`g.cell__xg`) scales 1 → `overshoot` (1.1) by 70, holds to 120 and returns to 1 at `settleMs` (250), ease-in-out. Total 250 ms.
- **Markup** (G2, `board-cells.ts`): each bar sits in its own rotated group so CSS can scale it without fighting the rotation: `g.cell__xg > g.cell__xb.cell__xb--a[transform=rotate(45 50 50)] > (rect.cell__xe) + rect.cell__x` and the same `--b` with −45 (`rotate(45)` is "\" in SVG's y-down space). The rects are axis-aligned in their group (`x 15.5 y 40.9 w 69 h 18.2 rx 6`; from `layout.mark` 0.69 / 0.182 / 0.06, checked against the 2d code). "\" (`--a`) animates `scale(0.3) → scale(1)` with the origin at the centre (`transform-box: view-box`, origin `50px 50px`); "/" (`--b`) animates `scaleX(0) → scaleX(1)` with the origin at its top-right tip (`84.5px 50px`); the group's overshoot uses origin `50px 50px`. The edge rects (patterns on) draw with their bars. The rounded end of "/" is briefly flattened while it grows (≤ 130 ms); accepted.
- **Wrong X** (`--wrong` bars and ring): unchanged, no draw-in (2d).
- **Unmark:** unchanged (the X disappears at once).
- **Reduced motion:** no squish or draw; the X fades in over 150 ms.

### 4.5 Press feedback (helper discs and Apply; G3)

| Item | Spec |
|---|---|
| Press | while the pointer is down on a helper disc (kitty, bulb, mouse) or on Apply, the whole control (disc, art and badge together) scales to **0.90** about its centre within **50 ms**, ease-out, and holds there. |
| Fire | on **release** inside the control (a normal `click`; already how the buttons fire). A release outside cancels. |
| Release | the disc springs back with an overshoot: **1.04 at ≈ 85–135 ms**, **1.0 by ≈ 300 ms** (kitty measured 0.905 → 1.04 → 1.0; bulb ≈ 1.03 under the dim). Apply has no release motion (it is removed). |
| Keyboard | Space / Enter play the same press (`:active`) without the spring. Disabled tools do not press. Reduced motion: no scale. |
| Touch (final audit B12) | `:active` does not hold while a finger is down (Chromium; iOS WebKit only with a touchstart listener), so the press is also mirrored into `[data-pressed]` from `pointerdown` to `pointerup` / `pointercancel` / `pointerleave` (`dom.ts trackPress`) and styled like `:active`. Checked in Chromium's touch emulation (a 500 ms hold reads 0.90); a real iPhone check remains. |

### 4.6 The idle pulse (D-2d1-9, replaces D-2d-11; G1 rule, G3 look unchanged)

`fx.helperPulse.target 'auto'` now means: the **suggested** helper pulses (the measured 1.5 s cycle of 2d, unchanged) only when **all** of these hold:

1. the attempt is `playing` with no overlay, hint, coach or win flow (2d);
2. **no board change** (mark, unmark, cat, mistake) for at least **`fx.helperPulse.idleMs`** (5 000) since the last one, since the board entry ended, or since the page became visible again (`visibilitychange`, FB `onPause` / resume); the pulse stops at the next board change and the idle time restarts;
3. the suggested helper is the **kitty** while every tile is empty, else the **bulb** (2d), and it is enabled;
4. with `needsStock` (default true), it has **stock > 0**: a helper showing the video badge never pulses, and the other helper does not take its place;
5. with `untilHelperUsed` (default true; critic), **no helper has been used in this attempt**: `hintsUsed` and `kittiesUsed` are 0 and the mouse has not run (the session's per-attempt mouse counter, passed in the view context). A Retry or a new board starts a new attempt.

Why condition 5 (critic): without it the rule does **not** fit v2 and v3. The board did not change between v1's end (08:55:06) and v2's start (08:56:09), ≈ 63 s, nor between the kitty (08:56:10) and v3's start (08:56:27), ≈ 17 s; the bulb had stock 1 and the board was not empty both times, so conditions 1–4 with a 5 s idle time predict a pulsing bulb at the start of v2 and v3, and none shows (the bulb disc does not change in any frame before its press). In both, a helper (the mouse) had already been used in the level. With condition 5 every observation fits: Level 96's still (untouched board, kitty stock 2: the kitty glowed), Level 96's video (five X's in one row and no cat, so no sign of a helper use; bulb stock 2: the bulb pulsed), Level 114's stills (untouched board, kitty at 0: nothing pulsed for ≥ 8 s), v1–v3 (the mouse used: no pulse). The other explanation (the original restarts its idle time when the app comes back from the control centre, where each recording began) is covered by the visibility restart in condition 2 but cannot by itself explain v2's 63 s. The idle time itself (5 s) is ours (§8 Q7). The view re-renders on the 1 s `TICK`, so the pulse starts within a second of the idle time.

### 4.7 The found cat's tile and the cat's size (G2)

- **Done-region veil** (2b, 45 % toward the page on `[data-done]`): it now **skips the cat's own tile** (`.cell[data-done]:not([data-s='c']):not([data-s='g'])`): the measured green tile under the placed cat kept its full colour. The region's other tiles still fade (01 12.8, likely; not observable on a one-tile region).
- **Resting cat:** 0.77 T tall (ears to chin), 0.78 T wide, centre 2 % T above the tile centre (§2.4); was 0.84 × the slot.

### 4.8 RTL, small screens, FBIG (critic: one place for what §1–§5 left implicit)

- **RTL:** the board stays LTR (look-spec §1.18, `i18n.css`), so everything on it is physical and unchanged in Arabic: the mouse's tiles and order, the ghost order ("row left → right" means screen left), the waves, the X strokes ("\" then "/"), the cat sequence. The hint card's text starts at the inline start (right); Apply, the "+N" and the labels are centred and clamped on both edges; the star flies to `scoreRect()` wherever the mirrored bar puts the Score (§2.5); the heads ring keeps its order from the inline start (look-spec §1.5); the tickers mirror (§5.3); the visible-on-focus close button sits on the card's top inline-end corner.
- **Small screens (320 × 568, s 0.796 web / 0.712 FBIG with the band):** every size of §1–§5 is × s (tile-relative ones follow T); the card and Apply positions were checked against look-spec §1.1's table (§3.2: card y ≈ 80–130, Apply ≈ 434–476, banner 509 on FBIG); the card's text scrolls inside it if it cannot fit between the bar and the board (§3.2); the "+N" and the labels are clamped inside the viewport; the shards are × s and leave the screen freely (they are `aria-hidden` and pointer-transparent). The `layout` e2e covers a cat in each corner tile and a hint whose sentence needs three lines in German.
- **FBIG:** the banner rule of §3.2 (hide during the hint, one re-show timer); nothing new enters the top-left 64 × 64 zone as a control (§3.5, §5.5); the rewarded flows (O2 before every video, the free fallback on the web) are unchanged from 2d.

---

## 5. The level-start tickers (replace the 2d toast; D-2d1-12)

### 5.1 What the stills show

Two cream pills stacked over the top of the HUD, both moving **right → left**: line 1 at y 151.2–180.5 (over the lower 4.5 px of the heads and fish pills and the top of the rule-card strip), line 2 at y 192.0–221.5 (over the lower halves of the rule cards). Each has a **paw-shaped left cap** (four toe beans in an arc and a main pad, the orange border following the scalloped outline) and an emoji-like icon at its right end (line 1 a lightning bolt, line 2 a star). Text: mauve ink, ≈ 16.5 px, weight ≈ 600; each line ≈ 47–55 characters of **social-proof statistics** (a very large round number of hard levels solved recently; players online from many countries). Between the stills the lines moved 324 and 306 px: proportional to each line's path (viewport + its width), so **both cross in the same time T**, line 2 ≈ 0.086 T ahead. The absolute speed is unresolved (§8 Q1).

### 5.2 Look (G3, with G2 art)

| Part | Spec (× s; y relative to y0) |
|---|---|
| Slots | line 1 **top y0 + 89.2**, line 2 **top y0 + 130.0**; each **29.3** tall. Over the HUD rows, below every overlay; `pointer-events: none`; in the game screen's fx layer (2d's toast layer). |
| Pill | fill **`--toast-fill` → `#FFF1C8`** (PNG; 2d's `#FEF0C7`, ΔE00 0.2), border **1.2** **`--toast-line` → `#E98E33`** (PNG; 2d's `#DD9045` came from the video, ΔE00 3.0), the inline-end cap a full semicircle (radius 14.65); no shadow. |
| Paw cap | `art-paw-cap` (new, G2; our drawing): at the inline start, the pill's full height; four round toe beans in an arc along the outer edge (peach `#FFCD9B`) and a large main pad (a soft gradient `#FFD4A5` → `#FFE1B5` fading into the fill); the border follows the scalloped outline. The text starts **20** from the paw's outer edge. **Final audit B8 (measured on still-a: the beans ≈ 7.8 px across form the outer edge and overhang the pill ≈ 2 px):** the cap is 28.4 × 33.5, 2.1 above and below the pill, four bordered scallops (outer r 5.4) with beans r 3.5; the pill's body (fill, border, round end) is `.ticker::before` from 8 s in, so its straight edges never run past the scallops and meet the paw's border in one line. |
| Text | `--ink` (4.85:1 on the fill), `max(10px, 16.5 s px)`, weight 600, one line, no wrap. **Final audit B7:** thinned like the labels (a 0.04 em stroke in the pill's fill): stroke 1.34 px against the still's 1.40 (was 1.87). |
| Icon | at the inline end, after the text: line 1 **`art-bolt`** (our lightning bolt, ≈ 20 × 22, 6 after the text, 3 from the border), line 2 **`art-star`** (our five-point star with a soft highlight, ≈ 26 × 22, 4 after the text, touching the border). Both new, G2. 2d's `art-flex` is retired. |
| Width | content (paw + text + icon); at most `colW − 24` (a longer translation is cut with an ellipsis; G3 checks in the i18n e2e). |
| DOM | `.tickers > .ticker[data-line=1|2][data-key=<i18n key>] > svg.ticker__paw + span.ticker__text + svg.ticker__icon`, `aria-hidden`. |

### 5.3 Motion

- **Final audit B14:** the crossing is the **game column's** (`.tickers` is the column, clipped), not the viewport's: on a wide desktop window the lines stay over the HUD and move as fast as on a phone; on a phone the column is the viewport.
- Each line starts with its inline-start edge just past the **inline-end edge of the viewport** and moves **linearly** toward the inline start until its inline-end edge has left the viewport: distance `vw + width_i`, duration **T = `fx.tickers.crossMs`** (9 000) for both lines, so speed_i = (vw + width_i) / T (≈ 100 px/s for a 440 px line at 402, the speed measured in the first recording).
- **Line 2 starts first**, `fx.tickers.delayMs` (150) after the board entry starts; **line 1** starts `lead × T` (0.086 × 9 000 = 774 ms) later.
- Each is removed when it has left. A new board or a Retry removes running tickers first.
- **RTL:** mirrored (they enter at the left edge and move right; the paw is at the inline start, on the right).
- **Reduced motion:** no movement: both fade in (150 ms) at the inline start of the column (x = 12 s), hold `reducedHoldMs` (3 000), fade out.

### 5.4 Copy: honest lines from real data (G1 picks, G3 renders; Appendix A)

We have no live player counts and no worldwide totals, so a ticker **never states a statistic we cannot back**: every number in a line comes from this player's own save or from the board itself, and the rest is plain encouragement or a true tip.

| # | Line | Key | Shown when | Data |
|---|---|---|---|---|
| 1 | Fresh start. You can do it! | `toast.start.retry` (2d) | line 1 on a Retry | — |
| 2 | A hard one. You've got this! | `toast.start.hard` (2d) | line 1 on a Hard level | — |
| 3 | Your best time here: {time} | `ticker.best` (new) | line 1, **level mode only**, when this level was won before (`progress.best[level][0]`, the ms of `LevelBest`) | the stored best time, **`formatClock`** ("4:12", the solve-time style the victory screen uses; critic: `formatDuration` is the coarse countdown style, "4 min" / "under a minute") |
| 4 | {count} cats are hiding here | `ticker.cats` (new, plural) | line 1 otherwise, half of the boards | n |
| 5 | You can solve this one! | `toast.start.level` (2d) | line 1 otherwise, the other half | — |
| 6 | You've solved {count} levels | `ticker.solved` (new, plural) | line 2 when `progress.completed` ≥ 2 | `progress.completed` |
| 7 | {count} fish this week (day / month per the period) | `period.pill.{kind}` (2c, reused) | line 2 when this period's total > 0 | `period.total` |
| 8 | {count} level points so far | `ticker.points` (new, plural) | line 2 when the lifetime total > 0 | `points.total` |
| 9 | Today's daily puzzle is waiting | `ticker.daily` (new) | line 2 when the daily is open and not solved today, **never on the daily itself** | `daily[today]` |
| 10 | Every puzzle has exactly one answer | `ticker.unique` (new) | line 2, always eligible | true for every shipped level (`levels:verify`) |
| 11 | Tip: double-tap a tile to place a cat | `ticker.tip.cat` (new) | line 2 while `progress.completed` < 20 | — |
| 12 | Tip: drag across tiles to cross out many | `ticker.tip.drag` (new) | line 2 while `progress.completed` < 20 | — |

**Selection** (`pickTickerLines`, G1, pure): line 1 = the first that applies of 1 → 2 → 3 → (4 or 5, chosen by the seed); line 2 = among the eligible 6–12, the one at index `seed mod count`. Seed = a hash of `puzzleId + ':' + attempt` (so a Retry may show another line 2). Daily and event boards use the same pool **without line 3** (critic: an event's index is not a level number, so `progress.best[index]` would show another level's time; a daily has no level). Our copy keeps the original's **role** (two short upbeat lines) but not its content type (worldwide statistics).

### 5.5 When

On a **fresh board or a Retry** (2d's trigger: G1 calls `GameScreen.playTickers(lines)` from `playBoardEntry()`), never on a resumed board, a revive or the tutorial, and not when `fx.tickers.enabled` is off. Once per board. `aria-hidden` (decorative; the facts are elsewhere: Home, the period pill, the level title). Not O9. No sound. On FBIG at 320 × 568 with the band (y0 0.1, s 0.712) line 1's top edge is at ≈ y 63.6, the bottom edge of the top-left 64 × 64 safe zone; the lines are not controls and take no pointer events (look-spec §1.1 accepts the same for the pills row).

---

## 6. Palette

### 6.1 The colours observed (PNG values; L* C* h from `de00.py`)

| Colour | Hex | Level 96 (10 × 10) | Level 114 (9 × 9) | L* C* h° | White X on it | Ours |
|---|---|---|---|---|---|---|
| green | `#AED994` | ✓ | ✓ (1 tile) | 82 40 132 | 1.60 | 3 Lime |
| teal | `#48B5B2` | ✓ | ✓ | 68 32 194 | 2.46 | 5 Lagoon |
| sky | `#6BBCE7` | ✓ | — | 73 32 246 | 2.11 | 6 Sky |
| grey-blue | `#A7BFD7` | ✓ | ✓ | 76 15 259 | 1.90 | 10 Slate |
| **slate / denim blue (new)** | **`#5B75B2`** | — | ✓ | **50 36 282** | **4.53** | **4 Denim** (was Mint) |
| purple | `#9778D6` | ✓ | ✓ | 57 55 306 | 3.52 | 7 Violet |
| magenta | `#EB85B7` | ✓ | ✓ | 68 46 349 | 2.45 | 8 Orchid |
| pink | `#FAB4D0` | ✓ | ✓ | 80 30 352 | 1.68 | 11 Pink |
| salmon | `#D57374` | ✓ | — | 60 42 24 | 3.21 | 0 Coral |
| orange | `#FFAA6D` | ✓ | ✓ | 77 51 60 | 1.87 | 1 Apricot |
| mustard | `#E4BB49` | ✓ | ✓ | 78 61 87 | 1.83 | 2 Mustard |

The eight colours both levels share match **exactly**, so the original's palette is fixed and each level uses a subset of at least 11 colours. Its 50 % head tint is `#ADBAD8` (measured `#ADBAD9`).

### 6.2 What changes (D-2d1-10; G2, the name at L0)

- **Index 4** becomes **Denim `#5B75B2`** (measured), replacing our Mint `#52A982`. Name `color.4` "Mint" → **"Denim"** (ours; our "Slate" is already the grey-blue). Index 9 **Cocoa `#B0855A`** (ours) stays as the only invented colour.
- **Tiers** (`regionColorsFor`): **n ≤ 11 draws from the 11 measured colours** {0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11} (k = 11 for `assignColors`, which already takes more colours than regions), **n = 12 adds Cocoa** (all 12). So a 9 × 9 or 10 × 10 board may leave out any measured colour, as the original does, and never shows an invented one. `PALETTE_CORE` becomes these 11 indices.
- **Why keep Cocoa rather than Mint** for the 12th: Mint's nearest measured colour is teal at ΔE00 **13.5**, Cocoa's is orange at **16.5**; with Cocoa the tritanopia report has one pair under 10 fewer (8 vs 9). Neither lowers the minimum pair.
- **Tutorial** (`TUTORIAL_COLORS [3, 7, 2, 0]`), How to play's mini boards and event motifs: no index-4 use needs a change except a mini board that shows Mint (G3 checks `how-to-play.ts`; any such tile now shows Denim, and its glyph follows §6.4).
- `PALETTE_DE00` is recomputed by `npm run palette:check`; `tokens.css --r4` = `#5B75B2`.

### 6.3 Distinctness (ΔE00, CIEDE2000, and the Machado CVD report; `scratchpad/2d1/palette/de00.py`)

| Set | Min pair | Next pairs | Protanopia min (pairs < 10) | Deuteranopia | Tritanopia |
|---|---|---|---|---|---|
| the 11 measured | **10.40** sky / grey-blue (both measured) | 11.13 magenta / pink; 14.19 **denim / purple** | 3.34 (9) | 4.11 (8) | 4.78 (7) |
| 11 + Cocoa (**2d.1, 12 colours**) | **10.40** | 11.13; 14.19 | 3.34 (9) | 4.11 (9) | 4.78 (8) |
| 11 + Mint (rejected) | 10.40 | 11.13; 13.52 teal / mint | 3.34 (9) | 4.11 (9) | 4.78 (9) |
| 2d's 12 (10 + Mint + Cocoa) | 10.40 | 11.13; 13.52 | 3.34 (9) | 4.11 (9) | 4.78 (10) |

Denim's nearest colours: purple 14.19, grey-blue 23.85, sky 24.16, teal 31.22. Every pair stays above `MIN_DE00` 10. The CVD minima are the same as 2d's (they come from measured pairs; informational, as in 2d).

### 6.4 A dark tile: contrast consequences (G2, `palette-check`)

Denim is the first tile darker than the white X needs (white on it 4.53, the best of all). Three 2d contrast rules assumed light tiles and fail on it:

| Graphic | 2d value on Denim | Fix (2d.1) | After |
|---|---|---|---|
| Wrong X and ring (`--wrong` `#6E0E25`, needs 3) | **2.64** | `--wrong` → **`#560A1C`** (ΔE00 4.9 from 2d's; darker, so every light tile gains) | ≥ **3.18** on every tile (Denim the lowest; others 4.10–9.03); faded tiles ≥ 6.4 |
| Colour-pattern glyph (`--ink-deep` at 0.85, needs 3) | **2.63** | on a **dark tile** (`data-dark`, `isDarkTile`: white on the tile ≥ 4.0:1, i.e. relative luminance ≤ 0.2125; today only Denim, 4.53; Violet at 3.52 keeps `--ink-deep`, 3.24, where white would give only 3.00) the glyph is **white** at 0.85; on the faded (done) Denim tile it stays `--ink-deep` at 0.65 | white 3.76; faded 3.12 |
| X edge with patterns on (edge vs tile ≥ 3) | 2.63 | the rule becomes "white X vs tile ≥ 3, **or** edge vs tile ≥ 3 and white vs edge ≥ 3": on Denim the white X alone passes (4.53) and the edge is kept for uniformity | pass |

Unchanged rows: the plain white X stays a recorded parity exception on light tiles (D-2d-6); the head tint `#ADBAD8` on white (1.95) joins the existing head-tint exception. New `uiContrast` rows for 2d.1: card text 5.34, ticker text 4.85, Apply white on `--apply` 3.05 (large), label outline on the page 7.56 and fill on outline ≥ 5.68, "+N" orange on the page 2.23 (exception D-2d1-16).

### 6.5 The heads order: a ring with a per-level start (G2 constant, G3 use)

- **Observed:** both levels list their colours in **one fixed cyclic order** (ascending hue): green → teal → sky → grey-blue → **denim** → purple → magenta → pink → salmon → orange → mustard → (green). Only the start differs (green on Level 96, pink on Level 114); about ten start rules were tested and rejected (board order, tile (0,0), the largest region, hue gaps, the level number …).
- **`HEAD_ORDER`** becomes the ring in palette indices: **`[3, 5, 6, 10, 4, 7, 8, 11, 0, 1, 9, 2]`** (Lime, Lagoon, Sky, Slate, Denim, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard; Cocoa sits between Apricot and Mustard by hue, as in 2d).
- **Start** `[DECISION]`: the board's colours in ring order, **rotated** to start at index `hash(puzzleId) mod count` of that filtered list (`headOrderFor(colors, puzzleId)`, G2, pure; the same id hash `regionColorsFor` uses for its tie rotation). Deterministic per board; varies between levels like the original's. The tutorial starts at its first colour (rotation 0).

---

## 7. Workstreams, interfaces, tests and acceptance

### 7.1 Ownership (disjoint, as 2d; every new file starts with `// Owner: G1|G2|G3 (Phase 2d.1)`)

| WS | Scope | Owns (create or modify) |
|---|---|---|
| **G1: logic, app, platform** | unit completion, the mouse's order and lock, the kitty's target, the pulse rule, the ticker lines, the hint wiring, the banner during the hint, sound scheduling for the mouse, the announcements | `src/game/types.ts` (`UNITS_DONE`, `DoneUnit`), `src/game/reducer.ts` (emit), **new** `src/game/units.ts`, `src/game/mouse.ts` (pick order, `mouseVisitMs`, `mouseLandMs`, `mouseRunMs`); `src/workers/**` (**new** `hint-chunk.ts`, `engine-client.ts`, `engine.worker.ts`); `src/app/**` except `config.ts` (`views.ts` pulse; `session.ts` openHint props, tickers trigger, mouse sounds; `session-effects.ts` `UNITS_DONE` feedback; `helper-flows.ts` mouse lock; `banner-flow.ts` hide during the hint; **new** `tickers.ts`); `src/platform/**` if the banner hide needs it; `tests/unit/game/**`, `tests/unit/app/**`, `tests/unit/platform/**`, `tests/unit/workers/**` (**new** `kitty-pick.spec.ts`; critic: the directory exists and had no owner); `tests/e2e/{smoke,winflow,layout,fbig}.spec.ts`; `docs/phase2d/requests-G1.md` (a "2d.1" section) |
| **G2: art, board, tokens** | the palette change, the dark-tile contrast fixes, the heads ring, the board's X draw-in, ghosts, the mouse's visits, the cat sequence on the board, the waves, the veil and cat size, every new drawing | `src/ui/art/**` (`palette.ts` `PALETTE[4]`, tiers, `PALETTE_CORE`, `HEAD_ORDER`, **new** `headOrderFor`, `isDarkTile`, `TOKENS`; `sprite.ts` symbols `board-mouse` (parts), `cat` mood `wink`, `fx-star4`, `fx-shard`, `art-paw-cap`, `art-bolt`, `art-star`, retire `art-flex`); `src/ui/board/**` (`board-cells.ts` bar groups, `path.cell__xo`, `data-dark`; `board-view.ts` `playEvent` for `MARKED` (draw-in / mouse), `CAT_PLACED`, `UNITS_DONE`; `board-fx.ts` **new** `ghostOrder`, `waveOrder`, `xOutlinePath`, the mouse run; `board-highlight.ts` ghost delays; `board-types.ts`); `src/styles/{tokens,board,art}.css`; `scripts/palette-check.ts`; `tests/unit/ui/{board-view,board-entry,art-a11y-fx,palette-check,css-rules,layout}.spec.ts`; `tests/e2e/visual-board.spec.ts`; `docs/phase2d/provenance-G2.md`; `docs/phase2d/requests-G2.md` |
| **G3: HUD, overlays, fx, i18n, audio** | the hint overlay, the "+N" / star / count-up, shards and sparkles, completion labels, the tracker face, the press feedback, the tickers, the strings, the sounds | `src/ui/overlays/{hint-card,hint-text,coach}.ts` (and `how-to-play.ts` only if a mini board shows index 4, §6.2); `src/ui/fx/**` (**new** `points-flight.ts`, `cat-burst.ts`, `done-label.ts`, `tickers.ts`; `start-toast.ts` deleted at I-3); `src/ui/hud/{game-bar,pills,tool-bar}.ts`; `src/ui/screens/game-screen.ts` (fx orchestration, `playTickers`, deferral of mouse units); `src/styles/{hud,fx,overlays,overlay-chunk,i18n}.css`; `src/i18n/**` (Appendix A, 16 drafts, `meta.ts`); `src/audio/sfx.ts` (`mouse`, `points`, `unit_done`); `tests/unit/ui/{hud,pills,fx-a11y,hud-css}.spec.ts`, `tests/unit/shell/**` (its new specs go here: `hint-overlay-2d1`, `points-flight`, `done-label`, `tickers-fx`; critic: G1 has a `tickers.spec` in `tests/unit/app`, so the names must not meet), `tests/unit/i18n/**`; `tests/e2e/{visual,i18n}.spec.ts`; `docs/phase2d/provenance-G3.md`; `docs/phase2d/requests-G3.md`; `docs/phase2d/screenshots/G3-2d1-*.png` |
| **Lead** | config (§0.6), the colour-name change at L0, dev harnesses, the visual acceptance, budgets, docs | `src/app/config.ts`; `color.4` in the 17 catalogues **with every test that names "Mint"** (L0, as 2d's C14); `dev/**` (**new** `dev/helpers-compare.ts`); `scripts/size-check.ts`; `playwright.config.ts`; docs |

`src/engine/**`, `tests/golden/**`, `src/data/**`, `tests/property/**` stay read-only. Running another owner's script is fine; editing it is a request.

### 7.2 Order

1. **L0 (lead):** the config of §0.6; `color.4` "Mint" → "Denim" in the English catalogue and every test that names it (the 16 locale drafts follow in G3's build); create the "2d.1" sections in the three requests files. Tree green.
2. **S0 (additive):** G1 adds `DoneUnit`, `UNITS_DONE` (emitted from S0, so G2/G3 can test against real events), `mouseVisitMs`, `mouseLandMs`, `mouseRunMs`, the pick order; G2 adds `ghostOrder`, `waveOrder`, `xOutlinePath`, `headOrderFor`, `isDarkTile`, the new tokens with final values and **placeholder** symbols; G3 declares `GameScreen.playTickers?`, `TickerLine`, `HintCardProps.cells?` / `boardRect?` / `cellRect?`, every English key of Appendix A with its final value, and **`SfxId` + `'mouse' | 'points' | 'unit_done'`** with placeholder tones (critic: G1's session plays all three, so its code needs the ids at S0).
3. **Build** (§7.3). Nobody deletes a member another workstream may still use.
4. **Integration (lead):** I-1 `dev/**` harnesses; I-2 requests; I-3 required members and deletions (`playStartToast`, `start-toast.ts`, `StartToastKind`, `art-flex`, `HintCardProps.avoidRect`, `sheetPlacement`, `fbTopInset` if unused, 2b `sparkle()` if unused, `fx.mouseStaggerMs` / `fx.startToast` readers); I-4 budgets (§7.9); I-5 docs (Appendix B); I-6 acceptance (§7.8).

### 7.3 Work items

**G1**
1. `units.ts` + reducer: §4.1 (`isUnitComplete`, `completedUnits(prev, next, changed)`, the anchor rule, the event order).
2. `mouse.ts`: pick order; `mouseVisitMs`, `mouseLandMs`, `mouseRunMs` (§1.5). `helper-flows.onMouse`: keep `runBusy` open for `mouseRunMs` after the dispatch (§1.2).
3. `workers/hint-chunk.ts`: `pickKittyCell` (fewest candidates; ties by the solution cell's reading order) + `getHintStep` re-export; `engine-client.ts` and `engine.worker.ts` load it (§2.3).
4. `views.ts`: the pulse rule of §4.6 (needs the last board-change time: kept by the session, passed in the view context).
5. `session.ts`: `openHint` passes `cells`, `boardRect`, `cellRect`; the banner hide / re-show around the hint (`banner-flow.ts`, `ads.banner.hideDuringHint`, the one re-show timer of §3.2); `playTickers(pickTickerLines(…))` where 2d called `playStartToast`; the mouse's `mouse` and `mark` sounds at each arrival and landing; the `points` sound at each star's landing (§2.5); the deferred `unit_done` of a mouse action (§4.1); the per-attempt mouse counter and the last board-change / visibility time for the pulse (§4.6); `HelperHost.reducedMotion()`.
6. `session-effects.ts`: `UNITS_DONE` → `{ sfx: 'unit_done', sfxIndex: units.length − 1, announce: … }`, without the sound when the same action has `REGION_DONE`, and without that region in the announcement (§4.3).
7. **New** `app/tickers.ts`: `pickTickerLines` (§5.4), pure.
8. Tests (§7.6) and e2e (§7.7).

**G2**
1. `palette.ts`, `tokens.css`, `palette-check.ts`: §6.2, §6.4 (`--r4`, `--wrong`, `isDarkTile`, the new rows), `HEAD_ORDER`, `headOrderFor`, new tokens (`--plus`, `--done-top`, `--done-bottom`, `--done-line`, `--hint-card`, `--apply`, `--toast-fill`, `--toast-line` new values).
2. `board-cells.ts`: the bar groups (§4.4), `path.cell__xo` (§3.3), `data-dark` (§6.4), the cat's resting size (§4.7).
3. `board-view.ts`, `board-fx.ts`, `board-highlight.ts`, `board.css`: the draw-in (§4.4), the ghosts (§3.3; remove the board hint dim), the mouse visits (§1.4–§1.5), the cat sequence on the board (§2.4: pop, celebrate, wink, settle, flash, halo, light, twinkles), the waves (§4.2), the veil (§4.7).
4. Art (Appendix C), each with a provenance row and its bytes.
5. Tests, `visual-board.spec.ts` captures (§7.7).

**G3**
1. `hint-card.ts` + `overlays.css` / `overlay-chunk.css`: §3.2–§3.5, §3.7 (`hintCutouts` in `hint-text.ts`).
2. `fx/points-flight.ts` + `game-bar.ts`: §2.5 (`scoreRect()`, `countTo()`; the POINTS roll, bump and inline chip retire for the Score).
3. `fx/cat-burst.ts`: shards, light and twinkles of §2.4 (screen layer).
4. `fx/done-label.ts`: §4.3.
5. `pills.ts`: §2.7 (face + dot) and `headOrderFor` (§6.5).
6. `tool-bar.ts`, `hud.css`: §4.5 (press, release spring); the busy tool row without the disabled fade (§1.2); the pulse look unchanged.
7. `fx/tickers.ts`: §5.2–§5.5 (replaces `start-toast.ts`); `game-screen.ts`: `playTickers`, the fx orchestration (which event plays what; the deferral of mouse-completed units, §4.1).
8. `audio/sfx.ts`: `mouse`, `points` (the star landing), `unit_done`.
9. i18n: Appendix A in `en/ui-2d1.ts` (**new**), the 16 drafts, `meta.ts` (`fx.done` ≤ 8, `ticker.*` ≤ 40 characters), glossary ("Denim"; "Done!" is the completion label, not a button), review log, `drafted-from.json`.
10. Tests and e2e (§7.6, §7.7); screenshots `docs/phase2d/screenshots/G3-2d1-*.png`.

**Bundle note (G3):** `points-flight.ts`, `cat-burst.ts` and `done-label.ts` may form one **lazy fx chunk** (`fx/celebrate.ts`), prefetched at idle after the first game screen mounts; until it has loaded, a POINTS event falls back to 2d's roll (no star) and a completed unit shows no label. This keeps the first-load JS row flat (§7.9). When the chunk has loaded the fx layer carries `.game-fx[data-celebrate=ready]` (critic: the `smoke` e2e waits for it, since the fallback roll would read 576 by 360 ms).

### 7.4 Interfaces (summary; exact code in [CONTRACTS-2d1.md](CONTRACTS-2d1.md))

- **G1 → G2 / G3:** `GameEvent` `UNITS_DONE { units: readonly DoneUnit[] }`; `DoneUnit { kind, index, anchor }`; `mouseVisitMs(c?)`, `mouseLandMs(k, c?)`, `mouseRunMs(count, reduced, c?)`; `pickMouseCells` returns pick order.
- **G2 → G3:** `ghostOrder(step, cells, n)`, `waveOrder(unit, n, regions)`, `headOrderFor(colors, puzzleId)`, `isDarkTile(paletteIndex)`, tokens, symbols.
- **G3 → G1:** `GameScreen.playTickers(lines)` (replaces `playStartToast`), `TickerLine` (declared in `ui/fx/tickers.ts`), `HintCardProps` `cells`, `boardRect()`, `cellRect(i)`; the English keys.
- **G1 internal (workers):** `HintEngine = Pick<typeof import('./hint-chunk'), 'getHintStep' | 'pickKittyCell'>`.

### 7.5 DOM contract (e2e)

| Element | Selector |
|---|---|
| X bars | `.cell__xg > g.cell__xb.cell__xb--a|--b > rect.cell__xe (patterns on) + rect.cell__x`; draw-in on `.cell.fx-mark` |
| Ghost X | `.cell[data-ghost=x][data-s=e]` (inline `--gd`) `> … path.cell__xo` |
| Mouse | `.board > .board__mouse[data-cell][data-face=blink|glance|grin]` while a visit runs; the pending X's `.cell.fx-pend` (2d) |
| Cat sequence | `.cell.fx-cat` (pop / celebrate / settle), `.cell__flash` |
| Wave | `.cell.fx-wave` (inline `--wd`) |
| Dark tile | `.cell[data-dark]` |
| Fx layer | `.game-fx > .fx-plus`, `.fx-star`, `.fx-burst`, `.fx-shard`, `.fx-done-label[data-anchor]`; `.game-fx[data-celebrate=ready]` once the lazy fx chunk has loaded |
| Score | `.top-bar--game .points-pill__n` (`[data-counting]` during the count-up) |
| Busy tools, busy board | `.tool-bar[data-busy]` (mouse run, kitty reveal, hint open: tools inert, no disabled fade); `.board[aria-busy=true]` during the mouse run |
| Heads | `.pills > .pill.pill--heads > .head[data-color][data-done] > svg.head__shape`, and while done `svg.head__face` + `span.head__dot` |
| Hint overlay | `.overlay[data-overlay=hint][data-instant] > svg.hint-dim + .hint-card > .hint-card__text` and `button.hint-apply`; `button.hint-close.visually-hidden-focusable` |
| Tickers | `.tickers > .ticker[data-line=1|2][data-key] > svg.ticker__paw + span.ticker__text + svg.ticker__icon` |
| Gone | `.start-toast`, `.hint-card__icon`, `.overlay[data-overlay=hint][data-placement]`, `.points-pill__chip` in the game bar, `svg.head` as a direct child of the heads pill |

### 7.6 Unit tests

**G1**
- `units.spec` (new): a row completes only with its cat and every other tile Mark or Wrong; a cat alone never completes a line; Given counts as a cat; one entry per unit, rows → columns → regions; the anchor is the last changed tile of the unit in reading order (a row completed by tiles 0–4, 6, 7 with the cat on 8 → anchor 7); an unmark never emits; unmarking and re-marking emits again; the event comes after `MARKED` / `CAT_PLACED` / `POINTS` / `REGION_DONE` and before `WON`, for `TAP`, `PAINT`, `DOUBLE_TAP`, `HINT_APPLY`, `KITTY` and `MOUSE`; a mistake that completes a unit emits it, one that ends in `LOST` does not; a `HINT_APPLY` still starts with `HINT_APPLIED`.
- `mouse.spec`: the pick order is the shuffle order (not sorted), deterministic per seed, a permutation-prefix of the candidates; `mouseRunMs(3, false)` = 3 × 935 + 170; reduced = 150; `onMouse` keeps the board busy for `mouseRunMs` (reduced motion: 150, through `HelperHost.reducedMotion`) and ends early when the session ends.
- `kitty-pick.spec` (new, **our own fixtures**): on a 9 × 9 board of ours with a one-tile region in the top-right corner the picker returns that tile; with no forced region it returns the solution cell of the cat-less region with the fewest candidates after shadows; ties go to the earlier solution cell; it never returns a cell whose region has a cat; it throws when every region has one; the result is always a solution cell. A property test over 200 shipped levels with random partial boards: always a solution cell of a cat-less region.
- `flags-views.spec`: the pulse (§4.6): none before `idleMs`, the kitty on an untouched board after it with stock, none with the kitty at 0 (and not the bulb instead), the bulb on a marked board with stock, none at 0; a board change and a visibility return reset the idle time; **none once a hint, the kitty or the mouse was used in the attempt**, again after a Retry; `needsStock: false`, `untilHelperUsed: false` and the pinned targets via `mergeConfig`.
- `tickers.spec` (new): line 1 priorities (Retry > Hard > best > seeded cats / level); line 2 eligibility per row of §5.4; every `{count}` / `{time}` equals a value from the inputs (no constants); deterministic per seed; Retry may change line 2; `period.pill.{kind}` follows `cfg.period.kind`; line 3 only in level mode (never for a daily or an event index) and carries the best time in ms for `formatClock`; line 9 never on the daily itself.
- `banner-flow.spec`: the hint hides the banner when `hideDuringHint`; after close it reloads at once when `minReloadSec` has passed, else exactly one timer reloads it when the window ends (not when the screen has gone, a modal is open or the board is won); off restores the 2d rule.
- `session` / `session-2d.spec`: `openHint` passes `cells`, `boardRect`, `cellRect`; `playTickers` on fresh boards and Retry, never on resume, revive or the tutorial; the mouse's sounds at k × 935 and k × 935 + 850; the `points` sound 1 330 ms after `POINTS` (at once with reduced motion; cancelled by a props render); a mouse action's `unit_done` at its anchor's landing; no `unit_done` sound in an action with `REGION_DONE`.

**G2**
- `palette-check.spec`, `art-a11y-fx.spec`: `PALETTE[4]` = `#5B75B2`; tiers (n ≤ 11 uses only the 11 measured indices; 12 adds 9); adjacent ΔE ≥ 10; `HEAD_ORDER` = the ring; `headOrderFor` is a rotation of the filtered ring, deterministic per id; `--wrong` ≥ 3 on every tile and faded tile; the white glyph on `[data-dark]`; the new `uiContrast` rows; every new symbol `aria-hidden`; `xOutlinePath` encloses the X with the 0.8 px margin at T = 39.
- `board-view.spec`: `MARKED` from a tap / paint / Apply adds `.fx-mark` to every new cell at once; `MARKED { source: 'mouse' }` keeps `.fx-pend` on cell k until k × 935 + 850, moves `.board__mouse` through the cells **in event order**, and the X pops (no `.fx-mark`); `CAT_PLACED` adds `.fx-cat` and the flash, and a `CAT_REMOVED` of that cell cancels them; every `.fx-pend` is gone `mouseRunMs` after the `MARKED` even with the animations paused; the draw-in: bar `--a` scales about the centre, bar `--b` grows from its top-right tip, the group overshoots; `UNITS_DONE` waves start at the end nearer the anchor with 33 ms steps (`--wd`), regions by king distance; ghost delays `333 + 60 i` in `ghostOrder` (row, column, rest), marked cells without a slot; no board-level hint dim; the veil not on the cat's tile; reduced motion variants.

**G3**
- `shell/hint-overlay-2d1.spec` (new): `hintCutouts` = focus ∪ Empty effects ∪ placeCell (mistaken mark: the mark); the card's bottom is 5.9 s above the board, Apply's top 31 s below, both centred; no visible ×; a dim tap closes when closable, never in the tutorial; Apply closes with `[data-instant]` (no exit transition); the dim path has one hole per cut-out tile and is rebuilt at `dimMs`; overflowing text scrolls inside the card; the focused close button sits on the card's top inline-end corner.
- `fx-a11y.spec` / new `shell/points-flight.spec`: P0 = the "+N" centre + (−4, +9.5) s and the Bézier control point formula; the star lands at `starAtMs + 17 + flightMs` (± 1 frame); the count-up values for 0 → 576 at 60 fps equal the measured table; no bump class; a newer POINTS never lowers the number; props renders cancel; reduced motion: no star, the number at once.
- `shell/done-label.spec` (new): position = anchor centre + 0.82 × pitch; clamped 2 px inside; one label per anchor; timings; reduced motion.
- `pills.spec`: the found head shows `.head__face` + `.head__dot` with the tint, pops 0.56 → 1.2 → 1 over 280; `CAT_REMOVED` returns the silhouette; the ring rotation from `headOrderFor`.
- `hud-css.spec`: the press scale 0.90 on `:active`, the release spring keyframes; `.tool-bar[data-busy] .tool:disabled` keeps opacity 1; the ticker slots and the mirrored direction in RTL.
- `shell/tickers-fx.spec` (new): both lines cross in T; `ticker.best` rendered with `formatClock`; line 2 starts `lead × T` before line 1; removal; reduced motion; RTL.
- `catalogs.spec`, `sanity.spec`: Appendix A keys in all 17 catalogues; `color.4` "Denim"; `fx.done` ≤ 8 characters.

### 7.7 End-to-end (Playwright, built apps)

| Spec (owner) | Adds |
|---|---|
| `smoke` (G1) | **Mouse:** tap → O2 free (web) → after `mouseRunMs` exactly **3** more `.cell[data-s=m]`, **none on a solution cell** (through the 2d e2e solution hook), and at 900 ms only the first is visible (`:not(.fx-pend)`); the board ignores taps during the run. **Kitty:** at run 0 on a fresh level the kitty places a cat on a solution cell; after waiting for `.game-fx[data-celebrate=ready]` (taken before the tap), `.points-pill__n` reads **576** after 1 800 ms (and still 0 at 1 000 ms); the colour's `.head[data-done] .head__face` exists. **Hint:** open → the number of ghost cells equals the cut-outs minus the focus; Apply → in the next frame the overlay is gone, and the new `.cell[data-s=m]` are **exactly the ghost cells**; with a hint that completes a line, one `.fx-done-label` per anchor. **Tickers:** two `.ticker` on a fresh level, none on resume. |
| `winflow` (G1) | the last cat's star and count-up end with the final total and `[data-final]`; the period counter still appears at t = 1 000 |
| `layout` (G1) | at 320 × 568 (web and FBIG with the band), 390 × 844 and 1280 × 800: the hint card covers the rules row and stays inside the viewport and below the bar; Apply is fully visible and above the banner band; the "+N" and labels stay inside the viewport for a cat in each corner tile; in German at 320 × 568 FBIG a three-line hint sentence keeps the card below the bar and off the board (scrolling if needed) |
| `fbig` (G1) | the banner hides while the hint is open; it comes back at once after close when `minReloadSec` has passed, else once when the window ends (with the stub's clock), never by a second load inside the window |
| `visual-board` (G2) | frames of the draw-in (0, 35, 70, 135, 200, 250 ms), a ghost pop (0, 67, 133, 233, 300, 500), the mouse visit (0, 17, 50, 115, 850, 900, 935), the cat (0, 16, 116, 300, 600, 816, 950, 1 400), a wave; the Denim tile with an X, a wrong X, a pattern glyph |
| `visual` (G3) | the hint overlay at 402 × 874 (settled), the "+N" at rest, the star mid-flight, the count-up mid-way, a label, the tickers mid-crossing; de and ar at 320 × 568 |
| `i18n` (G3) | the card's text fits at 320 in de, fr, ar (it grows upward, never under the bar); the label and tickers in RTL |

### 7.8 Visual acceptance against the recordings (lead, `dev/helpers-compare.ts`)

Required before 2d.1 is called done. Like look-spec §5.4: the script drives the built e2e app and composes images **in a scratch folder only** (never committed, D-2d-0 d), from `$MEWDOKU_ORIG_REF2`:

1. **Device:** 402 × 874, DSF 3, `--dev-safe-top: 62px; --dev-safe-bottom: 34px`, `?ads=` (mock banner), a seeded returning player on **one of our own 9 × 9 levels** chosen with a one-tile colour in a corner (our layout, never Level 114's), stocks kitty 1, hint 1.
2. **Time control:** Playwright's `page.clock` (install, `runFor`) for the JS timers and `requestAnimationFrame`, and `document.getAnimations()` with `currentTime` for the CSS animations, so each capture lands on an exact ms after the action.
3. **Sequences** (ms after the release; the user's frames at the same relative times, cropped to the same CSS-px box, side by side with 10 px guides):
   - mouse: one visit at 0, 17, 33, 50, 67, 117, 450, 850, 867, 900, 935; then the whole board at the end (v1 crops `v1-01`…`v1-05`);
   - cat: 0, 16, 33, 83, 116, 166, 300, 566, 816, 950, 1 400, the star at 850, 1 066, 1 300, the Score at 1 333, 1 450, 1 683 (v2 crops `v2-01`…`v2-10`);
   - bulb: open 0, 150, 300, ghosts at 333 + 60 i (+ 0, 67, 117, 233, 500 for one ghost), settled; Apply 0, 66, 83, 116, 150, 200, 250, 270, 560, 720 (v3 crops `hint-seq-*`; the app's 67 ms hitch after Apply makes 0–50 a single frame there, so draw-in onsets are compared from +66);
   - the heads tracker pop (0, 83, 280).
4. **Pass criteria** (checked by the script from DOM rects and computed styles, then looked at by the lead and shown to the user): positions of the sprite, the cat, the "+N", the labels, the card, Apply and the tickers within **± 2 px** (scaled to our tile size where the item is tile-relative); scales at each sampled time within **± 0.05**; event onsets within **± 1 frame** (17 ms); the star within **4 px** of the Bézier; the count-up values equal to the measured sequence; colours within **ΔE00 ≤ 3** of the (cc) values (critic: two independent corrections of the same video pixels differ by up to 1.7, so ≤ 2 would test the correction, not our build) and **≤ 1** of the PNG values. Differences by design are listed in the result: our art (mouse, cat, star, shards, paw, icons), our words, our level, Apply's darker orange, the centred Apply, the wave on regions, the face per visit.

### 7.9 Bundle

2d already plans to raise the first-load ceilings at its I-4 (look-spec §6.3). 2d.1 estimates (raw): G1 +1.4 KB (units, picker in the lazy hint chunk, tickers, pulse); G2 +3.0 KB (draw-in, ghosts, mouse, cat sequence, waves; art: mouse parts ≤ 0.6 KB, wink ≤ 0.2, star ≤ 0.1, shard ≤ 0.1, paw ≤ 0.4, bolt and star ≤ 0.4); G3 +4.5 KB (the hint overlay is in the lazy overlay chunk: +1.2 KB there; points, burst and labels +2.4 KB, **in a lazy fx chunk** per §7.3; tickers +0.6 KB net of the toast; strings +0.5 KB); deletions −1.0 KB (toast, sheet placement, `art-flex`, roll / bump / chip of the Score, 2b sparkle). **Expected:** main JS ≈ +3.5 KB, first-load CSS ≈ +1.5 KB, the lazy overlay chunk +1.2 KB, a new lazy fx chunk ≈ 3 KB. The lead measures at I-4 and records any raise in 04 §9 under the same policy as 2d (measured maximum + about 3 %).

---

## 8. Open questions (only what the recordings do not show; each built so it is cheap to change)

| # | Question | Provisional decision (built) | Where to change |
|---|---|---|---|
| Q1 | **Ticker speed.** The stills' timestamps (8 s apart) give a crossing time of ≈ 21 s; the first recording's toast moved at 100 px/s (≈ 9 s for a 440 px line). A 15–25 s recording from a level start would settle it. | T = 9 s | `fx.tickers.crossMs` |
| Q2 | When do the tickers show (every level? first minutes?), do they repeat, and what starts them? | Every fresh board and Retry, once | `fx.tickers.enabled`, G1 trigger |
| Q3 | How does an X **you** place appear (tap or drag)? | The hint's stroke draw-in with the tile squish | `board.css` `.fx-mark` |
| Q4 | Does a cat **you** place get the kitty's celebration (shards, "+N", star, wink)? | Yes, every correct cat | `board-view.ts`, `game-screen.ts` |
| Q5 | When does the completion label show for a **colour with several tiles**: when its cat is found, or when all its other tiles are crossed too? And again after you clear and re-cross a tile? | When the cat is placed **and** every other tile is crossed (the line rule); again after a re-cross | `game/units.ts` |
| Q6 | Is the hint charged when it **opens** or on **Apply**? Can you close it by tapping outside? | Charged on open (free reopen of the same board); a tap outside, Esc or back closes it | `helper-flows.ts`, `hint-card.ts` |
| Q7 | When does a helper **pulse**? Does it stop once you have used a helper in the level? | After 5 s without a move, the kitty on an empty board else the bulb, only with stock, and only until a helper is used in the attempt (critic: the only rule we found that fits v2's 63 s without a pulse) | `fx.helperPulse.idleMs`, `needsStock`, `untilHelperUsed` |
| Q8 | Which tile does the **kitty** choose when no region is forced? | The cat-less colour with the fewest open tiles (ties: the earlier row) | `workers/hint-chunk.ts` |
| Q9 | Where does the heads row **start** on a level? | A fixed start per level, from the level's id | `palette.ts` `headOrderFor` |
| Q10 | The **12th colour** for 12 × 12 boards (none recorded) | Our Cocoa `#B0855A` | `palette.ts`, `tokens.css` |
| Q11 | Can you tap the board **while the mouse runs**? | No, the board waits ≈ 3 s | `helper-flows.ts` |
| Q12 | **Apply's orange** (`#F0912A`) is too light for its white label by the contrast rule we follow (2.39, needs 3). Keep ours a shade darker (`#D38025`, 3.05) or match exactly? | A shade darker | `tokens.css` `--apply` |
| Q13 | The orange **"+576"** is 2.23:1 on the page. Keep the original's orange (decorative, the Score shows the number) or use our darker title orange? | Keep the original's orange | `tokens.css` `--plus` |
| Q14 | What does a tap on a helper **at 0** do in your game: a question card first (ours), or the video at once? | Our card first (Watch video / Not now) | `helper-flows.ts` |
| Q15 | **Sounds**: all three recordings are silent. Are there sounds for the mouse, the star and the labels? | Our own soft sounds | `audio/sfx.ts` |
| Q16 | How do **other hints** look (a hint that places a cat, or one about a whole colour)? | The same dim, card and Apply; a ghost cat for a cat | `hint-card.ts`, `board.css` |
| Q17 | The banner was absent at the level start in both stills. Does the game wait before the first banner of a level? | No extra wait (2d's rule: the 60 s reload window) | `ads.banner` |
| Q18 | Does a unit completed by a **mistake** (the wrong tile becomes the last crossed one) get the label? (critic) | Yes, unless the mistake ends the attempt | `game/units.ts` |

---

## 9. Decision log (Phase 2d.1)

| # | Decision | Kind |
|---|---|---|
| D-2d1-0 | Replicate the three helpers, the tickers and the palette from the user's recordings, under D-2d-0's terms (measure and sample; no tracing; our art and words) | **user, 2026-10-10** |
| D-2d1-1 | The mouse visits its tiles one by one (appear with a tile bump, idle face, X pops under it as it leaves, next appears at once), in pick order, with the board locked; replaces the 90 ms stagger | measured / ours (lock, faces) |
| D-2d1-2 | The kitty targets the cat-less region with the fewest candidates (ties: earlier solution cell); replaces 02 §9.2's "most candidates" | measured (one sample) / ours |
| D-2d1-3 | Every correct cat plays the measured cat sequence (pop to 1.56, 1.25 with a wink, settle; flash, shards, light) | measured (kitty) / ours (player, hint) |
| D-2d1-4 | Points: "+N" over the tile → star on a Bézier to the Score → 350 ms count-up without a bump; replaces 2d's roll, bump and inline chip | measured |
| D-2d1-5 | A found colour's head becomes our cat face with a tint dot; replaces D-2d-9 | measured |
| D-2d1-6 | A unit with its cat and every other tile crossed is complete: a wave (lines) and our "Done!" label under the anchor tile | measured (rows, columns, a one-tile colour) / ours (word, regions) |
| D-2d1-7 | The hint is a modal walkthrough: 75 % dim with tile cut-outs, card over the rule cards, Apply pill over the helpers, outline ghosts popping 60 ms apart, instant close | measured / ours (centred Apply, no visible ×) |
| D-2d1-8 | New X's from taps, paints and Apply draw in stroke by stroke with a tile squish ("\" grows from the centre, "/" from its top-right tip, the X overshoots to 1.1; critic re-measure); the mouse's X pops | measured (hint, mouse) / ours (player) |
| D-2d1-9 | The pulse needs 5 s idle, stock, and no helper used in the attempt; replaces D-2d-11's 'auto' | measured (constraints) / ours (5 s; the last condition from the critic) |
| D-2d1-10 | Denim `#5B75B2` replaces Mint; n ≤ 11 draws from the 11 measured colours; Cocoa only on 12 × 12; replaces D-2d-10's tiers | measured / ours (Cocoa kept) |
| D-2d1-11 | Dark-tile contrast: `--wrong` `#560A1C`, white pattern glyph on dark tiles, the edge rule's "or" | ours (WCAG) |
| D-2d1-12 | Two right-to-left tickers with a paw cap and our honest lines from the player's data; replaces D-2d-13's toast | measured (look, motion) / ours (copy, T) |
| D-2d1-13 | The banner hides while the hint overlay is open; after close it returns at once or, inside the reload window, once when the window ends | measured / ours (the timer; critic) |
| D-2d1-14 | Helper discs and Apply press to 0.90 and fire on release; discs spring back via 1.04 | measured |
| D-2d1-15 | The done veil skips the cat's own tile; the resting cat is 0.78 T | measured |
| D-2d1-16 | Contrast: Apply darkened to `#D38025`; the "+N" orange kept as a decorative exception | ours (asked, Q12, Q13) |
| D-2d1-17 | The heads ring `[3, 5, 6, 10, 4, 7, 8, 11, 0, 1, 9, 2]` starts at a per-level offset from the puzzle id | measured (ring) / ours (offset) |

---

## Appendix A. Strings (English, ours; G3 adds them in S0 in `src/i18n/en/ui-2d1.ts`; the 16 drafts in the build)

**New keys**

| Key | English | Notes |
|---|---|---|
| `fx.done` | Done! | the completion label (≤ 8 characters; an exclamation, not a button) |
| `a11y.unitDone` | {unit} complete. | per completed unit, `{unit}` = `unitName()`; joined with `joinList` for several |
| `ticker.best` | Your best time here: {time} | `{time}` = the stored best, `formatClock` ("4:12"; level mode only) |
| `ticker.cats.one` / `.other` | {count} cat is hiding here / {count} cats are hiding here | `{count}` = n |
| `ticker.solved.one` / `.other` | You've solved {count} level / You've solved {count} levels | `progress.completed` |
| `ticker.points.one` / `.other` | {count} level point so far / {count} level points so far | `points.total` |
| `ticker.daily` | Today's daily puzzle is waiting | |
| `ticker.unique` | Every puzzle has exactly one answer | |
| `ticker.tip.cat` | Tip: double-tap a tile to place a cat | |
| `ticker.tip.drag` | Tip: drag across tiles to cross out many | |

**Reused** (values unchanged): `toast.start.level`, `toast.start.hard`, `toast.start.retry` (2d; now ticker line 1), `period.pill.{day|week|month}` (2c; ticker line 2), `fish.plus` (the "+N"), `hint.*` (the card's sentences), `hint.apply`, `hint.close`, `a11y.mouse`.

**Changed value** (L0, lead, with every test that names it): `color.4` "Mint" → **"Denim"**.

**Glossary:** "Denim" is a tile colour (a mid blue), not fabric; "Done!" is the short cheer under a finished row, column or colour; ticker lines never state a statistic, only the player's own numbers.

## Appendix B. Documents to update at integration (lead, I-5)

- `docs/phase2d/STATUS-2d.md` (a 2d.1 section): what changed, verification, budgets, the open questions.
- [01](../phase1/01-game-deconstruction.md): the first-hand rows were added at this spec stage (update paragraph, 6.10–6.14, 12.22–12.29, §18 entries 15–17, §19); mark them "built".
- [02](../phase1/02-rebuild-spec.md): §9.1 (the hint's presentation), §9.2 (the kitty's target, the celebration), §17.2 (palette tiers), §17.4 (the X draw-in, ghosts), the pulse rule.
- [look-spec](look-spec.md): a pointer at §1.6, §1.9, §1.10, §1.11, §1.12, §1.13, §1.14, §1.16 to this file; D-2d-9 … D-2d-13 marked "replaced by 2d.1".
- [CONTRACTS](CONTRACTS.md): a pointer to [CONTRACTS-2d1](CONTRACTS-2d1.md).
- [parity-spec](../phase2b/parity-spec.md) §0.7 rows (helpers, tickers, palette).
- [differences-vs-original](../phase2/differences-vs-original.md): the closed helper items and what stays different (art, words, Apply's orange).
- [provenance](../provenance.md): rows from `provenance-G2.md` / `provenance-G3.md` (new art and motions; `art-flex` and the 2b kitty sparkle retired).
- [06](../phase1/06-legal-and-originality.md) §3: the recordings of 2026-10-10 under D-2d-0 (one line).

## Appendix C. Art to draw (G2; each from these words, never from a frame)

| Symbol | Words | Grid | Target bytes |
|---|---|---|---|
| `board-mouse` | our `tool-mouse` face split into parts: head + muzzle, ears with pink insides, two eyes with catchlights and a lid pair, pupils that can shift, a closed mouth with two teeth and an open-mouth variant, a pink nose, three whiskers a side | 100 | ≤ 0.6 KB (beyond `tool-mouse`) |
| cat mood `wink` | our Tux's right eye as a closed upward arc with a tiny white glint; the left eye open | 100 | ≤ 0.2 KB |
| `fx-star4` | a four-point star with concave sides, a round soft core | 24 | ≤ 0.1 KB |
| `fx-shard` | three irregular rounded polygons (chunky crystal bits), each with a lit face and a shaded face (two paths, `currentColor` and a darker mix) | 24 | ≤ 0.1 KB |
| `art-paw-cap` | a pill's rounded end replaced by a paw print: four round toe beans in an arc along the outer edge, a large rounded main pad; an outline following the scallops | 30 × 30 | ≤ 0.4 KB |
| `art-bolt` | a chunky zig-zag lightning bolt, yellow with an orange shade, no outline | 24 | ≤ 0.2 KB |
| `art-star` | a plump five-point star with rounded tips, gold with a soft highlight | 24 | ≤ 0.2 KB |
| `path.cell__xo` | not a symbol: the union outline of the two X bars (`xOutlinePath()`, computed) | 100 | code |

---

## Critic changes (independent critic, 2026-10-10)

Checked against the user's frames (the three contact sheets, then 8–15 frames around every key moment), five-plus timings re-measured at 60 fps with ffmpeg (crops decoded with `-vsync 0` against the container timestamps), the PNG stills, the critic's own sampler and solver of the 9 × 9 (`scratchpad/2d1/critic/r2/`, analysis only, never in the repo), the code at `f9c0b8d` and the 2d build at `HEAD`. **Confirmed unchanged:** the mouse's tiles (all three empty and outside the unique solution), the visit timing (arrivals at 242 / 1 108 ms), the X pop; the kitty's tile (the only tile of the one-tile green region, a solution cell; the 2b rule would pick the 14-candidate magenta region); the hint's 16 cells (7 of row 0, 8 of column 8, the neighbour (1,7)), their order and the two completed lines; the cat's scale curve (0.29 F at +16, 1.57 at +116–133, 1.25 at +300, 0.90 at +966, 1.0 by ≈ +1 316); the count-up table (every value, 0 at +1 333, 576 at +1 683); the head pop (0.55 → 1.21 at +83 → 1.0 at +283); the dim (linear, ≈ 297 ms); the ghosts (+333, 59–60 ms stagger); the label fade (v3: linear, α 1 → 0 from +551 to +751); all 11 PNG tile colours, the ticker fill and border and their positions; every ΔE00 and contrast number of §6 and the `uiContrast` rows (own CIEDE2000 and WCAG code); the (cc) colours within ΔE00 0.5–1.7 with an independent correction; silent audio; no copied sentence or label in either doc.

1. **§4.4, §3.1, §3.4, §0.4, §0.6, D-2d1-8 — the draw-in was misdescribed.** Bar "\" does not reveal from its top-left tip: on all 16 tiles it grows out of the X's centre in length and thickness together (≈ 0.45 / 0.72 / 1.05 of the final bar at +66 / +83 / +116). Bar "/" is a reveal from its top-right tip (+116 → ≈ +250). The whole X overshoots to ≈ 1.10–1.12 and settles by ≈ +270 (measured on tiles outside the waves). New timing (250 ms), markup origins and `fx.markDraw` shape; visual-board and acceptance capture times follow.
2. **§4.6, §0.4, §8 Q7, D-2d1-9, §0.6 — the pulse rule did not fit v2/v3.** Conditions 1–4 with a 5 s idle time predict a pulsing bulb at the start of v2 (≈ 63 s without a board change, bulb at 1) and v3 (≈ 17 s); none shows. Added condition 5 (`untilHelperUsed`: no pulse once a helper was used in the attempt), which fits every observation, and the idle restart on a visibility return; tests follow.
3. **§3.2, §7.6, §7.7, D-2d1-13 — the banner after the hint.** "Else at the next eligible screen mount" would leave the band empty for the rest of the level (2d's `modalClosed` never re-shows on the game screen), while the original showed a new ad right after close. Now: at once when the window has passed, else one timer at the window's end.
4. **§2.5, §1.6, §4.1, §4.3, §7.2, §7.3 — who plays the new sounds.** Sounds are played by the app layer, never by `ui/`; G1 now schedules `points` at the star's landing and the deferred `unit_done` of a mouse action; `unit_done` is skipped when the same action plays the region chime (a one-tile colour stacked three sounds); `SfxId` additions move to G3's S0 so G1 type-checks.
5. **§5.4, Appendix A, CONTRACTS §4 — the best-time ticker.** `formatDuration` is the coarse countdown style ("4 min", "under a minute"); a solve time uses `formatClock` ("4:12"). Line 3 only in level mode (an event index is not a level number; a daily has none); line 9 never on the daily itself.
6. **§1.2, §7.5 — the tools faded during helper runs.** The 2d `.tool:disabled { opacity: .45 }` would dim all three discs for the 3 s mouse run, the kitty's 820 ms reveal and under the hint dim; the recordings show no change. `.tool-bar[data-busy]` keeps them opaque and inert; the board gets `aria-busy` during the mouse run.
7. **§1.5 — safety finaliser** for `.fx-pend` (a hidden page throttles timers and pauses CSS animations; no X may stay hidden after the lock).
8. **§2.4 — `CAT_REMOVED` during a cat's sequence** cancels it on the cell; fx-layer pieces finish.
9. **§2.5 — the star's start point** is ≈ 9.5 px below and 4 px left of the "+N" centre (born near the digits' baseline), which matters for the 4 px Bézier criterion.
10. **§4.1, §8 Q18 — `UNITS_DONE`:** never in an action that ends in `LOST`; a mistake that completes a unit otherwise emits it; `HINT_APPLIED` stays first in `HINT_APPLY` (the 2b reducer order), and `WON` is pushed inside the cat placement, so G1 inserts `UNITS_DONE` before it. a11y: a region announced by `REGION_DONE` in the same action is not repeated.
11. **§1.1, §1.5 — the mouse's tile bump** is ≈ 0.88 (0.87–0.90 on both arrivals), not 0.85.
12. **§1.3, §0.4 — the mouse's spread and depths:** "more than a third" → 32.6 % (exact count); "depths 1, 2 and 5" → rounds 1, 2–3 and 5 depending on the rule set (critic's solver: 1, 3, 5).
13. **§2.3 —** the "most candidates" comparison holds only because marks count as candidates (magenta 14 vs mustard 13, else a tie); a `reveal_fallback` hint still uses the engine's most-candidates picker (accepted).
14. **§3.2, §3.5, §4.8 (new) — small screens, RTL, FBIG:** the card's text scrolls inside the card when it cannot fit; the dim path is rebuilt at `dimMs` (transformed tile rects); the focused close button's place; a new §4.8 gathers RTL (the board stays LTR, so the mouse, ghosts, waves and strokes are physical), 320 × 568 and FBIG.
15. **§7.1 — ownership:** `tests/unit/workers/**` (where `kitty-pick.spec` lives) had no owner, now G1; G3's new specs get paths under `tests/unit/shell/` (no clash with G1's `tickers.spec`); `how-to-play.ts` (conditional) and the screenshots folder added to G3.
16. **§3.6 —** `hintLocation` lives in `hint-card.ts`, not `hint-text.ts`.
17. **§7.3 bundle note, §7.5, §7.7 —** `.game-fx[data-celebrate=ready]`; the `smoke` kitty check waits for it (the 2d roll fallback reads 576 by 360 ms and would fail "still 0 at 1 000 ms").
18. **§7.8 —** (cc) colour tolerance ΔE00 2 → 3 (two independent corrections of the same pixels differ by up to 1.7).
19. **§3.6, §5.5 —** "no sound" stated for the ghosts and the tickers; the tickers' position against the FB safe zone at 320 × 568.

**Remaining risks** (not fixable from these recordings): the ticker speed (Q1: the EXIF timing and the first recording's 100 px/s still disagree; T = 9 s is a guess); the pulse rule (Q7) rests on one level and could also be "idle restarts when the app is reactivated" with a much longer idle time; the absolute onsets after Apply are uncertain by the app's 67 ms hitch; the player's own X and cat, other hint kinds, multi-tile colours completing and the 0-stock helper tap remain unrecorded; the banner timer depends on Meta's real reload window matching `minReloadSec`.
