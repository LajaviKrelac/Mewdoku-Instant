# Phase 2b provenance draft: workstream B (animation, win-flow UI, new screens)

Status: draft for the lead's integration merge into [docs/provenance.md](../provenance.md) (parity-spec Appendix B) · Date: 2026-10-09 · Author: workstream B

Every item below is our own work. It was made from the written spec ([parity-spec](parity-spec.md) §2, §4.4, §5.5, §5.6, §8.5) and our own Phase 1 research notes only: no reference images, screenshots, recordings, Spine files, audio or text from any other game were used, nothing was traced or sampled (R1, R6), and no source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened. The original's animation timings are not known; every duration below is a `GameConfig` value fitted to the spec's wait-time targets (§0.2: the 4.5 s reward window, the panel tap, the next board), not measured from the original.

The art these pieces move (Tux, the fish symbol, the icons, the accessories, the event patterns) is workstream A's and is listed in [provenance-A.md](provenance-A.md). B only places and animates it.

## Motion (code: WAAPI and CSS keyframes)

| Asset | File | Method |
|---|---|---|
| Fish flight (three fish, pop, hold, flight, trail) | `src/ui/fx/fish-flight.ts`, `src/styles/fx.css` | A quadratic Bézier from each source cat to the pill icon; the control point is the midpoint lifted perpendicular by `fx.win.fishArcLift` × distance with a fixed −10 % / 0 / +10 % spread per fish (§2.3). The path is sampled at `fx.win.fishPathSamples` keyframes with our cubic-bezier(.45,0,.25,1) easing solved in JS; the fish tilts along its path (capped at 70°), mirrors when it swims left, shrinks to `fishEndScale`. Pop overshoot 1.15. Trail: five four-point stars in `--gold`. The schedule runs on timers, so arrivals never depend on WAAPI. |
| Solved-board glow | `src/ui/fx/glow.ts` | Opacity 0 → 1 → `glowSettleOpacity` on A's `.cell__glow`, staggered in row order (§2.2). |
| Screen transitions | `src/ui/fx/transitions.ts` | `to_game`: fade and scale to 0.98 out, slide up 16 px in after 80 ms; `from_game`: crossfade with a 0.92 → 1 pop of the Home mascot; reduced: a 120 ms crossfade (§2.9). |
| Board entry wave | `src/ui/board/board-fx.ts` (`entryEndMs`), `board-view.ts`, `fx.css` | Card rise 24 px + fade; tiles scale 0.6 → 1.04 → 1 along the diagonals (r + c) × stagger (§2.9). |
| Board-cat idle loops | `board-view.ts`, `fx.css` | Breathing scale 1 → 1.02 with a per-cat phase from our own integer hash; ear flick (A's `cat-ear-flick` overlay turned 10°) on JS timers every 8–14 s; idle mood only, never with reduced motion. |
| Heart break | `src/ui/hud/pills.ts`, `fx.css` | One 700 ms timeline: a ±2 px shake, a white zigzag crack along the sprite's existing split line, the two halves falling (translate ∓22 % / +60 %, rotate ∓28°), three triangle shards flying 18 units at 35–60° from vertical, the empty outline fading in (§2.9). |
| Fish pill motion | `pills.ts`, `fx.css` | Fade-in, number roll (old number out up, new in from below), icon bump, the rising "+3" chip (§2.2). |
| Victory sun rays | `src/styles/screens.css`, `fx.css` | A 12-ray `repeating-conic-gradient` in `--accent-soft` with a radial fade mask, one turn per `fx.victoryRaysTurnMs`; static with reduced motion (§2.5). |
| Ranking panel pop, tap pulse, fade-out | `fx.css` | Scale 0.9 → 1.03 → 1; footer opacity .55 ↔ 1; 200 ms fade-out (§2.4). |

## Layout and UI (code)

| Asset | File | Method |
|---|---|---|
| Fish pill | `src/ui/hud/pills.ts`, `screens.css` | A white pill with A's `icon-fish`, the count and an orange "+" disc. |
| Ranking panel, rankings hub, victory screen, shop sheet, group result, event screen, Home event card, Settings language view, O2 swap button | `src/ui/overlays/*.ts`, `src/ui/screens/*.ts`, `screens.css`, `overlays.css` | Our own layouts built from the spec's tables, using the Phase 2 component vocabulary (cards, pills, sheets, the stage panel) and A's tokens only. |

## Sound (synthesized at runtime)

| Asset | File | Method |
|---|---|---|
| `fish_pop` | `src/audio/sfx.ts` | Our own recipe, replacing the F0 placeholder: a sine bending 360 → 1 020 Hz in 110 ms, a sub-octave body and a short low-passed noise splash ("bloop"). |
| `fish_plink` | `src/audio/sfx.ts` | Our own recipe: a sine at E6 raised `audio.fishPlinkStepSemitones` per fish, an inharmonic ×2.76 partial for a bell-like sheen, a soft ×2 triangle and a 15 ms high-passed click. |

## Text (English, `src/i18n/en/ui-2b.ts`)

Our own wording, added on top of the Appendix A keys (which keep their values): `rank.entries.one/other`, `rank.records.thisPuzzle`, `rank.tab.today`, `rank.tab.event`, `rank.tab.groups`, `shop.swap.a11y`, `shop.buy.a11y`, `shop.retry`, `group.wins`, `event.track.title`, `event.track.node`, `event.track.reached`. The copy says "fish" (never "golden fish") and "kitty"; it passes `tests/unit/sanity.spec.ts`.

## Dev-only (not shipped)

`dev/b-harness.html`, `dev/b-harness.ts`: the visual harness for these screens and the §2.2 timeline. Screenshots in `docs/phase2b/screenshots/B-*.png` were taken from it with Playwright (our own build, our own art).
