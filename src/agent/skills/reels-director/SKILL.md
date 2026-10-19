---
name: reels-director
description: |
  Direct a reel from the user's story, media and song (director mode): split the story into sections that follow the song, pick a move (effect) for each, choose the clips, write the lines, build with reels_director_build and check the result. Use for any new reel the user describes ("make a reel of my trek", "here are my clips and song, the story is…") unless they name a recipe.
---

# Reels director

The user brings three things: **a story** (a line or a few sentences), **their media** and **a song**. You are the director: you decide the structure, the effects, the clips and the words. The user should not have to know the moves exist.

## The loop (8-15 turns)

1. **One look at everything.** Call `reels_director_options` once (media with seconds and orientation, songs with bpm and first beat, the moves, text styles, looks). Then one contact sheet per source clip with `view_asset_frames` (12-16 samples) so you know what each clip shows and where it is steady. Do not look at a clip twice.
2. **Ask only what is missing**, in one message, at most two questions: the story if there is none, the song if none is imported and the user wants music. Never ask about effects, ratio or fonts.
3. **Write the story as beats.** 3-6 short story beats: hook, journey, peak, payoff, ending. Each becomes one or two sections.
4. **Fit the song.** Total beats ≈ (song seconds after firstBeatSec) × bpm / 60, minus a beat or two. Reels land best at 12-25 s unless the user says otherwise. Without a song a beat is 0.5 s.
5. **Pick a move per section** by what the story beat needs and what the footage can carry (read each move's `use` and `clips`):
   - Opener (first 2-4 s decides if people stay): `strips-reveal` when there is a steady wide shot of the user standing or walking; `flash-cuts` for a hype start; `hold` on the strongest view with a `big-title`.
   - Journey / build: `cut` (2 beats a shot lively, 4 calm), `photo-drift` for photos, `break-in` for contrast pairs.
   - "Everything at once": `split` (rows suit 9:16) or `postcard-band` under a title overlay.
   - Peak / drop of the song: `flash-cuts` for 2-4 beats, then the best shot.
   - Ending: `cards-finale` for a trip (14+ beats), or `hold` on the most beautiful shot with the closing line; `black` with a `big-title` for a final word.
   Vary the moves: never the same move twice in a row, at most one `flash-cuts` burst per 15 s, one look per reel.
6. **Cast with judgement.** Name `clips` for every section, in the order the move uses them (each move's `use` says the order). Best shot last, strongest hook first, never the same clip in two neighbouring sections unless at a different moment. Portrait clips suit 9:16; for 16:9 prefer landscape. Leave `clips` out only for montage moves (`postcard-band`) to sweep up the rest.
7. **Write the words.** Use the user's own words and tone; short. One line per section at most; `words-on-beat` for punchy fragments (3-8 words), `caption` for a sentence, `big-title` for a name or a final word, `title-shuffle` as an overlay for the place across a montage. Keep text off faces and inside Instagram's safe area (the styles already do).
8. **Build** with `reels_director_build` (ask before replacing a non-empty timeline). If it refuses, fix every listed problem and build again.
9. **Check once.** Look at the timeline at the start of each section (one frame each). Fix what is clearly wrong (a strip with nothing in it, a blurry hero shot, a line over a face) by changing the plan and building again. Then `reels_lint`.
10. **Report in three lines**: the structure (sections and moves in plain words), the length and song, and two or three things they could ask next ("slower ending", "different opener", "add a look").

## Example plan

A 2-day trek, 130 bpm song of 20 s, 13 portrait clips:

```json
{
  "ratio": "9:16", "music": "<song assetId>", "musicStart": "fromStart",
  "sections": [
    { "move": "strips-reveal", "beats": 8, "clips": ["<walking on the trail>", "<climb>", "<orange jacket>", "<group on plateau>", "<selfie>"] },
    { "move": "postcard-band", "beats": 8 },
    { "move": "cut", "beats": 4, "params": { "every": 2 }, "clips": ["<view>", "<group>"], "text": "the toughest trek in maharashtra", "textStyle": "caption" },
    { "move": "break-in", "beats": 8, "params": { "every": 4, "kind": "tall" }, "clips": ["<climb>", "<360 rock>"] },
    { "move": "split", "beats": 4, "params": { "layout": "split3v" }, "clips": ["<eating>", "<cooking>", "<camp>"] },
    { "move": "cards-finale", "beats": 14, "clips": ["<view>", "<group>", "<360 rock>", "<eating>", "<orange jacket>", "<pinnacle>"] }
  ],
  "overlays": [{ "text": "Maharashtra", "style": "title-shuffle", "from": 1, "to": 1 }]
}
```

## Rules

- One plan, one build, one check. Quality comes from the plan; every extra turn costs the user seconds.
- Never invent footage, songs or facts. If the footage cannot carry a move (no wide shot of a person for `strips-reveal`), choose another move.
- Use recipes (`reels_plan_options`) only when the user names one or asks for a template.
