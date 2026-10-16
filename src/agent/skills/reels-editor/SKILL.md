---
name: reels-editor
description: |
  Edit Instagram Reels (9:16, 1080x1920) in Reelsmith: beat-aware cuts, the Instagram safe zone, recipe-built reels (re-cut a section, re-pick shots), and a lint pass before finishing. Use for any reel, Instagram, 9:16, vertical short, "re-cut the body", "snap to the beat", or "choose the shots" request.
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

## Recipe-built reels

A reel made from the Recipes tab remembers its recipe run.

- `reels_run_info`: which recipe, its params and texts, and the sections on the timeline (e.g. `intro`, `body`, `outro`, `drop`).
- `reels_recut_section`: fresh shots for one section ("re-cut the body"). Other sections and clips the user added by hand are kept.
- To change rhythm ("cut every beat in the body"), re-cut the section, then `reels_snap_cuts_to_beats` with the wanted `every`.
- Hook or closer ("add a flash opener"): `reels_strobe` with `mode` opener or closer. It adds 3 beat-cut flashes of different footage with white flashes between, on its own track above the reel. Needs music with a beat grid; keep the default 1.5 s unless asked.

## Choosing the shots ("let my agent choose")

1. `reels_selection_candidates` gives `selectionKey`, primary `slots` and candidates, optional `brollSlots`/`brollCandidates`, and `framesAllowed`. Scores, near-duplicate groups, best windows, capture times and short transcript excerpts help you choose.
2. When `framesAllowed` is true, use candidate `inspect` requests with `view_asset_frames` for small contact sheets of uncertain clips. When false, choose from text facts without requesting pictures.
3. Call `propose_selection` with the exact `selectionKey`, primary `assetIds` in shot order (at most `slots`) and optional `brollAssetIds` (at most `brollSlots`). Never choose two from the same `groupId`. Keep vlog capture-time order; keep talking clips coherent. Refresh candidates when a stale-selection error occurs. Give a one-line rationale.
4. Report the accepted picks, rejected picks and heuristic fills. If none are usable or the agent is unavailable, the current assembled reel remains usable.

## Without a recipe

Use the normal editing tools (`edit_item`, `split_item`, `move_item`, `apply_layout`, `edit_captions`). Music analysis lives in `music-intelligence`; for beat snapping on a hand-made timeline, `reels_snap_cuts_to_beats` analyses the song once and stores the grid on the music clip.
