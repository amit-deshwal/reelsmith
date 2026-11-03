---
name: reels-editor
description: |
  Edit Instagram Reels (9:16, 1080x1920) in Reelsmith: beat-aware cuts, the Instagram safe zone, directed reels (changes go through the director), and a lint pass before finishing. Use for any reel, Instagram, 9:16, vertical short, "make me a reel about…", "snap to the beat", or a change to a reel that is already built.
---

# Reels editor

You are editing a short vertical video for Instagram Reels. The user cares about three things: it looks intentional, it lands on the music, and nothing important hides under Instagram's buttons.

## Rules

1. **Canvas is 9:16.** 1080x1920 at 30 fps unless the user says otherwise. If it is not, say so and offer `set_aspect_ratio`.
2. **Safe zone.** Instagram's UI covers about the top 250 px, the bottom 360 px and the right 10% of a 1080x1920 frame. Keep titles, captions and stickers inside. Never put text in the bottom band.
3. **Cut on the beat.** When there is music, cuts land on beats (every 1, 2 or 4 beats; 4 = on the bar). Use `reels_snap_cuts_to_beats` after manual reordering or trimming instead of moving cuts by hand.
4. **One request, one undo step.** Prefer the batch tools below; each is a single undo step.
5. **Lint before finishing.** Run `reels_lint` after your last edit. Fix every error; fix warnings unless the user wanted them. Mention any warning you leave.
6. **Say what changed, in plain words.** Two or three short lines: what you cut, moved or added, and where (seconds, not frames).
7. **Say when something is impossible.** If the footage is too short, a clip is missing, or a request conflicts with the safe zone or the beat, say so plainly and offer the closest option. Never pad with repeated clips without asking.

## A new reel (the user describes an idea; you direct it)

A new reel is always directed: load the `reels-director` skill and run its stages (`reels_director_options` to watch the footage, `reels_director_treatment`, `reels_director_build`, then `reels_director_critique` and `reels_director_fix`). The user should not have to write a prompt for you. When they describe a reel ("trip to Goa, 12 clips, chill, under 20 s"), ask only what is missing (what it is about, the vibe or pace, and the song if none is imported), never more than three questions, and skip every question already answered. If nothing is imported yet, say what to import and stop. If the timeline is not empty, ask before replacing it.

Songs: do not use `list_audio` / `add_audio` for a directed reel; the plan names the imported song. Small photos are enlarged 2x with a local model only when the user asks for best quality. Beat check: never cut hard on a song whose beat is `none`; tell the user and keep the clips' own sound or ask for another song.

When the reel is built, finish with `reels_lint` and two or three plain lines: what it is, the length in seconds, and what they can ask next ("make the ending stronger", "different opener", "snap to the beat").

## Work fast (every model turn costs seconds)

A whole reel should take about 10–20 turns, not 80. Quality comes from the plan, not from more checking.

1. **Look once, plan once.** Get one contact sheet per source clip (`view_asset_frames` with ~12–16 samples), write the full shot list (who or what, source in/out, zoom, caption, time), then edit. Do not look at a clip again unless a shot failed.
2. **Batch.** One `edit_item` call carries every add, update and delete of the pass: all clips, trims, speeds, transforms and filters together; `update_item_props` also takes several items. Never one call per clip.
3. **Verify at the end, not after each step.** Run `reels_lint`, then at most two `view_timeline_frames` calls (one sheet over the whole reel, one only if something looked wrong). No frame check after caption-only or colour-only edits.
4. **Do not re-measure.** Measure colour once per source clip, apply one correction per source, and move on.
5. **Cover every person and place.** When the footage shows several people, give each one a shot before repeating anyone. Say who is in each shot in the shot list.

## Transitions between shots

Reels cut hard by default. When the user asks for a transition ("add a bars transition between clip 2 and 3"), use `edit_item` with `adds:[{type:"transition", assetId:"builtin:tr-<type>", incomingItemId:"<the later clip>"}]` and leave `durationInFrames` out so the default props apply (the break-ins are 0.35 s).

- Break-ins, short and on the beat: `bars` (6 vertical bars, alternating from top and bottom), `wide-bars` (3 wide rows, calmer), `window` (a window grows from the centre; it stays inside the safe zone until 80%). Their props are fixed; only the length can change. Use `browse_library category=transitions` to see them.
- **Reels transitions (cinematic, 0.3–0.6 s):** `zoom-through` (punch in/out with streaks), `whip-blur` (a whip with motion blur, any direction), `spin-zoom` (spin and scale), `light-leak` (warm film bloom, from the side given by `direction`), `chroma-glitch` (RGB tear), `fluted-glass` (ribbed glass), `ripple-dissolve` (water ring from the centre), `tile-pop` (mosaic of rounded windows), `cube-turn` (a cube turns, left/right/up/down), `slide-over` (clean slide with parallax and shadow), `pixelate` (pixel dissolve), `film-burn` (warm film burn from a corner), `flip-3d` (3D card spin), `mirror-flip` (flat coin flip), `prism-flash` (light band with rainbow fringes) and `brush-wipe` (painted on in brush strokes). Add them like the others (`assetId:"builtin:tr-<type>"`, no `durationInFrames`); set `direction` for the directional ones.
- **Pick by the reel's mood, one family per reel:** fast/energetic or a beat drop → `zoom-through`, `whip-blur`, `spin-zoom`; techy or gaming → `chroma-glitch`, `pixelate`; travel, golden hour, calm → `light-leak`, `film-burn`, `ripple-dissolve`, `fluted-glass`; fashion or nights out → `prism-flash`; art and journals → `brush-wipe`; sports → `flip-3d`; before/after → `mirror-flip`; friends, photo dumps, collages → `tile-pop`; place changes or before/after → `cube-turn`; vlogs and talking reels → `slide-over` or `whip-blur`. Put the transition's peak on a beat (cut on the beat first) and keep them off shots under about 0.6 s.
- **Break in on the beat:** put the cut on a beat first (`reels_snap_cuts_to_beats`), then add the transition into the clip that starts on it.
- **One style per reel.** Pick one break-in and repeat it, or vary only when the user asks for variety. 
- **Hard cut for fast flashes.** Shots under about 0.6 s (strobe hooks, beat-by-beat drops) stay hard cuts or use the plain `flash` transition; do not put a bars or window break-in on them.
- A transition needs two adjacent clips on the same track; if there is a gap, say so instead of moving clips.

## Reel looks (one call, a whole grade)

When the user asks for a mood, a vibe or "make it look cinematic/retro/…", call `reels_apply_look` instead of stacking effects by hand: one undo step puts a grade + glow + texture stack on every clip (`scope:"selected"` for one clip; `look:"none"` removes it). Pick one look per reel by mood: `cinematic-travel` (trips, landscapes), `golden-hour` (warm, calm, couples), `neon-night` (city nights, parties, gaming), `retro-vhs` (throwback, funny), `old-film` (memories, family), `mixmedia-cutout` (person as a paper sticker on crayon paper) and `spotlight` (vivid person, dark soft background), both only on shots with a person, `soft-pastel` (lifestyle, food, selfies), `moody-bleach` (dramatic, treks), `comic-pop` (playful, friends), `mixmedia-crayon` (scrapbook, kids, diary: taped photo on patterned paper with crayon doodles), `sketchbook` (pencil drawing, calm and artsy), `riso-zine` (two-ink print; indie, fashion, music), `watercolor-dream` (soft washes; dreamy, nature). A later look replaces the earlier one; effects added by hand stay. Tune afterwards with `manage_effects` only if asked. On vertical video use `fine-grain` and `soft-vignette`, not the older Film grain and Vignette (which streak or cut to black).

## Signature styles (one considered treatment)

`reels_apply_signature` is the answer to "unique", "thrilling", "cinematic", "bold" or "use the best effects": one look on every clip, one accent effect on the opening shot only, and one transition type on the cuts, in one undo step. Pick by mood: `cinematic-drift` (travel, landscapes, calm), `neon-pulse` (nightlife, parties, energetic), `golden-memory` (couples, sunsets, friends, nostalgic), `retro-tape` (throwback, funny), `clean-minimal` (portraits, lifestyle, fashion: soft colour, hard cuts). Choose by what the footage shows, not only the user's words: `neon-pulse` is for dark night footage only (on daylight it turns white clothes and sky magenta), bright daytime footage takes `cinematic-drift` (the default for "unique/thrilling/bold") or `golden-memory`. Call it once after the build and add nothing on top: restraint is what makes a reel look expensive, and more effects only make it look busy. Never stack a signature, a look and hand-added effects.

Picture quality: `reels_lint` reports shots enlarged more than 2x (soft) or 3x (blocky). Replace that shot, zoom it less or say the source is too small; never ship a blocky shot.

## Film and lens effects (Resolve-style looks)

Apply with `manage_effects` (see `browse_library category=fx`). All have sliders; leave the defaults unless the user asks for more or less. One or two per reel, never a stack of looks.

- **Cinematic glow:** `halation` (warm red-orange glow round highlights; the film-stock look), `pro-mist` (soft diffusion glow, lifted blacks; skin and light), `anamorphic-flare` (long blue streaks from lights; night and city), `light-rays` (rays from a point; sun, windows; move `lightX`/`lightY` to the light).
- **Lens:** `zoom-blur` (radial punch-in blur; pair with a beat drop), `lens-distortion` (barrel warp with a colour fringe; vlog and street), `swirl` (a twist around a point; a playful moment, short).
- **Texture and era:** `film-damage` (dust, scratches, flicker; throwback and memories), `vhs` (tape wobble, tracking band; retro and 2000s), `cartoon` (flat colour with ink outlines), `water-ripple` (heat haze or underwater; dream sequences).
- **Hand-made and mixed media (whole frame, no cut-out needed):** `crayon` (wax crayon on cream paper), `scrapbook-paper` (the clip as a taped, tilted photo on patterned paper; `pattern` 0 stripes, 1 dots, 2 grid, 3 scribble), `crayon-doodles` (stars, hearts, spirals around the picture; keeps the centre clear), `cut-paper` (coloured-paper collage), `pencil-sketch`, `watercolor`, `riso` (two-ink halftone zine print), `thermal` (heat camera with brackets) and `frame-division` (the frame cut into slabs that re-cut). The hand-drawn ones boil at 8 fps on their own. Use one as the main style of a reel or segment; `scrapbook-paper` then `crayon-doodles` is the MixMedia scrapbook look.
- **Person effects (need a person in the shot; the app cuts them out of every frame):** `mixmedia-cutout` (the person as a paper sticker on patterned crayon paper with doodles behind them; the MixMedia scrapbook edit), `subject-pop` (vivid person with a glowing rim, dark soft background), `sticker` (die-cut sticker on a tinted blur), `double-exposure` (the scene inside their silhouette), `echo-copies` (tinted clones step out one per beat; set `beat` to the song's seconds per beat), `glass-person` (liquid glass), `predator` (hot body on a cold blue scene), `orbital-screens` (small screens orbit them), `card-breakout` (video boxed in a card, the person steps out of it), `silhouette` (flat poster shape), `echo-trails` (Echo Print: moving leaves tinted afterimages; best on dancing or walking, `step` is the seconds between prints; slower to preview because it decodes earlier frames), `text-behind` (a huge word scrolls in rows behind them; `word` picks one by number: 0 wanderlust, 1 summer, 2 good vibes, 3 main character, 4 escape, 5 love, 6 weekend, 7 adventure, 8 dream big, 9 golden hour, 10 new chapter, 11 home, 12 forever, 13 let's go; match it to the trip) and `light-trails` (streaks of their light stretch off them; `angle` is the direction, `mode` 1 for a burst). Use them on clips where one person is clearly visible; with nobody in the frame they show only the background. For groups or people far away set `detect` to 1 (rougher edges, finds more people).
- **Title effect (no person needed):** `title-reveal` (Movie title reveal: a weathered-steel title inside spiralling glass rings cut from the footage; put it on the opening clip; `word` picks the title by number: 0 the last summer, 1 wander lust, 2 golden hour, 3 the journey, 4 escape, 5 new chapter, 6 good vibes, 7 adventure, 8 the great escape, 9 island life, 10 road trip, 11 forever young; `reveal` is the seconds the rings take to open, 1.6 by default). It darkens the footage outside the glass, so use it on a hero shot, not every clip.
- **Frame:** `cinema-bars` (letterbox; on 9:16 keep the bars thin, size 0.06 to 0.1, and keep captions inside the safe zone).
- Effects go on the clip, not the timeline. Time-based ones (`film-damage`, `vhs`, `water-ripple`) animate by themselves.
- **Timed to the music (use this instead of a plain effect whenever the user mentions the beat, the drop, a build, "on the music", "only behind me"):** `reels_time_effect` with `timing` beat (punches on every `every` beats: `glitch`, `rgb-split`, `zoom-blur`, `shake`, `bounce`, `blackout`, `edge-glow`), drop (one hit that falls away: `zoom-blur`, `light-rays`, `bloom`; set `fromSec` to the drop), build (grows into `toSec`: `shake`, `zoom-blur`, `vignette`), fade (`light-leak`, `pro-mist`), steady. `strength` 0.6-0.8 usually looks better than 1. `region: "background"` keeps the person natural while the world changes (`duotone`, `sepia`, `thermal`, `pencil-sketch`); `region: "subject"` treats only them. Never compute beat times yourself; never stack two timed effects on the same beat.
- **Creator effects:** `bounce` and `blackout` only through `reels_time_effect` with timing beat; `sparkle` (glints on small highlights: water, lights, jewellery), `flare-sweep` (a sun flare drifting across; golden hour, open sky). A label that follows a person (`follow-tag`) or a line behind the person is drawn by the director; to add one to a reel the director built, change that section of the plan (`textStyle: "follow-tag"`, or `textBehind: true`) with `reels_director_fix` (only that section is rebuilt; one undo step) rather than faking it with a text item.

## Changes to a built reel

- A directed reel is changed with `reels_director_fix` (only the changed sections are rebuilt; with no arguments it returns the treatment and plan saved with the reel, also in a new chat). To change rhythm ("cut every beat in the body"), change that section's `params.every` there, then `reels_snap_cuts_to_beats` if the user wants cuts on the grid.
- Talking clips ("remove the ums", "cut my retakes", "tighten my talking"): `reels_clean_speech` (level balanced unless they ask for more; `pauses` true when they want it tighter). Report the words it cut.
- Backwards ("reverse that", "rewind the jump"): `reels_reverse` on the clip, or `fromSec`/`toSec` for a stretch of it; picture and sound play backwards, everything else stays. `forwards` true undoes it. Never fake it with keyframes or a negative speed.
- Hook or closer ("add a flash opener"): `reels_strobe` with `mode` opener or closer. It adds 3 beat-cut flashes of different footage with white flashes between, on its own track above the reel. Needs music with a beat grid; keep the default 1.5 s unless asked.

## Without a directed reel

Use the normal editing tools (`edit_item`, `split_item`, `move_item`, `apply_layout`, `edit_captions`). Music analysis lives in `music-intelligence`; for beat snapping on a hand-made timeline, `reels_snap_cuts_to_beats` analyses the song once and stores the grid on the music clip.
