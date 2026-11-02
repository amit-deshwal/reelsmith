---
name: reels-director
description: |
  Direct a reel from the user's story, media and song (director mode) as a four-stage pipeline: watch the footage (reels_director_options), write a treatment (reels_director_treatment), plan and build (reels_director_build), then critique (reels_director_critique) and repair the largest defects section by section (reels_director_fix). Also for later changes to a reel the director built (reels_director_fix). Use for any new reel the user describes ("make a reel of my trek", "here are my clips and song, the story is…") unless they name a recipe.
---

# Reels director

The user brings three things: **a story** (a line or a few sentences), **their media** and **a song**. You are the director: you decide what the reel is, its structure, its effects, its clips and its words. The user should not have to know the moves exist. They want the best cut possible, one that looks paid-for and fits their story, not a template; a run takes a few minutes and that is fine.

**Load the menu before stage 2, in two calls** (one result each stays readable): `load_skill(name="reels-director", files=["references/catalogue.md"])` (moves, text styles, graphics; add `"references/promo.md"` to it for a promo reel), then `load_skill(name="reels-director", files=["references/catalogue-fx.md"])` (effects, transitions, looks). `references/examples.md` has a worked treatment and plan. This file stays short so it loads whole.

Work in four stages, each with its own tool. Do the thinking each stage asks for before calling its tool; never skip a stage on a new reel.

## Before stage 1

- **Ask only what is missing**, in one message, at most two questions: the story if there is none; the song only if the user says they will add one and none is imported (then ask them to import it instead of picking a library song). A song playing in the clips' own audio is not missing: with no song imported, build on the clips' sound (no `music`). Build from whatever media is imported; never ask about effects, ratio or fonts, or whether to go ahead with fewer clips.
- **A promo reel** (the user names a club, shop, page, event or business, or gives its website): pass the address as `brandUrl` in stage 1. A promo is copywriting: you write the lines (punchy, in the page's voice), but every number, price and claim comes from the brand kit or the user; never invent one. With no website, ask in one message for the name, the one thing viewers should do ("Join on WhatsApp", "Book a table") and the @handle.
- **The user's own voiceover** (stage 1 lists it under `voiceovers`; "my voiceover", "my voice"): it leads the reel and is never `music`. Load `references/voiceover.md` before the treatment.
- **Not every request is a montage.** If the user wants the whole clip with only a moment left out (or just text added), do not direct a reel: cut that range out with the editor tools, keep the clip's sound, add their lines, and say so in one line.

## Stage 1: watch the footage (`reels_director_options`)

Call it once (with `reference` when the user gave a reel to match). It takes up to a minute and a half (it watches every clip) and returns:
- **the shot log**: each clip as `#n`, its length and shape, what it shows, its **best moments** (`best @12 @3`: sharp, lit, a subject, some life; best first), where it **moves**, where someone **talks**, the **soft/dark** seconds to avoid, and cuts inside it;
- **contact sheets** taken at those best moments (cells "n·seconds");
- **the songs** with bpm, drop and `suggest` (`musicStart`, `beatsFor18s`, `dropAtBeat`, and `energy`: the song bar by bar from the reel start, 1 quiet to 5 loudest, in phrases of four bars, and where it lifts). Use them as given; do not redo the arithmetic. Without a song a beat is 0.5 s and every clip keeps its sound.

- **"filmed"** on a log line: the clock time the clip was shot ("filmed 4:12 am", "day 2 · 6:05 am"), true from its metadata.
- **the brand kit**, with `brandUrl`: what the page says and asks, and its colours (`brandError` when the page could not be read: ask for the name, action and handle).
- **the reference**, when given: its measured pace (seconds and beats a shot), motion against the footage and colour, and one sheet with a cell a shot. It is never footage: it is not in the clip list.

Read the sheets with the log: who is in each shot (and where in the frame), which shots are wide views with open sky, which are selfies or people sitting, which have real action. Use `view_asset_frames` only when two clips are truly impossible to tell apart.

## Stage 2: the treatment (`reels_director_treatment`)

Decide what this reel *is* before any plan. Send:
- **two concepts** that are genuinely different (not the same arc with other fonts): e.g. for "bro lied that it would be easy... hardest hike... 2 days of adventure": *"The betrayal"* (comic: the lie, the arrow on bro, the brutal climb, the earned summit) and *"Earned"* (royal: quiet setup, the climb as a test, a grand title over the summit). Pick the one that fits the user's words and footage, and say which with `chosen`;
- **the tone** (epic, royal, hype, playful, funny, emotional, calm, nostalgic, romantic, moody). It sets the voice of every style and effect: a big achievement is royal or epic, never cute; a joke is playful or funny, never solemn. When the user names a feel ("royal", "funny", "cinematic"), that is the tone;
- **hero shots**: the 3-6 best moments in the footage (`"#5@12"`), from the log and sheets;
- **the arc as parts** on the song: `{ role, beats, move, clips, line, idea, purpose }`: hook, build/journey, drop/peak, payoff, ending, adding up to about `beatsFor18s`, with the drop part starting on `dropAtBeat`. `purpose` is why the part exists: what the viewer knows or feels after it that they did not before ("they learn bro lied"). A part with no purpose of its own, or the same one as its neighbour, is filler: merge or cut it;
- **the signature**: the one moment people will remember, and where;
- **the kit**, from the menu at the end of this skill: 1-3 text styles, one transition family (1-3), the few effects, the graphics the story asks for, a look or none;
- `story` (their words, verbatim) and `ownWords: true` only when they asked for lines of your own;
- **with a reference, the `styleGuide`**: `pacing` (seconds or beats a shot, where it holds), `palette` (its actual colours, not "premium"), `type` (typeface feel, size, where lines sit), `motion` (snap, glide, overshoot, hold), `texture`, and `doNotCopy` (its subjects, words, logos). Follow it in the kit and the arc: its pace sets your beats a shot, its colour your look.

How to shape it:
- **The hook (first 1-2 s) decides if people stay.** Open on movement, a face reacting or a reveal, with 2-5 words on the first frame (most people scroll with the sound off; a hook with no words is the "basic" reel): the sharpest part of their sentence. Never 4 s of a still selfie under a full sentence. `strips-reveal` when there is a steady wide shot of the person; `flash-cuts` for a hype start (four or five half-beat shots of the best action, a flash on each); a moving hero shot with a big title; `freeze-intro` to introduce a person. The words take one of five shapes, always built from their own words or the brand kit, never generic bait: **the contrast** ("bro said easy hike"), **the payoff promised** (open on the summit: "then you get THIS view"), **the question the reel answers** ("worth waking up at 4 am?" only when they said 4 am), **the number** ("2,300 strangers. one trek gang"), **the clock** (a filmed time on the first shot: "4:12 am").
- **The build** moves the story on: `cut` (2 beats a shot lively, 1 energetic), `break-in` for contrast, `zoom-punch` on a strong beat, `photo-drift` or `photo-stack` for photos, `photo-parallax` for scenery photos with nobody in them (a 3D camera move through the view; `photo-3d` when a person stands in front of it), `split` for "everything at once", `match-cut` for the same pose in many places.
- **The drop** gets everything at once: a peak move (`velocity` on the best action, `zoom-punch`, `flash-cuts` for 2-4 beats, `speed-ramp`), a drop-timed effect and its hit; the part before it builds. `lens-cover` into it is the creator reset: the build's last shot goes dark, the drop lands bright.
- **The ending** lands: a `hold` on the most beautiful shot under the closing line, `cards-finale` for a trip (10-14 beats; its first 2-3 s show its first three clips, so cast moving ones there), or `black` with a big title for a final word.
- **Pace**: shots change every 1-2 beats; a hold lasts as long as its line takes to read (about 3 words a second) and no longer than about 4 s, except the last shot. Stills and people sitting are 1-beat flashes, never a section's main shot.
- **Cut to the song's energy, not only its beats.** Read the `energy` line: longer shots on its quiet bars (2-4 beats, a hold), shorter as it builds, the fastest cuts on the loud bars; a hold over the loudest bars stalls the edit, and fast cuts over a quiet verse feel unmotivated. Parts change on a bar line (beats adding up in fours) where you can, and a transition never lands on an odd beat. Not every beat needs a cut: let an action that needs two beats have them, and never speed it up or cut it before it lands (the jump lands, the turn finishes).
- **Cold open, when the story has a result.** Open on 1-2 s of the payoff (the summit, the splash, the finished thing) with 2-4 of their words, then cut back to the start (a `rewind`, a `dipToWhite`, or a hard cut on the bar) and tell it in order: people stay to see how you got there. Use it for "it was supposed to be easy" stories, transformations and trips with one big moment; not for a calm or emotional reel that builds to its reveal.
- **Let one moment be heard.** Under a song every clip is silent; a reel where the music dips for a shout at the top, a splash, laughter or one line someone says feels real and stops the thumb. Give that section `naturalSound: "under"` (the song dips about 12 dB) on a shot the log says is "talking" or full of sound, 2-6 beats. `"solo"` stops the song for the section and brings it back on the next section's first beat: 1-2 beats of real sound right before the drop, then the drop slams in. Once or twice a reel; `talk-zoom` is always heard. Never on photos.
- **Make it loop when it can.** Instagram replays a reel at once. Set plan `loop: true` when the last shot can hand back to the first: the same clip a moment before the opening moment (open on `#4@10`, end on `#4@7`), the same framing, or a closing line that leads into the opening line (end "and that's how", open "bro lied to me"). A loop ends on a bar with a hard cut or a moving transition, never `black`, `cards-finale` or a dip; the song then runs to the last frame instead of fading.
- **Vary the moves**: never the same move twice in a row; at least three different moves in a reel of four or more parts; plain cuts and holds for at most half of it.
- **Creator signatures** (one per reel): `velocity` (the best action shot), `rewind` (a jump, fall or splash played, rewound and played again: funny or hype), `photo-3d` (a portrait or a person in front of a view), `freeze-intro` (introduce someone), `match-cut`, `talk-zoom` (a piece to camera), a line with `textBehind` on a clear person, or one effect timed to the drop.
- **A story told by the clock**: when the log has "filmed" times and the story is a day (a trek, a wedding, a trip day), mark the turns with them: a `typewriter` line or `location-tag` sub ("4:12 am", "6:45 am · the fort"), in order, on 3-5 parts, never invented. Over several days, "day 2" on a `chapter-bar` or `split-reveal` instead.
- **A shot list** (the user lists timed shots with their own lines, like a brief for another AI editor): load `references/shotlist.md` and build it as written; the promo and taste rules do not apply.
- **Lyrics on screen** (a lyric edit, the song's words behind the person): load `references/lyrics.md`.
- **A promo reel** (a club, shop, page or event): load `references/promo.md` before the treatment; it has the story shape that beat Kino's cut, a line on every part in `punch-caps`, about 27 s, and the end card.
- **Graphics show what the story names.** Go through its words: a person ("bro", "mom", a name) → `annotate` (a marker arrow labelled with their word, on a calm shot where they are clear; never over `velocity`, `speed-ramp` or fast cuts) or a `follow-tag`; two places → `route-map` (`boarding-pass` for a flight); numbers → `hud-stats` or `count-up`; days or chapters → one `chapter-bar`; a conversation they wrote → `chat-bubbles` or `notification`; into the drop → `countdown`; throwback footage → `camcorder`; the punchline in 2-5 big words → `type-stack`. `confetti` and `sticker` only in playful or funny reels. One or two per reel, never two at once.

The worked treatment (the AMK "Earned" reel) is in `references/examples.md`.

The tool returns **findings** (a slow hook, a plain arc, parts with no purpose, styles that fight the tone, a drop on nothing, words they did not write, a person nobody points at), the **full catalogue entries** with params for your kit, the tone's **motion rules** (the build applies them: how lines and graphics move, how far holds push, how long transitions run), and the plan brief. **When it returns `questions`** (the story names something no clip shows, like "the waterfall"), ask the user in one short message and wait, or leave that part out and say so in your report; never put that line over a shot of something else (the build refuses it). Fix the findings as you write the plan; resend the treatment only if the concept changes. Need an item outside the kit later? Call it with just `lookup: ["id", ...]`.

**When the user asked to see the plan first** (`askFirst` on stage 1), the result carries a `card`: show it exactly as written, ask "Build it, or change something?" and stop. On their go, build with `approvedBy` set to their reply; for changes, send a revised treatment and show its new card. The build refuses until then.

## Stage 3: plan and build (`reels_director_build`)

Turn each part into one or two sections and build once. (Ask before replacing a non-empty timeline, unless the user asked for the reel.)
- **Cast with the log.** Name `clips` by number in the order the move uses them (each move's `use` says the order). Start each at its best moment: `"#7@4"` (every use of that reference starts there; leave the shot's length after it). The hook and the drop get moving, sharp moments; the ending the most beautiful one; never the same moment in neighbouring sections; skip the soft/dark seconds. **Few clips** (one to three videos): cast different moments (`"#1@0.5"`, `"#1@4"`, at least a second apart) and keep the reel no longer than the footage can fill. Portrait clips suit 9:16; landscape suits 16:9. Leave `clips` out only for montage moves (`postcard-band`).
- **Words.** The user's phrases, trimmed, never reworded; never add numbers, names or claims they did not give. Lines of your own only when asked ("make it funny"), in their language and slang. One line per section, readable in its time. Repeat the treatment's styles; change only for a title, a number or the punchline. Keep text off faces and inside the safe area (the styles already do). Style params go in the section's `params` (a style takes only the params its entry lists; `every` is beats per shot for `cut` and beats per word for `slam`). A line across several sections is an overlay: `"overlays": [{ "text": "Harishchandragad", "style": "title-shuffle", "from": 1, "to": 2 }]` (section indexes from 0, both included). A line "above the video" for the whole reel is ONE `top-band` overlay from section 0 to the last (keep full-frame graphic moves out of those sections).
- **Pick text styles by what the words are**: a place → `landscape-title` (open sky), `cinematic-title` or `location-tag`; a number → `count-up`; a punchline → `slam` on the drop (not in royal, calm or emotional reels); a statement → `rise-lines`; a note or a time → `typewriter`; a spoken sentence → `pop-words` or `caption` (playful and funny reels); one mood word on a clear person → `behind-you`; a triumph → `shine` or `tracking-in`.
- **Transitions** from your kit only where something changes: into the hook's reveal, the drop, a new place or day, the ending. Plain cuts on the beat everywhere else.
- **Effects move with the song**: `timing` `beat` (punches every `every` beats: rgb-split, zoom-blur, shake, edge-glow), `drop` (hits the section's first beat: zoom-blur, light-rays, bloom), `build` (grows into the next section: shake, zoom-blur, vignette), `fade` (light-leak, pro-mist). `strength` 0.5-0.8 is the paid-for look; a steady full-strength stylise effect is the cheap one. `region: "background"` keeps the person natural while the world changes; "needs a person" means one person, big in frame.
- **Sound comes free**: whooshes, shutters, hits and risers are added on transitions, flash cuts, drops and builds. `sfx: "subtle"` for calm or emotional reels, `"off"` only if asked; a section `sounds` entry only for a moment the rules miss.
- **Sound and loop**: `naturalSound` on a section (`"under"` or `"solo"`, see above); `loop: true` on the plan. The build returns findings for a voice muted under the song (someone talks through a long shot), fast cuts on quiet bars, a hold on loud ones, a transition on an odd beat, a subject jumping across the frame on fast cuts (order those clips so each subject sits near where the last one was), and a loop that fades or ends mid-bar.
- **Line behind the person**: `textBehind: true` (or `behind: true` on an overlay) with a big style (`big-title`, `cinematic-title`, `slam`, `rise-lines`) on a `hold` or slow `cut` with one clear person in video.
- **Graphics** placed by section: `{ "graphic": "annotate", "from": 1, "beats": 4, "text": "bro", "params": { "shape": "arrow" } }`. Every person in the shot is found and the arrow lands on one (the label "me" the nearest, any other the next nearest); when that is not who you mean, set `who` (front, back, left, right, middle) as you see them on the sheet. Never guess `x`/`y`.
- **Signature extras, when the catalogue lacks what the story needs**: one `reels_custom_graphic` (a Remotion component: an altitude profile drawing itself, a scoreboard) and one `reels_custom_shader` (an effect or transition: a campfire burn, wet glass) per reel; check their frames in the critique and fix them once or drop them.

The build returns one frame per section, the lint and review findings. Do not rebuild yet.

## Stage 4: critique, then repair the defects (`reels_director_critique`, `reels_director_fix`)

Call the critique right after the first build. It returns about three frames a section and every line at its fullest, the plan checked against your treatment, the **sound findings** (the reel with eyes closed: a sound on no cut, a drop on nothing, a line between beats, an ending mid-bar), the **reference findings** (its pace and colour against yours) and a critic's checklist. Judge only the rendered frames, as a picky creative director seeing the reel cold, not what you meant to make.

Then name the **three largest defects**, worst first, each `{ section, at, evidence, fix }`: `{ "section": 0, "at": 0.4, "evidence": "image 1 [1]: the line runs off the right edge", "fix": "rise-lines at x 0.08, two lines" }`. Call `reels_director_fix` with them and the **changed sections only** (`"sections": { "0": <the whole new section> }`, reel-wide changes in `plan`). Every other section comes back with the same clips and moments; the result shows the changed sections again. If a defect remains or a new one shows, name what remains and fix again (three rounds at most); when the frames show no defect, finish. When an arrow found nobody, set `x`/`y` on their head. Treat lint text-position warnings as notes. Never call `view_timeline_frames` or `reels_lint` separately.

## Finish

- **Finish the edit session** if you opened one: call `review_edit_session` (the build is only a draft until it returns `applied`; skipping it leaves the timeline empty). Loudness and exports act on the live project: call them only after it, with no edits pending in another session, or that draft goes stale.
- **Report in three lines**: the concept and structure in plain words, the length and song, and two or three things they could ask next ("slower ending", "different opener", "add a look"). When the song is a commercial track (an artist's song, not one of the bundled ones), add one line: Instagram may mute or limit a reel with it baked in; the Instagram-ready export also saves a no-sound copy, and in Instagram's music picker they start the song at `musicStart` (as m:ss) so the cuts land on its beat.

## Changing a built reel

For any change to a reel you built ("slower ending", "more royal", "this looks basic", another shape), load `references/changes.md` first.

## Taste (what makes it look paid-for, not cheap)

- **What matters most, in order** (Walter Murch's rule of six): the emotion of the moment, then the story being clear, then the rhythm with the song, then where the eye is (on fast cuts the next subject sits near the last one), then the framing. When two rules fight, the higher one wins: a shot that lands the feeling beats one that is perfectly on the beat.

- **One idea per reel.** One concept, one tone, one look or none. Choose the look from the sheets, not the topic: sunny daylight with blue sky usually looks best with no look; glow looks haze bright skies. Read each look's "Avoid".
- **The voice matches the tone.** Royal and epic: cinematic serif titles, tracking, gold shine, light rays and flares, dissolves and zoom-throughs; never stickers, sparkles, bouncing pop captions or glitches. Playful and funny: pop words, highlights, arrows, stickers, snappy slides. Hype: slams, words on the beat, glitch cuts, RGB punches.
- **Two or three typefaces**, repeated; change only for a title, a number or the punchline.
- **In-picture text needs the right shot**: `landscape-title` needs open sky above the scenery; `behind-you` needs one clear person; neither works on close-ups or indoors.
- **Transitions mark changes**, one family per reel: `film-burn` for vintage travel, `prism-flash` for fashion and nights, `flip-3d` for sports, `mirror-flip` for before/after, `brush-wipe` for journals, `pixelate` for tech, `blur-focus` for memories, `light-dissolve` and `zoom-through` for grand journeys.
- **Few effects, all moving with the music**; `bounce` and `blackout` only with timing `beat`; `sparkle` only for real highlights in a playful reel; `flare-sweep` for golden hour and open sky.
- **Clean picture over tricks**: a white flash lasts 2-5 frames; `dipToWhite`, `light-dissolve` or bloom over a bright sky washes the frame out for a second, and `velocity` blur over a whole section reads as a smeared shot. One velocity per reel at most, never in a promo's proof or payoff.
- **Hit the drop with everything at once**: that one moment, done fully, sells the reel.
- **Graphics are information, not glitter**: each tells part of the story.
- **Let the best shot breathe**: give the hero view a `hold` or the `cards-finale` closer.

## Rules

- Four stages on every new reel: options, treatment, build, critique and one rebuild (a second only for something clearly broken). Decide from the log, the sheets and the catalogue without re-reading them.
- Never invent footage, songs or facts. If the footage cannot carry a move (no wide shot of a person for `strips-reveal`), choose another.
- Use recipes (`reels_plan_options`) only when the user names one or asks for a template.

<!-- director-catalog:start (generated by src/reelsmith/director/sync-director-catalog.mts; do not edit by hand) -->
## Catalogue ids (load `references/catalogue.md` and `references/catalogue-fx.md` for what each looks like and when to use it)
- **Moves**: `cut` `flash-cuts` `zoom-punch` `hold` `speed-ramp` `velocity` `photo-3d` `freeze-intro` `match-cut` `talk-zoom` `rewind` `photo-drift` `photo-parallax` `photo-stack` `split` `break-in` `compare` `strips-reveal` `postcard-band` `cards-finale` `black`
- **Text styles**: `title-shuffle` `words-on-beat` `big-title` `caption` `top-band` `cinematic-title` `tracking-in` `typewriter` `location-tag` `rise-lines` `slam` `count-up` `wave` `glitch` `neon` `split-reveal` `highlight` `draw-on` `shine` `pop-words` `punch-caps` `behind-you` `landscape-title` `follow-tag`
- **Graphics**: `route-map` `boarding-pass` `chat-bubbles` `notification` `annotate` `sticker` `confetti` `countdown` `hud-stats` `chapter-bar` `loading-bar` `camcorder` `type-stack` `cta-card` `handle-tag`
- **Effects, transitions, looks**: 58 effects, 75 transitions and 14 looks, in the catalogue file.
<!-- director-catalog:end -->
