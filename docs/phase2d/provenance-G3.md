# Phase 2d provenance draft: workstream G3 (HUD, screens, overlays, fx, i18n)

Status: draft for the lead to merge into [docs/provenance.md](../provenance.md) at I-5 ([look-spec](look-spec.md) Appendix B) · Date: 2026-10-10 · Author: Claude (Anthropic), workstream G3

## How this was made

- **Decision D-2d-0 (user, 2026-10-10).** The user's own recording and screenshot of the original's game screen may be used as a look and layout reference. Measuring sizes, positions and proportions, timing motions and sampling colours are allowed. Tracing is not.
- **What G3 made.** G3 drew no art. Every icon on the HUD is G2's (`sprite.ts`, `fish.ts`, `rule-art.ts`; see [provenance-G2.md](provenance-G2.md)). G3 wrote:
  - the DOM and CSS that place the art: the game bar, the heads pill, the fish pill, the rule cards, the helper row, the count badges, the settings dot, and the start toast's pill;
  - the motions below;
  - the copy (English, then 16 AI-drafted locales).
  
  All of it is hand-written TypeScript and CSS, from the written descriptions in look-spec §1.3–§1.7, §1.11, §1.13–§1.15 and §2.2.
- **Numbers from the recording.** These are sizes, positions, timings and sampled colours, taken from look-spec §1 and its measure notes, never from pixels in our files:
  - the bar's disc size, inset and top, and the dot's offset and size;
  - the Level and Score columns' centres and type sizes;
  - the pills' heights, insets and gap, and the heads' and fish slots' pitch;
  - the cards' container, padding, gap and diagram box;
  - the helpers' disc size and centres, and the badge size and offset;
  - the toast's height, inset and drift speed;
  - the pulse's period and peak.
- **How it was checked.** It was checked only against our own renders: our private e2e build at 402 × 874 (DSF 3), 390 × 844, 320 × 568 and 1280 × 800, with the screenshots in `docs/phase2d/screenshots/G3-*.png`. Every row of the recording's state is within ±2 px of the measured positions; `visual.spec.ts` "402 × 874 …" asserts it. The side-by-side comparison with the user's frame was built in the session scratchpad and is not committed (D-2d-0 d).
- **What was not used.**
  - No frame of the recording was traced, copied, or opened in an editor while writing CSS.
  - No source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened.
  - No image, audio or text generator other than the coding agent itself was used.

## Motions (CSS keyframes and WAAPI, hand-written)

| Motion | Where | What it does | From the recording | Ours |
|---|---|---|---|---|
| Helper idle pulse | `hud.css` `@keyframes tool-pulse`, `tool-glow`; `tool-bar.ts` `[data-pulse]`; `game-screen.ts` `--pulse-ms`, `--pulse-scale` | The suggested helper's disc grows to `fx.helperPulse.peakScale` (1.08) and its warm glow fades in (0 → 32 %). It holds (→ 36 %), shrinks back (→ 69 %) and rests (→ 100 %). One cycle is `periodMs` 1 500 ms, forever. The count badge does not scale. Reduced motion: no pulse. | the period, the peak scale and the glow's colour (timed and sampled) | the keyframe shape (two plateaus), the glow as a separate `::after` layer, and which helper pulses (`target` 'auto': the kitty while nothing is marked or placed in the attempt, then the bulb; [DECISION] in config) |
| Head found | `fx.css` `.head--pop` (the shared `bump` keyframes, `--head-ms` = `fx.headFoundMs` 300 ms); `pills.ts` | When a colour gets its cat, its head goes from 50 % to full opacity with one pop (scale 1.25 at 40 %). | the 50 % tint until found (look-spec §1.6) | the pop itself (D-2d-9, look-spec §1.6: no description of the original's change was found) |
| Head un-found | `fx.css` `.head--out`, `@keyframes head-out` | An undo (or a revive restore) on the same board fades the head back to 50 % over `fx.reducedMotionFadeMs`, with no pop. | none | all |
| Level-start toast | `start-toast.ts` (WAAPI); `fx.css` `.start-toast` | A pill with our line and our flexed-arm art (G2's `art-flex`) slides in from the inline start (`inMs` 300 ms, ease-out), `delayMs` 150 ms after the board entry starts. It holds `holdMs` 1 200 ms, then drifts out to the inline start at `exitPxPerSec` 100 px/s × s (linear) until it is off the screen. In RTL it moves the other way. Reduced motion: fade in, hold `reducedHoldMs` 1 500 ms, fade out. | the slide-in from the left edge over the rules row, the hold, the 100 px/s drift, the pill's height and inset | the copy ("You can solve this one!", "A hard one. You've got this!", "Fresh start. You can do it!"), the easing and the timings other than the drift |
| Score "+N" chip | `hud.css` `.points-pill__label`; `game-bar.ts` `clampChip` | The 2c.1 level-points "+N" sits at the Score number's inline end, centred on it. When it would reach the gear, it moves back toward the number (`--chip-dx`) so it stays at least 4 px clear of the gear. | none (the recording shows Score 0) | all |
| Period counter over the heads | `pills.ts`; `fx.css` `.pill--heads[data-out]`; `screens.css` `.period-pill[data-in-game]` | In the win flow, the heads pill fades out and the weekly period counter takes its cell (2c.1's counter, moved from column 1). Its "+3" chip sits at the number's inline end. | none | all |
| Coach card row layout | `coach.ts` `[data-row]`; `overlay-chunk.css` | On a short screen with no slot clear of the top bar and the board, "Got it" sits beside the text (a shorter card). | none | all |

## Copy

- Every English string in `src/i18n/en/ui-2d.ts` and the changed `howto.helpers` and `settings.patterns.note` are our own words (look-spec Appendix A). The recording's lines were not copied. The start toast's line is honest: it never claims that other players solved the level.
- The 16 locales' Phase 2d keys are AI drafts by the same agent, marked "Phase 2d (AI draft, unreviewed)" in each catalogue and logged in [review-log.md](../i18n/review-log.md). Terms follow [glossary.md](../i18n/glossary.md) (Score, mouse, the start toast; colour names Coral, Mustard, Violet, Pink).

## Retired in 2d (G3's files)

- The cat counter pill (`.pill--cats`), the in-row points pill, the tight fallback and the compact pill sizes (`pills.ts`, `hud.css`, `screens.css`).
- The 2c.1 rule chips' icons (the chips are now cards with G2's `ruleDiagram`).
- `fx.css`' X draw-in rules (G2's X now pops; look-spec §1.10).
- `.pill--bump .pill__icon` and the old chip CSS.

---

## Phase 2d.1 (helpers-spec, 2026-10-10): the helpers' HUD, overlay and fx

### How this was made

- **Same decision, new material.** D-2d-0 covers the user's three new recordings (v1 the mouse, v2 the kitty's cat, v3 the hint) and the two level-start stills. They were measured by script in the session scratchpad (sizes, positions, timings, sampled colours); the numbers live in helpers-spec §2–§5 and its config keys (`fx.points`, `fx.unitDone`, `fx.catPlaced`, `fx.hint`, `fx.tickers`, `layout.hint`).
- **What G3 made.**
  - Every new motion below, in hand-written TypeScript (one rAF loop whose pieces are pure functions of time) and CSS.
  - One new drawing: the **trail and burst sparkle** (`points-flight.ts` `SPARK_PATH`, a plump four-point star with gently concave sides and a cream heart). It is drawn from the words "four-point sparkles" in helpers-spec §2.5.
  - The gradients and glows: the star's round glow and comet tail, the burst's glow disc, the "+N" outline and shadow, the completion label's two-colour fill and outline, and the hint dim's rounded holes (geometry from the tile radius).
  - The copy (English, then 16 AI drafts).
- **G2's art used as is:** `fx-star4` (the flying star), `fx-shard` / `-2` / `-3` (the shards, in the tile's colour), `art-paw-cap`, `art-bolt` and `art-star` (the tickers), and the cat face on a found head. See [provenance-G2.md](provenance-G2.md).
- **How it was checked.** Our private e2e build was driven with Playwright's clock: each capture lands on an exact ms after the action, and the CSS and WAAPI animations are put at their age on that clock. The captures were set side by side with the user's frames at the same ms, in the same CSS-px box, **in the scratchpad only** (D-2d-0 d). Our side alone is committed as `docs/phase2d/screenshots/G3-2d1-*.png`.
  - Matched: the "+N" and label positions within ≈ 2 px; the card's box (y 175.2–245.5 against 174.0–244.3); Apply's top (670.4 against 672.0; ours is centred by design); the star's birth at 783 → first frame 789; the landing frame and the count-up values on our 16 ms test frames (51, 101, 147 … 576, the formula of the measured 0, 54, 104 … 576 at 60 fps); the tickers' slots within 1.5 px.
  - The visible differences are by design: our words, our art, our level (273, not the recording's), Apply centred, and our sparkle and tail drawings.
- **What was not used.** No frame was traced or opened in an editor while writing code. No source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened. No generator other than the coding agent was used. The original's sentences, its Apply label and its completion word are not in our copy (the completion word was readable in the reference frames and was deliberately avoided).

### Motions (2d.1)

| Motion | Where | What it does | From the recordings | Ours |
|---|---|---|---|---|
| Hint dim | `hint-card.ts` `dimPath`, `overlay-chunk.css` `.hint-dim`, `@keyframes hint-dim-in` | Black at 0.75 over the whole screen, with one rounded hole per cut-out tile (even-odd path). It fades in linearly over `fx.hint.dimMs` (300). The holes are measured on the opening frame and again at `dimMs`. It closes in one frame (`[data-instant]`). | the colour and α, the linear 0.30 s fade, what stays bright, the one-frame close | the SVG path and the re-measure |
| Hint card and Apply | `hint-card.ts` `hintLayout`; `overlay-chunk.css` `.hint-sheet`, `.hint-card`, `.btn.hint-apply` | The card is anchored 5.9 s above the board card and Apply 31 s below it, both centred on the board (sizes from `layout.hint`). The card grows upward to the bar, and past that its text scrolls. Apply presses to 0.90 on `:active`. | the boxes, gaps, radius, fill, shadow, type size, the press scale | Apply centred (the original's sits 6.9 px right); our close button (visually hidden, shown on focus) |
| "+N" pop | `points-flight.ts` `PLUS_SCALE`, `PLUS_ALPHA` | The orange "+576" with a white outline, one pitch above the tile: 0.53 → 1.0 at 83 → 1.15 at 166–216 → 1.0 at 350. Opaque by 33, it fades to 0.4 from 683 to 900 and is gone at 916. It is clamped 3 px inside the viewport. Reduced motion: a fade in place. | every key above, the colour, the margin | the type face and the soft shadow |
| Star flight | `points-flight.ts` `playStar`, `bezierControl`, `streakFor` | Born on the "+N" baseline at 783 (5 → 22 s px by +67), it flies from +800 on a quadratic Bézier, C = (P2.x + (P0.x − P2.x) / 3, P0.y), linear in time over 530 ms, and lands at 1 330. Its glow trails as a comet tail along the path, stretched up to 1.6× by speed; at the landing the tail runs on into the number over ≈ 5 frames. A sparkle drops behind it every frame (3–7 s px, gone in 150 ms). | the timings, the path, the yellow star with a light core, the trail | the tail drawing, the sparkle drawing, the tail's hand-over at the landing |
| Landing burst | `points-flight.ts` `playBurst` | A white-to-yellow glow disc over the digits (peak +70…+170, gone by +350). Ten sparkles: three big ones (13–15 s px) over the number and label, seven (7–12 s px) up to 30 s px around them; they drift 20 s px outward, then shrink and fade by `fx.points.burstMs` (650). | the timing, the spread, the warm glow over the digits | the drawings and the drift |
| Count-up | `game-bar.ts` `countTo`, `countValue` | From the landing frame, every frame shows `round(from + (to − from)(1 − (1 − u)²))` over `fx.points.countMs` (350). No bump, no colour change. A higher total waits for its star (`starPoints`). | the measured sequence 0, 54, 104, 153 … 576 | the hold-and-sync rules (reset on a new board, a Retry, a language change) |
| Shards | `cat-burst.ts` | `fx.catPlaced.shards` (10) of G2's shard art in the tile's colour: radial at 0.3–0.5 px/ms × s, mostly up and sideways; they fall under gravity 0.0009 px/ms² × s, then shrink and fade from 430 to `shardLifeMs` (650). Not drawn with reduced motion. | the count, sizes, speeds, gravity and fade | the seeded plan |
| Completion label | `done-label.ts` | One label per anchor tile, centred 0.82 pitch below it and clamped 2 px inside the viewport: 0.78 → 1.07 at 83 → 1.0 at 170, opaque by 60, fading from 560 to `fx.unitDone.labelMs` (720). Reduced motion: a 150 ms fade in and out. | the place, the size, the gradient fill and dark outline colours, the timings | the word ("Done!") |
| Found head | `pills.ts`, `hud.css` `.head__face`, `.head__dot`; `fx.css` `.head--pop` | A found colour's head becomes G2's cat face, with a dot of the colour at its lower inline end. It pops 0.56 → 1.2 → 1 over `fx.headFoundMs` (280). | the face, the dot's place and tint, the pop | the dot's ring |
| Helper press and release | `hud.css` `.tool:active`, `.tool--spring`, `@keyframes tool-spring`; `tool-bar.ts` | The disc presses to 0.90 in 50 ms ease-out. On release it springs 1.0 → 1.04 → 1.02 → 1.0 over 300 ms. While the board is busy (`data-busy`), the row ignores taps and keeps full opacity. | the 0.90 press, the overshoot ≈ 1.03 at +100, settled by +250 | the spring keys |
| Level-start tickers | `tickers.ts` (WAAPI), `celebrate.css` `.ticker` | Two pills with G2's paw cap cross right → left. Each takes `fx.tickers.crossMs` (9 000) over the viewport plus its own width, linearly; line 2 starts `delayMs` (150) after the board entry and line 1 `lead × T` (774) later. A late load joins mid-crossing. RTL mirrors it. Reduced motion: a fade in place, held 3 s. | the slots, the fill and border colours, the paw, the end icons, the equal crossing time, the 0.086 T lead | the copy, T = 9 s (Q1), the late join |

### Copy (2d.1)

- `src/i18n/en/ui-2d1.ts` is ours:
  - the completion word "Done!" and its screen-reader line;
  - eleven ticker lines that state only the player's own numbers (best time, levels solved, level points) or the board's (cats hiding), or general true facts (one solution, a daily puzzle, two play tips).
- None of it is the original's sentences, labels or completion word. The original's tickers state very large player totals and country counts; ours never claim numbers we cannot back.
- The 16 locales' 2d.1 keys (and `color.4` "Denim") are AI drafts by the same agent, marked "Phase 2d.1 (AI draft, unreviewed)". They are logged in [review-log.md](../i18n/review-log.md) and follow [glossary.md](../i18n/glossary.md): the completion cheer, the ticker rules, and Denim.

### Retired in 2d.1 (G3's files)

- The Score's "+N" chip and its gear clamp (`game-bar.ts` `clampChip`; `hud.css` `.points-pill__chip` / `__label`; `fx.css`' chip rise for the Score).
- The 2b hint sheet placement rules in `overlay-chunk.css`. One dead rule stays for the lead's `review2b-css` test until I-3 (requests-G3 H2).
- `fx.css`' dead `.cell.fx-drop` / `@keyframes cat-drop`, `@keyframes ghost-pulse` and `@keyframes spark` (requests-G2 H6).
- The level-start toast is no longer played by the game screen: the tickers replace it. `start-toast.ts` itself goes at I-3.
