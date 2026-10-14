# UI batch (2026-10-13): leaderboard — workstream notes

Both leaderboard screens: the post-win panel (overlay `ranking`) and the Home sheet (overlay `ladder`), which share
`src/ui/overlays/bracket-list.ts` (lazy `ladder` chunk). Base `3067892`. Everything below follows the lead plan's
"leaderboard" decisions 1–11; the extra decisions taken here are listed in §2.

## 1. What changed and why (the user's items)

| # | User's ask | Done |
|---|---|---|
| 1 | Panel: remove "+1 fish · Your total: 16" | `.ranking__sub` is `hidden` in the ladder `bracket` and `loading` states (`ranking-panel.ts` `render`). It stays the dialog's `aria-describedby` and part of the live announcement; the records card and the 2b/2c/event boards keep it. The victory screen still shows the total next. |
| 2 | Remove "The top 3 win hints and kitties." (both screens) | `rewardsLineText` only returns the minimum line ("Rewards need at least 5 players …", which explains a bracket without chests). Keys `ladder.rewards.line.*` deleted (English, meta, 16 locales). |
| 3 | Timer right under "Leaderboard" | Follows from 1 in the panel; spacing tightened (`.lb-timer` 4 px, the panel's list 6 px). The preview build's "Preview: sample players" line now goes after the stopwatch (`preview/labels.ts`, scoped margin in `preview/preview.css`). |
| 4 | Remove the number of players | `.ranking__count` and its separators removed; `.ranking__meta` is now `sr-only` and holds only the worded countdown (the stopwatch is `aria-hidden`; countdowns are never live regions). The announcement ("You are #5 of 37 …") and the chip's label keep the server's count. Keys `ladder.players.*` deleted (also from `PLAYER_COUNT_KEYS`). |
| 5 | Three different chests, better place = better reward (look and content) | Art: `reward-chest-1` (full size, gold straps and corner caps, a gold crown band with a ruby, a sapphire and a jade, the fish lock, gold sparkles), `reward-chest-2` (86 %, silver straps, rivets, corner caps, silver fish lock), `reward-chest-3` (72 %, plain wood, bronze straps, a round bronze lock plate, no caps). Content: server `rewards.places` = 1st 3 + 3, 2nd 2 + 2, 3rd 1 + 1 (was 2 + 2, 1 + 1, 1 + 0). The client shows only the server's amounts: `BracketListView.rewards` from `rules.places` (`ladder-flow.ts` `listView`). A chest shows only where the server could pay: `rewardsLine === 'places'`, a rule for that place with a grant > 0, and fish on the row (`bracket-prize.ts` `prizeFor`). |
| 6 | Tap a chest → a tooltip above it with its rewards | `bracket-prize.ts` `createPrizeTip`: one `.lb-tip[role=tooltip]` in the list's root (never clipped by the scrolling rows), above the chest (below it when there is no room), centred on it and kept inside the list; the place's medal with its number, the helpers' own art (`tool-bulb`, `tool-kitty`) with "×3". Closes on a second tap, a press elsewhere, focus leaving the chest, a scroll, any re-render (incl. the 30 s status tick and a language change), the rank-up, and Esc (both overlays' `dismiss()` ask `closeTip()` first). Row chests are buttons (`aria-expanded`, named "Reward for #1: 3 hints and 3 kitties"); the row's own name ends with the same words; podium chests are pointer-only (the podium is `aria-hidden`). |
| 7 | Panel one row taller | `.ranking[data-list='bracket'] .ranking__card { max-height: min(78vh + 60px, 100vh − 104px − safe) }` (FB: `100vh − --fb-safe − 88px − safe-bottom`). At ≤ 640 px tall the 84vh rule stays (it gains only the removed lines); in FB builds it is capped too (`− --fb-safe − 74px`), which also fixes the FB 320 × 568 footer overflow the map measured (64 + 477 + 58 + 16 > 568). Measured with `data-fb-safe`: footer bottom 826/828 at 390 × 844, 550/552 at 320 × 568, 622/624 at 360 × 640, 682/684 at 390 × 700. |
| 8 | My row sticks where it left the view | The real row is `position: sticky; top/bottom: -4px` in the `ol` scroller (flush with its edge over the 4 px padding), `z-index: 3`, lifted with `--shadow-2`. The pinned copy and `updatePinned` are gone. `centerAfter` measures with `[data-measuring]`, `playClimb` sets `[data-climbing]`/`.is-climbing` before measuring; both make my row `position: relative`. |
| Sheet | No pencil; (i) to the left, title centred | `onEditName` removed from `BracketListCallbacks`, `LadderSheetProps` and its three callers (`ladder-flow.ts`, `boot.ts`, `dev/ladder-harness.ts`), the pencil code, its CSS and the key `nick.edit.a11y`. Head order back · (i) · title · × (back and (i) never show together); the head's start margin mirrors its end margin, so the ribbon is centred between two 44 px discs (RTL mirrors). The name sheet still opens from Settings → "Ranking name" and the Home profile picture. The panel's (i) is unchanged. |

Chest sizes on narrow phones: rows keep a smaller chest at ≤ 360 px wide (26 px) and hide it only at ≤ 340 px (the row
name still says the reward); the compact podium (≤ 740 px tall) keeps its chests as a badge in each step's top corner
(the steps stay short). At 320 × 568 the panel has no chest (podium hidden ≤ 640 px tall, rows ≤ 340 px wide); the
sheet shows them on its compact podium.

## 2. Decisions beyond the plan

1. **Two new keys** (lazy, `enLazyUi2e`, after `ladder.climb.up`; 16 drafts at the anchor): `ladder.chest.a11y`
   "Reward for #{rank}: {reward}" (screen readers; `{reward}` = "3 hints and 3 kitties" from `event.reward.*` +
   `joinList`; describes the place, never "your reward", H-4) and `ladder.chest.count` "×{count}" (`translatable:
   false`, max 6; added to the pinned list in `tests/unit/i18n/catalogs.spec.ts`).
2. **Three symbols, not CSS-variable layers:** `reward-chest` (result card, day-7 row) stays byte-identical
   (1 178 B, its tests unchanged); the tiers come from one `tier()` function in `chestArt()`. All three share one
   48 × 48 box and are drawn at 1 / 0.86 / 0.72 on one ground line, so the rows keep one column width (no name
   width jitter between places) while the chests still differ in size. Colours only from `TOKENS`, `CHEST_COLORS`,
   `MEDAL_COLORS`, `PALETTE` (gems: `--danger`, Sky, Lagoon).
3. **`BracketListView.rewards` is optional** (absent = no chest) and `BracketListHandle.closeTip` is optional, so the
   other workstreams' view literals and test doubles keep compiling.
4. **Chest hit area:** a 30 × 44 button (art 30 px; 32 px of column as before, so "Playing now" truncates no more than
   before), its `::after` reaching 14 px toward the fish pill (18 px at ≤ 360 px; mirrored in RTL), never over the
   heart's 44 × 44.
5. **The ribbon title may wrap** (`flex: 0 1 auto; min-width: 0`, 14 px side padding below 360 px): a long
   translation ("Papan peringkat") at 320 px now wraps inside the ribbon instead of running under the head's discs
   (it overflowed before too; the head now has the same total room, split evenly).
6. **A tap outside the list while a tip is open** closes the tip and, in the panel, continues as any outside tap
   (no swallowed click). Inside the list (chest, tip, rows, podium) never continues, as before.
7. **Contract fixtures unchanged:** `session.*.json`/`claim.*.json` keep 2 + 2 etc. (shape-only fixtures; the
   ladder-fake and `ladder-flow.spec` run on them). The visual e2e route fake (`FAKE_RULES`, the paid result) now
   uses the new defaults so the review captures show them.
8. **Harness:** `PLACE_REWARDS` default; new views `panel-tip`, `sheet-tip` (a tip open) and `sheet-me-30` (my row
   far down, to see it stick at the bottom / top).

## 3. Server: reward amounts (D-2e-17 / P-L5 revised)

`server/src/core/config.ts` `rewards.places`: 1st 3 hints + 3 kitties, 2nd 2 + 2, 3rd 1 + 1 (×2 by video unchanged;
min 5 members, `needOneBelow` unchanged). No migration (amounts are frozen per reward row at finalisation, so a
ranking finalised after the deploy pays the new amounts; rows already finalised keep theirs). It can still be
overridden per environment through `CONFIG_OVERRIDES`. Tests updated: `server/test/unit/rules.spec.ts`,
`server/test/http/flow.spec.ts`, `server/test/http/social.spec.ts`, `tests/unit/preview/sample-server.spec.ts`,
e2e `ladder.spec.ts` (+6/+6 for 1st ×2), `preview.spec.ts` (+4/+4 for 2nd ×2). Staging needs a deploy (not done).

## 4. Provenance rows (for `docs/provenance.md`)

§13.1 Art:

| Asset | File(s) | Method and words drawn from | Markup (B) |
|---|---|---|---|
| `reward-chest-1`, `reward-chest-2`, `reward-chest-3` | `src/ui/art/ladder-art.ts` (`chestArt` → `tier`) | UI batch 2026-10-13, hand-coded SVG by an AI coding agent from our written words: "the same wooden chest in three sizes on one ground line; 1st gold straps and corner caps, a gold crown band set with a ruby, a sapphire and a jade, the fish lock, gold sparkles; 2nd silver straps, rivets, corner caps and a silver fish lock; 3rd plain wood, bronze straps, a round bronze lock plate". Built on our own `reward-chest` geometry; no reference image. | 2 100 / 1 433 / 1 151 |

§13.3 Screens: the chest tooltip (`.lb-tip`, `src/ui/overlays/bracket-prize.ts`, `ladder-chunk.css`; our own layout:
a toast-coloured bubble with an arrow, the medal and the helpers' art), the sticky own row, the centred sheet head.

§13.4 Copy: `ladder.chest.a11y` "Reward for #{rank}: {reward}" and `ladder.chest.count` "×{count}" (ours; 16 AI
drafts from our English, `meta.ts` and the glossary only). Removed: `ladder.players.*`, `ladder.rewards.line.*`,
`nick.edit.a11y` (the §13.4 bullet that lists `nick.edit.a11y` should drop it).

## 5. Stale doc lines (suggested text; the lead applies them)

`docs/phase2e/spec.md`
- :74 D-2e-17, :92 P-L5, :420, :664, :689 — "1st 2 + 2, 2nd 1 + 1, 3rd 1 + 0" → "1st 3 hints + 3 kitties, 2nd 2 + 2,
  3rd 1 + 1 (UI batch 2026-10-13, the user: the better place, the better reward)".
- :729-732 wireframe — drop the "+2 fish · Your total: 14" and "Ends in … · 37 players" and "The top 3 win …" lines;
  show "Leaderboard (i)" then the stopwatch pill "07:48:00", the podium with one chest per paid place, then the rows.
- :746 — "when I scroll it away, a copy pins to the bottom of the list (`aria-hidden` …)" → "my row is sticky in the
  scroll list: scrolled away, it stays at the edge it left by (top or bottom); no copy".
- :747 — "\"37 players\" is the server's `members`" → "the server's `members` is read in the announcement only (no
  visible count since the UI batch)".
- :748 — "the rewards lines name the number of paid places …" → "the minimum line from `rules.minMembers`; the chests
  and their tooltip from `rules.places` (amounts as sent)".
- :774 — "my row with a pencil (opens the name sheet, §2.7), an info button and Close" → "(i) at the head's start,
  the title centred, Close at its end; no pencil (the name sheet opens from Settings and the Home picture)".
- :797 — "or the pencil on my row in the sheet" → "or the profile picture on Home".
- :840 — "rows, my row, the pinned copy" → "rows, my sticky row, the chests (bracket-prize.ts)".
- :1226-1227 (§9.4) — delete the "My pinned copy" row; header lines become ".ranking__meta.sr-only >
  .ranking__countdown, .lb-timer, .ranking__rewards (the minimum only), .ranking__stale, .ranking__hearts-new,
  button.ranking__info"; add "Chests: `button.rank-row__gift[data-place][aria-expanded]`, `.lb-pod__gift[data-place]`,
  `.lb-tip[role=tooltip]`".
- :1257 — "the pinned copy" → "the sticky row, the chests and their tooltip".
- :1275 (§10.3 #1) — "\"N players\" equals their count" → "the announcement's count equals theirs".
- :1280 (§10.3 #5) — "stock +4 / +4" → "stock +6 / +6".
- :1319 (§10.6 #4) — "outside `ladder.players.*`" → "outside the rules lines (`PLAYER_COUNT_KEYS`)".
- :1513-1517 (Appendix A) — remove `ladder.players.*` and `ladder.rewards.line.*`; add the two chest keys.
- :1633 (Appendix C) — add "`reward-chest-1` … `-3`: the paid places' chests (gold, silver, bronze; size and
  ornaments differ)".

`docs/phase2e/CONTRACTS.md`
- :679 — "the server's count (\"37 players\")" → "the server's count (the announcement)".
- :682-683 — `rewardsLine` 'places' no longer draws a line; add `readonly rewards?: readonly PlaceRewardView[]`.
- :724 and :892 — drop `onEditName`; :892 add `closeTip?()` to `BracketListHandle`.
- :812 — add `reward-chest-1`, `reward-chest-2`, `reward-chest-3`.
- :896 — drop `nick.edit.a11y`; add `ladder.chest.a11y`, `ladder.chest.count`.

`docs/provenance.md` :376 (add the row in §4), :404 (drop `nick.edit.a11y`); §13.3 "my pinned copy" → "my sticky row".

## 6. Sizes (FB build, `npx vite build --mode fbig`, `scripts/size-check.ts`)

| Row | Before (map, HEAD 31bfd53) | Now | Ceiling |
|---|---|---|---|
| Lazy JS (ladder) | 37 868 B | 40 268 B | 38 500 (over by 1 768) |
| Lazy CSS (ladder) | 21 817 B | 24 116 B | 22 200 (over by 1 916) |
| Lazy JS (English) | 13 590 B | 13 406 B | 13 600 |
| Locale chunk (hi, largest) | 41 839 B | 41 491 B | 41 900 |
| Lazy JS (overlay chunk) | 55 416 B | 55 531 B | 56 200 |
| Lazy CSS (overlay chunk) | 33 229 B | 33 229 B | 33 500 |

The ladder rows grow by the chest art, the tooltip (JS + CSS) and the sticky/chest/compact-podium rules, minus the
pinned copy, the pencil and the count. First-load rows are untouched by this workstream (CSS first load was already
over: 52.4 of 51.7 KB).

## 7. Checks

See the commit message; screenshots (390 × 844, 320 × 568, 360 × 740, Arabic, FB safe zone) were looked at in the
dev harness on port 5191.
