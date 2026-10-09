# Phase 2c provenance draft: workstream G2 (UI, art, fx, audio, styles, i18n)

Status: draft for the lead to merge into [docs/provenance.md](../provenance.md) at I-5 ([fish-lives-spec §6](fish-lives-spec.md)) · Date: 2026-10-09 · Author: Claude (Anthropic), workstream G2

Every asset below is ours. It was written directly as code and text by an AI coding agent (Claude) from our own spec ([fish-lives-spec](fish-lives-spec.md) §1.2–§1.6, §2.1, §2.6–§2.7, §4.6–§4.7, §5.2–§5.4, Appendix A) and our existing art (`icon-fish`, phase2b §1.7). The user's first-hand facts (2026-10-09) told us *what* the game does: fish are the lives, the fish left at a win go to the period leaderboard, level points improve with a no-mistake streak. They did not describe *how* the original looks. No reference image was used, no source listed in [06 §4](../phase1/06-legal-and-originality.md) was opened, and no colour, size or timing was sampled from the original (spec R6). No image, audio or text generator other than the coding agent itself was used. Every value (outline opacity, durations, angles, distances, colours) was chosen here and checked only against our own screenshots of our own build (`docs/phase2c/screenshots/G2-*.png`).

## Art (SVG, hand-coded)

| Asset | File(s) | Method and tools |
|---|---|---|
| Empty-life fish `icon-fish-empty` ("a fish that is gone") | `src/ui/art/fish.ts` (`fishOutlineMarkup`, `FISH_OUTLINE_OPACITY`, the shared `FISH_TAIL` / `FISH_FIN` paths), `src/ui/art/sprite.ts` | The silhouette of our own `icon-fish` (tail, top fin, `FISH_BODY`) as one outline only: an ink stroke at 30 % opacity under a pale `--life-empty` fill, no eye, sheen or belly band; the group is scaled by (20 + 1.4) / (20 + 2w) about the body centre so its outer edge matches the full fish. Typed by hand on the 24-unit grid; `--life-empty` `#EDE8E2` is the old empty-heart wash, renamed |
| Lives pill (three fish slots, compact variant) | `src/ui/hud/pills.ts`, `src/styles/hud.css` | DOM built in TypeScript; each slot stacks `icon-fish-empty` under `icon-fish`, drawn at 114 % of the 28 px slot (23 px compact) so the fish read at HUD size. Replaces the 2b hearts pill; the hearts, `icon-heart*` and `clip-heart-*` are deleted |
| Period pill (Home top bar) and in-game period counter | `src/ui/hud/pills.ts` (`buildPeriodPill`, `createPeriodPill`), `src/styles/screens.css` | A white pill with our `icon-trophy` in `--gold` and the period total; the in-game variant adds the rolling number and the rising "+N" chip. Hand-written CSS; replaces the 2b fish pill and its "+" |
| Victory reward rows (kept fish, level points chip, perfect-streak chip) | `src/ui/overlays/victory-screen.ts`, `src/styles/overlay-chunk.css` | A white pill with the kept fish (full `icon-fish`) and the lost ones (`icon-fish-empty`) overlapping by 4 px, "+N" and the period total; under it the points chip (`--accent-soft`) and the streak chip (`--gold` / `--ink`, shown only on a perfect win). Layout ours |
| Ranking panel period board and records rows; rankings hub "This week" tab | `src/ui/overlays/ranking-panel.ts`, `src/ui/overlays/rank-hub.ts` | The 2b panel and hub with our period titles, a fish score format ("42 fish") and four record rows (this period, best period, perfect streak with its best, levels solved) |
| How to play: the lives note and the period-points note | `src/ui/overlays/how-to-play.ts`, `src/styles/overlay-chunk.css` | Our `icon-fish` and `icon-trophy` beside our own sentences |
| Out-of-fish revive badge ("+1" with a fish) | `src/ui/overlays/fail-overlay.ts`, `src/styles/overlay-chunk.css` | Our `icon-fish` at 16 px in the button badge |

## Motion (CSS keyframes and WAAPI, hand-written)

| Asset | File(s) | Method and tools |
|---|---|---|
| Fish loss on a mistake (`fx.lifeLossMs` 700 ms) | `src/ui/hud/pills.ts` (`loseLife`, `LOSS_DROPS`), `src/styles/fx.css` (`life-lost`, `life-drop`, `life-empty-in`, `hurt`) | Designed in words in spec §1.3 and drawn here: the fish wriggles (±12°, ±8°, 0–140 ms), flips out (a 6 px hop to 45°, then a 22 px fall to 180° at 0.8 scale, 140–560 ms) and fades from 300 ms; three water droplets (circles in `--fish-hi` with a `--fish-deep` rim) burst at −50°, −10° and +35° from straight up (140–480 ms); the empty outline fades in from 300 ms; the lives pill swells 6 % (`fx.lifeLossPillMs` 400 ms). Reduced motion: a 150 ms swap, no droplets. Our timing and angles, tuned frame by frame on our own captures |
| Revive pop | `src/ui/hud/pills.ts` (`popLife`, `POP_DROPS`), `src/styles/fx.css` (`life-pop`, `life-pop-drop`) | The restored fish scales 0.4 → 1.15 → 1 over 520 ms with two droplets at ±40° (300 ms) |
| Period counter roll, bump and rising label | `src/ui/hud/pills.ts`, `src/styles/fx.css` (`period-roll-in`, `period-roll-out`, `period-label-rise`) | Renamed from the 2b fish-pill motion (workstream B's, ours); the roll now keeps at most two numbers in flight when arrivals come faster than the roll |
| Fish flight from the lives pill | `src/ui/fx/fish-flight.ts` (`startScale`, `fishSpread`, `fishSizeFromRect`) | Workstream B's 2b Bézier flight, extended: it can start at full size from a life icon (`startScale` 1), its arc spread adapts to 1, 2, 3 or more fish, and its size follows the icon's rect |

## Sound

No new sound. The fish loss reuses the existing `mistake` and `heart_last` cues (ids unchanged, spec §7.3 G2 item 7); the flight keeps `fish_pop` / `fish_plink` (phase2b §8.3, ours).

## Text and translations

| Asset | File(s) | Method and tools |
|---|---|---|
| English copy of Appendix A.1 (lives say fish) and A.2 (period, streak, kept fish, How to play), plus `rank.records.streakBest` "{count} (best {best})" | `src/i18n/en.ts`, `src/i18n/en/ui-2c.ts`, `src/i18n/en/ui-2b.ts`, `src/i18n/meta.ts` | Our own words from the spec's Appendix A; the per-key notes and length limits in `meta.ts` are ours |
| Phase 2c redraft of the 16 catalogues (AI drafts, unreviewed) | `src/i18n/locales/*.ts` (the A.1 lines in place; a block headed "Phase 2c" at the end of each) | Written directly as TypeScript by Claude (Anthropic) for G2 on 2026-10-09 from our English copy, `meta.ts` and the glossary only, the same brief as phase2b (provenance §8.4). Logged as unreviewed in [`docs/i18n/review-log.md`](../i18n/review-log.md) |
| Glossary rows: fish as a life and a ranking point, points, weekly ranking, this week, perfect streak, shop without swap | `docs/i18n/glossary.md` | Claude for G2, 2026-10-09 |

## Dev-only material (not shipped)

The private frame-capture harness used to tune the motion (virtual time over `setTimeout` and `document.getAnimations()`) lived in the session's scratch directory and is not in the repository. The screenshots in `docs/phase2c/screenshots/G2-*.png` and `docs/i18n/screenshots/` are of our own build.
