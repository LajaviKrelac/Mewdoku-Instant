# Character art brief: toony animal heads, export spec and prompts

Home redesign, 2026-10-11. The new main characters are toony animal heads in the style of the app icon (the
orange bear sticker on the red / teal grid). This brief says what to generate in ChatGPT or Gemini and exactly how
to export it, so the game can animate the character itself.

## How the animation works (why you export parts, not a video)

You do **not** export an animation. You export one character as a **kit of separate layers** (head, pupils,
eyelids, eyebrows, mouths). The game stacks the layers and animates them in code:

| Motion | How the game does it |
| --- | --- |
| Blinking | swaps the eye layers open → half → closed → half → open (about 150 ms), at random 2–6 s intervals, sometimes a double blink |
| Moving eyes | slides the two pupil layers inside the eye whites (looks around, follows the player's taps) |
| Eyebrows | moves and tilts the two brow layers (raise, frown, one-brow "hmm") |
| Mouth | swaps mouth layers (talk flaps, smile, laugh, "oh!", sad) |
| Head | bob, tilt, squash and stretch, a bounce on a win |

Why not a video or a frame-by-frame sprite sheet from the AI: the frames drift from each other (the face changes
shape from frame to frame), the files are large (the Facebook build has a 1 MB limit for the whole game), and a
video can only loop. Layers stay sharp, cost a few dozen KB, and the character can react to the game (look at the
cell you tapped, laugh on a win, frown on a mistake).

## Export rules (every file)

1. **PNG, 1024 × 1024 px, transparent background** (real alpha: no white, no checkerboard drawn into the pixels).
2. **One canvas, one position.** Every layer of a character uses the **same 1024 × 1024 framing as the master
   image**: the part sits exactly where it sits on the face in the master, and everything else is transparent.
   Do not crop, centre or rescale a part. (Small drift is fine; I align the layers. A part moved to the middle of
   the canvas is not.)
3. **Framing of the master:** the head faces the viewer straight on (symmetrical, not three-quarter view), centred,
   ears included, about 80 % of the canvas wide, at least 60 px of empty margin on every side.
4. **No ground shadow, no background, no text, no watermark, no glow outside the outline.** The game adds the
   shadow.
5. **The white sticker outline** (about 20–24 px, like the icon) goes **only around the head layer's silhouette**.
   Parts that sit inside the face (pupils, brows, mouths, lids) have no white outline.
6. **Fallback if the tool cannot make transparency (Gemini usually cannot):** a flat pure green background
   `#00FF00`, edge to edge, with no shading, gradient or shadow on it, and no green anywhere in the character. I key
   it out. Say "solid flat #00FF00 chroma-key background" in the prompt instead of "transparent background".
7. **File names:** a folder per animal, the names below exactly, lower case: `bear/head.png`, `bear/pupil-l.png`, …
   (`-l` / `-r` are the character's left and right **as you look at the picture**: `-l` is on the left of the
   image.)

You send me 1024 px masters; I shrink them and convert them to WebP for the game, so do not compress them yourself.

## The kit (per animal: 16 files)

| File | What it contains (everything else transparent) |
| --- | --- |
| `reference.png` | The assembled master face: neutral friendly expression, eyes open looking straight ahead, closed smile. Background allowed here (it is only my alignment reference). |
| `head.png` | The whole head: fur, ears, muzzle, nose, cheeks, the white sticker outline. **Eye whites drawn empty** (plain white ovals: no pupils, no lids, no lashes). **No eyebrows. No mouth**: the muzzle is smooth fur where the mouth goes. |
| `pupil-l.png`, `pupil-r.png` | Only the iris + pupil + white catchlight of one eye, at that eye's centre. The catchlight on the upper left in both eyes. |
| `lids-half.png` | Both upper eyelids half closed (fur-coloured lids covering the top half of each eye white, with the lid edge line), nothing else. |
| `lids-closed.png` | Both eyes fully closed: lids covering the whole eye whites, a soft closed-eye line. |
| `eyes-happy.png` | Both eyes as happy upside-down "U" arcs (laughing eyes), covering the eye whites completely. |
| `brow-l.png`, `brow-r.png` | One eyebrow each, neutral position and shape. |
| `mouth-smile.png` | Closed gentle smile. |
| `mouth-talk.png` | Small half-open mouth (mid-word), a little dark inside, no tongue visible. |
| `mouth-open.png` | Open happy smile with tongue, like the icon. |
| `mouth-laugh.png` | Very wide open laugh, tongue, bigger than `mouth-open`. |
| `mouth-oh.png` | Small round surprised "O". |
| `mouth-sad.png` | Small downturned closed mouth. |
| `mouth-worried.png` | Wavy unsure line ("uh-oh"). |

Every mouth sits on the same spot of the muzzle, and the eye parts exactly over the eye whites of `head.png`.

## Prompts

Paste the **style block** into every prompt. Fill `[ANIMAL]` and `[ANIMAL DETAILS]` once per character (examples at
the end).

### Style block (paste into every prompt)

```
Style: toony 3D mobile-game mascot, soft clay / plush look, rounded chunky shapes, big expressive cartoon eyes,
glossy nose, warm saturated colours, soft studio light from the upper left, gentle ambient occlusion, no hard
black outlines. Matches a cute casual puzzle game icon. Front view, perfectly symmetrical head facing the viewer.
Square 1024 x 1024 image. Transparent background (PNG with alpha). No ground shadow, no text, no watermark,
no frame, no extra objects.
```

(Gemini: replace "Transparent background (PNG with alpha)" with "Solid flat pure green #00FF00 chroma-key
background, edge to edge, no green on the character".)

### 1. Master → `reference.png`

```
A cute toony [ANIMAL] head mascot, head only (no body), with ears. [ANIMAL DETAILS]
Neutral friendly expression: big white eye whites with dark brown pupils looking straight at the viewer, simple
rounded eyebrows, a closed gentle smile. A thick white sticker outline (about 22 px) around the whole head
silhouette. The head is centred and fills about 80% of the canvas width, with at least 60 px empty margin on all
sides, ears fully inside the canvas.
[STYLE BLOCK]
```

Generate until you like it; this face is the character. Every next step is an **edit of this image** (upload it /
keep it in the same chat and say "edit this image"), so the shapes stay the same.

### 2. `head.png`

```
Edit this exact image. Keep the head, ears, fur, muzzle, nose, cheeks and the white sticker outline exactly the
same: same size, same position, same framing on the 1024 x 1024 canvas. Remove the pupils and irises so the eyes
are plain empty white ovals. Remove both eyebrows (smooth fur there). Remove the mouth completely so the muzzle is
smooth fur under the nose. Do not move, crop or rescale anything.
[STYLE BLOCK]
```

### 3. Layer prompts (one image each; always start from `reference.png`)

Use this frame and put one line from the table below into `[KEEP ONLY]`:

```
Edit this exact image. Keep ONLY [KEEP ONLY], exactly where it is now, same size, same position on the
1024 x 1024 canvas. Erase everything else (head, fur, ears, outline, other features) to a fully transparent
background. Do not move, centre, crop or rescale the part. No white sticker outline around the part.
[STYLE BLOCK]
```

| File | `[KEEP ONLY]` |
| --- | --- |
| `pupil-l.png` | the iris, pupil and catchlight of the eye on the left side of the image |
| `pupil-r.png` | the iris, pupil and catchlight of the eye on the right side of the image |
| `brow-l.png` | the eyebrow on the left side of the image |
| `brow-r.png` | the eyebrow on the right side of the image |
| `mouth-smile.png` | the mouth |

For parts that are **not** in the master (lids, other mouths) first make an edited face, then cut the part out:

```
Edit this exact image. Change only [CHANGE]. Keep everything else identical: same head, same size, same position,
same framing on the 1024 x 1024 canvas.
[STYLE BLOCK]
```

then run the `[KEEP ONLY]` prompt on that result.

| File | `[CHANGE]` | then `[KEEP ONLY]` |
| --- | --- | --- |
| `lids-half.png` | both upper eyelids half closed (sleepy blink, lids in the fur colour covering the top half of the eye whites) | both upper eyelids |
| `lids-closed.png` | both eyes fully closed (fur-coloured lids with a soft curved closed-eye line) | both closed eyes and lids, covering the whole eye areas |
| `eyes-happy.png` | both eyes into happy laughing upside-down U arcs | both eye areas with the arcs, covering the whole eye areas |
| `mouth-talk.png` | the mouth into a small half-open mouth, mid-word, no tongue visible | the mouth |
| `mouth-open.png` | the mouth into an open happy smile with a pink tongue | the mouth |
| `mouth-laugh.png` | the mouth into a very wide open laugh with a pink tongue | the mouth |
| `mouth-oh.png` | the mouth into a small round surprised "O" | the mouth |
| `mouth-sad.png` | the mouth into a small sad downturned closed mouth | the mouth |
| `mouth-worried.png` | the mouth into a wavy unsure "uh-oh" line | the mouth |

### Animal details (examples)

- **Bear** (the icon): `Warm orange-caramel fur with a lighter muzzle, small round ears with darker inner ears,
  short dark-brown rounded eyebrows, big glossy black-brown nose with a white highlight, fluffy cheek tufts.`
- **Cat**: `Soft grey-and-white tabby fur with faint darker stripes on the forehead, white muzzle and chest tuft,
  big triangular ears with pink insides, small pink triangle nose, short whiskers, short rounded eyebrows.`

## Checklist before sending

- [ ] 16 files per animal, named as above, in a folder per animal
- [ ] 1024 × 1024, transparent (or flat `#00FF00`)
- [ ] Every part in its place on the face (lay it over `reference.png`: it should line up)
- [ ] `head.png` has empty white eyes, no brows, no mouth
- [ ] Front view, symmetrical; same character in every file

Send them (a zip or the files in the chat) and I will build the layered character, align the parts and wire the
idle animation (blinks, glances, brow moves, mouth flaps) into Home.
