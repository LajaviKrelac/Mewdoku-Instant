# UI batch (2026-10-13): profile — typed names, frames and backgrounds

The user asked: "Profile popup: Let me edit my name (put text). Remove section "First/second word", "Number/Shuffle".
Add section for picking frames & backgrounds", and decided "Mix: some free, rest unlock" for the looks. This file is the
profile workstream's record for the lead: what changed and why, the decisions beyond the lead plan, provenance rows,
deploy order, the sizes measured, and the doc lines that are now stale (the lead applies doc edits outside this area).

## What changed

**Typed names (server).**
- `nickname.freeText` now defaults to **true** (`server/src/core/config.ts`); the key stays as the kill switch (false:
  a typed name is a 422 `nickname_invalid`, the client shows the name read-only and the looks still save). P-L12 and
  D-2e-16 change by the user's request (see "Stale doc lines").
- The shape rule moved to a shared pure leaf, `src/shared/nick-text.ts` (imports nothing; the layering rule needed no
  change): NFKC, trimmed, inner white space as one space; at most **16 code points**; at least **3 wide** where a wide
  character (CJK, kana, Hangul, fullwidth) counts 2 (so 李明 and ゆい pass, 李 does not); letters **with their combining
  marks** (Hindi राहुल, Thai ณัฐพล, Vietnamese), digits, space, `.`, `_`, `-`; at least one letter; a mark only on a
  letter and at most 3 in a row (no "Zalgo" noise); at most 4 digits; no web address or @ handle. The server's
  `checkFreeText` applies it, then the blocklist; the sheet shows the same verdict while typing.
- Moderation (`server/src/core/moderation.ts`, `server/src/moderation/blocklist.ts`):
  - skeletons now NFKD with accents dropped on Latin, Greek, Cyrillic, Arabic and Hebrew letters (é → e, the
    optional Arabic vowel signs and the tatweel, ى/ة/ک/ی spelling variants) while scripts whose vowel signs are the word
    (Devanagari, Thai, kana voicing marks) keep them; the result is NFC;
  - a second skeleton reads Cyrillic and Greek look-alikes as Latin (capitals before lowercasing: Greek Ν is an N,
    its ν a v): "fuсk" with a Cyrillic с and "ѕһіт" are caught; every term is tested against both skeletons;
  - a strong (substring) entry needs a display width ≥ 3 (a 2-character Chinese term counts);
  - a new `innocent` list (Scunthorpe, Atwater) is cut out of the name before the substring test (replaced by a space,
    so the two sides never join into a term);
  - the measured false positives pass: "porn", "nazi", "shit" and "nigga" became whole-word (ambiguous) entries with
    their compounds kept strong (porno, pornstar, pornhub, neonazi, shithead, shithole, bullshit, dipshit, …), so
    Pornchai, Nazia/Nazir, Hoshita/Yoshitaka and Nigar pass; "ho" and "huy" were removed (Ho Minh, Huy Tran);
  - native-script entries for the worst terms of our locales: ru (Cyrillic), th, ja, ko, zh-Hans, hi (Devanagari), ar,
    vi, plus a few more romanised ones (de, es, it, pt-BR, pl, id); tests cover each script and a list of common
    names in all 17 languages (`server/test/unit/nick.spec.ts`).
- Admin `reset-nickname` now starts the name cooldown (`changedAt: now`), so a player whose name was reset cannot type a
  new one at once; the reset itself is never refused (no guard).

**Frames and backgrounds (end to end, server-stored, visible to everyone).**
- Wire (additive inside v1): `FRAME_COUNT = 8`, `BACKGROUND_COUNT = 8` (append-only; 0 = today's look);
  `PlayerView.frameId/backgroundId: number | null` (null = a server without them: the client hides the pickers and
  never sends the fields), `BracketRow.frameId/backgroundId: number` (absent or bad → 0, the row is never dropped),
  `ProfileRequest.frameId?/backgroundId?` (shape only; "at least one field" counts them). An out-of-range id is the
  existing 422 `avatar_invalid` (no new error code: older clients would read a new one as a generic failure).
- Server: migration `server/migrations/0004_profile_looks.sql` (`players.frame`, `players.bg`, `members.frame`,
  `members.bg`, `INTEGER NOT NULL DEFAULT 0`, expand-only); `PlayerRow`/`MemberRow`; the one `INSERT INTO members`
  copies them (still one statement; `wins.ts`/`join.ts` pass the player's); `updateProfile` adds two fixed statement
  pairs (players, then members in OPEN brackets), like the avatar; views emit them. No cooldown.
- Client save: `ladder.me.frameId/backgroundId` (inside v4, no version bump): a copy without them reads 0 and is not
  reported; a bad value takes 0 and reports `ladder.me.frameId` / `ladder.me.backgroundId`, the name, picture and code
  stay (`src/game/ladder.ts` `readLook`).
- Unlocks (`src/game/looks.ts`, pure table, one entry per id): ids 0–2 of each are free; frames 3 level 25, 4 best
  streak 7, 5 level 100, 6 a ranking reward claimed, 7 level 300; backgrounds 3 level 50, 4 best streak 14, 5 level
  200, 6 a ranking reward claimed, 7 level 500. What the player already wears is never locked (it may come from another
  device). Only a new pick is checked; the server stores any id in range.
- Art (`src/ui/art/looks-art.ts`, lazy, mounted with the ranking art): procedural, from small tables, our own words
  (provenance below). The avatar's coat disc became `style="fill:var(--avatar-bg,<tint>)"`, so a background shows
  under the head without drawing 12 more heads.
- One shared picture helper, `avatarBadge(avatarId, frameId, backgroundId, opts)` in `src/ui/art/sprite.ts`: up to three
  `<use>`s (background under, avatar, frame over; the head 86 % inside a frame so the ears clear the ring); id 0 adds
  nothing (the plain look is exactly the old `icon('avatar-N')`), an id we do not draw reads 0. Used by Home's profile
  button, the ranking rows, the podium, the "New ranking" card and every picker button of the sheet.

**The profile sheet (`src/ui/overlays/nickname-sheet.ts`, rewritten; `look-grid.ts`, `profile-text.ts` new).**
- Title "Your profile" (`nick.title`'s English changed, all 16 drafts updated). My picture as others see it next to a
  labelled name field (`input.nickname__input`: 16 px, `dir=auto`, `autocomplete=off`, `autocapitalize=words`,
  `spellcheck=false`, `enterkeyhint=done`, Enter saves, never the first focus, at most 16 code points — a longer
  generated name is never chopped, it can only shrink), a hint line for a bad shape (`aria-invalid`, described by the
  field), then a segmented tab bar Picture · Frame · Background (`role=tablist`, arrows move and select, RTL-aware)
  showing one radio grid at a time (`look-grid.ts`: roving tabindex, arrows move through every button; a locked look
  keeps focus without being picked, `aria-disabled`, a lock badge, and the line under the grid says what unlocks it:
  "Reach level 25 to unlock." etc.), the status line, Save, Cancel.
- States: idle, saving, offline, **rejected** (a blocked name: "That name can't be used…"), **invalid** (new: the
  server refused the form: "That name doesn't fit the rules. Try another one."), cooldown (now also up front when the
  server's `nicknameChangeAt` is in the future, and from the 409's own `retryAfterMs`; the time is kept on one line).
- Removed: First word / Second word / Number / Shuffle (UI, CSS, `pickName`, `clampNum`), the client word-list
  re-export from the ladder chunk, `src/game/nickname.ts` (+ its test), `icon-shuffle`, the `random` dep of the flow,
  and the keys `nick.first`, `nick.second`, `nick.number`, `nick.shuffle`, `nick.fallback`, `nick.error` (English,
  meta, 16 locales). `src/shared/nick-words.ts` stays (the server's generated first names).
- Flow (`src/app/ladder-flow.ts` `openNameSheet`): sends only what changed (`{nickname:{text}}`, `frameId`,
  `backgroundId`, the avatar), `nick_set` analytics gained `frame` and `bg` (0/1; never the name or the ids).
- Podium: my place keeps a mark that is not only the border colour (an accent dot in a white ring over the top of my
  picture), since a frame of mine may have any colour.

**Fakes and harness.** The preview sample server takes typed names (`checkFreeText`, when `freeText` is on) and the
looks, and some sample players wear one (fixed by place, no randomness); `tests/fixtures/ladder-fake.ts` takes `{text}`
per its rules (the shared shape rule plus a tiny stand-in blocklist) and the looks, with `retryAfterMs` on a cooldown;
the contract fixtures carry the new fields (bracket.full/open rows have some looks), `freeText: true` in
session.fb/web, and two new fixtures `profile.looks`, `profile.text` with real answers in `contract.spec.ts`.
`dev/ladder-harness.ts`: views `nick` (with locks), `nick-looks`, `nick-rejected`, `nick-invalid`, `nick-fixed`,
`nick-old-server`, `home-looks`; `?tab=frame|bg` opens a tab.

## Decisions beyond the plan

1. **`PlayerView.frameId/backgroundId` are `number | null`** (null = a server without them; absent or null on the wire
   parse as null, a bad value as 0). This is how the client knows to hide the pickers; rows use plain numbers (0).
2. **The unlock table lives in `src/game/looks.ts`** (the plan's "pure table"), not in `app/config.ts`: config is in
   the first load and the table is only read by the lazy flow. Thresholds as listed above (level 500 for the last
   background, so the two "level" tops differ).
3. **`avatarBadge` lives in `sprite.ts` (first load)** instead of being a ladder-chunk helper with Home building `<use>`s
   inline: one helper for Home and the ranking, and about the same main-JS bytes as Home's inline copy would cost.
   `ART_LOOKS` (12/8/8) sits next to it; tests pin it to `AVATAR_COUNT`/`FRAME_COUNT`/`BACKGROUND_COUNT`.
   `avatarSymbol()` stays exported in `ladder-art.ts` (unused by src now; kept so a parallel branch that still calls it
   merges cleanly; tree-shaken).
4. **A framed avatar is drawn 86 % inside the ring** (the ear tips reach r ≈ 47 of the disc, the ring's band is
   r 41–48), so frames never cover the cat; the plain look is untouched. Tests check every frame stays outside r 38.
5. **No new error code** for looks: `avatar_invalid` (as the plan said); no new contract fixture error.
6. **Shape rule shared, blocklist server-only**: the client hint covers the shape; a blocked name is only known after
   Save (`rejected`), so the blocklist never ships.
7. **The `@` handle check comes before the character check**, so "@cat" says "No web addresses or @ names" rather than
   "letters only". At least one letter is required (new): "1234" or "___" is not a name.
8. **Combining marks**: at most 3 in a row on a letter (`NAME_MAX_MARKS`), none without a letter. Joiners (ZWJ/ZWNJ)
   stay outside the allowed set (no locale of ours needs them in a name).
9. **Generated names longer than 16** (e.g. "Mischievous Whisker 99") keep working: the field only stops growth past
   the limit; once the player edits, Save needs ≤ 16.
10. **`nick.saved` → "Profile saved."** (English changed with all 16 drafts), since a look-only save is not a name.
11. **Tabs size by their labels** (`flex: 1 1 auto`): "Background"/"Hintergrund" never break inside the word at 320 px.
12. **The visual spec's route fake** now answers `freeText: true` and gives some fake players a look (fixed by place).
13. **Blocklist trade-off** (recorded for review): moving "shit"/"porn"/"nazi"/"nigga" to whole-word matching lets a
    run-together compound such as "ShitCat" through unless listed; the strong compounds above and the native entries
    cover the common forms. The other path (an exceptions list of names) was kept small (`innocent`: Scunthorpe,
    Atwater) because Japanese and South-Asian names that contain those letters are too many to list.

## Deploy order

1. `npm --prefix server run db:migrate:staging` (0004 adds `players.frame`, `players.bg`, `members.frame`,
   `members.bg`), **then** `npm --prefix server run deploy:staging` (it turns typed names on by default). The victory
   workstream's 0005 follows the same rule.
2. Then the client. A new client against an old server: `PlayerView.frameId` absent → no frame/background tabs; the old
   server's `freeText: false` → the name field is read-only (no 422 loop). An old client against the new server ignores
   the new fields.
3. Kill switch without a release: `CONFIG_OVERRIDES='{"nickname":{"freeText":false}}'`.

## Provenance rows (for `docs/provenance.md` §13.1 / §13.4; the lead adds them)

| Asset | File(s) | Method and words drawn from | Markup (B) |
|---|---|---|---|
| `frame-1` (solid) | `src/ui/art/looks-art.ts`, `palette-2e.ts` `LOOK_COLORS` | "A plain denim ring around the picture with a soft white highlight at the upper left"; 100 grid, band r 41–48 around the avatar disc. | 338 |
| `frame-2` (double) | same | "Two lagoon rings with a white line between them". | 293 |
| `frame-3` (beaded) | same | "Eighteen orchid beads on a thin line, each with a white glint". | 2 132 |
| `frame-4` (scalloped) | same | "An apricot ring whose outer edge is a row of sixteen round bumps". | 996 |
| `frame-5` (studded) | same | "A gold ring with darker gold edges and eight round gems (sky, coral, lime, violet) with glints". | 1 364 |
| `frame-6` (laurel) | same | "Two leafy branches of alternating green leaves up the sides, open at the top, tied at the bottom with a small coral bow". | 2 428 |
| `frame-7` (starry) | same | "A violet ring with eight gold five-point stars and small white dots between them". | 1 530 |
| `bg-1` (sunny) | same | "A soft yellow disc with a paler halo ring". | 185 |
| `bg-2` (mint) | same | "A mint disc with a lighter mint centre". | 143 |
| `bg-3` (polka) | same | "A rose disc with staggered white dots, each wholly inside the disc". | 2 375 |
| `bg-4` (stripes) | same | "A sky disc with five pale horizontal bands (the bands are cut to the disc by their own arcs, no clip path)". | 513 |
| `bg-5` (night) | same | "A navy disc, a gold crescent moon between the ears, a few gold and white stars around the head". | 782 |
| `bg-6` (sunburst) | same | "Sixteen gold rays on an apricot tint from the centre". | 705 |
| `bg-7` (rainbow) | same | "Six concentric rings of our palette colours (coral, apricot, mustard, lime, sky, violet)". | 331 |
| Avatar disc override | `ladder-art.ts` `avatar()` | The coat disc's fill is `var(--avatar-bg, <tint>)`; `avatarBadge` sets `--avatar-bg:none` under a background. | — |
| Podium "mine" dot | `src/styles/ladder-chunk.css` | An accent dot in a white ring over the top of my podium picture. | — |

Colours (`palette-2e.ts` `LOOK_COLORS`): palette colours (Denim, Lagoon, Orchid, Apricot, Sky, Coral, Lime, Violet,
Mustard), the gold tokens, palette tints toward white (sunny, mint, mintLight, rose, skyTint, skyLight, rays) and six
deeper shades of ours (denimDeep `#3F5891`, orchidDeep `#C25C93`, apricotDeep `#E0803F`, violetDeep `#6A4FB0`, leaf
`#6E9F57`, night `#2F3A66`). Decorative only: every look also differs by shape or pattern (not added to
`scripts/palette-check.ts`; the art test's allowed set includes them).

Copy (ours, `src/i18n/en/lazy.ts` nick block; AI drafts in all 16 locales from our English, meta and the glossary only):
`nick.title` (now "Your profile"), `nick.saved` (now "Profile saved."), `nick.name`, `nick.name.off`,
`nick.rule.length`, `nick.rule.chars`, `nick.rule.digits`, `nick.rule.link`, `nick.invalid`, `nick.frame`,
`nick.background`, `nick.frame.a11y`, `nick.background.a11y`, `nick.locked.a11y`, `nick.lock.level`,
`nick.lock.streak.*`, `nick.lock.prize`. New placeholders in `meta.ts` `PLACEHOLDER_NOTES`: `from`, `to`, `digits`,
`label`, `how`. Glossary §6: "Ranking name" rewritten for typed names, new rows "Profile", "Frame, background" and the
two term rows in both tables.

## For the lead

- **`docs/i18n/drafted-from.json`**: `nick.title` and `nick.saved` changed English in all 16 locales (the drafts were
  rewritten too), so `i18n:check` warns "was translated from…" ×32 until `--write-drafted-from` is run; the new keys need
  a "Drafts awaiting review" section in `docs/i18n/review-log.md`.
- **Removed keys**: `nick.first`, `nick.second`, `nick.number`, `nick.shuffle`, `nick.fallback`, `nick.error` (English,
  meta, 16 locales). `nick.edit.a11y` is untouched (the leaderboard workstream decides).
- **e2e specs edited (not run)**: `ladder.spec.ts` (the name test types a name, checks the up-front cooldown and that a
  frame still saves and reaches another player's view), `preview.spec.ts` (types a name, picks a background),
  `layout.spec.ts` (the 320 × 568 fit for each tab; counts `.nickname__avatars` radios), `visual.spec.ts` (route fake
  `freeText: true`, looks on some fake rows and in the profile PUT; the sheet assertions), `i18n.spec.ts` (the Settings
  name row also with a 16-character typed name in Latin, Chinese and Arabic). The visual and preview specs still open
  the sheet with my row's pencil (`.rank-row__edit`), which the leaderboard workstream removes on the Home sheet: that
  opening line is theirs to change (Settings → "Ranking name" or Home's profile picture both open the sheet).
- **Toast text**: e2e looks for "Profile saved." now (was "Name saved.").

## Stale doc lines (suggested text)

- `docs/phase2e/spec.md:73` D-2e-16 → "**Names: generated from our word lists at the first session; since the UI batch
  (2026-10-13, the user's request) players may type their own** (the shared shape rule `src/shared/nick-text.ts` and the
  server blocklist), with a picture, a frame and a background (some unlock by progress) | the user asked; moderation
  hardened (native-script terms, look-alikes, whole-word short terms) | srv `nickname.freeText` (true; the kill switch);
  `AVATAR_COUNT`, `FRAME_COUNT`, `BACKGROUND_COUNT` (append-only)".
- `spec.md:99` P-L12 → "Typed names allowed (generated first); change at most once a day after the first change |
  srv `nickname.freeText` true, `nickname.changeCooldownMs` 24 h".
- `spec.md:436` → add "or `{nickname: {text}}`" and "`frameId`, `backgroundId` (no cooldown)".
- `spec.md:438` → "**Free text** (`nickname.freeText` true since the UI batch): the shape rule of
  `src/shared/nick-text.ts` (NFKC; 3–16 wide, a wide character 2; letters with their marks, digits, space . _ -;
  ≤ 4 digits; no link or handle); two skeletons (NFKD, accents dropped on Latin/Greek/Cyrillic/Arabic/Hebrew, and
  Cyrillic/Greek look-alikes read as Latin) checked against the blocklist (strong ≥ 3 wide as substrings after cutting
  the innocent words, ambiguous as whole words, native-script entries for our locales); admin `reset-nickname` falls back
  to a generated name **and starts the cooldown**."
- `spec.md:667` → "`nickname.freeText` / `changeCooldownMs` | true / 24 h".
- `spec.md:1044` (§7.1 `ladder.me`) → "`{ name, avatarId, frameId, backgroundId, code } | null` … `frameId`/`backgroundId`
  0 … count − 1, absent = 0 (not reported)".
- `spec.md:1119` (`nick_set`) → "`result`, `avatar`, `frame`, `bg` (0/1 changed)".
- `spec.md:1229` (DOM contract) → `.overlay[data-overlay=nickname]` with `.nickname__me`, `input.nickname__input`,
  `[role=tablist] .nickname__tab[data-tab]`, `[role=radiogroup].nickname__avatars|.nickname__frames|.nickname__bgs`,
  `.nickname__unlock`, `button.nickname__save`.
- `spec.md:1307` → "names rendered with `textContent` only (XSS); typed names moderated by the shape rule and the
  blocklist".
- `spec.md:1635` (Appendix C) → drop `icon-shuffle`; add rows for `frame-1…7` and `bg-1…7` (as the provenance rows).
- `spec.md:603` and `:1144` (privacy) → "a nickname (possibly typed by the player), an avatar with its frame and
  background, and fish totals are shared…"; G-SRV-3 (spec.md:138) now concerns player-chosen names too (open question
  for the gate: Meta's user-generated-content expectations, a report path).
- `docs/phase2e/CONTRACTS.md:96, 185, 247` (wire types) → the new fields; `:311-317` §2.3 → "the server's first names
  only (the client no longer ships the lists)"; `:343` → `"freeText":true`; `:743-753` (NicknameSheetProps) → the new
  props (`current: ProfilePick`, `frames`, `backgrounds`, `nameEditable`, `nameRules`, `checkName`, state `invalid`; no
  `words`, `numMin`, `numMax`, `shuffle`); `:812` → drop `icon-shuffle`, add `frame-*`, `bg-*`.
- `docs/phase2e/STATUS-2e.md:248` → remove "free-text names" from "Not built by design".
- `server/README.md:15, 25` → add `0004_profile_looks.sql` and the migrate-before-deploy line for it.
- `docs/provenance.md` §13.1 row `icon-pencil, icon-shuffle, icon-info` → without shuffle; add the rows above.

## Sizes (measured: `npx vite build --mode fbig`, then `scripts/size-check.ts`)

| Row | Now | Ceiling | Before (map / dist of 2026-10-13) |
|---|---|---|---|
| Lazy JS (ladder) | 43 033 B | 38 500 | 37 868 (+5 165: the looks art ≈ 3.4 KB, the tabs, grids and name field; the word lists −1.1 KB) |
| Lazy JS (ladder boot) | 37 853 B | 36 600 | 36 195 (+1 658: the shape rule, the unlock table, the flow) |
| Lazy CSS (ladder) | 22 605 B | 22 200 | 21 817 (+788) |
| Lazy JS (English) | 14 222 B | 13 600 | 13 590 (+632) |
| Locale chunk (hi, the largest) | 42 979 B | 41 900 | 41 839 (+1 140) |
| Main JS | 354 634 B | 360 000 | 353 731 (+903: `avatarBadge`, the save's lenient read, the wire constants and validator) |
| First-load CSS | 52 409 B | 51 700 | 52 409 (unchanged: no new first-load CSS) |
