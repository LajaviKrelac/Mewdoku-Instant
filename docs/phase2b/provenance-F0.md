# Phase 2b provenance draft: F0 (lead)

Status: draft for the lead's integration merge into [docs/provenance.md](../provenance.md) (parity-spec Appendix B) · Date: 2026-10-08 · Author: F0 foundation lead

Every item below is our own work, made without reference images, recordings or text from any other game, and no source listed in 06 §4 was opened (spec §0.2, R1, R6). All of them are interim: the owning workstream replaces them in place.

## Art (SVG, hand-coded)

| Asset | File | Method | Replaced by |
|---|---|---|---|
| Placeholder `icon-fish` | `src/ui/art/sprite.ts` (`PLACEHOLDERS`) | An ellipse, a triangle tail and a dot eye on the 24 grid. Fill from the `--fish` / `--fish-deep` tokens, with the spec §1.4 hex values as fallbacks | A (§1.7) |
| Placeholder icons `icon-plus`, `icon-shop`, `icon-globe`, `icon-crown`, `icon-users` | same | Generic line marks in the existing `LINE` style on the 24 grid | A (§1.7) |
| Placeholder `cat-ear-flick` | same | One rounded triangle on the 100 grid | A (§2.9) |
| Placeholder accessories `acc-lantern`, `acc-scarf`, `acc-yarn` | same | One circle each on the 100 grid | A (§4.4) |
| Placeholder event art element | `src/ui/art/event-art.ts` (`eventArt`) | A `div` holding the accessory placeholder symbol | A (§4.4) |

## Sound (synthesized at runtime)

| Asset | File | Method | Replaced by |
|---|---|---|---|
| `fish_pop`, `fish_plink` placeholder recipes | `src/audio/sfx.ts` | One WebAudio sine voice each. The plink rises `audio.fishPlinkStepSemitones` per fish | B (§2.2) |

## Text

| Asset | File | Method |
|---|---|---|
| The phase2b Appendix A English strings, split by owner | `src/i18n/en/{ui-2b,events,platform,i18n}.ts` | Our own wording from the spec's Appendix A (owners may refine it until M1). The endonyms in `en/i18n.ts` are the languages' own names. `tests/unit/sanity.spec.ts` checks every catalogue for the banned phrases (06 §3 plus the original's event names and "golden fish"). |
| Changed values of `a11y.mascot` and `a11y.illustration.{boot,win,fail}` | `src/i18n/en.ts` | Now describe the black-and-white cat (Appendix A) |
