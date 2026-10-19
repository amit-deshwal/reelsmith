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
4. **Fit the song.** Total beats ≈ (song seconds after firstBeatSec) × bpm / 60, minus a beat or two. Reels land best at 12-25 s unless the user says otherwise. Without a song a beat is 0.5 s.
5. **Pick a move per section** by what the story beat needs and what the footage can carry (read each move's `use` and `clips`):
   - A clip often starts weak (a selfie before the pan, a shaky first second): start it where it is good with `"assetId@seconds"` (e.g. `"abc123@4"`); every use of that reference starts there.
   - Opener (first 2-4 s decides if people stay): `strips-reveal` when there is a steady wide shot of the user standing or walking; `flash-cuts` for a hype start; `hold` on the strongest view with a `big-title`.
   - Journey / build: `cut` (2 beats a shot lively, 4 calm), `photo-drift` for photos, `break-in` for contrast pairs.
   - "Everything at once": `split` (rows suit 9:16) or `postcard-band` under a title overlay.
   - Peak / drop of the song: `flash-cuts` for 2-4 beats, then the best shot.
   - Ending: `cards-finale` for a trip (14+ beats), or `hold` on the most beautiful shot with the closing line; `black` with a `big-title` for a final word.
   - Also: `zoom-punch` for a strong-beat build, `speed-ramp` for the single best action moment, `photo-stack` for photos and memories, `compare` for before/after or day/night pairs.
   Vary the moves: never the same move twice in a row, at most one `flash-cuts` burst per 15 s.
6. **Cast with judgement.** Name `clips` for every section, in the order the move uses them (each move's `use` says the order). Best shot last, strongest hook first, never the same clip in two neighbouring sections unless at a different moment. Portrait clips suit 9:16; for 16:9 prefer landscape. Leave `clips` out only for montage moves (`postcard-band`) to sweep up the rest.
7. **Write the words.** Use the user's own words and tone; short. One line per section at most, and pick its text style by what the words are (read each style's `use`): a place → `landscape-title` (open sky), `cinematic-title`, `location-tag` (arriving) or `title-shuffle` (overlay over a montage); a number → `count-up`; a punchline → `slam` on the drop; a statement → `rise-lines`; a note or time → `typewriter`; a spoken-style sentence → `pop-words` or `caption`; one mood word with a clear person → `behind-you`; a celebration → `shine`. Keep text off faces and inside Instagram's safe area (the styles already do).
8. **Season, lightly.** Optional per section: `transition` (how it comes in from the one before; only between sections with footage on both sides), up to 3 `effects` (read `use` and `needsPerson`), and a section `look`. Defaults are good; add these only where the story asks for it (see Taste).
9. **Build** with `reels_director_build` (ask before replacing a non-empty timeline). If it refuses, fix every listed problem and build again.
10. **Check once.** Look at the timeline at the start of each section (one frame each). Fix what is clearly wrong (a strip with nothing in it, a blurry hero shot, a line over a face) by changing the plan and building again. Then `reels_lint`.
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
    { "move": "break-in", "beats": 8, "params": { "every": 4, "kind": "tall" }, "clips": ["<climb>", "<360 rock>"] },
    { "move": "split", "beats": 4, "params": { "layout": "split3v", "sub": "burnt" }, "clips": ["<eating>", "<cooking>", "<camp>"], "text": "6,000 calories", "textStyle": "count-up" },
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
- **Let the best shot breathe**: give the hero view a `hold` or the `cards-finale` closer, and the strongest action a `speed-ramp`.

## Rules

- One plan, one build, one check. Quality comes from the plan; every extra turn costs the user seconds.
- Never invent footage, songs or facts. If the footage cannot carry a move (no wide shot of a person for `strips-reveal`), choose another move.
- Use recipes (`reels_plan_options`) only when the user names one or asks for a template.
