# Phase 2b "parity" spec: close the 8 headline differences

Status: Phase 2b spec, ready to build after review · Date: 2026-10-08 · Owner: game design + tech lead · Branch `claude/mewdoku-instant`

Review pass (2026-10-08): checked with three lenses (implementer, platform truth, originality) and fixed in place. Appendix C lists what changed and why.

Revision (2026-10-08, user decisions): **one theme only** (the Classic look; the ginger skin and the skin system are removed); defaults for the open decisions; **parity first** (where the draft deviated from the original for taste, it now follows the original). Appendix D lists what changed.

Inputs: [differences-vs-original](../phase2/differences-vs-original.md) (the 8 headline differences, tables §2–§6), [01](../phase1/01-game-deconstruction.md) (what we know about the original, with confidence tags), [02](../phase1/02-rebuild-spec.md), [04](../phase1/04-architecture.md), [05](../phase1/05-fbig-platform.md), [06](../phase1/06-legal-and-originality.md), [STATUS](../phase2/STATUS.md), [CONTRACTS](../phase2/CONTRACTS.md) and the current source (`src/**`, read 2026-10-08).

---

## 0. Read me first

### 0.1 The decision and what this spec covers

The user's decisions:

- **Close all 8 headline differences, and make the game match the original as closely as possible.** Phase 2 (2b included) is about parity; Phase 3 will differentiate later. Where this spec still differs from the original, the reason is a platform rule, legality (the clean-room rules, §0.2–§0.3) or an original behaviour we do not know, never taste; the accessibility extras the user kept (headline 7) are the only other exception. §0.7 lists each remaining difference with its reason.
- **One theme only.** The Classic look (our own "Tux" tuxedo-style cat, orange accents, white X, even gutters, off-white page) is *the* look of the game. It replaces the current ginger look: the ginger art, the teal tokens and the region-aware gaps are deleted from the codebase, not kept as an alternative. There is no skin system and no skin setting. Design tokens still live in CSS custom properties, as one set.

Each section §1–§8 maps to one headline item and has the same parts: target, what the original does (with our confidence), our design, exact numbers, data/config/save changes, code areas, FB vs web, tests, and `[DECISION]`s for every unknown. §9–§13 cover the save migration, config, bundle budget, the parallel work plan and acceptance.

"Mewdoku" stays the code name. Every user-facing name comes from `app.name` (06 §6). The public name is still pending `[DECISION: default, user may change]`: the build runs under the code name, and choosing the name gates the public release (G-NAME, §13), not the build.

### 0.2 The clean-room line, including "steal animations"

The user asked us to "steal animations if needed until we finish the first phase". We do this in the only form that is safe: **we reproduce the choreography, timing, staging and feel that our research describes in words, with animation code and art we make ourselves.** We do not extract, trace or reuse any of the original's files, not even as temporary placeholders. The reasons:

1. The original's cat and win animations are Spine files: copyrighted expression, not ideas (06 §1, §3).
2. The only catalogue of those files is a source we must not open (06 §4, `yizong-boop/meowdoku-site`).
3. Temporary placeholders tend to ship. The publisher is in active IP litigation (01 §1.10), so a single leaked frame is a takedown risk for the whole project.
4. There is little to copy anyway: the original's animation timings are not known, except as **wait times** that automation tools allow (4.5 s for the fish, about 8 s until the leaderboard closes, 3 s for the next board). We use those waits as our **total-duration targets** (§2.2).

So that animation work is never blocked by art, F0 puts **our own placeholder shapes** behind every new symbol id: a fish is an ellipse plus a triangle, and an accessory is a small circle. The existing cat symbols and poses keep today's art as the interim until A replaces it in place with Tux. B animates from day 1, and A replaces each placeholder as the final art lands (§12.1). None of the old ginger art ships (§1.8).

Hard rules, unchanged from 06 and repeated here:

- No art, Spine files, audio, text, store or UI strings, level layouts or event names ("Meow Cup", "Long Live Meow", "Moonlit Meows") from the original.
- No tracing of screenshots. Never open a source listed in 06 §4.
- Every new asset gets a row in `docs/provenance.md`.

Our copy says "fish", never "golden fish" (differences §4: the fish *presentation* stays ours).

### 0.3 Legal risk the user has accepted (read before shipping)

**Residual trade-dress risk, in short (for the user).** Every drawing, sound and word in the game is ours, so nothing in it copies the original's protected *expression*. The risk that remains is the *overall look*: a black-and-white cat on pastel tiles with white crosses, orange buttons and titles, and an off-white page is the combination players know from Meowdoku. Some jurisdictions protect such a combination as trade dress, or treat it as passing off when it could confuse players about who made the game. Store or platform review can also reject it as a look-alike. The publisher is reported to be in active IP disputes (06 §1), which raises the chance that someone acts on it. The risk is highest with a confusable name such as "Mewdoku", and drops a lot with a distinct public name, our own cat with visible signature marks, and our own event and store art. Work goes ahead, and the user accepts this residual risk. Before any public release we need a lawyer's review (gate G-LEGAL below). This is our own reasoning, not legal advice (06).

This spec deliberately reverses two Phase 1 rules:

- 06 §3, "Trade dress combination": the *combination* of tuxedo cat, cream page, orange pill buttons and white X on pastel tiles.
- 06 §7 and differences §4: "any future leaderboard or victory screen must not bring back orange titles or buttons".

The Classic look brings that combination back on purpose, as the game's only look. Mitigations, all required:

| # | Mitigation | Where |
|---|---|---|
| R1 | Every drawing, sound and string is our own, with a provenance row. Our cat has its own signature marks (§1.6: an asymmetric blaze and a notched ear), its own poses and its own fish. | §1.6, §2.8, provenance |
| R2 | *Withdrawn (user decision 2026-10-08).* There is no fallback look: Classic is the only theme, and the user accepts the residual risk above. | — |
| R3 | **Gate G-LEGAL.** No public release (FB production or a public web URL) until an IP lawyer has reviewed the Classic look together with the final public name. Add it to the 05 §13 checklist. | §13 |
| R4 | Update 06 §3 and §7 in the same PR: mark both rows "reversed by user decision 2026-10-08, see phase2b/parity-spec §0.3". | Appendix B |
| R5 | A distinct public name is now a **hard prerequisite for release** (not for the build). "Mewdoku" plus the Classic look is the highest-risk combination (06 §6.1; naming shortlist). | §0.1, §13 |
| R6 | No colour, size or timing is **sampled** from the original (no colour picker on screenshots or video, no frame counting from recordings). The parity review (§1.14) reports impressions in words; we then pick our own values. | §1.14 |
| R7 | Store art and the listing (Phase 4) do not use the Classic board as their hero image next to orange captions. They use our cat's poses and our event art, in a caption style unlike the original's sky-blue band (06 §3, Branding). | Phase 4 |

### 0.4 Conventions

- **Confidence** applies to claims about the original only, as in 01: *confirmed* · *likely* · *inferred* · *unknown*.
- **FB SDK facts** are tagged **[05: confirmed]**, **[05: likely]**, **[search: Meta docs]** or **[uncertain]**.
  - *[search: Meta docs]*: read on 2026-10-08 through web-search summaries of developers.facebook.com pages (WebFetch to Meta is blocked). That is stronger than 05's third-party evidence, but still not first-hand. *[search: Meta forum]* is the same for a single post on Meta's developer forum.
  - *[uncertain]*: neither 05 nor that search settles it.
  - Every tag except *[05: confirmed]* must be verified on developers.facebook.com before the feature is switched on in production (§14). Until then, the design must still work when the API is missing: each FB feature has a stated fallback.
- **`[DECISION]`** marks our own choice wherever the original is unknown. Every number that code reads lives in `GameConfig` (§10).
- **`[DECISION: default, user may change]`** marks a default the user accepted on 2026-10-08 for an open question. It holds until the user changes it, and it lives in config wherever it can (§0.8).
- **CSS-only motion constants** (keyframe percentages, rotation angles, sway amplitudes) may live as custom properties at the top of `fx.css`, as Phase 2 did with `--t-drop`. Any value that JS also reads (durations that gate input, timers, sizes used for geometry) lives in `GameConfig` and is mirrored into CSS by the screen.
- Sizes are CSS px. "Slot" is the cell's grid slot (02 §19). Times are ms from the event named.
- File paths are relative to the repo root. **New** marks a file that does not exist yet.

### 0.5 What does not change

Rules, the reducer and the mistake model; gestures; the engine; the 1 000 levels and the daily packs; hearts, revive and the hint and kitty behaviour; the tutorial script; the save-merge principles; the clean-room process. The layering rules of CONTRACTS §2 still hold.

The paw booster keeps its current user-facing name, **Kitty** (`game.tool.kitty`, plural "kitties"). All new copy (shop, rewards, events, groups) uses that name.

### 0.6 Platform matrix (summary)

| Feature | FBIG build | Web build (production) |
|---|---|---|
| The look (one theme), win flow, fish, motion | yes | yes |
| Interstitials | yes, from completed level 10, cooldown 120/100/90 s (the original's reported values, unchanged from Phase 2) | none (no ad network) |
| Banners | yes, from completed level 10, on **Home, the victory screen and the event screen only, never during play** (Meta's guidance, §3.2), **if** the SDK reports both banner APIs `[DECISION: default, user may change]` | none |
| Rewarded (hint, kitty, revive, group ×2) | yes | free fallback grant, 10-minute cooldown (unchanged) |
| Events | yes | yes (event top list shows personal results only) |
| Rankings | FB leaderboards (whichever of the two leaderboard APIs the SDK reports, §5.4) and overlay views; each part capability-gated, falling back to personal records | personal records and an honest empty state |
| Group challenges | FB tournaments, behind flag `groupChallenges` until §14 G2 is verified | hidden |
| Languages (17) | locale from `FBInstant.getLocale()`. Dev and preview builds carry all 17; release builds only `i18n.releaseLocales` (§6.7) | locale from `navigator.languages`; the same build rule |
| Purchases | facebook.com and Android only (not iOS, not Messenger.com), when `onReady` fires | hidden; the shop sheet offers only "swap fish" |

### 0.7 Where 2b still differs from the original, and why

Parity is the goal (§0.1). Every difference that remains is there because of a platform rule, legality or an original behaviour we do not know, or because the user chose to keep it for accessibility (headline 7, and the accessibility minimum behind the X edge). None is there for taste: the draft's taste-driven differences were reverted in this revision (last table).

| Difference | Reason |
|---|---|
| Our own cat (Tux, with signature marks; no tears, no instrument), fish art, sounds, strings, event names and event themes; copy says "fish", never "golden fish" | legality (R1; 06 §3; differences §4) |
| Our own colour, size and timing values: the region palette, every token, all durations (fitted to the reported wait times, §0.2) | legality (R6: no sampled values); the original's values are unknown |
| A thin tinted edge under the white X (1 px at a 25 px slot) | the accessibility minimum (02 §0, WCAG 1.4.11); white alone is 1.23–2.39:1 on our tiles (§1.5) |
| Banners never during play (the original may show them in play); they start, like the original's reported start, at about level 10 | platform (Meta's guidance, §3.1) `[DECISION: default, user may change]` |
| No ads on the production web build; a free fallback grant instead | platform (no ad network) |
| Other players' names only inside FB overlay views; personal records on the web; group rewards for taking part | platform (§5.2, §5.6) |
| No subscriptions; no purchases on iOS, Messenger.com or the web | platform (§8.2) |
| What fish buy, the points table, what each board ranks, event contents (21 puzzles, milestones, no pass) | the original is unknown (differences §6 #1, #2, #13) |
| The style of the board entry, screen transitions, idle motion, heart break and the victory-screen layout | the original is unknown (only "the board animates in" is *likely*) |
| 17 languages (the iOS app lists 62) | the Android list is unknown; more can follow in Phase 3 |
| Accessibility extras (colour patterns, Reduce motion, screen reader, keyboard) | kept by the user's headline-7 decision; all off or invisible by default |
| A web boot screen; keyboard and mouse input | platform (web) |

Reverted to the original's behaviour in this revision:

| Draft | Now |
|---|---|
| Interstitial cooldown 90/75/60 s, lowered for taste | the original's reported 120/100/90 s (§3) |
| "Wider gaps between colours" option (region-aware insets) | even gutters only, like the original; region-aware gaps are deleted (§1.5) |
| "Dark crosses" option (the old ink X) | white X only, like the original (§1.5) |

### 0.8 Open decisions and their defaults

Each row is `[DECISION: default, user may change]`.

| Decision | Default | Where |
|---|---|---|
| Banners | Home, victory and event screens only (where Meta's guidance allows), from 10 completed levels, never during play | §3.2 |
| Fish exchange rates | 1 hint = 15 fish, 1 kitty = 30 fish | §2.8, `shop.*` |
| IAP prices | No Ads 3.99, Bulb Bundle 1.99, Kitty Basket 1.99, Fish Bucket 1.99, Fish Crate 4.99 (USD, set in the dashboard) | §8.3 |
| Translations | AI drafts for all 16 locales now. Release builds ship only the locales in `i18n.releaseLocales` (default `['en']`); dev and web preview builds show all 17 | §6.7, `i18n.*` |
| Public name | Still pending. The build runs under the code name through `app.name`; the choice gates the public release (G-NAME), not the build | §0.1, §13 |

---

## 1. The look: Classic, the only theme (headline 1)

### 1.1 Target

One look, **Classic**, that matches the original's look and replaces today's everywhere:

- our own dark tuxedo-style cat, "Tux";
- orange primary buttons and titles;
- white X marks on pastel tiles;
- even white gutters between all tiles, rounded flat tiles, no grid lines;
- an off-white page.

The current ginger look is **removed**, not kept: the ginger cat parts and poses, the teal tokens, the ginger colour literals and the region-aware gaps are replaced in place (§1.8). There is no skin system, no runtime switching and no skin setting.

### 1.2 What the original does

| Trait | Original | Conf. |
|---|---|---|
| Cat piece | Cat head with dark (black) fur, probably white face (tuxedo); Spine-animated (unverified) | likely (01 §12.4; differences §3.1) |
| Accent | Orange main-menu level button, orange "Level N" victory button, orange leaderboard title | likely (Android tools) |
| X mark | Thick white cross, round caps; weakest on yellow | likely (iOS + Web-Y) |
| Gutters | Evenly spaced white gutters; no grid lines, no region borders, no frame | confirmed (tiles, gaps, no strokes), likely (even, white) |
| Page | Off-white or cream page; white board area | likely |
| Tiles | Rounded, flat, fairly saturated pastels, up to 12 colours | confirmed (character), likely (12) |
| Done region | Colour fades or mutes | likely |
| Solved board | Cats glow | confirmed (iOS store art), presumed on Play |
| Chrome | Heavy rounded type, white pill counters, rounded cards with soft shadows, dark full-screen overlays | likely (Web-Y) |

### 1.3 Theme tokens (one set)

| Piece | Spec |
|---|---|
| Tokens | `src/styles/tokens.css` holds the **one** token set: the shared tokens (type scale, spacing, radii, motion, layout) and every colour token of §1.4. The §1.4 values replace today's values in place. No other stylesheet uses a literal colour (§1.12). Tinted shadows and glows use RGB-triplet tokens (`--ink-rgb`, `--accent-rgb`, `--gold-rgb`), written as `rgba(var(--accent-rgb), .28)`; that syntax works on the 04 §1 browser baseline. |
| TS mirror | `src/ui/art/palette.ts`: `TOKENS` gets the §1.4 values and `CAT_COLORS` the Tux colours (§1.6), both replacing today's values; new `xEdgeColor(paletteIndex)` (§1.5). `palette-check` reads `TOKENS` (§1.12). |
| Region palette | **[DECISION] Keep our 12 region colours (02 §17.2), indexed as today.** Why: (a) the original's tile colours are known only in words ("fairly saturated pastels"), and our palette already fits that description; (b) R6 forbids sampling theirs; (c) the passing ΔE and CVD results, colour assignment (`regionColorsFor`) and the colour names in hints stay valid. |
| Cat symbols | The sprite's cat symbols keep their ids (`cat-idle`, `cat-happy`, `cat-sad`, `cat-surprised`, `cat-blink`) and get Tux content; `cat-ear-flick` is new. Every `<use>` on the board is unchanged. |
| Event overrides | An active event can set the attribute `[data-event-theme='<id>']` on the event screen and the event game screen only (§4.4). Its blocks live in `tokens.css`. It may override `--page`, `--page-art`, `--board-card` and `--glow`, plus the cat accessory. It may never override region colours, `--ink`, `--wrong` or the X tokens. |

### 1.4 Colour tokens (values chosen by us)

Contrast ratios below were computed with `scripts/palette-check.ts`'s own `contrastRatio` on 2026-10-08.

| Token | Value | Use | Checked contrast |
|---|---|---|---|
| `--page` | `#FAF6F0` | page | — |
| `--page-2` | `#F1EADF` | wells, desktop side fill | — |
| `--card` | `#FFFFFF` | board card, pills, sheets | — |
| `--ink` | `#2F2A35` | text, outlines | 12.97 on page |
| `--ink-2` | `#665E6C` | secondary text | 5.20 on page-2, 5.77 on page |
| `--ink-3` | `#B2AAB4` | disabled, hairlines | no text use |
| `--accent` | `#E57010` | primary button fill, focus fill, hint ring | white label **3.15** → allowed only for labels ≥ 24 px (WCAG large text); 3.15 vs card as a graphic |
| `--accent-deep` | `#B4560A` | 4 px bottom edge of primary buttons | — |
| `--accent-title` | `#D2620C` | large titles (≥ 24 px) on light surfaces | 3.55 on page, 3.82 on card |
| `--accent-text` | `#A84B08` | small accent text; background of small badges with white text | 5.31 on page, 4.78 on page-2; white on it 5.71 |
| `--accent-soft` | `#FDE9D6` | icon wells, victory rays | — |
| `--focus` | `#B9520A` | focus ring | 4.56 on page, 4.91 on card |
| `--title-on-dark` | `#E57010` | ranking-panel title on `--stage` | 4.78 |
| `--tap-text` | `#FFD45C` | "Tap to keep going" on the scrim | 7.26 |
| `--stage` | `#2A2430` | solid dark panels (ranking, O4) | white on it 15.07 |
| `--scrim` | `rgba(28,23,32,.82)` | full-screen dim | white on scrim-over-page 10.28 |
| `--gold` | `#FFC23D` | glow, sparkles (graphics only) | — |
| `--fish`, `--fish-deep`, `--fish-hi` | `#FFB81F`, `#C98200`, `#FFE08A` | fish art | fish outline is `--ink` |
| `--glow` | `rgba(255,194,61,.65)` | solved-board glow | — |
| `--heart`, `--danger`, `--wrong`, `--hard` | unchanged (`#E8506A`, `#D33A4A`, `#A3193A`, `#6C3FB5`) | — | `--wrong` ≥ 3.18 on every tile; white on `--hard` 6.96 |

Primary-button rule:

- `.btn--primary` always uses `font-size: 1.5rem` (24 px) with `text-shadow: 0 1px 0 rgba(120,50,0,.35)`.
- No smaller white text ever sits on `--accent`. Count badges on orange use the `--accent-text` background.
- `palette-check` lists the pair "white on `--accent`" as a large-text pair (`min: 3`), which is valid only because of the 1.5rem rule. A CSS unit test asserts that rule (§1.12).

### 1.5 Board look

| Item | Spec |
|---|---|
| Card | white, padding 10 px, radius 18 px, shadow `0 2px 0 rgba(47,42,53,.05), 0 10px 26px rgba(47,42,53,.08)` |
| Gutters | **even**, like the original: every tile inset 2 px on all sides (4 px white gutter) when slot ≥ 30 px; 1.5 px (3 px gutter) below 30 px. No inset depends on regions; the region-aware insets are deleted. |
| Tile radius | 20 % of slot |
| Grid lines, region strokes, frame | none |
| X mark | **White** X, round caps, 54 % of the cell (path 23→77 on the 100-unit box), stroke 12 units. Under it, an **edge** stroke of 12 + 2×4 = 20 units in `--xe`, where `--xe` = `mixHex(tileColour, --ink, 0.70)` per palette index (`xEdgeColor(paletteIndex)` in `palette.ts`; board-cells sets `--xe` on each cell). That is 1 px at a 25 px slot and 1.44 px at a 36 px slot. The white X is the only mark style; the old ink X is deleted. |
| X contrast (checked) | white vs tile only 1.23–2.39, so **the edge carries WCAG 1.4.11**: edge vs tile ≥ **3.32** (worst: Slate), white vs edge ≥ **6.27**; on faded tiles the edge vs tile is higher |
| Wrong cell | `--wrong` X (stroke 11) plus a 2 px ring (unchanged); ≥ 3.18 on every tile |
| Cat size | 0.84 × slot |
| Done region | veil 45 % toward `--page`, 400 ms (unchanged) |
| Solved glow | §2.2 |
| Pattern glyphs | unchanged (`--ink` at 85 % / 65 %); ≥ 3:1 on every tile |

### 1.6 Cat design brief: "Tux" — our own character

Tux replaces the ginger cat everywhere: board heads, moods and every pose. Drawn by hand as SVG path data on the same grids as today: a 100-unit grid for board heads and a 200-unit grid for poses. **No reference images**: draw from this brief, and log it in provenance.

**Silhouette and signature marks**

| Part | Shape (100-unit head grid) |
|---|---|
| Head | A wide, soft "bun", 80 wide × 60 tall (x 10–90, y 28–88). Flat on top; cheeks bulge slightly below the eye line. |
| Ears | Rounded triangles: base 26, height 24, tilted 12° outward. **The left ear has a small rounded notch, 3 units deep, near the tip** (signature mark). |
| Mask (white) | An inverted-V blaze that starts between the eyes at y 40 and widens to the muzzle (x 32–68 at y 70) and the chin (y 86). **Asymmetric: on the right side it reaches up to the right eyebrow** (signature mark). |
| Eyes | Iris ellipses rx 6.2 / ry 7 in `#BFE38A`, pupils rx 3.6 / ry 5.4 in `#16131A`, one 1.6 catchlight each, centres at x 36 / 64, y 54. |
| Nose, mouth | Rounded-triangle nose `#F28AA0` at y 62; a small ink "w" mouth on the white mask. |
| Whiskers | Two per side, `#F6F0E8` at 70 % over the fur and ink at 40 % over the mask. Only two, so the head reads cleanly at small sizes. |
| Body (poses) | Dark body, white bib (a rounded shield on the chest), white front-paw socks, and a dark tail with a white tip. |

**Palette (ours)**

| Part | Hex |
|---|---|
| fur, fur sheen | `#2E2A33`, `#46404E` |
| outline | `#16131A` (2 px non-scaling on the board; 3.4 units on the 200 grid) |
| white mask, bib, socks, tail tip | `#FBF8F4` |
| inner ear, nose, blush, mouth | `#F2A3B4`, `#F28AA0`, `#FF8FA6` at 45 % (on the mask only), `#6B2B3F` |
| expression lines **on dark fur** | `#F6F0E8`. Ink lines vanish on black fur, so happy-eye arcs, sad brows and closed lids are light. |

Checked against every tile, normal and faded: fur ≥ 5.87:1, outline ≥ 7.68:1. The cat reads as a dark shape on any tile, as the original's does (differences §3.1).

**Moods** (board symbols; mood swaps change `<symbol>` content, no tween, as today)

| Mood | Eyes | Ears | Mouth | When |
|---|---|---|---|---|
| idle | open irises | up | "w" | default |
| happy | light arcs `^ ^` with blush | up, tilted 4° out | open, pink tongue | win (from t = 300 ms) |
| sad | irises half-covered by fur lids, light worried brows | drooped 25° | small frown | mistake, for `fx.sadCatsMs` (1 500 ms) |
| surprised | round irises (r 7), small pupils | up and pricked (+3 units) | small "o" | kitty reveal |

No tears, in any mood or pose (06 §3: the original's fail cat cries).

**Poses** (200-unit grid). They replace today's poses in the same modules, so every export keeps its name and signature: `home` and `boot` in `src/ui/art/mascot.ts` (`mascotIllustration(kind)`), the others in `src/ui/art/illustrations.ts` (`illustration(kind)`).

| Pose | Description | Bundle |
|---|---|---|
| `home` | Sitting upright, front paws together (white socks), tail curled right with its white tip; head tilted 4°. The tail and head are separate groups (`.pose__tail`, `.pose__head`) for the idle loop (§2.9). | main |
| `boot` | Curled asleep, nose under tail; two floating Zs (existing CSS). | main (web only) |
| `win` | Mid-leap, both front paws holding one of our fish above the head, eyes `^ ^`, three sparkles. **No instrument.** | overlay chunk (as today) |
| `fail` | Lying flat (pancake), ears back, one paw over the eyes, two small sweat drops. **No heart, no tears.** | overlay chunk |
| `daily` | Peeking over a calendar page; one paw on the page edge. | overlay chunk |
| `tutorial` | Sitting, one paw raised (wave loop, existing CSS). | overlay chunk |
| accessories | `acc-lantern`, `acc-scarf`, `acc-yarn` (§4.4): separate symbols layered on head and pose. | lazy (events chunk) |

**Idle loop:** §2.9.

### 1.7 Fish and new icons (A draws; B animates)

| Symbol | Spec (24-unit grid) |
|---|---|
| `icon-fish` | A plump fish facing right: body ellipse 16 × 10 in `--fish`; a belly band in `--fish-deep` at 40 %; a forked tail; a top fin in `--fish-deep`; eye white r 1.6 with an ink pupil r 0.9; a sheen arc in `--fish-hi`; ink outline 1.4. It must read at 16 px. |
| `icon-plus`, `icon-shop` (basket), `icon-globe` (language), `icon-crown` (rank #1), `icon-users` (group) | Same 24 grid and line style as the existing icons (`LINE` in `sprite.ts`). |

### 1.8 What is removed

The ginger look is replaced in place, not kept. By the end of 2b none of the following exists in `src/` (a test enforces it, §1.12):

- the ginger cat: its head parts, moods and poses (`cat-parts.ts`, `mascot.ts`, `illustrations.ts` now hold Tux), and the ginger `CAT_COLORS`;
- the teal tokens and every ginger or teal colour literal (the side-pattern dots, the button and hint glows, `#c8651e` on the paw icon);
- the dark-ink X mark (`layout.markOpacity` 0.7) and the region-aware insets (the region branch of `layout.ts`);
- the descriptions of the ginger cat in existing a11y strings (their English values change, Appendix A).

The new screens (ranking panel, victory, shop, event) use tokens only. Provenance marks the ginger-art rows "retired in 2b" (Appendix B).

### 1.9 Data, config, save

- Save: no look settings. There is no skin, gaps or mark-style setting (§9).
- Config: the existing `layout.*` keys get the §1.5 values, and five `layout.*` keys are new (insets, X edge); `layout.insetSamePx` and `layout.insetDiffPx` are no longer read (§10).
- Settings O5 gets no look rows. Its new rows are Language (§6) and Shop / Remove ads (§8).

### 1.10 Code areas

| File | Change |
|---|---|
| `src/styles/tokens.css` | the one token set of §1.3 and §1.4, replacing today's values; RGB-triplet tokens for tinted shadows and glows; the `[data-event-theme]` blocks (§4.4); the per-script `--font-display` stacks (§6.6) |
| `src/styles/board.css`, `hud.css`, `base.css` | tokens only. Phase 2 left colour literals in these files: the ginger and teal side-pattern dots, the teal button and hint glows, `#c8651e` on the paw icon, `#d8c6cd`. A turns each into a token. Also: the X edge underlay; the `.cell__glow` look (a radial gradient of `--glow`, 1.3 × slot) and the `.cell__ear` overlay that B animates; the `.btn--primary` 1.5rem rule; the banner reserve hook `.screen[data-banner] { padding-bottom: calc(var(--banner-reserve) + var(--safe-bottom)) }` (§3.2); the latin-ext `@font-face` (§6.6) |
| **new** `src/styles/art.css` | art-bound motion: the Home mascot's tail sway and head tilt (§2.9), accessory and event-pattern styles |
| `src/ui/art/palette.ts` | `TOKENS` and `CAT_COLORS` with the new values; `xEdgeColor(paletteIndex)` |
| `src/ui/art/cat-parts.ts`, `mascot.ts`, `illustrations.ts` | Tux replaces the ginger art in place (§1.6); exports keep their names and signatures. `mascot.ts` also runs the Home mascot's head-tilt timer (§2.9). |
| `src/ui/art/sprite.ts` | Tux moods behind the existing cat ids, new icons, `cat-ear-flick`; `mountSprite(doc?)` unchanged. F0 puts placeholder art behind every new symbol id (§12.1). |
| `src/ui/board/layout.ts` | **new** `evenInsets(n, slotPx, c?)`: every cell gets the same inset (`layout.insetPx`, or `layout.insetSmallPx` below `layout.insetSmallBelowSlot`), returned as today's `CellInsets[]`. F0 adds it and switches B's call in `board-view.ts`; A then deletes `regionInsets`. |
| `src/ui/board/board-cells.ts` | X underlay `<path class="cell__xe">` and the per-cell `--xe`. Every cell also gets two inert nodes that B animates: `.cell__glow` (an empty `<span>` behind the cat, for §2.2) and `<use class="cell__ear" href="#cat-ear-flick">` (hidden unless `.is-flick`, for §2.9). |
| `src/ui/hud/top-bar.ts` | fish pill slot on Home (§2.5) |
| `src/styles/overlays.css`, `fx.css` (B) | B removes the colour literals left in its own stylesheets (the stage button states, `#fff6d6`, the gold coach and hint pulses, the confetti fallback), using A's tokens |
| `scripts/palette-check.ts` | the new token pairs and the X edge checks (§1.12) |

### 1.11 FB vs web

Identical. On FBIG the FB safe zone (top-left 64 × 64) is unchanged.

### 1.12 Tests

| Test | What |
|---|---|
| `scripts/palette-check.ts` (extended; `npm run palette:check`) | For the one token set: ΔE matrix and pairwise ≥ 10; CVD report. For each tile, normal and faded: the X edge vs tile ≥ 3 **and** white vs edge ≥ 3, cat outline ≥ 3, cat fur ≥ 3, wrong X ≥ 3, pattern glyph ≥ 3. UI pairs of §1.4 at 4.5, or 3 for listed large-text and graphic pairs. Event themes (§4.3): every text pair re-checked on the event `--page`, and the faded-tile checks repeated with that `--page` (computed 2026-10-08 for all three themes: `--ink-2` ≥ 5.65, `--accent-text` ≥ 5.21, `--accent-title` ≥ 3.48 (large text), focus ring ≥ 4.48 (needs 3), X edge ≥ 3.32, faded wrong X ≥ 4.62, faded pattern glyph ≥ 3.63). |
| `tests/unit/ui/art-a11y-fx.spec.ts` | Every cell has `.cell__xe` and `--xe` equal to `xEdgeColor(paletteIndex)`; the sprite's cat ids are unchanged and resolve to Tux art; `illustration(kind)` and `mascotIllustration(kind)` render every pose with its label. |
| `tests/unit/ui/layout.spec.ts` | `evenInsets`: every inset equals 2 px (slot ≥ 30) or 1.5 px below, whatever the regions. |
| `tests/unit/ui/css-rules.spec.ts` (new) | Parses every file in `src/styles/`. Colour literals (hex, `rgb()`/`rgba()`/`hsl()` with numbers, named colours) are allowed only in `tokens.css`. Allowlist elsewhere: `#fff`/`#ffffff`, `rgba(255,255,255,α)`, `rgba(0,0,0,α)`, `transparent`, `currentColor`, `inherit`. `.btn--primary` is ≥ 1.5rem. **Retired-look guard:** none of the retired Phase 2 values (the teal `#17806F` and `#0F5A4E`, the ginger fur `#F29A4A`, `#c8651e`, …; the list lives in the test) appears anywhere in `src/`, and no source file mentions `data-skin`. |
| `tests/e2e/visual.spec.ts` (new, A) | Screenshots at 320, 390 and 1280: Home, mid-game, ranking, victory, fail, settings, shop, event. Stored under `docs/phase2b/screenshots/`; reviewed by a person, not diffed in CI. |

### 1.13 Decisions

- `[DECISION]` (user, 2026-10-08) One theme. No skin system, no skin setting, no fallback look.
- `[DECISION]` Keep our 12 region colours (§1.3).
- `[DECISION]` The white X keeps WCAG 1.4.11 through a tinted edge (70 % ink mix). A plain drop shadow was rejected: it fails 3:1 on Slate and Lavender. This is the one default-look difference made for accessibility (§0.7).
- `[DECISION]` (parity) Even gutters always, like the original. The region-aware gaps of 02 §18 ("always on") are deleted, not kept as an option. The non-colour cue for regions is the colour-patterns option (§7).
- `[DECISION]` (parity) The white X is the only mark style; the draft's "Dark crosses" option is dropped.
- `[DECISION]` Cat eyes use light irises, because dark eyes vanish on dark fur.
- `[DECISION]` Events can only theme the page and board (§4.4).

### 1.14 Visual parity review (words only)

Matching "visually fully" is checked **by a person playing the Play Store app** in a 30–45 minute session. Differences §6 already lists the session; this spec adds the visual items below. The person writes what they see **in words, with no screenshots handed to implementers** (06 §2). Each finding becomes a token or timing change, never a traced shape.

Write findings as comparisons with our build ("their gutter looks about twice as wide as ours", "their win reaches the leaderboard about a second later"), or as rough durations counted in seconds. Never write a hex value read with a colour picker, a pixel size measured on a screenshot, or a frame count from a recording (R6). Each finding becomes a new value of our own: A applies the visual ones as token changes, and the lead applies config changes (config is frozen after F0).

Checklist: page tone; board card or no card; gutter width relative to tile; tile corner roundness; X thickness; cat size in cell; button height, corner and edge; title weights; HUD order; glow look; fish count and arc; ranking layout; victory layout; transition style; idle motion. Record the results in `docs/phase2b/parity-review.md`.

---

## 2. Win flow, fish currency and motion gaps (headline 2)

### 2.1 Target and original

| Step | Original | Conf. |
|---|---|---|
| Solved board | Cats glow | confirmed (iOS store art), presumed on Play |
| Reward | A three-golden-fish collection; a solver waits 4.5 s for it | likely (Android solver) |
| Ranking | A dimmed full-screen leaderboard, orange title, yellow "tap to continue" | likely (Android tools) |
| Victory | A victory screen with a wide orange "Level N" button; an Android macro closes the leaderboard about 8 s after the last cat | likely |
| Next board | A solver waits 3 s after Next; the board animates in | likely |
| What fish are for | unknown | unknown |

Our target: the same five beats, with our timings fitted to those wait times, our art and our copy. Fish become a persistent currency.

### 2.2 Timeline (level mode; t = 0 when the last cat lands, i.e. the `WON` event)

| t (ms) | What happens | Config |
|---|---|---|
| 0 | Last cat drops (280 ms, unchanged) | `fx.catDropMs` |
| 0 | **Rewards are committed:** the fish, points and progress go into the save in the same critical save as the win (§2.8, §5.5). The animation only *shows* rewards that are already saved. The top bar's Home and Gear become `aria-disabled` until the ranking panel opens, and Esc does nothing. | — |
| 300 | Every cat turns happy and hops (520 ms, 45 ms stagger, unchanged); win sound and haptic. **Glow:** each cat cell's `.cell__glow` (a radial gradient of `--glow`, 1.3 × slot, behind the cat) fades 0 → 1 in 300 ms, then settles to 0.7 over 600 ms; staggered 40 ms in row order. | `fx.win.glowInMs` 300, `glowSettleMs` 600, `glowStaggerMs` 40, `glowSettleOpacity` 0.7, `glowScale` 1.3 |
| 1 000 | In game, the fish pill fades in at the centre of the pills row (200 ms) and shows the count from *before* this win. It stays until the screen leaves. During play it is hidden, so the in-level HUD keeps two pills, like the original's (01 §8). | `fx.win.fishPillInAtMs` 1000, `fishPillFadeMs` 200 |
| 1 200 / 1 350 / 1 500 | Fish 1/2/3 pop at their source cats: scale 0 → 1.15 → 1 over 220 ms, with a soft "bloop" tick | `fx.win.fishAtMs` 1200, `fishStaggerMs` 150, `fishPopMs` 220 |
| 1 450 / 1 600 / 1 750 | Each fish flies to the HUD fish pill (§2.3) in 800 ms, eased `cubic-bezier(.45,0,.25,1)`. It turns along its path, shrinks to 0.6 and leaves 5 sparkle dots behind (each 300 ms). | `fishHoldMs` 250, `fishFlightMs` 800, `fishEndScale` 0.6, `fishTrailDots` 5, `fishTrailMs` 300 |
| 2 250 / 2 400 / 2 550 | Arrivals: the pill count goes +1 each time (number roll), the pill icon bumps (360 ms), a "plink" sounds (pitch +2 semitones per fish), 8 ms haptic | `counterBumpMs` 360, `audio.fishPlinkStepSemitones` 2, `haptics.fish` 8 |
| 2 550 | A "+3" label rises 24 px from the pill and fades (700 ms). A bonus (hard or daily, §2.8) shows "+2" at 2 900 ms; the count then jumps by the bonus. | `plusLabelMs` 700, `plusLabelRisePx` 24, `bonusLabelAtMs` 2900 |
| 4 200 | Scrim fades in over 300 ms | `scrimAtMs` 4200, `scrimFadeMs` 300 |
| **4 500** | **Ranking panel** opens (pop, 260 ms). Total time to here: 4.5 s, matching the solver's allowance. | `fx.winOverlayDelayMs` → **4500** (was 800), `rank.panelPopMs` 260 |
| 5 700 | "Tap to keep going" becomes active and starts pulsing (opacity .55 ↔ 1, 1 400 ms). An Android macro closes the original's leaderboard about 8 s after the last cat; that is the macro's wait, and the original's own tap gate is unknown. Ours can close from 5.7 s. | `rank.panelTapMinMs` 1200, `rank.tapPulseMs` 1400 |
| tap | The panel fades out (200 ms); the **victory screen** comes in (screen transition, §2.9) | `rank.panelOutMs` 200 |
| +600 | The victory button turns active | `fx.winButtonDelayMs` → **600** (was 1 000) |
| tap "Level N" | Interstitial gate (§3), then the next board: transition, then board entry (700 ms) | — |

Ranking data is fetched from t = 0 (§5.5), so the panel is ready at 4.5 s. The fetch deadline is 3 s.

Interruptions:

- **Teardown** (Home from the victory screen, `overlay:failed`, session dispose): every flow timer and WAAPI animation is cancelled and the fish layer is emptied. Nothing is lost, because the rewards were saved at t = 0.
- **Page hidden or FB `onPause` mid-flow:** the flow keeps its schedule on the session clock. Background tabs throttle timers, so when the page returns, every step whose time has passed runs at once, in order, with its animation jumped to the end state. No step is replayed, and the panel's tap gate still counts from when the panel actually opened.
- The win flow never shows an interstitial and never shows a banner (§3.2).

### 2.3 Fish-flight geometry

| Item | Rule |
|---|---|
| Source cats | The cats in rows `floor((n−1)/4)`, `floor((n−1)/2)` and `floor(3(n−1)/4)` (their solution cells); on the 4×4 tutorial: rows 0, 1, 2. The source point is the cell centre (`GameScreen.cellRect`). |
| Target | The centre of the HUD fish pill's icon (`GameScreen.fishRect()`). |
| Path | A quadratic Bézier from source S to target T. The control point is the midpoint lifted perpendicular, toward the top of the screen, by 0.35 × \|ST\|, with a ±10 % spread per fish. The spread is fixed per fish index (−10 %, 0, +10 %), so tests are deterministic. Config: `fx.win.fishArcLift` 0.35, `fishArcSpread` 0.1. |
| Layer | One fixed layer `.fx-layer` above the screen and below overlays (z-index 30); its fish elements are `<svg><use href="#icon-fish">`, 0.5 × slot (min 22 px, max 36 px). Config: `fx.win.fishSizeFraction` 0.5, `fishMinPx` 22, `fishMaxPx` 36. |
| Engine | WAAPI `element.animate` on `transform` and `opacity` only; the path is sampled at 12 keyframes. Everything is cleaned up on finish or on session teardown. |

### 2.4 Ranking panel (new overlay `ranking`)

| Part | Spec |
|---|---|
| Container | Full screen: `--scrim` over the board. Centred panel in `--stage`, max-width 400 px, radius 20 px, padding 20/16; max-height 78 % of the viewport. |
| Title | `--title-on-dark` (orange), 28 px display font; copy by board (Appendix A, `rank.title.*`) |
| Subtitle | My result for this win: "+55 points · 2:14" (level), "Solved in 3:08" (daily), "13 of 21 solved" (event) |
| List (FB, overlay views can be placed in a rect) | An FB overlay view rendered into the panel's list area (§5.4): up to `rank.topCount` (10) rows of rank, photo, name and score. When the provider can identify my entry (`caps().myRank`), my row is pinned at the bottom when I am outside the top 10, with a 4 px `--accent` bar at the inline start; otherwise no row is highlighted. |
| List (FB, overlay views exist but cannot be placed) | Our panel shows my line (below) and a secondary button "See top players" (`rank.seeTop`). It opens the overlay view however FB presents it (full screen, FB-owned); closing it returns to our panel. |
| List (FB, no overlay views) | **No other players' rows** (names can only be shown inside overlay views, 05 §3). Show "Your rank: #1 234" and my score when `caps().myRank`; otherwise "Your score: 1 240" (`rank.yourScore`). Add the entry count only if the API returns it. |
| Web / no provider | "Your records" card: this level's time; best time on this board size; total points; levels solved. Then the line `rank.localOnly` (Appendix A). |
| Loading / failure | Skeleton rows (static grey bars, not fake data) for up to `rank.fetchTimeoutMs` from `WON`; on timeout or error, the personal records card plus `rank.unavailable`. |
| Footer | "Tap to keep going" in `--tap-text`, 18 px, centred, 24 px below the panel |
| Input | A tap anywhere, Enter, Space or Esc continues once `panelTapMinMs` has passed. A tap that lands inside the FB overlay view counts only if the overlay forwards it [uncertain]; otherwise the footer and the scrim are the targets. |
| A11y | `role="dialog"`, labelled by the title; a live region reads "Your rank: #1 234. 55 points." |

### 2.5 Victory screen (new overlay `victory`; replaces O3, and O7 for dailies)

| Part | Spec |
|---|---|
| Layer | Full screen, opaque `--page`. Behind the cat, 12 sun rays in `--accent-soft` (conic gradient) turn once every 20 s; static with reduced motion. |
| Content, top to bottom | Praise word (40 px, `--accent-title`); the win pose (210 px); "Level 37 complete" (18 px, `--ink-2`); reward row: three fish icons with "+3" and the total ("128"), a bonus chip "Hard level bonus +2" if any, and "+55 points"; event milestone line if any (§4.5). |
| Primary button | **Wide orange "Level 38"**: `btn--primary btn--lg`, width = column − 32 px, height 64 px, label 24 px; enabled 600 ms after the screen shows. |
| Secondary | Ghost "Home" |
| Variants | **Level**: "Level {L+1}". **Tutorial** (first run): "You're ready!" with "Play Level 2". **Tutorial replay**: no fish; "Home". **Daily**: time, mistakes, hints, the next-puzzle countdown and "Done" (orange). **Event**: progress bar plus "Puzzle {i+1}", or "Back to event" after the last one. |
| Fish pill on Home and the victory screen | A white pill: `icon-fish`, the count (`formatNumber`, §6.4) and a "+" button that opens the shop. On Home it sits at the top-bar **lead** (after the FB safe zone on FBIG; at the inline start on web). In game, the fish pill appears only during the win flow, **in the pills row, centred** between the cat counter and the hearts, with no "+" button (§2.2 t = 1 000; §2.10 explains why not in the game's top bar). |
| Banner | On FBIG, when a banner is shown (§3.2), the screen root gets `data-banner` and the column reserves `ads.banner.reservePx` at the bottom; the primary button sits at least 16 px above that band. |

### 2.6 Mode variants of the flow

| Mode | Glow | Fish | Ranking panel | Victory |
|---|---|---|---|---|
| Level | yes | 3 (+2 if Hard) | points board | Level variant |
| Daily | yes | 3 (+2 daily bonus) | daily board | Daily variant (Done → gate `daily_done`) |
| Event | yes | 3 | event board | Event variant (gate `event_next`) |
| Tutorial, first run | yes | 3 | **none**: victory at 3 300 ms (`fx.win.tutorialVictoryAtMs`) | "You're ready!" |
| Tutorial replay | yes | none (nothing is saved) | none: victory at 1 200 ms | "Home" |
| Restored full board (02 §15 step 4) | no | already granted at the original win, never twice | none | victory at once |

### 2.7 Reduced motion

| t (ms) | What happens |
|---|---|
| 300 | Cats turn happy (no hop); a static glow at 0.7 fades in over 150 ms; the in-game fish pill appears and its count goes +3 (plus any bonus) at once; the "+3" label fades in and out (150 / 600 ms). |
| 1 200 | The ranking panel fades in (150 ms). The tap becomes active 600 ms later (`fx.win.reduced.tapMinMs`). |
| — | The victory screen crossfades in (120 ms); the rays are static. |

The audio and haptics are unchanged.

### 2.8 Fish economy `[DECISION]`

The original's fish meaning is unknown (differences §6 #1). We pick the smallest sensible role: **fish are the soft currency that buys hints and kitties**. This matches the original's "in-game reward system" for refilling hints (01 §6.2, confirmed).

| Earn | Fish |
|---|---|
| Level win | 3 |
| Hard level win | 3 + 2 bonus |
| Daily win | 3 + 2 bonus |
| Event puzzle win | 3, plus event milestones (§4.5) |
| First-run tutorial | 3 |
| Group challenge, taking part (not winning) | 10 (§5.6) |
| IAP fish packs (FB) | 250 / 900 (§8) |

| Spend | Price `[DECISION: default, user may change]` |
|---|---|
| 1 hint | 15 fish (`shop.hintFish`) |
| 1 kitty | 30 fish (`shop.kittyFish`) |

Revive cannot be bought with fish. It stays rewarded-ad or free-fallback only, to keep the ad model of 02 §13.

Rules:

- The wallet is capped at 999 999.
- Earn and spend are pure functions in `src/game/economy.ts`. They are idempotent per win: a fish award is applied only when the win is *counted*. That reuses `applyLevelWin`'s existing guard; dailies count once per date; event puzzles once per index.
- **Spend points:**
  - O2 "Out of hints" gets a "Swap 15 fish" button whenever the wallet holds at least the price. The order in O2 is Watch video / Swap / Not now.
  - The shop sheet (§8.5) offers both swaps.
  - On the web, a swap is the non-ad refill alongside the 10-minute free grant.

### 2.9 Motion gaps

**Board entry** (replaces the 250 ms entry; the original's board animates in, *likely*):

| Phase | Spec |
|---|---|
| Card | Rises 24 px → 0 and fades 0 → 1 over 250 ms (`fx.boardEntryCardMs`, `fx.boardEntryRisePx`), ease-out |
| Tiles | A diagonal wave starting at 80 ms (`fx.boardEntryWaveStartMs`). Tile (r, c) starts at `80 + (r + c) × stagger`, where `stagger = min(fx.boardEntryStaggerMs, fx.boardEntryWaveBudgetMs / (2n − 2))` = `min(18, 400 / (2n − 2))` ms. Each tile scales 0.6 → 1.04 (at 70 %) → 1 over 220 ms (`fx.boardEntryTileMs`; the scales are CSS-only constants); opacity 0 → 1 over the first 40 %. A 12×12 board ends at 696 ms; a 4×4 at 80 + 6 × 18 + 220 = 408 ms. |
| Input | `START` is dispatched at `entryEndMs(n) = 80 + (2n−2) × stagger + 220`, at most `fx.boardEntryMs` (**700**, was 250). `BoardView.playEntry()` returns that value, and the session schedules `START` from it. |
| Reduced motion | 150 ms fade, `START` at 150 ms |

**Screen transitions** (router):

| Transition | Outgoing | Incoming |
|---|---|---|
| Home → game, victory → next game, event → game | fade 1 → 0 and scale 1 → 0.98, 160 ms | after 80 ms: slide up 16 px → 0 and fade in, 240 ms ease-out; the board entry overlaps it |
| Game → Home, game → event | fade out 160 ms | fade in 200 ms; the Home mascot pops in (0.92 → 1, 260 ms) |
| Reduced motion | crossfade 120 ms | — |

During a transition the outgoing screen is `inert` and `aria-hidden`. Focus moves to the incoming screen at its start.

**Idle cat loop:**

| Where | Loop |
|---|---|
| Board cats (B) | Blink every 3–7 s (unchanged). Breathing: scale 1 → 1.02 → 1 over 2 800 ms with a per-cat phase from `cellNoise`. Ear flick: the `cat-ear-flick` overlay rotates one ear 10° for 160 ms, every 8–14 s per cat. All of it stops during sad, happy and surprised moods. |
| Home mascot (A, inside the pose: `art.css` and `mascot.ts`) | Breathing 3 200 ms (existing); tail sway ±6° over 2 800 ms (`.pose__tail`); head tilt ±3° every 6–10 s (`.pose__head`); blink 4.6 s (existing) |
| Reduced motion | Static, eyes open |

**Heart break** (O-HUD pills; replaces the 400 ms crack):

| t (ms) | What happens |
|---|---|
| 0–120 | The heart shakes ±2 px, twice |
| 120–220 | A white zigzag crack draws in (stroke-dashoffset) |
| 220–700 | The halves fall: translate ∓22 % / +60 %, rotate ∓28°, fade out. Three shards (small triangles in `--heart`) fly 18 px at ±(30–60)° and fade by 600 ms. |
| 400–700 | The empty-heart outline fades in |
| Reduced motion | A 150 ms swap to the empty heart |

Config: `fx.heartBreakMs` 700; `fx.heartCrackMs` (400) is kept for the falling halves.

### 2.10 Data, config, save

- Save:
  - `wallet: { fish, earned }`;
  - `points.total` (§5);
  - win bookkeeping now returns `{ save, fishEarned, pointsEarned, bonus }`.

  See §9.
- Config: the `fx.win.*` group, `fx.boardEntry*`, `fx.screen*`, `fx.idle*`, `fx.heartBreakMs`, `fish.*`, `shop.*`, `rank.panelTapMinMs`, `haptics.fish` (§10).
- `[DECISION]` **In game, the fish pill is in the pills row, not the top bar, and only during the win flow.** At 320 px the column is 288 px wide. The FB safe zone takes 52 px of the top bar's lead, the centred title needs up to 140 px, and Home + Gear take 96 px, which leaves under 44 px for a pill. During play the pill is hidden, so the in-level HUD matches the original's two pills (counter and hearts, 01 §8). On Home the top bar has no title, so the pill sits in its lead there.

### 2.11 Code areas

| Owner | File | Change |
|---|---|---|
| B | **new** `src/ui/fx/fish-flight.ts` | `flyFish(layer, from: DOMRect[], to: DOMRect, opts): { done: Promise<void>; cancel() }` |
| B | **new** `src/ui/fx/glow.ts` | `playGlow(board, cells, reduced)` |
| B | **new** `src/ui/fx/transitions.ts` | `playScreenTransition(oldEl, newEl, kind, reduced): Promise<void>` |
| B | `src/ui/board/board-view.ts`, `board-fx.ts` | new entry, board-cat idle loops, glow hooks, `entryEndMs(n)` |
| A | `src/ui/art/mascot.ts`, **new** `src/styles/art.css` | the Home mascot idle loop (§2.9); it runs inside the pose, so B only mounts it |
| B | `src/ui/hud/pills.ts` | fish pill, heart break, `fishRect()` |
| B | **new** `src/ui/overlays/ranking-panel.ts`, `victory-screen.ts` | §2.4, §2.5 |
| B | `src/ui/overlays/win-overlay.ts`, `daily-result.ts` | kept for one release and no longer opened |
| B | `src/ui/screens/home-screen.ts`, `game-screen.ts` | fish pill, `fishRect()`, event card (§4) |
| B | `src/audio/sfx.ts` | `fish_pop`, `fish_plink` (synthesised) |
| C | **new** `src/app/win-flow.ts` | the §2.2 orchestration on session timers (cancelled on teardown) |
| C | `session.ts` (`onWon` delegates to it), `session-effects.ts` (`winBookkeeping` returns the rewards) | — |
| C | `src/game/economy.ts`, `stats.ts` | fish award and spend; earning table |
| C | `src/app/helper-flows.ts` | the O2 "Swap" path (§2.8): stock check → O2 with `swap` props → on Swap, `spendFish` + `grant` + `saves.now()` → dispatch, with no ad and no fallback cooldown |
| C | `src/app/router.ts`, `overlay-chunk.ts` | `replaceScreen` with transitions; new overlay ids `ranking`, `victory`, `shop`, `rank_hub`, `group_result`, all exported from the lazy overlay chunk; `showEvent(view, cb)` for the event screen (lazy `events` chunk) |
| C | `src/app/views.ts` | `selectVictoryView`, `selectRankingView`, `selectEventView`, `HomeView.fish` and `HomeView.event` |

### 2.12 FB vs web

Two differences: the panel content (§2.4), and on FBIG a possible banner in its own reserved band on the victory screen (§3.2).

### 2.13 Tests

| Test | What |
|---|---|
| `tests/unit/app/win-flow.spec.ts` (new, fake clock) | Exact timestamps of the §2.2 steps; rewards saved at t = 0 (critical save) before any animation; Home and Gear disabled until the panel; reduced-motion timeline; tutorial, replay, daily and event variants; teardown mid-flow cancels every timer and leaves no fish nodes; a clock jump of 10 s mid-flow runs the missed steps once each; restored full board → victory at once with no second award. |
| `tests/unit/app/helper-flows.spec.ts` | The swap path: shown at ≥ price, hidden below; spends exactly the price; no ad call; works on web and FB. |
| `tests/unit/game/economy.spec.ts` | Earn table; spend prices; cap; idempotent awards; never negative. |
| `tests/unit/shell/victory-ranking.spec.ts` (new) | Gating times; Enter, Space and Esc continue; focus; variants; no list rows without provider data; the three FB list modes of §2.4 (placed overlay, "See top players", no overlay) and "Your score" when there is no rank; the rankings hub tabs. |
| `tests/unit/ui/pills.spec.ts` (new) | Heart-break phases and the reduced variant; the in-game fish pill hidden during play, shown from the win flow, counting up per arrival. |
| `tests/unit/ui/fx-fish.spec.ts` (new) | Source-row selection per n; path control point; cleanup; reduced motion skips the flight. |
| `tests/unit/ui/board-entry.spec.ts` | `entryEndMs(n)` ≤ 700 for n = 4…12; the wave order. |
| `tests/e2e/winflow.spec.ts` (new) | Solve through the hook: fish pill +3 → panel visible within 4.4–4.8 s → tap → victory "Level 3" → next board, with input locked until entry ends; the same with `reducedMotion` (panel ≤ 1.4 s). |

### 2.14 Decisions

- `[DECISION]` Three fish per win, every time; bonuses add a number, not more fish.
- `[DECISION]` Fish buy hints and kitties; revives are not for sale.
- `[DECISION: default, user may change]` The rates: 15 fish per hint, 30 per kitty (§2.8).
- `[DECISION]` No auto-close of the ranking panel.
- `[DECISION]` The tutorial earns fish but shows no ranking.

---

## 3. Ads: closer to the original's cadence (headline 3)

### 3.1 Target, original and platform rules

| Original | Conf. |
|---|---|
| An interstitial after almost every level (Android Central, June–July) | likely |
| Grace period about level 10–12; cooldown 120 / 100 / 90 s by tenure | likely (single origin) |
| Banners exist; their start level (said to be about 10) was not re-found. Ad content in iOS screenshots weakly suggests banners during play (01 §11.12) | likely (exist), inferred (start, placement) |
| Rewarded from level 1 for revives and boosters | likely |

| FB platform fact (banners) | Tag |
|---|---|
| `loadBannerAdAsync(placementID, …)` both loads **and shows** the banner; there is no separate show call. `hideBannerAdAsync()` removes it. | [search: Meta docs]; the position argument in 8.0 is [05: confirmed] |
| The banner is 50 dp tall and full width, overlaid at the bottom (one Meta page also mentions the top) | [search: Meta docs] |
| Meta enforces a **45 s rate limit** on `loadBannerAdAsync`; a call inside it fails with `RATE_LIMITED` | [search: Meta docs] |
| **Meta's guidance: no banners during active gameplay.** Show them on menus, level select, shops, pause and results screens; hide them when gameplay begins | [search: Meta docs] |

The original may show banners in play. We cannot copy that on FB, so our banners follow Meta's guidance. The original's *cadence* (an interstitial after nearly every level) is what a player notices most; we keep its reported grace and cooldowns (§3.2), which Phase 2 already uses.

### 3.2 Design (FBIG)

| Format | Rule |
|---|---|
| Interstitial | Triggers `next_level`, `retry`, `daily_done` and new `event_next`, on the victory or O4 button tap, **never** during the win flow. Gate (02 §13.2, unchanged): completed ≥ 10, session grace 60 s, and the cooldown **120 / 100 / 90 s** for tenure days 0–2 / 2–7 / 7+, the original's reported values (01 §11.4), unchanged from Phase 2. With level times of 1–4 min, this shows an ad after most levels once past the grace period. Rewarded ads still reset the clock. Owning No Ads (§8) turns interstitials off. |
| Banner: capability | `banner` is true only when **both** `loadBannerAdAsync` and `hideBannerAdAsync` are in `getSupportedAPIs()` and `VITE_FB_PLACEMENT_BANNER` is non-empty. Without a working hide we could not keep banners out of play, so no banner is ever shown. `unsupported` from any banner call latches the banner off for the session (05 §6.2). |
| Banner: where `[DECISION: default, user may change]` | On the **Home**, **victory** and **event** screens only (`ads.banner.screens`), when `progress.completed ≥ 10` (`ads.banner.fromCompletedLevels`), not on the first-run tutorial's victory screen, and not `noAds`. Never on the game screen (any status, including the hint card and O4), the ranking panel, the boot screen or a full-screen overlay. |
| Banner: show | When an eligible screen mounts, after its entry transition: if the last `loadBannerAdAsync` call was at least `ads.banner.minReloadSec` (60 s, above Meta's 45 s) ago, call it with position bottom. Otherwise **skip the banner on this screen**. No retry loop, because a load inside the window would only hit `RATE_LIMITED`. |
| Banner: hide | `hideBannerAdAsync()` *before* the eligible screen unmounts or a transition to the game screen starts, before any interstitial or rewarded ad, and when a modal overlay opens over the screen (settings, how to play, shop). It is not re-shown when the overlay closes unless the 60 s window has passed. |
| Banner: layout | When a load is attempted, the screen root gets `data-banner` and reserves `ads.banner.reservePx` (58 px = the 50 px banner + 8 px) plus `safeBottom`. Primary buttons sit at least 16 px above that band, so a tap meant for "Level N" never lands on the ad. If the load fails, the reserve stays until the screen unmounts, so nothing jumps. |
| Rewarded | Unchanged for `hint`, `kitty` and `revive`. New placement `group_double` (§5.6). No Ads does not remove rewarded ads: they are opt-in. |

### 3.3 Web

- **Production web stays ad-free**: no interstitials, no banners. The free fallback is unchanged.
- Dev and e2e builds add a mock banner: `?ads=` also drives a 50 px grey "Banner placeholder" bar fixed at the bottom (`platform/web/mock-ads.ts`), following the same screen rules. It is compiled out of production, as the mock ads are today.

### 3.4 Data, config, save

- Config (§10):
  - `ads.interstitial.cooldownSec` stays `[{0,120},{2,100},{7,90}]`;
  - `ads.interstitial.triggers` gains `event_next`;
  - `ads.banner` becomes `{ enabled: true, fromCompletedLevels: 10, screens: ['home','victory','event'], position: 'bottom', reservePx: 58, minReloadSec: 60, buttonClearancePx: 16 }`;
  - new `ads.rewarded.placements`.
- Env `VITE_FB_PLACEMENT_BANNER`.
- Save: no change (`noAds` lives in purchases, §9).

### 3.5 Code areas

| Owner | Files |
|---|---|
| D | `src/platform/types.ts`: optional `PlatformAds.banner?: { show(position: 'bottom'): Promise<AdResult>; hide(): Promise<void> }`. It is optional, so existing test doubles still compile. `AdKind` stays `'interstitial' \| 'rewarded'`, because a banner has no preload. `InterstitialPlacement` gains `'event_next'` and `RewardedPlacement` gains `'group_double'` (F0). **New** `src/platform/fb/fb-banner.ts`, `fb/index.ts` (capability), `fb/fbinstant.d.ts`, `web/mock-ads.ts`, `src/env.d.ts`, `tests/fixtures/fbinstant-stub.js` (banner calls, a 45 s rate limit, `RATE_LIMITED`) |
| C | `src/game/ad-pacing.ts` (`bannerGate(input)`, `event_next`), **new** `src/app/banner-flow.ts` (show, skip and hide rules; the 60 s window; `UiState.bannerReserved`) |
| A | `src/styles/base.css` (`.screen[data-banner]` reserve, `--banner-reserve` from config) |
| B | `home-screen.ts`, `victory-screen.ts`, `event-screen.ts` (accept `bannerReserved` in their view and set `data-banner`) |

### 3.6 Tests

| Test | What |
|---|---|
| `tests/unit/game/economy-pacing.spec.ts` | The cooldown table stays 120/100/90; the `event_next` trigger; `bannerGate` truth table (completed, screen, `noAds`, capability, first-run tutorial) |
| `tests/unit/app/banner-flow.spec.ts` (new) | Show on Home, victory and event; never on the game screen or the ranking panel; hide before game, ads and modal overlays; skip inside the 60 s window; `unsupported` latch; reserve kept after a failure; no banner when `hideBannerAdAsync` is missing |
| `tests/unit/platform/fb-banner.spec.ts` (new) | SDK calls and error mapping (`RATE_LIMITED` → `rate_limited`), against the stub |
| `tests/e2e/fbig.spec.ts` | No banner before 10 completed; banner on Home and on the victory screen at level 11 with a 58 px reserve; no banner call while the game screen is shown |
| `tests/e2e/layout.spec.ts` | No overlap at 320×568 between the banner reserve and the Home Level button or the victory button |

### 3.7 Decisions

- `[DECISION]` (parity) Keep the original's reported cooldown, 120/100/90 s (Phase 2's value). The draft lowered it to 90/75/60 s for taste; that is reverted (§0.7). All in config.
- `[DECISION: default, user may change]` Banners on Home, victory and event screens only, from 10 completed levels, never in play, following Meta's guidance (§3.1). This replaces the first draft's "game screen only", which contradicted that guidance. A banner on the victory screen sits in its own reserved band below the "Level N" button.

---

## 4. Limited-time events (headline 4)

### 4.1 Target and original

| Original | Conf. |
|---|---|
| At least three themed event cards on Google Play in summer 2026, each with a theme and the same placement rules in a seasonal setting; one with a leaderboard | confirmed (cards), likely (same puzzle, reskinned) |
| An event ranking list | likely (probably iOS) |
| A paid "premium pass" | inferred (not re-found) |
| In-event mechanics and rewards | unknown |

Target: a data-driven event system with our own themes. There is **no paid pass**; one could be added later through §8.

### 4.2 Event definition (JSON; **new** `src/data/events/events.json`, bundled in main, about 2 KB)

```ts
// src/game/events.ts (types)
export type EventId = string;                       // /^[a-z0-9-]{3,40}$/
export interface EventDef {
  v: 1;
  id: EventId;
  nameKey: I18nKey;                                 // 'event.lantern.name'
  taglineKey: I18nKey;
  startUtc: string;                                 // ISO 8601, inclusive
  endUtc: string;                                   // ISO 8601, exclusive
  unlockAfterLevel: number;                         // playable when progress.level > this
  theme: {
    page: string;                                   // hex; checked against --ink-2 (≥ 4.5)
    pageArt: 'lanterns' | 'snowflakes' | 'yarn';    // CSS pattern drawn by us (A)
    boardCard: string;                              // hex
    glow: string;                                   // rgba
    accessory: 'lantern' | 'scarf' | 'yarn';        // symbol acc-<name>
  };
  puzzles: { file: string; count: number };         // 'events/<id>.json', a pack of LevelRecords
  rules?: { hearts?: number };                      // modifier; default = cfg.hearts.perAttempt
  track: { at: number; reward: Reward }[];          // milestones by puzzles solved, ascending
  leaderboard: string;                              // FB global board name, e.g. 'event_lantern_walk_2026'
}
export type Reward = { fish?: number; hints?: number; kitties?: number };
```

Event packs:

- Generated by **new** `scripts/gen-events.ts` with our engine.
- Seeds `mewdoku:event:v1:<id>:<i>`; size weights and grade band per event.
- Duplicate check against the shipped level and daily packs.
- `scripts/verify-levels.ts` also verifies `src/data/events/*.json`.

### 4.3 Our three events

All names are ours; check them against store event names before Phase 4.

| id | Name / tagline (en) | Dates (UTC, end exclusive) | Puzzles | Sizes (weights) / band | Theme |
|---|---|---|---|---|---|
| `lantern-walk-2026` | **Lantern Walk** / "Light the way, one cat at a time." | 2026-11-13T00:00Z → 2026-11-27T00:00Z | 21 | 7 (1), 8 (2), 9 (2), 10 (1) / G2–G3 | page `#FFF4E6`; paper-lantern pattern; card `#FFFFFF`; glow `rgba(255,170,60,.65)`; accessory: a small lantern on a string |
| `snow-paws-2026` | **Snow Paws** / "Cosy puzzles for chilly nights." | 2026-12-18T00:00Z → 2027-01-08T00:00Z | 21 | 8 (2), 9 (2), 10 (2), 11 (1) / G3–G4 | page `#F3F6FA`; snowflake pattern; card `#FFFFFF`; glow `rgba(150,200,255,.6)`; accessory: a knitted scarf |
| `yarn-hearts-2027` | **Yarn Hearts** / "Tangled threads, tidy cats." | 2027-02-05T00:00Z → 2027-02-19T00:00Z | 21 | 9 (2), 10 (2), 11 (2), 12 (1) / G3–G4 | page `#FFF1F3`; yarn-ball pattern; card `#FFFFFF`; glow `rgba(255,140,170,.6)`; accessory: a little yarn heart |

The same milestone track for all three:

| Puzzles solved | Reward |
|---|---|
| 3 | +2 hints |
| 7 | +30 fish |
| 12 | +2 kitties |
| 16 | +60 fish |
| 21 | +100 fish, +3 kitties |

Rules:

- Rewards are granted **the moment a milestone is reached** and shown on the victory screen. There is no claim step and nothing is pending when the event ends.
- There are **no rank-based prizes**: with no server, ranks cannot be verified, and prizes would invite cheating.
- `unlockAfterLevel` is 10 for all three; hearts are default.

### 4.4 Flow and UI

| Element | Spec |
|---|---|
| Resolution | `activeEvent(defs, now)` returns the event with `start ≤ now < end`. Events never overlap; a test enforces it. `teaserEvent(defs, now)` returns the next event within `events.teaseHours` (72 h). Times use the device clock `[DECISION]`; there is no server. |
| Home card | Sits above the Level button when an event is active or teased. Height 72 px: the event pattern behind it, the Tux pose with the accessory (48 px; both from A's `eventArt(def, 'card')`), title, then a status line. Status lines: "Ends in 3 d 4 h · 7 / 21 solved", "Starts in 2 d" (teaser, not tappable) or "Opens after level 10" (locked). A progress bar in `--accent` is 4 px tall. |
| Event screen (**new** screen `event`) | Header art (pattern + pose, A's `eventArt(def, 'header')`); name and tagline; "Ends in …"; milestone track (5 nodes on a bar; reached nodes filled, with the reward icon); primary "Play puzzle {i}"; "Top list" (FB: opens the ranking panel for the event board; web: personal results); "Home". |
| Event game | Mode `event` (new `ModeId`); title "Lantern Walk · 13"; the game screen has `data-event-theme` (page pattern, card, glow, accessory over the board cats); rules = level rules with optional hearts. Save slot `inProgress.event`, id `E<eventId>/<index>`; fish and points as §2.8 and §5.3; interstitial trigger `event_next`. The win flow is §2.6 (event board). |
| After the end | The card and screen are gone; an unfinished `inProgress.event` slot is cleared at launch; records stay in the save. |

### 4.5 Victory variant

The progress bar animates from the old to the new value (400 ms). On a milestone it shows "Event reward: +30 fish". The button is "Puzzle {i+1}", or "Back to event" after the 21st.

### 4.6 Data, config, save

- Save: `events: Record<EventId, { solved, ms, lastAt }>` and `inProgress.event` (§9).
- Config: `events.teaseHours` 72, `events.cardEndsSoonHours` 48 (the card shows "Ends soon!" in `--accent-text`).
- New flag `events` (on).
- Analytics:
  - `event_start` {id, index, size};
  - `event_win` {id, index, size, ms, mistakes};
  - `event_milestone` {id, at}.

### 4.7 Code areas

| Owner | Files |
|---|---|
| C | **new** `src/game/events.ts` (types, `validateEventDef`, `activeEvent`, `teaserEvent`, `applyEventWin`, milestones), `src/game/modes.ts` (`event` mode), `src/game/levels-repo.ts` (`getEventPuzzle(id, i)` with fetch deadline and substitute generation as for packs), `src/game/progression.ts`, `src/game/types.ts`, **new** `src/app/event-flow.ts`, `src/app/views.ts` (`selectHomeView.extraCards` gets the event card; `selectEventView`), `src/data/events/**`, `scripts/gen-events.ts`, `scripts/verify-levels.ts`, `src/i18n/en/events.ts` |
| B | **new** `src/ui/screens/event-screen.ts`, `home-screen.ts` (event card variant of `extraCards`), `victory-screen.ts` (event variant) |
| A | **new** `src/ui/art/event-art.ts` (patterns as CSS-ready SVG data, accessories, and `eventArt(def, 'card' \| 'header')`, the art part of the Home card and the event-screen header), `tokens.css` (`[data-event-theme]` blocks), `art.css` (pattern and accessory styles) |

### 4.8 FB vs web

Both builds show events. FB adds the event top list (§5); web shows "Your results: 7 of 21, total 1:12:04" with `rank.localOnly`.

### 4.9 Tests

| Test | What |
|---|---|
| `tests/unit/game/events.spec.ts` (new) | Schema validation (ids, dates ordered, no overlap, track ascending, i18n keys exist, theme contrast); `activeEvent` and `teaserEvent` before, during, at the end instant and after; `applyEventWin` idempotent per index; milestone grants once; hearts modifier. |
| `tests/property/events.spec.ts` (new) | Every event record is unique-solution and in its band; the count matches the def. |
| `tests/unit/app/event-flow.spec.ts` | Home card states; slot save and restore; slot cleared after the end; interstitial `event_next`. |
| `tests/e2e/events.spec.ts` | Fake `Date` inside Lantern Walk: card → event screen → puzzle 1 → win → victory shows 1 / 21 → back. |

### 4.10 Decisions

- `[DECISION]` Events ship in the bundle. A new event means a new build; that is acceptable for one event every 4–8 weeks, and a JSON fetch from a server is not possible (no backend).
- `[DECISION]` 21 puzzles, played in order, all available from day 1.
- `[DECISION]` Milestone rewards only; no rank prizes.
- `[DECISION]` Device clock.

---

## 5. Rankings and identity (headline 5)

### 5.1 Target and original

| Original | Conf. |
|---|---|
| A post-win leaderboard on Android | likely |
| Global fastest-time leaderboards (store copy) | confirmed (promise) |
| An event leaderboard | confirmed (event card) |
| "Group challenges" that pay kitties: 2, or 4 after an ad (one iOS review) | likely |
| Points come in multiples of 5 (a review) | likely |
| A logged-in player on Android | likely |
| Boards that players call fake or full of bots | likely (player claims) |

Our rule, absolute: **never fabricate a player, a rank, a score or a list row.** Show fewer rows rather than padding, and honest empty states.

### 5.2 FB SDK 8.0 building blocks (per 05, re-checked 2026-10-08)

| Feature | API | Status |
|---|---|---|
| Leaderboards, API 1: "classic" | `FBInstant.getLeaderboardAsync(name)` → `setScoreAsync(score, extra?)`, `getEntriesAsync(count, offset)`, `getPlayerEntryAsync()` (my rank), `getEntryCountAsync()`. Boards are configured in the App Dashboard, with a sort order. | **[search: Meta docs]**: Meta's current leaderboard guide describes it. 05 found that a third-party 8.0 adapter dropped it in 2025, so whether 8.0 still serves it is **[uncertain]**. |
| Leaderboards, API 2: NEZP | `FBInstant.globalLeaderboards.setScoreAsync(id, score)`, `getScoreAsync(id)`, `getTopEntriesAsync(id, n)`, `getTopFriendEntriesAsync(id, n)`. Entries carry a **session ID** and a score, not a player ID, so game code cannot tell which entry is "me" or read my rank. A score is kept only when it beats the player's current one. | **[05: likely]** + **[search: Meta docs]** (Meta's zero-permissions pages document it, and one page calls it the older way). How board ids are provisioned is unverified. |
| Names and photos | Only inside **overlay views**: `overlayViews.createOverlayViewWithXMLString(xml, css, data, onLoad, onError, basePath)`, with XML `View`, `Text`, `Image`, `Button`, `For`, `If`, and bindings such as `{{FBInstant.player.name}}`. Leaderboard session IDs can be passed into an overlay view. | **[05: confirmed]** (API and NEZP samples). Positioning inside a rect, tap forwarding and dismissal are **[uncertain]**. |
| Player identity | `player.getID()` (game-scoped); no `getName`/`getPhoto` in 8.0 | **[05: confirmed]** / likely |
| Tournaments | `tournament.createAsync({initialScore, config: {title, sortOrder, scoreFormat, endTime}})` (opens FB's dialog; only when the player is not already in a tournament; `endTime` defaults to one week), `postScoreAsync(score)` (no dialog), `shareAsync(payload)`, `getTournamentsAsync()` (tournaments the player created or joined, or friends play), `getTournamentAsync()` (the current context's). Errors include `INVALID_OPERATION`, `DUPLICATE_POST`, `TOURNAMENT_NOT_FOUND`, `NETWORK_FAILURE`. | **[05: likely]** + **[search: Meta docs]** (v8.0 reference). |
| Tournament **standings** | Players see standings in FB's own UI. **No API that returns ranked entries to game code was found.** | **[search: Meta docs]**: treat as unavailable (§5.6). |
| Contexts | Types SOLO, THREAD, GROUP; `context.getID/getType`, `chooseAsync`/`switchAsync` | **[05: likely]** (types); the methods are **[uncertain]** for 8.0. Not used directly. |
| Connected players | `getConnectedPlayersAsync` returns IDs only | **[05: likely]**; not used |
| Leaderboard error `LEADERBOARD_SCORE_NOT_IMPROVED` | — | third-party only; handle as "ok, not improved" |

Every score we post is **higher-is-better** (§5.3), so each board must be configured that way wherever a sort order exists (dashboard, tournament `sortOrder: 'HIGHER_IS_BETTER'`). D lists the boards in `docs/phase2b/fb-dashboard.md`.

### 5.3 Scoring `[DECISION]`

Paw points per win (all multiples of 5, which matches the reported "multiples of 5"):

| Part | Points |
|---|---|
| Base | 5 × n (board size) |
| Hard level | base × 2 |
| Flawless (0 mistakes and 0 revives) | +10 |
| Unaided (0 hints and 0 kitties) | +10 |
| Daily | +15 |
| Event puzzle | +5 |
| Tutorial | 0 |

Examples: an 8×8 with 1 mistake and 1 hint scores 40; a 10×10 Hard, flawless and unaided scores 120.

| Board | What is ranked | Encoding (int, higher is better, < 2³¹) |
|---|---|---|
| `paw_points` (post-win, level mode) | All-time points total | `score = points.total` (capped at 2 000 000 000) |
| `daily_fastest` (one board for all days) | Today's fastest daily time | `score = dayIndex × 100 000 + (99 999 − secs)`. `dayIndex` = whole days from 2026-01-01 to the daily's own date key; `secs = min(ceil(ms/1000), 99 999)`. Readers keep only entries whose `floor(score / 1e5)` equals the shown day. The maximum for 2028-12-31 is about 1.1 × 10⁸. |
| `event_<id>` (one per event, e.g. `event_lantern_walk_2026`) | Puzzles solved, then the least total time | `score = solved × 1 000 000 + (999 999 − min(totalSecs, 999 999))` |
| Group tournament | Points earned inside the challenge window | NUMERIC, `HIGHER_IS_BETTER` |

A per-level board (time on Level 37) was rejected: 1 000+ boards would each need provisioning, and the endless levels have no limit.

Sanity limits (no server, so client-side only):

- No submission for a solve under `rank.minSolveMs` (3 000 ms) or over 24 h.
- Submissions at most every `rank.submitMinIntervalMs` (10 s); the latest pending score is queued in `rank.pending` and retried on the next win or boot.

### 5.4 `RankingProvider` (D implements; C calls)

```ts
// src/platform/types.ts (additive, F0)
export type BoardKey = 'paw_points' | 'daily_fastest' | `event_${string}`;
export interface RankEntry { readonly rank: number; readonly score: number; readonly isMe: boolean } // no names in game code
export interface RankingCaps {
  readonly api: 'classic' | 'nezp' | 'none'; // which leaderboard API the probe found
  readonly global: boolean;    // top entries readable
  readonly myRank: boolean;    // my own rank readable (classic getPlayerEntryAsync); false on NEZP
  readonly overlay: boolean;   // overlay views exist
  readonly overlayInRect: boolean; // = cfg.rank.overlayPlacement === 'rect' && overlay (G3)
}
export interface RankingProvider {
  caps(): RankingCaps;
  /** 'unsupported' also when the board has no platform id (VITE_FB_LEADERBOARDS). */
  submit(board: BoardKey, score: number): Promise<'ok' | 'not_improved' | 'unsupported' | 'error'>;
  mine(board: BoardKey): Promise<RankEntry | null>;            // null unless caps().myRank
  top(board: BoardKey, n: number): Promise<readonly RankEntry[]>;
  /** Overlay view with names and photos. With `rect` it is placed inside it (only when caps().overlayInRect);
   *  without, FB presents it its own way. null when unsupported or on error. */
  showList(board: BoardKey, view: RankListView, rect?: DOMRect): Promise<{ close(): void } | null>;
}
export interface RankListView { readonly title: string; readonly scoreFormat: 'points' | 'time' | 'event'; readonly highlightMe: boolean; readonly count: number }
// PlatformAdapter gains optional members: ranking?: RankingProvider; groups?: GroupProvider; payments?: PaymentsProvider.
// The existing Phase 4 placeholder `leaderboards?` is never implemented; F0 marks it @deprecated (types are additive only).
// Capabilities: the existing `leaderboards` flag = ranking.caps().global (it already drives showTrophy in views.ts);
// new flags `overlayViews` and `groups`; the existing `payments` flag is used as is.
```

FB implementation (**new** `src/platform/fb/fb-ranking.ts`, `fb-overlay-views.ts`):

- **Probe, in order** (exact `getSupportedAPIs()` strings are [uncertain], so the adapter also checks `typeof` at runtime):
  1. `getLeaderboardAsync` present → `api: 'classic'`. `mine` uses `getPlayerEntryAsync()`, `top` uses `getEntriesAsync(n, 0)`.
  2. Else `globalLeaderboards.setScoreAsync` and `getTopEntriesAsync` present → `api: 'nezp'`. `myRank: false`; `isMe` is always false; `mine` returns null.
  3. Else `api: 'none'`: `ranking` stays defined but every call answers `unsupported` / `null` / `[]`. The panel shows personal records.
- **Board ids** come from build-time env, like placement ids: `VITE_FB_LEADERBOARDS`, a JSON map from `BoardKey` to the dashboard name or id. A board without an id is `unsupported`, so a forgotten event board degrades to personal records and never throws.
- **Names in the list.** Game code fetches the entries, decodes each score with `game/scoring.ts` (time, points or "13 of 21") and passes rows `{ sessionId | playerId, rankText, scoreText, isMe }` as the overlay's `data`. The XML template renders the name and photo from the id. So the XML needs no decoding logic, and all number formatting stays ours (`formatNumber`, §6.4).
- The XML and CSS templates are **ours**, kept as strings in `src/platform/fb/views/rank-list.ts`. Their shape: a `For` over the rows, each with rank, `Image` photo, `Text` name, `Text` score and an `If` for "me".
  - Before writing them, check the binding syntax against Meta's NEZP sample `leaderboard_list.xml` (05 [nezp-lb]). That sample is Meta's own public example, so reading it is allowed; copy no text from it.
- `cfg.rank.overlayPlacement` is `'fullscreen'` until §14 G3 shows that an overlay can be placed in a rect; then the lead flips it to `'rect'`.
- Every call has the `rank.fetchTimeoutMs` deadline (3 000 ms).

Web: `ranking` is undefined. The panel shows personal records (§2.4).

### 5.5 Post-win, daily and event flow

| Step | Order |
|---|---|
| 1 | At `WON`: compute the points and update `save.points.total` in the same critical save as the win. |
| 2 | Submit through the provider (board by mode) when the submit limits allow; on failure, set `rank.pending[board] = score`. |
| 3 | Start `mine` + `top`, so the result is ready by 4 500 ms. When `caps().overlayInRect`, the panel calls `showList(board, view, rect)` as it opens. |
| 4 | The ranking panel (§2.4) renders whatever came back: rows only from provider data, else personal records. |

There is also a **Rankings hub** (Home trophy button, shown when `capabilities().leaderboards`): a sheet with tabs "Paw points", "Today", "Event" (while active) and "Groups" (when enabled). Each tab is a list panel with the same three FB modes as §2.4.

### 5.6 Group challenges (FB only; flag `groupChallenges`, **off until §14 G2 is verified**)

FB shows tournament standings to players in its own UI, but no API was found that hands them to game code (§5.2). The design therefore has two reward modes; `groups.rewardMode` picks one.

| Item | Spec |
|---|---|
| Start | Rankings hub → "Start a group challenge" → `tournament.createAsync({initialScore: 0, config: {title: t('group.title'), sortOrder: 'HIGHER_IS_BETTER', scoreFormat: 'NUMERIC', endTime: now + 72 h}})`. FB's dialog handles sharing into a thread or group. |
| Scoring | At boot and on each win, `GroupProvider.current()` (`getTournamentAsync()`) says whether the game runs in a challenge's context. If it does, every win's points are added to `save.groups[id].total`, `wins` goes up by 1, and the total is posted with `tournament.postScoreAsync(total)`. A failed post is not retried; the next win posts the higher total. Points earned in other contexts do not count (that is how FB tournament contexts work). |
| Players | Whoever joins through FB's own surfaces; we show at most 8 rows, and only through an overlay view. |
| End: `rewardMode: 'participation'` (**default**, needs no standings) | On the first launch after `endsAt`, a challenge with `wins ≥ groups.minWinsForReward` (3) gives **2 kitties**. The dialog offers "Watch a video for 4" (rewarded placement `group_double`; on success 4 in total, not 2 + 4). The copy says the challenge has *finished* (`group.finished`), never that the player *won*. |
| End: `rewardMode: 'rank'` (only if G2 finds a standings API) | `GroupProvider.standings(id)` gives my rank. Rank 1, including everyone tied for 1st, gets **2 kitties**, or 4 with the video. Others with `wins ≥ 1` get 10 fish. If standings come back `null`, this challenge falls back to the participation rule. |
| Rules for both | One claim per challenge (`save.groups[id].claimed`). **No rank or result is ever guessed.** The rewards are for playing, never for inviting or sharing. Whether FB policy allows rewards tied to tournaments at all is part of G2. |
| Web | Hidden |

```ts
export interface GroupProvider {
  create(endTimeMs: number, title: string): Promise<{ id: string } | null>;
  current(): Promise<{ id: string; endTimeMs: number } | null>;  // tournament of the current context
  post(score: number): Promise<boolean>;
  /** Absent unless §14 G2 finds a standings API. */
  standings?(id: string): Promise<{ myRank: number; count: number; tiedFirst: boolean } | null>;
}
```

### 5.7 Identity

- **FB**: the player is `player.getID()`, game-scoped. We never read or store a name or photo; our own UI says "You". Overlay views alone render names and photos.
- **Web**: no identity and no sign-in `[DECISION]`; local records only.

### 5.8 Data, config, save

- Save: `points: { total }`, `rank: { pending: Partial<Record<BoardKey, number>>, lastSubmitAt }` and `groups: Record<id, { endsAt, total, wins, claimed: 0 | 1 }>`, keeping at most 10 entries, oldest `endsAt` dropped (§9).
- Config `rank.*` and `groups.*` (§10). Env `VITE_FB_LEADERBOARDS`.
- Analytics:
  - `rank_panel` {board, api: classic|nezp|none|local, ms, ok};
  - `group_create`;
  - `group_result` {mode, place, wins, doubled} (`place` only in rank mode).

### 5.9 Code areas

| Owner | Files |
|---|---|
| C | **new** `src/game/scoring.ts` (points, encode and decode, submit limits, score formatting for overlay rows), **new** `src/app/ranking-flow.ts`, **new** `src/app/group-flow.ts`, `src/app/win-flow.ts` |
| D | `src/platform/types.ts`, **new** `fb/fb-ranking.ts` (probe), `fb/fb-overlay-views.ts`, `fb/views/*.ts`, `fb/fb-groups.ts`, `fbinstant.d.ts`, the stub (both leaderboard APIs, switchable; tournaments; overlay views), `src/env.d.ts` (`VITE_FB_LEADERBOARDS`), `docs/phase2b/fb-dashboard.md` |
| B | `ranking-panel.ts`, **new** `rank-hub.ts`, **new** `group-result.ts`, `home-screen.ts` (trophy) |

### 5.10 Tests

| Test | What |
|---|---|
| `tests/unit/game/scoring.spec.ts` | Points table (every result a multiple of 5); encode and decode round trips; ordering properties (faster = higher, newer day > older day, more solved > fewer); limits; every encoded score < 2³¹. |
| `tests/unit/app/ranking-flow.spec.ts` | Submit order; pending queue and retry; timeout gives personal records; **"no fabricated rows"**: the rendered list length always equals the provider's entries, with no default names or ranks; `api: 'none'` and a board without an id both give personal records. |
| `tests/unit/app/group-flow.spec.ts` | Participation mode: below 3 wins nothing, at 3 a 2-kitty dialog, the double through rewarded gives 4, one claim; rank mode: ties share 1st, `null` standings fall back to participation; the copy never says "won" in participation mode. |
| `tests/unit/platform/fb-ranking.spec.ts` | The probe order (classic, NEZP, none); stub calls; overlay creation with and without a rect, and close; `NOT_IMPROVED` handling; `VITE_FB_LEADERBOARDS` parsing. |
| `tests/e2e/fbig.spec.ts` | After a win, the stub's leaderboard receives the `paw_points` score; with the classic stub the panel shows "Your rank: #…", with the NEZP stub "Your score: …". |
| `tests/e2e/smoke.spec.ts` (web) | The panel shows personal records and the `rank.localOnly` line; no other player rows. |

---

## 6. Languages (headline 6)

### 6.1 Target and original

The original has a localized UI (Indonesian on Android, *likely*; 62 locales on iOS). Ours is English only today, with about 230 keys and a locale hook.

### 6.2 Locales `[DECISION]`: 17 (en + 16)

| id | Language | FB locale codes mapped to it (background knowledge, verify) | Display font | Plural categories used |
|---|---|---|---|---|
| `en` | English | en_US, en_GB, en_*, en_UD | Fredoka latin | one, other |
| `es` | Spanish (neutral Latin American) | es_LA, es_ES, es_* | Fredoka latin | one, many, other |
| `pt-BR` | Portuguese (Brazil) | pt_BR, pt_PT | Fredoka latin | one, many, other |
| `fr` | French | fr_FR, fr_CA | Fredoka latin | one, many, other |
| `de` | German | de_DE | Fredoka latin | one, other |
| `it` | Italian | it_IT | Fredoka latin | one, many, other |
| `id` | Indonesian | id_ID | Fredoka latin | other |
| `tr` | Turkish | tr_TR | Fredoka latin + latin-ext | one, other |
| `pl` | Polish | pl_PL | Fredoka latin + latin-ext | one, few, many, other |
| `ru` | Russian | ru_RU | system (no Fredoka Cyrillic) | one, few, many, other |
| `vi` | Vietnamese | vi_VN | system (stacked diacritics) | other |
| `th` | Thai | th_TH | system | other |
| `ja` | Japanese | ja_JP, ja_KS | system | other |
| `ko` | Korean | ko_KR | system | other |
| `zh-Hans` | Chinese (Simplified) | zh_CN, zh_SG, **and zh_TW, zh_HK until zh-Hant ships** | system | other |
| `hi` | Hindi | hi_IN | system | one, other |
| `ar` | Arabic (RTL) | ar_AR | system | zero, one, two, few, many, other |

Plural categories come from `Intl.PluralRules`; the test (§6.9) derives the required set at run time. Phase 3 candidates: `zh-Hant`, `fil`, `ms`, `nl`, `uk`, `bn`.

### 6.3 Locale resolution (E: **new** `src/i18n/locale.ts`)

| Step | Rule |
|---|---|
| Source | FB: `platform.getLocale()` **after** `startGameAsync` (05 §4; FB format `ll_CC`). Web: `navigator.languages` in order. A user override `settings.locale` (≠ `'auto'`) always wins. |
| Normalise | Replace `_` with `-`, then lowercase the language and uppercase the region. |
| Match | (1) An exact id (`pt-BR`); (2) the special map: `zh-CN`, `zh-SG`, `zh-TW`, `zh-HK`, `zh-MO` → `zh-Hans`; `pt-*` → `pt-BR`; `es-*` → `es`; (3) the language subtag alone (`fr-CA` → `fr`); (4) the next entry of `navigator.languages`, on web only; (5) `en`. |
| Prefetch | During boot (before start), guess the locale from `navigator.language` and prefetch its chunk inside the bounded boot wait. After `start()`, resolve the real locale. If it differs, load it within `i18n.localeTimeoutMs` (1 200 ms) before the first route; on timeout show English and swap when the chunk lands. |
| Apply | `setLocale(id)` loads the chunk, then sets `<html lang>` and `<html dir>` (`rtl` for `ar`) and emits `locale:changed`. Screens re-render, and open overlays update text through `update(props)`. |

### 6.4 Runtime formatting (E: `src/i18n/format.ts`, `plural.ts`)

| Need | Rule |
|---|---|
| Plurals | `tn(base, count)` picks `${base}.${Intl.PluralRules(locale).select(count)}`, falling back to `.other`. The English catalogue keeps `.one`/`.other`; other locales may add `.zero`, `.two`, `.few` and `.many`. |
| Numbers | `formatNumber(n)` = `Intl.NumberFormat(locale, { numberingSystem: 'latn' })`, used for fish, points and ranks. `[DECISION]` Latin digits everywhere, including Arabic, so board coordinates, timers and counters never mix digit systems. |
| Dates | `formatShortDate(key)`: `en` keeps the catalogue template ("Tue 6 Oct", unchanged); other locales use `Intl.DateTimeFormat(locale, {weekday:'short', day:'numeric', month:'short', timeZone:'UTC'})` on the key's UTC date. |
| Clock | `formatClock` stays "4:12" for every locale. |
| Durations | Catalogue templates per locale (`time.hoursMinutes`, new `time.daysHours`). |
| Lists | The existing catalogue-based `joinList` with per-locale `list.*`. `Intl.ListFormat` is not used: iOS 14.0 lacks it. |
| Bidi | In RTL locales `interpolate()` wraps each parameter in U+2068 … U+2069 (first-strong isolate). |
| Colour names | Translated per locale. Translators write hint templates with the colour as a **name in apposition** ("the colour Lavender"), so there is no adjective agreement in es, fr, it, pt, de, ru, pl or ar. |

### 6.5 RTL (Arabic)

| Element | Rule |
|---|---|
| Document | `<html dir="rtl">`. Stylesheets switch to logical properties (`margin-inline-start`, `inset-inline-*`, `text-align: start`) wherever they touch the start or end edge; `src/styles/i18n.css` holds the few `[dir='rtl']` overrides that remain. |
| Mirrored | Pills row (cat counter ↔ hearts; the fish pill stays centred); hearts deplete from the inline end; chevrons (`.btn__chev`, `.daily-card__chev`) turn 180°; progress bars fill from the right; sheets' close buttons; event milestone track; ranking "me" bar; coach card text; toast alignment; the coach hand art is flipped. |
| **Not** mirrored | **The board** (`.board { direction: ltr }`): column 1 is always the leftmost, so hint text and screen-reader labels stay correct. Also the top-bar action buttons stay at the **top right**, because the FB safe zone is top-left; the clock, digits, fish flight geometry (computed from rects) and the victory sun rays. |
| Swipe | No change (the board is LTR). |

### 6.6 Fonts (A: typography is part of the visual identity)

| Script | Strategy | Bytes |
|---|---|---|
| Latin (en, es, pt, fr, de, it, id) | Fredoka 600 latin (as today) | 16.5 KB, first load |
| Latin extended (tr, pl) | Add `fredoka-latin-ext-600-normal.woff2` from the same OFL package, as a second `@font-face` in `base.css` with its `unicode-range`. The browser fetches it only when such glyphs appear. | 2.7 KB, lazy |
| Cyrillic, Vietnamese, Thai, Devanagari, Arabic, CJK | System fonts. `src/styles/tokens.css` sets `:lang(ru)`, `:lang(vi)` … `{ --font-display: <stack>; --display-weight: 700 }`. Stacks: ja `'Hiragino Maru Gothic ProN','Hiragino Sans','Noto Sans JP',system-ui`; ko `'Apple SD Gothic Neo','Noto Sans KR',system-ui`; zh `'PingFang SC','Noto Sans SC','Microsoft YaHei',system-ui`; th `'Thonburi','Noto Sans Thai',system-ui`; hi `'Kohinoor Devanagari','Noto Sans Devanagari',system-ui`; ar `'Geeza Pro','Noto Sans Arabic','Segoe UI',system-ui`; ru and vi `system-ui,'Segoe UI',Roboto`. | 0 |
| Digits in those locales | The `.num` class (level numbers, fish, points, timer) keeps Fredoka, which has Latin digits | — |

`OFL.txt` already ships; add the latin-ext file to the provenance row.

### 6.7 Translation process

| Step | Rule |
|---|---|
| 1. Source | `src/i18n/en.ts` (the aggregator of `en/*.ts`) plus **new** `src/i18n/meta.ts`: per key a description, max length (chips ≤ 18 chars, buttons ≤ 22, titles ≤ 28 where the layout needs it) and placeholder notes. |
| 2. Draft | AI draft (Claude) per locale into `src/i18n/locales/<id>.ts`. The prompt carries only our English, `meta.ts` and the glossary (`docs/i18n/glossary.md`: cat, kitty, fish, hint, colour names, rule wording). **The prompt must not mention the original game or its strings, and translators must not look at the original's localized UI** (06 §2 step 6). Prompts and outputs are logged in provenance. |
| 3. Release list `[DECISION: default, user may change]` | `cfg.i18n.releaseLocales` lists the locales approved for release; the default is `['en']`. The AI drafts of all 16 other locales are written now and ship in every non-release build. |
| 4. Builds | **Release builds** (`vite build --mode release`, used for the FB production zip and the public web deploy) bundle only the locales in `i18n.releaseLocales`: the locale loader map is built from that list, so the other catalogues are not in the bundle at all. **Dev, e2e and web preview builds** bundle all 17 (`i18n.locales`). In both, locale resolution (§6.3) and the Settings Language row use only the locales the build contains, and anything else falls back to `en`. |
| 5. Approval | A locale joins `i18n.releaseLocales` when the user approves it. The recommended route is a native reviewer per locale who checks the in-game screenshots (`tests/e2e/i18n.spec.ts` output) and the catalogue. Each approval is a line in **new** `docs/i18n/review-log.md` (locale, approver, date, catalogue commit). Approval does not block Phase 2b. |
| 6. Release check | `scripts/i18n-check.ts --release`: every locale in `releaseLocales` is in `locales`, passes the catalogue checks (§6.9) and has a review-log line; `en` is always included; the release build output contains no other locale chunk. |

### 6.8 Code areas (E unless noted)

- `src/i18n/index.ts`: async `setLocale`; `tn` via `Intl.PluralRules`; `formatNumber`; bidi isolation.
- **new** `src/i18n/locale.ts`, `format.ts`, `plural.ts`, `meta.ts`.
- `src/i18n/en.ts`: aggregator of existing keys plus `en/*.ts` (§12).
- **new** `src/i18n/locales/*.ts`, one lazy chunk each, loaded through the build's locale loader map (§6.7 step 4; the lead wires the map in `vite.config.ts` at F0).
- **new** `src/styles/i18n.css` (the RTL overrides only).
- **new** `scripts/i18n-check.ts` (with `--release`); `docs/i18n/glossary.md`, `docs/i18n/review-log.md`.
- A: `src/assets/fonts/display-latin-ext.woff2`, its `@font-face` in `base.css`, the per-script stacks in `tokens.css` (§6.6).
- C: `boot.ts` (prefetch and resolve), `shell.ts` (the Language row).
- B: the Settings "Language" row (a list of endonyms, from `locale.name.*`, for the locales in the build).

### 6.9 Tests

| Test | What |
|---|---|
| `tests/unit/i18n/catalogs.spec.ts` (new) | For every locale: every English key present; non-empty; **placeholder set equal to English** for each key (no missing, extra or renamed `{name}`); every plural base has each category that `Intl.PluralRules(locale).select(n)` returns for n = 0…200 and 1 000; no key that `meta.ts` marks translatable is identical to English (allowlist: `app.name`, `boot.progress`, numbers); max lengths as warnings. |
| `tests/unit/i18n/locale.spec.ts` | The resolution table (es_LA → es, pt_PT → pt-BR, zh_TW → zh-Hans, ar_AR → ar, en_UD → en, xx_YY → en); override; prefetch mismatch path; in a build with only `['en','es']`, `fr_FR` resolves to `en`, and a saved override `de` resolves as `'auto'` while staying in the save. |
| `scripts/i18n-check.ts --release` (run by `npm run build:release`) | The release rules of §6.7 step 6. |
| `tests/unit/i18n/format.spec.ts` | Plural selection in ar, ru and pl; Latin digits in ar; date output per locale (snapshot); bidi isolation only in RTL. |
| `tests/unit/sanity.spec.ts` | Runs over **every** locale catalogue for the known original phrases (06 §3), plus "Meow Cup", "Long Live Meow", "Moonlit Meows" and "golden fish". |
| `tests/e2e/i18n.spec.ts` (new) | At 320×568 and 390×844 for de, ru, ar, th, ja and a pseudo-locale `xx-long` (+40 % length, accents): no horizontal overflow; chips and buttons do not clip; `ar` has `dir=rtl` with the board LTR and the top-bar actions on the right. Screenshots go to reviewers. |

### 6.10 FB vs web

Same catalogues; only the locale source differs (§6.3).

---

## 7. Accessibility: keep every extra, defaults look like the original (headline 7)

| Item | Default (looks like the original) | Kept extra |
|---|---|---|
| Colour patterns | **off** | Settings toggle; glyphs ≥ 3:1 on every tile |
| Gutters | even, like the original | none: the region-aware gaps are removed (§1.5) |
| Mark style | white X, like the original, with a tinted edge (≥ 3:1 through the edge) | none: the edge already meets WCAG 1.4.11, and the draft's "Dark crosses" option is dropped (§1.13) |
| Reduce motion | System | System / On / Off; every new motion has a reduced variant (§2.7, §2.9) |
| Sound, Vibration | on | toggles |
| Screen reader | — | Announcements: fish ("You caught 3 fish. You have 128."), rank, event progress, milestone; new overlays are `role=dialog` with labels; the fish pill has `aria-label` "128 fish"; the event card is a button labelled with its status line. |
| Keyboard | — | Ranking: Enter, Space or Esc continue; victory: Enter on the primary; shop: arrows inside the list; event screen: tab order header → play → top list → home. Focus is never lost through screen transitions (focus moves at the incoming start). |
| Focus ring | — | `--focus` (`#B9520A`, ≥ 4.5 on page) |
| Contrast | — | `palette-check` covers the token set, the event themes and the new tokens (§1.12) |
| Text size | — | 200 % zoom without overlap holds for the new screens (layout e2e at 2× text) |

`[DECISION]` The WCAG 1.4.1 position: colour-only regions by default (like the original), with one built-in, one-tap alternative, colour patterns. How to play gets one line pointing to it: `howto.a11y`, Appendix A.

Tests: `tests/unit/shell/review-fixes.spec.ts` (defaults); palette-check; `tests/e2e/layout.spec.ts` (keyboard pass through the win flow and the shop); a manual screen-reader pass (VoiceOver and TalkBack) at Phase 4.

---

## 8. Purchases (headline 8)

### 8.1 Target and original

The Play listing shows "In-app purchases" and iOS sells Premium and Premium Plus subscriptions (*likely*); the Android catalogue is *unknown*. FB payments work on facebook.com (`FB`) and Android (`GOOGLE`) only; **iOS is not eligible [05: confirmed]**, and Messenger.com is not supported **[search: Meta docs]**.

### 8.2 SDK surface (05 §9, re-checked 2026-10-08)

| Call or fact | Status |
|---|---|
| `payments.onReady(cb)`, `getCatalogAsync()`, `purchaseAsync({productID, developerPayload})`, `getPurchasesAsync()` (unconsumed purchases), `consumePurchaseAsync(purchaseToken)` | **[05: likely]** + **[search: Meta docs]** (v8.0 payments reference) |
| Check support with `getSupportedAPIs()` containing `payments.purchaseAsync`. **If `onReady` never fires, payments are unsupported for this session.** | **[search: Meta docs]** |
| Purchase fields `productID`, `purchaseToken`, `paymentID`, `purchaseTime`, `signedRequest`, `purchasePlatform`, `purchasePrice`, `paymentActionType`, `isConsumed` | **[05: likely]** |
| `purchaseAsync` rejects before `startGameAsync` | **[05: confirmed]** (reference text) |
| Consume order. Meta's pages are worded both ways: consume, then provision; and consume after delivering. | **[search: Meta docs]**, contradictory. Our order is in §8.4. |
| One developer reports that an **unconsumed** purchase makes `getPurchasesAsync` fail with an unknown error | **[search: Meta forum]**, single report |
| Lowercase product ids | Playgama practice (*inferred*), followed |
| **Subscriptions** | **[uncertain]**: not in 05's sources. **Not used** `[DECISION]`; revisit in Phase 4 after reading the live docs. |
| Non-consumable products | No product-type flag was found. **Not relied on** (§8.4: No Ads is consumed and kept as a save entitlement). |
| `signedRequest` verification | Needs a server, which we do not have. **Not verified** (accepted risk, §8.7). |

### 8.3 Catalogue `[DECISION]` (our ids and names; prices are set in the dashboard)

The proposed prices are the default `[DECISION: default, user may change]`. They live in the FB dashboard, not in code: the game always shows the catalogue's localized `price` string.

| productID | Type | Our name (en) | Grants | Price (USD, default) |
|---|---|---|---|---|
| `remove_ads` | entitlement: consumed at once, then kept in the save as `purchases.noAds` (cloud-saved, so it follows the FB account) | No Ads | interstitials and banners off; rewarded ads stay optional | 3.99 |
| `hints_15` | consumable | Bulb Bundle | +15 hints | 1.99 |
| `kitties_8` | consumable | Kitty Basket | +8 kitties | 1.99 |
| `fish_250` | consumable | Fish Bucket | +250 fish | 1.99 |
| `fish_900` | consumable | Fish Crate | +900 fish | 4.99 |

Value check at 15 fish per hint: 250 fish ≈ 16.7 hints, about the same as Bulb Bundle; 900 fish = 60 hints carries a bulk bonus. Kitties at 30 fish: 8 kitties = 240 fish. The displayed price is always the catalogue's localized `price` string; names and descriptions come from our i18n (`shop.product.<id>.*`), never from the dashboard text.

### 8.4 Purchase flow (D: **new** `src/platform/fb/fb-payments.ts`; C: **new** `src/game/purchases.ts`, `src/app/shop-flow.ts`)

```ts
export interface PaymentsProvider {
  ready(): boolean;                                  // onReady fired
  onReady(cb: () => void): void;                     // cb at once if already ready
  catalog(): Promise<readonly Product[]>;            // { id, price, currency } (title from our i18n)
  purchase(id: ProductId, payload: string): Promise<{ ok: true; p: Purchase } | { ok: false; reason: 'cancelled' | 'not_ready' | 'unsupported' | 'error' }>;
  purchases(): Promise<readonly Purchase[] | null>;  // unconsumed; null on failure
  consume(token: string): Promise<boolean>;
}
```

| Step | Rule |
|---|---|
| Capability | `capabilities().payments` is true iff `getPlatform() !== 'IOS'` and `payments.purchaseAsync` is in `getSupportedAPIs()`. The **Buy** section also needs `ready()`. The shop shows "Getting the shop ready…" for up to `iap.readyTimeoutMs` (5 s) after start; after that, `shop.unavailable`. If `onReady` fires later in the session, the Buy section appears then. |
| Grant order `[DECISION]` | **Record, grant, save, then consume:** `applyPurchase(save, p)` (pure, idempotent by token), record the entry, `saves.critical()` (flush), then `consume(token)`. If the game dies before the consume, the purchase is still unconsumed, so the boot restore finds it, sees its token already recorded, and only consumes. Meta's "consume first" wording would lose the grant if the game died between the two steps. If G5 shows that FB rejects grants made before consume, flip `iap.grantBeforeConsume` to `false`: consume first, then grant at once and save. |
| Ledger entries | `purchases.tokens` holds `"<productId>\|<purchaseToken>"` strings (the newest `iap.tokensKept` = 50). The product id is what lets a merge re-apply paid grants (§9.3). |
| Boot restore | After `start()` and `onReady`: call `purchases()`. For each purchase, whatever its product (No Ads included): if its token is **not** in `tokens`, grant it, record it, `saves.critical()`, then `consume`; if it is, only `consume`. When `purchases()` returns `null` (failure), nothing changes and the next boot tries again. |
| Buy | `purchase(id, developerPayload = playerId + ':' + nonce)` → on ok: the grant order above → the toast `shop.thanks`. |
| No Ads `[DECISION]` | Consumed like the others, then kept as the entitlement `purchases.noAds = true` in the save (merged by OR, §9.3). This avoids relying on unconsumed purchases: non-consumables are not documented (§8.2), and one report says unconsumed purchases break `getPurchasesAsync`. The cost: a refund cannot revoke No Ads (§8.7). `iap.removeAdsMode: 'keep'` (never consume; `noAds` follows `purchases()`) is kept as the alternative for G5. |
| Errors | `USER_INPUT` (cancel) is silent; `PAYMENTS_NOT_INITIALIZED`, `NETWORK_FAILURE`, `INVALID_PARAM` and `INVALID_OPERATION` show the toast `shop.error`, with nothing granted. |
| Analytics | `iap` {product, result, platform}. No price or payment ids in analytics. |

### 8.5 Shop UI (B: **new** `src/ui/overlays/shop-sheet.ts`)

A bottom sheet (max-width 480 px).

| Section | Contents |
|---|---|
| Header | Fish balance |
| "Swap fish" | 1 hint for 15 and 1 kitty for 30, each with a "Swap" button disabled below the price |
| "Buy" (FB with `payments` and `ready()`) | The five products: name, description, `price` and "Buy" (or "Owned" for No Ads once `noAds` is true) |
| Footer | Unavailable states: iOS and Messenger show `shop.unavailable`; before `onReady`, `shop.loading`; a catalogue failure shows `shop.error` with retry |

Entry points: the "+" on the fish pill (Home, victory), Settings → "Shop", and Settings → "Remove ads" (FB, payments ready, not owned).

### 8.6 FB vs web vs iOS

| Surface | Purchases |
|---|---|
| FB on facebook.com, FB Android | the "Buy" section shown once `onReady` fires |
| FB iOS, Messenger.com, or `onReady` never fires | hidden; "Swap fish" only |
| Web build | hidden; "Swap fish" only; no payments code bundled (`payments` is undefined in the web adapter) |

### 8.7 Risks (accepted)

- Purchases are client-trusted: no `signedRequest` check, because there is no server. A modified client could grant itself items. That is acceptable for a single-player game with no rank prizes.
- Refunds revoke nothing: No Ads stays owned and consumed items stay granted. If G5 shows that refunds matter, switch No Ads to `removeAdsMode: 'keep'`.
- Two devices offline at once: the wallet and stock follow the newer save (as `stock` does today), but **paid** grants are re-applied on merge from the ledger, so a purchase is never lost (§9.3). Free fish earned on the losing device can be lost, as hints and kitties can today.

### 8.8 Tests

| Test | What |
|---|---|
| `tests/unit/game/purchases.spec.ts` | `applyPurchase` per product; idempotent by token; ledger capped at 50 and parsed as `productId\|token`; merge of `noAds` (OR) and the ledger (union); paid grants from the losing document re-applied once. |
| `tests/unit/app/shop-flow.spec.ts` | Record, grant, save, consume order; crash between grant and consume (token recorded) then boot → consume only, no double grant; No Ads is consumed and `noAds` stays true after a boot whose `purchases()` is empty; `purchases()` null changes nothing; `onReady` late shows Buy, never shows Buy on iOS; cancel is silent; fish swaps (insufficient balance, exact balance); `grantBeforeConsume: false` path. |
| `tests/unit/platform/fb-payments.spec.ts` | `onReady` gating and the 5 s wait; error mapping; consume calls; stub catalogue. |
| `tests/e2e/fbig.spec.ts` | Stub purchase of `hints_15` → +15 hints → `consumePurchaseAsync` called once; `remove_ads` → consumed, then no interstitial and no banner afterwards; stub platform IOS → no Buy section. |
| `tests/e2e/smoke.spec.ts` (web) | The shop shows only "Swap fish"; a swap works. |

---

## 9. Save schema v2 (C)

### 9.1 Shape

`SaveDataV2` = V1 plus the fields below. `SaveData` becomes an alias of the latest version. Three F0 contract changes follow: the `PlatformStorage.save()` parameter, `AppState.save` and the `stats.ts`/`economy.ts` signatures change from `SaveDataV1` to `SaveData`.

```ts
// src/game/types.ts (F0)
export type ModeId = 'tutorial' | 'level' | 'daily' | 'event';
export interface InProgressV2 extends Omit<InProgressV1, 'mode'> { mode: 'level' | 'daily' | 'event' }
export interface SaveDataV2 extends Omit<SaveDataV1, 'v' | 'settings' | 'inProgress'> {
  v: 2;
  settings: Settings & { locale: 'auto' | LocaleId };             // no look settings: one theme (§1)
  inProgress: { level: InProgressV2 | null; daily: InProgressV2 | null; event: InProgressV2 | null }; // event: mode 'event', id `E<eventId>/<i>`, i 0-based (the UI shows i + 1)
  wallet: { fish: number; earned: number };                       // earned = lifetime, for stats
  points: { total: number };
  events: Record<EventId, { solved: number; ms: number; lastAt: number }>;
  groups: Record<string, { endsAt: number; total: number; wins: number; claimed: 0 | 1 }>; // ≤ 10 entries
  purchases: { noAds: boolean; tokens: string[] };                // ledger: "<productId>|<purchaseToken>", ≤ 50 entries, each ≤ 240 chars
  rank: { pending: Partial<Record<BoardKey, number>>; lastSubmitAt: number };
}
```

### 9.2 Migration `migrate_1_to_2` (added to `MIGRATIONS[1]` in `src/game/save.ts`)

| Field | v1 → v2 value |
|---|---|
| `settings.locale` | `'auto'` |
| `inProgress.level`, `inProgress.daily` | unchanged (an `InProgressV1` is a valid `InProgressV2`) |
| `inProgress.event` | `null` |
| `wallet` | `{ fish: 0, earned: 0 }` (no retro grant `[DECISION]`) |
| `points.total` | `0` |
| `events`, `groups` | `{}` |
| `purchases` | `{ noAds: false, tokens: [] }` |
| `rank` | `{ pending: {}, lastSubmitAt: 0 }` |

Validation (`validateV2`) extends `validateV1` field by field, and an invalid field gets its default:

- `fish` and `earned` are integers in 0…999 999;
- `points.total` is an integer in 0…2 × 10⁹;
- event ids match `/^[a-z0-9-]{3,40}$/` and `solved` ≤ 1 000;
- `groups`: at most 10 entries (oldest `endsAt` dropped); `wins` and `total` non-negative integers;
- ledger entries are strings matching `/^[a-z0-9_]{1,40}\|.{1,200}$/`, deduplicated and capped at 50 (newest kept);
- `locale` is `'auto'` or a `LocaleId`; a saved locale that the running build does not contain resolves like `'auto'` (§6.7) and is kept, so it applies again in a build that has it;
- `inProgress.event` follows the slot rules of 04 §7.2, with mode `'event'`.

Storage keys stay `mewdoku.save.v1` (and `:<playerId>`) and the cloud key stays `save` `[DECISION]`: the key is a name, and renaming it would orphan saves. Downgrade risk is nil, because no v1 build has been public. **If one ships before 2b, add a guard**: a v1 reader must keep unknown top-level fields.

### 9.3 Merge additions (04 §7.3)

| Field | Rule |
|---|---|
| `wallet`, `stock`, `settings.*` (new ones too) | from the document with the newer `updatedAt` (as `stock` today), **then** the paid-grant repair below |
| Paid-grant repair | For every ledger entry that only the *other* document has, apply that product's grant once to the merged wallet or stock (`applyPurchase` is idempotent by token). A purchase is therefore never lost by a merge. |
| `points.total` | max |
| `events[id]` | per id: the record with more `solved`; on a tie, the smaller `ms`; `lastAt` max |
| `groups[id]` | union; `claimed` max; `total` max; `wins` max |
| `purchases.noAds` | OR |
| `purchases.tokens` | union, newest 50 |
| `rank.pending` | from the newer document |
| `inProgress.event` | newer document; cleared after the merge if its event has ended or its index < `events[id].solved` |

Size: at most about 4 KB extra (50 ledger entries × 50 B + events + groups), far below FB's 1 MB.

### 9.4 Tests

`tests/unit/game/save.spec.ts`:

- v1 fixture → v2 defaults (existing level and daily slots kept);
- garbage in each new field → defaults;
- the merge table above, including the paid-grant repair (a `fish_900` on the older document survives a merge with a newer document that lacks it, exactly once);
- round trip;
- size bound (40 KB after 1 000 levels, a year of dailies, 3 events and 50 ledger entries);
- `validateSlot` for event slots.

---

## 10. Config additions and changes (`src/app/config.ts`; F0 adds them all)

Changed values (existing keys; allowed by CONTRACTS §7, never renamed or removed):

| Key | Was | Now |
|---|---|---|
| `fx.boardEntryMs` | 250 | 700 (cap; `START` at `entryEndMs(n)`) |
| `fx.boardEntryStaggerMs` | 8 (per row) | 18 (per diagonal, upper bound). The meaning changes; F0 rewrites its JSDoc. |
| `fx.winOverlayDelayMs` | 800 | 4500 (first post-win overlay) |
| `fx.winButtonDelayMs` | 1000 | 600 (victory button) |
| `ads.interstitial.triggers` | 3 | + `event_next` (its element type widens; a lead-approved F0 change) |
| `ads.banner.enabled` | false | true (FBIG still needs the capability and the placement id) |
| `layout.boardPad` | 12 | 10 (card padding, §1.5) |
| `layout.boardRadius` | 16 | 18 |
| `layout.cellRadiusFraction` | 0.18 | 0.2 |
| `layout.catScale` | 0.82 | 0.84 |
| `layout.markScale` | 0.52 | 0.54 |
| `layout.markStrokeFraction` | 0.1 | 0.12 |
| `layout.markOpacity` | 0.7 | 1 (the white X) |

`ads.interstitial.cooldownSec` keeps its Phase 2 value, 120/100/90 (§3.7).

The look's geometry is the one `layout.*` group; there is no per-skin geometry. `layout.insetSamePx` and `layout.insetDiffPx` are **no longer read**, because the region-aware insets are deleted (§1.8). Keys are never removed (CONTRACTS §7), so F0 marks both `@deprecated` in their JSDoc and leaves their values.

New keys:

| Group | Keys = values |
|---|---|
| `layout` | `insetPx: 2`, `insetSmallPx: 1.5`, `insetSmallBelowSlot: 30` (even gutters, §1.5), `markEdgeFraction: 0.04`, `markEdgeMix: 0.7` (the X edge) |
| `fx` | `boardEntryCardMs: 250`, `boardEntryRisePx: 24`, `boardEntryWaveStartMs: 80`, `boardEntryTileMs: 220`, `boardEntryWaveBudgetMs: 400`, `screenOutMs: 160`, `screenInMs: 240`, `screenInDelayMs: 80`, `screenSlidePx: 16`, `screenReducedMs: 120`, `heartBreakMs: 700`, `catBreatheMs: 2800`, `catBreatheScale: 0.02`, `earFlickMinMs: 8000`, `earFlickMaxMs: 14000`, `earFlickMs: 160`, `mascotHeadTiltMinMs: 6000`, `mascotHeadTiltMaxMs: 10000`, `victoryRaysTurnMs: 20000` |
| `fx.win` | `glowInMs: 300`, `glowSettleMs: 600`, `glowStaggerMs: 40`, `glowSettleOpacity: 0.7`, `glowScale: 1.3`, `fishPillInAtMs: 1000`, `fishPillFadeMs: 200`, `fishAtMs: 1200`, `fishStaggerMs: 150`, `fishPopMs: 220`, `fishHoldMs: 250`, `fishFlightMs: 800`, `fishArcLift: 0.35`, `fishArcSpread: 0.1`, `fishEndScale: 0.6`, `fishSizeFraction: 0.5`, `fishMinPx: 22`, `fishMaxPx: 36`, `fishTrailDots: 5`, `fishTrailMs: 300`, `counterBumpMs: 360`, `plusLabelMs: 700`, `plusLabelRisePx: 24`, `bonusLabelAtMs: 2900`, `scrimAtMs: 4200`, `scrimFadeMs: 300`, `tutorialVictoryAtMs: 3300`, `replayVictoryAtMs: 1200`, `reduced: { rankingAtMs: 1200, tapMinMs: 600 }` |
| `fish` | `perWin: 3`, `hardBonus: 2`, `dailyBonus: 2`, `tutorial: 3`, `groupParticipation: 10` (rank mode, non-winners), `max: 999999` |
| `shop` | `hintFish: 15`, `kittyFish: 30` (`[DECISION: default, user may change]`) |
| `points` | `perSize: 5`, `hardMultiplier: 2`, `flawless: 10`, `unaided: 10`, `daily: 15`, `event: 5`, `max: 2000000000` |
| `ads.banner` | `fromCompletedLevels: 10`, `screens: ['home','victory','event']` (both `[DECISION: default, user may change]`), `position: 'bottom'`, `reservePx: 58`, `minReloadSec: 60`, `buttonClearancePx: 16` |
| `ads.rewarded` | `placements: ['hint','kitty','revive','group_double']` |
| `audio` | `fishPlinkStepSemitones: 2` |
| `events` | `teaseHours: 72`, `cardEndsSoonHours: 48` |
| `rank` | `fetchTimeoutMs: 3000`, `topCount: 10`, `fetchCount: 50`, `panelPopMs: 260`, `panelOutMs: 200`, `panelTapMinMs: 1200`, `tapPulseMs: 1400`, `submitMinIntervalMs: 10000`, `minSolveMs: 3000`, `maxSolveMs: 86400000`, `dailyEpoch: '2026-01-01'`, `boards: { points: 'paw_points', daily: 'daily_fastest', eventPrefix: 'event_' }`, `overlayPlacement: 'fullscreen'`, `showPanelWithoutProvider: true` |
| `groups` | `durationH: 72`, `rewardMode: 'participation'`, `minWinsForReward: 3`, `rewardKitties: 2`, `rewardKittiesWithAd: 4`, `maxShown: 8`, `keep: 10` |
| `iap` | `readyTimeoutMs: 5000`, `catalogCacheMs: 600000`, `tokensKept: 50`, `grantBeforeConsume: true`, `removeAdsMode: 'consume'`, `products: [{id:'remove_ads',noAds:true},{id:'hints_15',hints:15},{id:'kitties_8',kitties:8},{id:'fish_250',fish:250},{id:'fish_900',fish:900}]` |
| `i18n` | `locales: ['en','es','pt-BR','fr','de','it','id','tr','pl','ru','vi','th','ja','ko','zh-Hans','hi','ar']`, `fallback: 'en'`, `rtl: ['ar']`, `localeTimeoutMs: 1200`, `releaseLocales: ['en']` (`[DECISION: default, user may change]`; the locales a release build ships, §6.7) |
| `haptics` | `fish: 8` |

New env (`src/env.d.ts`, D): `VITE_FB_PLACEMENT_BANNER`, `VITE_FB_LEADERBOARDS` (JSON map `BoardKey` → dashboard name or id). Empty means that feature is off, as for the existing placement ids.

New flags (`src/app/flags.ts`): `events` (on), `banners` (on), `shop` (on), `rankings` (on; capability-gated), `groupChallenges` (**off**). `DEFAULT_FLAGS` gains them with these defaults; `?flags=` overrides still work.

---

## 11. Bundle-size impact and budgets

Baseline is the Phase 2 final (STATUS §4, FBIG build; raw bytes, 1 KB = 1 000 B). Estimates are ranges from comparable existing modules; integration measures them.

| Item | Now (FBIG) | Δ estimate | Projected | Current budget | **Proposed budget** |
|---|---|---|---|---|---|
| Main JS | 173.3 | Tux art replaces the ginger art in place (net +0.5); fish and icons +0.8; motion (entry, transitions, idle, heart) +2.5; save v2, economy, scoring, event resolution, win-flow +8; events.json +2; FB banner and capability glue +1.5; i18n runtime +2.5; English strings +8 | **≈ 199** (web ≈ 190) | 190 | **210** |
| CSS | 37.8 | token values replaced in place, X edge, `art.css` +1.5; new screens and overlays +6; events +2; i18n/RTL +1.5 | **≈ 49** | 40 | **53** |
| Font (first load) | 16.5 | 0 (latin-ext is lazy) | 16.5 | 25 | 25 |
| index.html | 0.8 | 0 | 0.8 | 4 | 4 |
| **First load, English** | 228.3 | | **≈ 266** | 250 | **280** |
| **First load incl. one non-English locale chunk** | — | + ≤ 24 | **≈ 290** | — | **305** |
| Lazy JS (core: overlays incl. the Tux poses, hint engine, sfx, RPC, generator, win flow, ranking, victory, shop UI) | 45.4 | +11 | ≈ 57 | 48 | **62** |
| Lazy JS (optional: `events` screen + art, `fb-social` = ranking + overlay views + groups + payments) | 0 | 7 + 9 | ≈ 16 | — | **25** |
| Locale chunk (each of 16) | — | 14–24 | — | — | **24 per file** |
| Worker | 17.6 | 0 | 17.6 | 25 | 25 |
| Event packs (3 × 21 records) | — | 3 × ~3.5 | lazy | — | listed |
| FB zip (dev or preview build, all 17 locales) | 216.8 KB, 51 files | +16 locales, 3 event packs, about 5 chunks, 1 font | ≈ 600 KB, ≈ 76 files | 500 KB, 60 files | **750 KB, 100 files** (platform cap 500 files). A release zip carries only `i18n.releaseLocales` and is smaller. |

Lazy-loading rules:

- The event screen and art load when an event is active or teased (prefetched after Home shows).
- `fb-social` loads after `start()`, without blocking the first route.
- Only the active locale chunk ever loads, and a release build contains only the release locales (§6.7).
- Win-flow UI and the shop are in the core overlay chunk, preloaded after the first screen as today.

Time to start on FB stays well under 5 s: the extra main JS is about 26 KB raw, and the locale chunk is prefetched during loading (§6.3).

`scripts/size-check.ts` (D) gets the new rows; update the 04 §9 history comment with these ceilings (a lead decision, recorded in STATUS).

---

## 12. Implementation plan: parallel workstreams with disjoint file ownership

### 12.1 Order

| Step | Who | Duration | Output |
|---|---|---|---|
| **F0 contracts** | lead | 1–1.5 days | See the F0 list below. |
| **A–E in parallel** | 5 workstreams | 6–9 days | §12.2 |
| M1 copy freeze | all | day 4 | English strings final, so E can produce the AI drafts |
| M2 feature-complete | all | day 8–9 | behind flags; unit tests green |
| **Integration** | lead | 3–4 days | wiring; budgets; e2e on the Playwright projects plus the new specs; a release-mode build (§6.7); screenshots; docs (Appendix B); provenance merge; STATUS-2b |
| Locale approval | the user (a native reviewer per locale is recommended) | any time; does not block 2b | a locale joins `i18n.releaseLocales` (§6.7) |
| Phase 4 verification | lead + D | — | §14 items before the related flags go on in production |

**F0 list** (the lead; nothing in A–E starts before it lands):

1. **Config:** every §10 key and changed value, with the JSDoc that CONTRACTS §7 requires; `@deprecated` on `layout.insetSamePx` and `layout.insetDiffPx`.
2. **Types** (the type widenings are lead-approved contract changes):
   - `game/types.ts`: `SaveDataV2`, `SaveData`, `InProgressV2`, `ModeId` + `'event'`, `LocaleId`, `EventId`. (No skin type: one theme.)
   - `platform/types.ts`: `BoardKey`, `RankingProvider`, `RankingCaps`, `GroupProvider`, `PaymentsProvider`, optional `PlatformAds.banner?`, `InterstitialPlacement` + `'event_next'`, `RewardedPlacement` + `'group_double'`, `Capabilities` + `overlayViews`, `groups` (the existing `leaderboards` and `payments` flags are reused), `PlatformAdapter.ranking?`/`groups?`/`payments?`, `@deprecated` on `leaderboards?`, and `PlatformStorage.save(data: SaveData, …)`.
   - `app/store.ts`: `ScreenId` + `'event'`; `OverlayId` + `'ranking' | 'victory' | 'shop' | 'rank_hub' | 'group_result'`; `UiState` + `locale`, `dir`, `bannerReserved`; `AppState.save: SaveData`.
   - `app/events.ts`: bus events `locale:changed`, `wallet`, `rank:result`, and the analytics rows of §4.6, §5.8 and §8.4.
   - `i18n/index.ts`: `setLocale(id): Promise<string>` (was synchronous); boot is the only caller.
3. **Flags** with their defaults (§10).
4. **Stubs:** view-model interfaces and stubs for every new module (throwing `not implemented`), including `RewardedPromptProps.swap?: { price: number; balance: number; onSwap(): void }` and `eventArt(def, kind)`.
5. **Placeholder art** in `sprite.ts`, behind every new symbol id: `icon-fish` (an ellipse plus a triangle), `cat-ear-flick`, the new icons and the accessories (a small circle). The cat ids and poses keep today's art as the interim until A replaces it in place. B animates from day 1.
6. **Board insets:** add `evenInsets(n, slotPx)` to `layout.ts` (implemented: it is a few lines) and switch B's `regionInsets` call in `board-view.ts` to it, so A can delete the region-aware code without touching B's file.
7. **Strings:** split `en.ts` into `src/i18n/en/*.ts` per owner, wired into the aggregator and seeded with Appendix A; change the English values of the four existing cat-description keys (Appendix A).
8. **Test splits:** every existing test file that imports modules of two workstreams is split by owner:
   - `tests/unit/ui/hud.spec.ts` → `hud.spec.ts` (A) + `pills.spec.ts` (B);
   - `art-a11y-fx.spec.ts` → `art-a11y-fx.spec.ts` (A: art, sprite, palette) + `fx-a11y.spec.ts` (B: fx, a11y);
   - `ui/review-fixes.spec.ts` → stays with B, and its `computeLayout`/`readViewport` cases move to `layout.spec.ts` (A).
9. **Tests:** the `tests/unit/sanity.spec.ts` banned list (§6.9).
10. **Build config:**
    - `vite.config.ts`: the lazy chunks `events`, `fb-social` and the locale chunks; the locale loader map built from `i18n.locales`, or from `i18n.releaseLocales` in `--mode release` (§6.7);
    - `playwright.config.ts`: `visual.spec.ts` at 320, 390 and 1280; `i18n.spec.ts` at 320 and 390; `winflow` and `events` in `web-390`;
    - `package.json`: scripts `events:gen`, `i18n:check` and `build:release` (the release-mode builds, then `i18n:check --release`), and `verify` gains `i18n:check`;
    - `src/main.ts`: import the new, empty stylesheets `src/styles/art.css` (A), `screens.css` (B) and `i18n.css` (E); each owner fills its own.
11. **Docs:** **new** `docs/phase2b/CONTRACTS.md`.

### 12.2 Ownership (disjoint; every new file starts with `// Owner: <ws>`)

**Rebalance after the single-theme decision.** The skin system was a large part of A's plumbing and of B's Settings work; it is gone. A becomes **visual identity + art** for the one theme and takes over the visual work that sat with B and E, so B, the largest workstream, gets lighter:

| Work | Was | Now | Why |
|---|---|---|---|
| Skin system: `applySkin`, `skins.css`, the lazy ginger chunk, skin tests; Settings rows "Cat style", "Wider gaps", "Dark crosses" | A, B | deleted | one theme (§1) |
| Replacing the ginger art and tokens in place, and the retired-look guard (§1.8, §1.12) | — | A | new |
| Fonts: the latin-ext face and the per-script display stacks (§6.6) | E | A | typography is visual identity; E keeps RTL, catalogues and the release-locale rules |
| Home mascot idle loop (§2.9) | B | A | it moves the pose's own groups |
| Event art for the Home card and the event-screen header (`eventArt`) | B | A | art; B places it |
| The `.cell__glow` look (gradient, size) | B | A (`board.css`) | A owns the cell and its stylesheet; B keeps the animation |
| Visual parity findings turned into token values (§1.14) | lead | A | the lead still owns config changes |

| WS | Scope | Owns (create or modify) |
|---|---|---|
| **A: visual identity + art** | §1 (tokens, Tux, board look, removal of the ginger look), §1.7, §1.14 token changes, §2.9 Home mascot loop, §4 event art, §6.6 fonts | `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/board.css`, `src/styles/hud.css`, `src/styles/art.css` (new); `src/ui/art/**` (incl. new `event-art.ts`; Tux replaces the ginger art in `cat-parts.ts`, `mascot.ts`, `illustrations.ts`, `palette.ts`, `sprite.ts`); `src/ui/board/layout.ts`, `src/ui/board/board-cells.ts`; `src/ui/hud/top-bar.ts`, `tool-bar.ts`, `rule-chips.ts`; `src/assets/fonts/**`; `scripts/palette-check.ts`; `tests/unit/ui/{layout,art-a11y-fx,css-rules,hud,palette-check}.spec.ts`; `tests/e2e/visual.spec.ts`; `docs/phase2b/provenance-A.md` (Tux, fish, icons, event art, the latin-ext font; the ginger rows marked retired) |
| **B: animation, win-flow UI, new screens** | §2 UI, §2.9 (board cats, heart, transitions, entry), §4.4–4.5 UI, §5 UI, §8.5, the Settings Language / Shop / Remove ads rows | `src/styles/fx.css`, `src/styles/overlays.css`, `src/styles/screens.css` (new); `src/ui/fx/**` (new `fish-flight.ts`, `glow.ts`, `transitions.ts`); `src/ui/a11y/**`; `src/ui/board/board-view.ts`, `board-fx.ts`, `board-highlight.ts`, `board-types.ts`, `gestures.ts`, `keyboard.ts`; `src/ui/hud/pills.ts`; `src/ui/overlays/**` (new `ranking-panel.ts`, `victory-screen.ts`, `shop-sheet.ts`, `rank-hub.ts`, `group-result.ts`; `settings-modal.ts`; `rewarded-prompt.ts` swap button); `src/ui/screens/**` (new `event-screen.ts`); `src/audio/**`; `src/i18n/en/ui-2b.ts` (incl. the shop product names); `tests/unit/shell/**`; `tests/unit/ui/{fx-fish,fx-a11y,board-entry,board-view,pills,gestures,review-fixes}.spec.ts`; `docs/phase2b/provenance-B.md` |
| **C: logic, save v2, app orchestration** | §2.8, §2.10, §3 gates, §4 logic and data, §5 logic, §8 grant logic, §9 | `src/game/**` (new `events.ts`, `scoring.ts`, `purchases.ts`); `src/app/**` except `config.ts` (frozen after F0; changes go through the lead), incl. new `win-flow.ts`, `banner-flow.ts`, `event-flow.ts`, `ranking-flow.ts`, `group-flow.ts`, `shop-flow.ts`, plus `router.ts`, `overlay-chunk.ts`, `boot.ts`, `shell.ts`, `helper-flows.ts`, `session*.ts`, `views.ts`, `store.ts`, `events.ts`, `flags.ts`; `src/main.ts`; `index.html` (after F0); `src/workers/**`; `src/data/events/**`; `scripts/gen-events.ts`, `scripts/verify-levels.ts`; `src/i18n/en/events.ts`; `tests/unit/game/**`, `tests/unit/app/**`, `tests/unit/layering.spec.ts`, `tests/property/events.spec.ts`; `tests/e2e/{smoke,layout,winflow,events}.spec.ts` |
| **D: platform** | §3 SDK, §5 FB, §8 SDK, budgets | `src/platform/**` (new `fb/fb-banner.ts`, `fb-ranking.ts`, `fb-overlay-views.ts`, `fb/views/*.ts`, `fb-groups.ts`, `fb-payments.ts`; `web/mock-ads.ts` banner); `src/env.d.ts`; `platform-assets/**`; `tests/fixtures/fbinstant-stub.js`; `tests/unit/platform/**`; `tests/e2e/fbig.spec.ts`; `scripts/size-check.ts`, `scripts/zip-fbig.ts` (the production zip comes from the release-mode build, §6.7); `docs/phase2b/fb-dashboard.md` (leaderboards with sort order, banner placement, products to create, the `VITE_FB_*` values) |
| **E: localization** | §6 except fonts (§6.6, A) | `src/i18n/index.ts`, `src/i18n/en.ts` (aggregator and existing keys), new `locale.ts`, `format.ts`, `plural.ts`, `meta.ts`, `locales/**` (the 16 AI drafts); `src/styles/i18n.css` (RTL overrides); `scripts/i18n-check.ts` (incl. `--release`); `tests/unit/i18n/**`; `tests/e2e/i18n.spec.ts`; `docs/i18n/**` (glossary, review log); `docs/phase2b/provenance-E.md` (translation prompts and outputs) |

Read-only for everyone in 2b: `src/engine/**`, `src/ui/dom.ts`, `tests/golden/**`, the level and daily packs. Shared after F0: none. `tests/unit/sanity.spec.ts`, `vite.config.ts`, `playwright.config.ts`, `vitest.config.ts` and `package.json` are the lead's. `docs/provenance.md`, 02, 04, 05, 06 and CONTRACTS are updated by the lead at integration, from the `provenance-*.md` drafts. A file that is not listed belongs to the lead; ask before touching it.

RTL edits: A and B use logical properties in their own stylesheets; E owns only `i18n.css`. Typography: A owns every `--font-display` value, including the per-script stacks.

### 12.3 Cross-workstream contracts (signatures fixed in F0)

| Producer → consumer | Contract |
|---|---|
| A → B | `icon('icon-fish')`; `illustration(kind)` and `mascotIllustration(kind)` (signatures unchanged; Tux art; the Home mascot animates itself, §2.9); `eventArt(def, 'card' \| 'header')`; `xEdgeColor`; `evenInsets(n, slotPx)`; `buildCell(…)` with the X underlay and the inert `.cell__glow` and `.cell__ear` nodes, already styled (§1.10); `createTopBar(props, cb, { lead?: HTMLElement })` (a slot after the FB safe zone; B puts the Home fish pill there); the `.screen[data-banner]` reserve rule and `--banner-reserve` |
| B → B (shared component) | `createFishPill(props): View` in `src/ui/hud/pills.ts`, used by Home, the game pills row and the victory screen |
| B → C | `flyFish`, `playGlow`, `playScreenTransition`, `BoardView.playEntry(): number` (returns `entryEndMs`), `GameScreen.fishRect()`, `GameScreen.showFishPill(count)`, `RankingPanelProps`, `VictoryProps`, `ShopProps`, `EventScreenView`, `GroupResultProps`, `HomeView.event`, `HomeView.fish`, `bannerReserved` on the Home, victory and event views, `RewardedPromptProps.swap` |
| C → B | view selectors (`selectHomeView`, `selectEventView`, `selectVictoryView`, `selectRankingView`) |
| D → C | `platform.ads.banner?`, `platform.ranking?`, `platform.groups?`, `platform.payments?`, capabilities |
| E → all | `t`, `tn`, `formatNumber`, `formatShortDate`, `setLocale(): Promise<string>`, `getDir()`, `onLocaleChanged(cb)`, `buildLocales(): readonly LocaleId[]` (the locales this build contains, for the Language row) |

Placeholder rule: until A's final art lands, B uses the F0 placeholder shapes, and today's cat art, behind the same symbol ids and exports.

---

## 13. Acceptance checklist (Phase 2b done)

**Gates:**

- [ ] **G-LEGAL (release only):** IP-lawyer review of the Classic look plus the final public name; 06 §3/§7 updated (§0.3).
- [ ] **G-NAME (release only)** `[DECISION: default, user may change]`: the public name is chosen and cleared; `app.name` updated. Until then the build runs under the code name; this gate blocks the public release only.
- [ ] **G-CLEAN:** every new asset has a provenance row; no source from 06 §4 was opened; the sanity test passes in all 17 locales.

**1 The look (one theme)**

- [ ] Classic is the only look: no skin type, skin setting, `data-skin` or skin chunk exists.
- [ ] The ginger art, the teal tokens, the ink X and the region-aware insets are gone from `src/` (the retired-look guard, §1.12).
- [ ] Even gutters; white X with edge; dark Tux cat in 4 moods plus 6 poses and idle loops.
- [ ] `palette-check` passes for the token set and the 3 event themes.
- [ ] The paw booster is still called "Kitty" everywhere in the UI.

**2 Win flow**

- [ ] Glow → 3 fish → counter +3 → ranking at 4.5 s ± 0.2 → tap → victory with the wide orange "Level N" → next board with entry and transitions.
- [ ] Rewards are saved at `WON`, before any animation; the in-level HUD shows two pills during play.
- [ ] Reduced-motion timeline.
- [ ] Fish persist, spend at 15/30, and are never double-awarded.
- [ ] The heart-break and idle loops work.

**3 Ads**

- [ ] FBIG: interstitial gate at 120/100/90 s (the original's reported values, unchanged from Phase 2) after 10 completed levels.
- [ ] Banners (`[DECISION: default, user may change]`) from 10 completed levels on Home, victory and event screens only, never during play, with the 58 px reserve and the 60 s reload window; off unless both banner APIs exist.
- [ ] Web production: no ad code paths. Rewarded flows unchanged, plus `group_double`.

**4 Events**

- [ ] Three of our events with valid packs.
- [ ] Home card (teaser, active, locked); event screen; event mode; milestones; event board (FB) or personal results (web).
- [ ] No overlap; slots cleared after the end.

**5 Rankings**

- [ ] Points, daily and event boards through `RankingProvider` (FB), with the probe (classic, NEZP, none) and the personal-records fallback at each step.
- [ ] The web shows personal records with an honest empty state.
- [ ] Group challenges are implemented and tested in both reward modes, behind a flag that stays off until G2 (§14).
- [ ] **No fabricated rows, anywhere** (test).

**6 Languages**

- [ ] 17 locales.
- [ ] Resolution from `getLocale()` / `navigator.languages`, plus the override.
- [ ] Plurals through `Intl.PluralRules`; Latin digits; Arabic RTL with an LTR board.
- [ ] The catalogue test passes; AI drafts exist for all 16 non-English locales.
- [ ] Release builds ship only the locales in `i18n.releaseLocales` (default `en`); dev and web preview builds show all 17; `i18n:check --release` passes.

**7 Accessibility**

- [ ] The defaults match the original (patterns off, even gutters, white X).
- [ ] Every extra still works; the new screens are keyboard and screen-reader complete.

**8 Purchases**

- [ ] facebook.com and Android: catalogue, buy, consume and boot restore, idempotent by token; the Buy section waits for `onReady`.
- [ ] No Ads kept as a save entitlement; paid grants survive a save merge.
- [ ] iOS, Messenger.com and web: hidden.
- [ ] No subscriptions.

**General**

- [ ] Save v2 migration and merge tests.
- [ ] Config only, no magic numbers.
- [ ] Budgets of §11 pass in `size-check`.
- [ ] `npm run verify` and all Playwright projects are green.
- [ ] Screenshots in `docs/phase2b/screenshots/`.
- [ ] The words-only parity review (§1.14) is done and logged, with its findings applied as config changes.

---

## 14. Verify before switching on in production (Phase 4, developers.facebook.com)

| # | Item | Blocks |
|---|---|---|
| G1 | Which leaderboard API 8.0 serves: classic `getLeaderboardAsync` or NEZP `globalLeaderboards.*` (or both); their `getSupportedAPIs()` strings; how boards are created and named (dashboard), with a higher-is-better sort order; the int score range; behaviour on "not improved"; whether NEZP entries can identify "me" | rankings (FB); `VITE_FB_LEADERBOARDS` |
| G2 | Whether any API gives game code a tournament's standings (the 2026-10-08 search found none, so `rewardMode` stays `'participation'`); `createAsync` behaviour (dialog, initial score post); **whether FB policy allows in-game rewards tied to tournaments** (not incentivised sharing) | `groupChallenges` flag; `groups.rewardMode` |
| G3 | Overlay views: positioning inside a rect, tap forwarding, closing, binding syntax for rows passed as `data` with session ids | `rank.overlayPlacement: 'rect'` |
| G4 | Banners in 8.0: the position argument's values; `hideBannerAdAsync`; the 50 dp height on Android and iOS; overlay versus resize of the webview; the 45 s load limit; Meta's no-banner-in-gameplay guidance and placement rules near buttons; Monetization Manager banner placement | banner reserve and screens |
| G5 | Payments: the consume-then-grant versus grant-then-consume wording; whether unconsumed purchases break `getPurchasesAsync`; non-consumable support; subscriptions; refund visibility; acceptance of a "remove ads" product | `iap.grantBeforeConsume`, `iap.removeAdsMode` |
| G6 | Interstitial frequency policy versus the 120/100/90 s cooldowns | §3 |
| G7 | The FB locale code list (`es_LA`, `ar_AR`, …) | §6.3 table |
| G8 | Event and theme names cleared against store listings | §4.3 |

Until an item is verified, its feature runs in the fallback state the spec gives it: personal records instead of lists, no banners without both banner APIs, the participation reward mode, a full-screen overlay instead of an in-panel one, and No Ads consumed and kept in the save. Nothing waits on Phase 4 to be *built*; only the production switch waits.

---

## Appendix A. New English strings (seed for F0; owners may refine until M1)

All copy is ours. Plurals use `.one` / `.other`. The paw booster stays "kitty" / "kitties" (§0.5).

**Changed English values of existing keys** (F0; keys and placeholders unchanged, CONTRACTS §7). They described the ginger cat, which is removed:

| Key | Was | Now |
|---|---|---|
| `a11y.mascot` | A ginger cat | A black-and-white cat |
| `a11y.illustration.boot` | A ginger cat having a nap | A black-and-white cat having a nap |
| `a11y.illustration.win` | A ginger cat in a party hat | A black-and-white cat leaping with a fish |
| `a11y.illustration.fail` | A ginger cat with a little bandage | A black-and-white cat hiding its eyes |

**New keys:**

| Key | English |
|---|---|
| `settings.language`, `settings.language.auto` | Language / Automatic |
| `settings.shop`, `settings.removeAds` | Shop / Remove ads |
| `howto.a11y` | Colours hard to tell apart? Turn on colour patterns in Settings. |
| `fish.count.one` / `.other` | {count} fish / {count} fish |
| `fish.plus` | +{count} |
| `a11y.fishEarned.one` / `.other` | You caught {count} fish. You have {total}. / You caught {count} fish. You have {total}. |
| `victory.next` | Level {level} |
| `victory.bonus.hard` / `victory.bonus.daily` | Hard level bonus +{count} / Daily bonus +{count} |
| `victory.points` | +{points} points |
| `victory.eventReward` | Event reward: {reward} |
| `rank.title.points` / `.daily` / `.event` | Paw points / Today's fastest / {event}: top players |
| `rank.tap` | Tap to keep going |
| `rank.you` / `rank.yourRank` / `rank.yourScore` | You / Your rank: #{rank} / Your score: {score} |
| `rank.seeTop` | See top players |
| `rank.points` | {points} points |
| `rank.loading` / `rank.unavailable` | Fetching the rankings… / Rankings couldn't load right now. |
| `rank.localOnly` | Rankings with other players aren't available in this version. Here are your own records. |
| `rank.noEntries` | No one has posted a score here yet. |
| `rank.records.thisLevel` / `.bestSize` / `.solved` / `.total` | This level / Your best {n}×{n} / Levels solved / Total points |
| `rank.hub` | Rankings |
| `event.lantern.name` / `.tagline` | Lantern Walk / Light the way, one cat at a time. |
| `event.snow.name` / `.tagline` | Snow Paws / Cosy puzzles for chilly nights. |
| `event.yarn.name` / `.tagline` | Yarn Hearts / Tangled threads, tidy cats. |
| `event.card.endsIn` / `.startsIn` / `.endsSoon` | Ends in {time} / Starts in {time} / Ends soon! |
| `event.card.progress` / `.locked` / `.done` | {solved} / {total} solved / Opens after level {level} / All solved! |
| `event.play` / `event.back` / `event.topList` | Play puzzle {index} / Back to event / Top list |
| `event.title.game` | {event} · {index} |
| `event.results.local` | Your results: {solved} of {total}, total {time} |
| `event.reward.fish.one` / `.other` | {count} fish / {count} fish |
| `event.reward.hints.one` / `.other` | {count} hint / {count} hints |
| `event.reward.kitties.one` / `.other` | {count} kitty / {count} kitties |
| `time.daysHours` | {d} d {h} h |
| `group.title` / `group.start` | Group challenge / Start a group challenge |
| `group.body.participation.one` / `.other` | Win {count} puzzle in this challenge within {hours} hours to earn {kitties} kitties. / Win {count} puzzles in this challenge within {hours} hours to earn {kitties} kitties. |
| `group.body.rank` | Earn the most paw points in {hours} hours. The winner gets {kitties} kitties. |
| `group.finished` | Your group challenge has finished. Thanks for playing! |
| `group.endsIn` | Ends in {time} |
| `group.won` / `group.place` | You won your group challenge! / You finished #{place} of {count}. |
| `group.take` / `group.double` | Take {count} / Watch a video for {count} |
| `group.participation` | Thanks for playing: +{count} fish |
| `shop.title` / `shop.swap` / `shop.buy` / `shop.owned` | Shop / Swap fish / Buy / Owned |
| `shop.swap.hint` / `shop.swap.kitty` / `shop.swap.action` | 1 hint / 1 kitty / Swap |
| `shop.notEnough` | Not enough fish yet. |
| `shop.loading` / `shop.unavailable` | Getting the shop ready… / Purchases aren't available here. |
| `shop.thanks` / `shop.error` | Thank you! Your items are in. / We couldn't finish that purchase. Please try again. |
| `shop.product.remove_ads.name` / `.desc` | No Ads / No breaks between levels and no banners. Optional videos stay available. |
| `shop.product.hints_15.name` / `.desc` | Bulb Bundle / 15 hints |
| `shop.product.kitties_8.name` / `.desc` | Kitty Basket / 8 kitties |
| `shop.product.fish_250.name` / `.desc` | Fish Bucket / 250 fish |
| `shop.product.fish_900.name` / `.desc` | Fish Crate / 900 fish |
| `rewarded.swap` | Swap {count} fish |
| `ads.banner.placeholder` | Banner placeholder |
| `locale.name.<id>` | Endonyms: English, Español, Português (Brasil), Français, Deutsch, Italiano, Bahasa Indonesia, Türkçe, Polski, Русский, Tiếng Việt, ไทย, 日本語, 한국어, 简体中文, हिन्दी, العربية |

---

## Appendix B. Documents to update at integration (lead)

| Doc | Change |
|---|---|
| 02 | §3 changed tunables; §5 wireframes (Home fish pill and event card, pills row, ranking, victory, shop); §10 win flow; §13 ads (banners, remove ads; the cadence is unchanged); §14 settings rows (Language, Shop, Remove ads); §17 the one token set and the Tux cat, replacing the ginger cat and the teal tokens; §18 even gutters and the white X replace the region-aware gaps and the ink X; §20 analytics events; §21 locales and the release-locale list; §22 hooks used |
| 04 | §3 tree; §4.3 `SaveDataV2`; §4.4 platform interfaces; §7.3 merge additions; §9 budgets |
| 05 | §1 and §6: banners in use on non-gameplay screens, with the 2026-10-08 search facts (load shows, 50 dp, 45 s limit, no banners in gameplay); §8: both leaderboard APIs and the probe, overlay views, tournaments without a standings API; §9: payments in use, `onReady` semantics, the consume-order question; §5.4 and §13: the first-load (≤ 280 KB) and zip (≤ 100 files) ceilings of §11 replace 220 KB and 60 files; §14: add the G1–G5 rows |
| 06 | §3 trade-dress and cat-character rows and §7 checklist: "reversed by user decision 2026-10-08 (phase2b §0.3)"; §5 asset plan: the Tux cat replaces the ginger cat; fish, event art |
| differences-vs-original | §4 "Cat character" and "Trade dress" rows: reversed by user decision 2026-10-08 (phase2b §0.3); re-run the comparison after 2b; mark items 1–8 closed or partly closed |
| CONTRACTS | link `docs/phase2b/CONTRACTS.md` |
| provenance | merge `provenance-A/B/E.md`; mark the ginger-art rows "retired in 2b"; latin-ext font file; translation prompts and outputs |
| STATUS | a new `docs/phase2b/STATUS.md` with verification and budgets |

---

## Appendix C. Review log (2026-10-08)

Three lenses were applied to the first draft. The table lists every change that affects what gets built.

| Lens | Finding in the draft | Fix (section) |
|---|---|---|
| Platform | Banners were shown **only during play**. A search of Meta's banner guide finds the opposite rule: no banners during active gameplay. It also finds that loading shows the banner, the 50 dp size and a 45 s load limit. | Banners on Home, victory and event screens only; off unless both banner APIs exist; 60 s reload window; 58 px reserve (§0.6, §3) |
| Platform | Only the NEZP `globalLeaderboards` API was planned. Meta's current guide describes the classic `getLeaderboardAsync` API, and NEZP entries carry session ids that cannot identify "me". | A probe (classic, NEZP, none); `caps().myRank`; "Your score" when there is no rank; board ids from `VITE_FB_LEADERBOARDS`; scores decoded by us and passed to the overlay as data (§5.2, §5.4) |
| Platform | Group rewards depended on tournament standings, and no API for them was found. | Two reward modes; the default `participation` needs no standings and never says "won"; the policy check is part of G2 (§5.6, §14) |
| Platform | Overlay views were assumed to sit inside our panel. | `overlayPlacement: 'fullscreen'` until G3, with a "See top players" button (§2.4, §5.4) |
| Platform | No Ads relied on an undocumented non-consumable product, and one report says unconsumed purchases break `getPurchasesAsync`. The `onReady` rule was incomplete. | No Ads is consumed and kept as a save entitlement; the Buy section waits for `onReady`; the grant order is explicit and switchable (§8) |
| Implementer | The wallet and stock merge "newest wins" could lose a paid fish pack on a second device. | The ledger stores product ids, and the merge re-applies paid grants once (§9.1, §9.3) |
| Implementer | `inProgress.event` used `InProgressV1`, whose `mode` cannot be `'event'`; `groups` could not tell who played. | `InProgressV2`, `ModeId` + `'event'`; `groups[id].wins` (§9.1) |
| Implementer | Unowned files (`board-highlight.ts`, `ui/a11y/**`, `index.html`, build configs), test files that mix two owners, placeholder art in an A-owned file that B needs, and DOM nodes that B animates in A's cells. | F0 list; ownership table; test splits; `.cell__glow` and `.cell__ear` in the A → B contract (§12) |
| Implementer | Signature changes presented as additive: `setLocale` becomes async, `AdKind` + `'banner'`, the placement unions. (The draft's skin parameters are gone with the skin system, Appendix D.) | Optional parameters where possible; the remaining changes are listed as lead-approved F0 changes; the banner is an optional `PlatformAds.banner?` (§3.5, §12.1) |
| Implementer | Numbers that were only in prose (fish size, trail, arc spread, label rise, bonus timing, panel pop and pulse), and a "no colour literal" rule that 46 existing literals would break. | All in `GameConfig` (§10); a CSS-only constants convention (§0.4); an allowlist for the colour rule and a cleanup assigned to A and B (§1.10, §1.12) |
| Implementer | The win flow did not say when rewards are saved, or what happens on Home, on teardown or on a hidden page mid-flow. | Rewards are saved at `WON`; Home and Gear are disabled; interruption rules; tests (§2.2, §2.13) |
| Parity | A fish pill during play added a third HUD pill that the original's in-level HUD does not have. | The pill appears only during the win flow (§2.2, §2.5, §2.10) |
| Originality | The trade-dress risk was a table only, and nothing stopped values being sampled from the original during the parity review. | A plain-language paragraph for the user; R6 (no sampled values) and R7 (store art) (§0.3, §1.14) |

Checked and unchanged:

- Every contrast number in §1.4, §1.5 and §1.12 was recomputed with `scripts/palette-check.ts` and matches.
- Nothing in the spec requires the original's art, Spine files, audio, text, event names or level layouts. The cat is drawn from a written brief, with its own signature marks and poses; the event names and themes are ours.
- "Steal animations" stays limited to timing, staging and feel described in words (§0.2). There is nothing to extract that the research does not already describe as wait times.

---

## Appendix D. Revision log: user decisions (2026-10-08)

| Decision | What changed (sections) |
|---|---|
| **One theme only.** Classic is *the* look; the ginger skin is removed, not kept | Skin system, runtime switching, `SkinId`, `skins.css`, the lazy ginger chunk, `boot.skinTimeoutMs`, `skins.*` and `skinLayout.*` config, the save's `skin` / `regionGaps` / `darkMarks` settings and the Settings look rows are deleted. Tux, the one token set and the board geometry replace today's art, tokens and `layout.*` values in place; a guard test proves nothing ginger remains (§1, §7, §9, §10, §11, §13). R2 (switch back to Ginger) is withdrawn; the risk paragraph stays (§0.3). |
| **Defaults for the open decisions** | Banners, fish exchange rates, IAP prices, translations (AI drafts now; `i18n.releaseLocales` decides what release builds ship, while dev and web previews show all 17) and the pending public name (gates release, not the build) are marked `[DECISION: default, user may change]` and collected in §0.8. `i18n.shipUnreviewed` and `status.json` are replaced by `i18n.releaseLocales` and `docs/i18n/review-log.md` (§6.7, §10). |
| **Parity first** | Taste-driven deviations reverted to the original: the interstitial cooldown is back to 120/100/90 s; the "Wider gaps" and "Dark crosses" options are dropped (even gutters and a white X only). The remaining differences and their reasons (platform, legality, unknown, plus the X edge for the accessibility minimum) are listed in §0.7. The clean-room rules stay (R1, R3–R7: our own assets only, no sampled values); only R2, the switch back to Ginger, is withdrawn. |
| **Paw booster name** | Stays "Kitty", as in the current build (§0.5, Appendix A). |
| **Workstreams rebalanced** | A becomes "visual identity + art" and takes fonts (from E), the Home mascot loop, the event art component and the glow look (from B) and the visual parity token changes (from the lead); F0 adds `evenInsets` and the release-locale build mode; the parallel phase is 6–9 days (§12). |
