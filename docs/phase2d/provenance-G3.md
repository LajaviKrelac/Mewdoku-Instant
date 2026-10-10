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
