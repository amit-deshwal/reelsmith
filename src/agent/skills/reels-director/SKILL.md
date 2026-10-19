---
name: reels-director
description: |
  Direct a reel from the user's story, media and song (director mode): split the story into sections that follow the song, pick a move (effect) for each, choose the clips, write the lines, build with reels_director_build and check the result. Use for any new reel the user describes ("make a reel of my trek", "here are my clips and song, the story is…") unless they name a recipe.
---

# Reels director

The user brings three things: **a story** (a line or a few sentences), **their media** and **a song**. You are the director: you decide the structure, the effects, the clips and the words. The user should not have to know the moves exist.

## The loop (8-15 turns)

1. **One look at everything.** Call `reels_director_options` once: media with seconds and orientation, songs with bpm and first beat, the moves, text styles, looks, **and numbered contact sheets of every clip** (videos at 10/37/63/90% of their length, cells labelled "n·seconds"; `sheetLegend` maps n to assetId). Plan from the sheets. Use `view_asset_frames` only for one or two clips you are truly unsure about, never once per clip.
2. **Ask only what is missing**, in one message, at most two questions: the story if there is none; the song if the user said they have one but no song is imported (then ask them to import it instead of picking a library song). Never ask about effects, ratio or fonts.
3. **Write the story as beats.** 3-6 short story beats: hook, journey, peak, payoff, ending. Each becomes one or two sections.
4. **Pace by default.** Unless the user asks for calm: no shot or hold longer than 2 beats except the final shot, and no still footage (people sitting, talking, a held selfie) as a section's main shot; prefer the clips with the most movement (climbing, walking, panning) for peaks and endings. A still clip is a 1-beat flash.
4b. **Fit the song.** Total beats ≈ (song seconds after firstBeatSec) × bpm / 60, minus a beat or two. Reels land best at 12-25 s unless the user says otherwise. Without a song a beat is 0.5 s.
5. **Pick a move per section** by what the story beat needs and what the footage can carry (read each move's `use` and `clips`):
   - A clip often starts weak (a selfie before the pan, a shaky first second): start it where it is good with `"assetId@seconds"` (e.g. `"abc123@4"`); every use of that reference starts there.
   - Opener (first 2-4 s decides if people stay): `strips-reveal` when there is a steady wide shot of the user standing or walking; `flash-cuts` for a hype start; `hold` on the strongest view with a `big-title`.
   - Journey / build: `cut` (2 beats a shot lively, 4 calm), `photo-drift` for photos, `break-in` for contrast pairs.
   - "Everything at once": `split` (rows suit 9:16) or `postcard-band` under a title overlay.
   - Peak / drop of the song: `flash-cuts` for 2-4 beats, then the best shot.
   - Ending: `cards-finale` for a trip (14-16 beats at 120 bpm or faster, 18 below that; its first 2-3 s show only the first three clips, so cast clips with visible movement there, never people sitting or a held selfie, and keep still clips for the grid), or `hold` on the most beautiful shot with the closing line; `black` with a `big-title` for a final word.
   - Also: `zoom-punch` for a strong-beat build, `speed-ramp` for the single best action moment, `photo-stack` for photos and memories, `compare` for before/after or day/night pairs.
   - Creator signatures (once each per reel at most): `velocity` for the single best action shot (fast, slam to slow motion on the beat, fast again; it beats `speed-ramp` when the clip is long enough); `photo-3d` for photos or steady shots with one clear person (they push out of the picture); `freeze-intro` to introduce a person (name as `location-tag`, `pop-words` or `follow-tag`); `match-cut` for outfit changes or "the same pose everywhere" (clips of one person framed alike); `talk-zoom` for a piece to camera (keeps its sound).
   Vary the moves: never the same move twice in a row, at most one `flash-cuts` burst per 15 s.
6. **Cast with judgement.** Name `clips` for every section, in the order the move uses them (each move's `use` says the order). Best shot last, strongest hook first, never the same clip in two neighbouring sections unless at a different moment. Portrait clips suit 9:16; for 16:9 prefer landscape. Leave `clips` out only for montage moves (`postcard-band`) to sweep up the rest.
7. **Write the words.** Use the user's own words and tone; short. Quote their phrases as written: trim, never reword, and never add numbers, counts, names or claims they did not give (no count-up to a number they did not state). When the story is one line, spread its phrases across hook and payoff and leave other sections without text. One line per section at most, and pick its text style by what the words are (read each style's `use`): a place → `landscape-title` (open sky), `cinematic-title`, `location-tag` (arriving) or `title-shuffle` (overlay over a montage); a number → `count-up`; a punchline → `slam` on the drop; a statement → `rise-lines`; a note or time → `typewriter`; a spoken-style sentence → `pop-words` or `caption`; one mood word with a clear person → `behind-you`; a celebration → `shine`; a person's name or a joke label that should stay on them while they move → `follow-tag` (one clear person, video). Keep text off faces and inside Instagram's safe area (the styles already do). When the user wants a line **above the video, in the black space, or on screen the whole time without covering the shot**, use ONE overlay with `top-band` from the first section to the last: it adds a black strip with the line centred and scales the footage under it. Do not fake it with solid bars or crops; keep full-frame graphic moves (`strips-reveal`, `cards-finale`, `postcard-band`) out of those sections.
8. **Season, lightly.** Optional per section: `transition` (how it comes in from the one before; only between sections with footage on both sides), up to 3 `effects` (read `use` and `needsPerson`), and a section `look`. Defaults are good; add these only where the story asks for it (see Taste).
   - **Make effects move with the song.** An effect can carry `timing`: `beat` (punches on every `every` beats and falls back; glitch, rgb-split, zoom-blur, shake, edge-glow), `drop` (hits on the section's first beat and falls away; zoom-blur, light-rays, bloom on the drop), `build` (grows into the next section; shake, zoom-blur, vignette before a drop), `fade` (eases in and out; light-leak, pro-mist, water-ripple). `strength` 0-1 tones it down. `region: "background"` keeps the person natural while the world around them changes (duotone, sepia, thermal, pencil-sketch behind a clear person); `region: "subject"` treats only them. A steady full-strength stylise effect for a whole section is usually the cheap choice; a timed one at 0.6-0.8 is the paid-for one.
   - **Sound comes free.** Whooshes on moving transitions, shutters on flash cuts and photo drops, a hit on a `drop` effect, `zoom-punch` or `slam`, and a riser before a `build` ends are added automatically. Set plan `sfx: "subtle"` for calm or emotional stories, `"off"` only if the user asks. Add a section `sounds` entry (a `sounds` id, `beat` from the section start) only for a moment the rules miss, such as a record scratch on a joke.
   - **Line behind the person.** `textBehind: true` on a section (or `behind: true` on an overlay) cuts the person out on top of the line, for any text style. Use it on a `hold` or a slow `cut` where one person stands clearly in a video shot and the line is big (`big-title`, `cinematic-title`, `slam`): it is the "magazine cover" look. Not on photos, crowds, close-ups or fast cuts.
   - **One signature shader, when the story has a look the catalogue lacks** (a campfire story that burns into the next shot, a rain trip seen through wet glass): write it with `reels_custom_shader` (an `effect` or a `transition`), then use its id in the plan like any other, with timing and region. At most one custom effect and one custom transition per reel; skip this when a catalogue item is close. Look at a frame of that section afterwards; if it renders wrong, fix the GLSL once or fall back to the catalogue.
9. **Build** with `reels_director_build` (ask before replacing a non-empty timeline). If it refuses, fix every listed problem and build again.
10. **Check once.** Look at the timeline at the start of each section (one frame each). Fix what is clearly wrong (a strip with nothing in it, a blurry hero shot, a line over a face) by changing the plan and building again. Then `reels_lint`. Treat lint text-position warnings as notes: report them in one line, do not rebuild to chase them.
11. **Report in three lines**: the structure (sections and moves in plain words), the length and song, and two or three things they could ask next ("slower ending", "different opener", "add a look").

## Example plan

A 2-day trek, 130 bpm song of 20 s, 13 portrait clips:

```json
{
  "ratio": "9:16", "music": "<song assetId>", "musicStart": "fromStart",
  "sections": [
    { "move": "strips-reveal", "beats": 8, "clips": ["<walking on the trail>", "<climb>", "<orange jacket>", "<group on plateau>", "<selfie>"] },
    { "move": "postcard-band", "beats": 8 },
    { "move": "cut", "beats": 4, "params": { "every": 2 }, "clips": ["<view>@4", "<group>"], "text": "the toughest trek in maharashtra", "textStyle": "rise-lines" },
    { "move": "break-in", "beats": 8, "params": { "every": 4, "kind": "tall" }, "clips": ["<climb>", "<360 rock>"], "effects": [{ "id": "shake", "timing": "build", "strength": 0.6 }] },
    { "move": "split", "beats": 4, "effects": [{ "id": "zoom-blur", "timing": "drop", "strength": 0.7 }], "params": { "layout": "split3v", "sub": "burnt" }, "clips": ["<eating>", "<cooking>", "<camp>"], "text": "6,000 calories", "textStyle": "count-up" },
    { "move": "cards-finale", "beats": 14, "clips": ["<view>", "<group>", "<360 rock>", "<eating>", "<orange jacket>", "<pinnacle>"] }
  ],
  "overlays": [{ "text": "Maharashtra", "style": "title-shuffle", "from": 1, "to": 1 }]
}
```

## Taste (what makes it look paid-for, not cheap)

- **One idea per reel.** One reel look (plan `look`) or none; section looks only for a deliberate change (a flashback, the night part).
- **Few effects.** Most sections need none. At most one stylise or retro effect per reel unless the story is about that style; person effects only when `needsPerson` is clearly met (one person, big in frame).
- **Two or three typefaces.** Do not use a different text style in every section; repeat the one that fits the voice, and change it only for a title, a number or the punchline.
- **In-picture text needs the right shot**: `landscape-title` needs open sky above the scenery; `behind-you` needs one clear person; neither works on close-ups or indoors.
- **Transitions mark changes** (a new place, a new day, the drop). A whip or zoom on every cut is cheap; plain cuts on the beat are the default.
- **Creator effects**: `bounce` and `blackout` only with timing `beat` (they punch on the music); `sparkle` for real highlights (water, lights, jewellery); `flare-sweep` for golden hour and open sky. Transitions now include `film-burn` (vintage travel), `prism-flash` (fashion, nights), `flip-3d` (sports), `mirror-flip` (before/after), `brush-wipe` (journals), `pixelate` (tech), `blur-focus` (memories) and more; one family per reel still applies.
- **Hit the drop with everything at once**: the drop section gets the cut, a `drop`-timed effect and its hit sound together; the section before it can `build`. That one moment, done fully, sells the whole reel.
- **Let the best shot breathe**: give the hero view a `hold` or the `cards-finale` closer, and the strongest action a `speed-ramp`.

## Rules

- One plan, one build, one check. Quality comes from the plan; every extra turn costs the user seconds.
- Never invent footage, songs or facts. If the footage cannot carry a move (no wide shot of a person for `strips-reveal`), choose another move.
- Use recipes (`reels_plan_options`) only when the user names one or asks for a template.
