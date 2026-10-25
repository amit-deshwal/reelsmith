// Reelsmith agent tools (RS-106, RS-108, RS-403). Executors: ./reelsTools.ts.
import type { AgentToolSchema } from '../../agent/tool-schema';
import { CLIP_TOOL_SCHEMAS } from './clipToolSchemas';

export const REELS_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'reels_lint',
    description: [
      'Timeline lint for an Instagram Reel. Reports errors and warnings: canvas not 9:16, text that overlaps the Instagram UI',
      '(safe zone: top ≈250 px, bottom ≈360 px, right 10% on 1080x1920), gaps or black holes on the main video track, clips shorter',
      'than 0.3 s, cuts that miss the beat grid by more than 2 frames, and a reel longer than 90 s. Run it before you finish an edit.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_plan_options',
    description: [
      'Plan a reel step 1: one call returns every imported asset (assetId, name, kind, seconds, orientation) and every bundled recipe with its',
      'ratios, target length, media inputs (accept, min, max), text inputs (maxLength) and params. Songs (imported ones and libraryMusic) say beat steady/none/unknown and recipes say needsBeat: never pair a needsBeat recipe with a song whose beat is none. Use it to pick the recipe that fits what the user',
      'wants and what they imported, and to check there is enough footage, before calling reels_plan_assemble.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_plan_assemble',
    description: [
      'Plan a reel step 2: build the reel from your plan with a bundled recipe, as one undo step, and remember the run so reels_recut_section and',
      'propose_selection work afterwards. Media you do not name is filled automatically (unused clips for clip inputs, the only song for a song input).',
      'Refuses with a clear error when footage is too short or a value is invalid; nothing is changed then. When the timeline already has items, ask the',
      'user first and pass replaceTimeline true.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        recipeId: { type: 'string', description: 'Recipe id from reels_plan_options.' },
        ratio: { type: 'string', description: 'One of the recipe ratios, e.g. 9:16 (default: the recipe default).' },
        media: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, description: 'Optional: input id to assetIds in the order you want. Omit an input to fill it automatically.' },
        texts: { type: 'object', additionalProperties: { type: 'string' }, description: "Recipe text inputs by id (e.g. the Travel Diary line). Use the user's own words; within maxLength." },
        params: { type: 'object', additionalProperties: {}, description: 'Optional recipe params by id (see params in reels_plan_options).' },
        targetSec: { type: 'number', description: 'Length the user asked for, in seconds (kept inside the recipe limits). Recipes marked lengthFixed ignore it; the result says the real length (seconds) and a lengthNote when it misses by more than 1.5 s.' },
        music: { type: 'string', description: 'Optional song: a name or id from libraryMusic or an imported song. Omit it and a recipe that needs a song uses the first library song with a steady beat, added for you. Never add songs with add_audio for a plan.' },
        fallbackRecipeId: { type: 'string', description: 'Optional recipe that needs no beat (needsBeat false); built instead, in the same call, if the song turns out to have no steady beat.' },
        enhanceSmallPhotos: { type: 'boolean', description: 'Optional: true upscales photos that would be enlarged a lot (small or messaged photos) 2x with a local model before building, so they stay sharp and full-frame. Slower (seconds per photo); use it only when the user asks for best quality or the photos are small (see size in reels_plan_options). Does nothing if the enhancer is not installed; the result messages say how many were enhanced.' },
        seed: { type: 'number', description: 'Optional seed; same plan and seed give the same reel.' },
        replaceTimeline: { type: 'boolean', description: 'Pass true only after the user agreed to replace what is on the timeline.' },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'reels_apply_look',
    description: [
      'Apply a reel look: one undo step that stacks grade, glow, lens and texture effects on every video/photo clip (or only the selected one).',
      'Looks: cinematic-travel (teal/orange, halation, mist; trips and landscapes), golden-hour (warm sunset glow; calm, couples), neon-night (cyber grade,',
      'anamorphic streaks, bloom; city nights, parties), retro-vhs (tape wobble; throwback, funny), old-film (sepia, dust, scratches; memories, family),',
      'soft-pastel (portrait colour, soft glow; lifestyle, food, selfies), moody-bleach (bleach bypass, halation; dramatic, trek), comic-pop (ink outlines; playful),',
      'mixmedia-crayon (taped photo on patterned paper with crayon doodles; scrapbook, kids, diary), sketchbook (pencil drawing), riso-zine (two-ink halftone print; indie, fashion), watercolor-dream (soft washes; dreamy, nature),',
      'mixmedia-cutout (the person as a paper sticker on crayon paper with doodles) and spotlight (vivid person, dark soft background): both need a person in the shot.',
      '"none" removes the looks. Effects a look added are replaced by the next look; effects added by hand stay. Sliders stay editable with manage_effects.',
      'Pick the look from the reel\'s mood and use one per reel; do not stack looks.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        look: { type: 'string', enum: ['cinematic-travel', 'golden-hour', 'neon-night', 'retro-vhs', 'old-film', 'soft-pastel', 'moody-bleach', 'comic-pop', 'mixmedia-crayon', 'sketchbook', 'riso-zine', 'watercolor-dream', 'mixmedia-cutout', 'spotlight', 'none'] },
        scope: { type: 'string', enum: ['all', 'selected'], description: 'all (default): every video/photo clip; selected: only the selected clip.' },
      },
      required: ['look'],
    },
  },
  {
    name: 'reels_apply_signature',
    description: [
      'Give the reel one considered, restrained style in one undo step: a look on every clip, one accent effect on the opening shot only, and one transition type on the cuts.',
      'Use this when the user wants it unique, thrilling, cinematic, bold or "the best effects": one signature beats a stack of effects. Do not add more effects on top.',
      'Choose by what the footage shows, not only the words: neon-pulse is for dark night footage only (it washes daylight and white clothes magenta); bright daytime footage is cinematic-drift (the default for "unique/thrilling/bold") or golden-memory.',
      'cinematic-drift (travel, landscapes, calm: teal/orange, flare on the opening, whip-blur cuts), neon-pulse (nightlife, parties, energetic: bloom, zoom-blur punch, chroma-glitch cuts),',
      'golden-memory (couples, sunsets, friends, nostalgic: warm grade, light-leak cuts), retro-tape (throwback, funny: VHS, flash cuts), clean-minimal (lifestyle, portraits, fashion: soft colour, hard cuts, nothing else).',
      'Transitions are only added when the reel has none yet (Travel Diary already places its own); pass transitions false to keep hard cuts. Replaces a previous signature or look.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', enum: ['cinematic-drift', 'neon-pulse', 'golden-memory', 'retro-tape', 'clean-minimal'] },
        transitions: { type: 'boolean', description: 'false: look and accent only, keep hard cuts. Default true.' },
      },
      required: ['signature'],
    },
  },
  {
    name: 'reels_run_info',
    description: [
      'Read which Reelsmith recipe built this timeline: recipe id/version, assembler, seed, params, texts, the chosen media per input,',
      'and the recipe sections present on the timeline with their clip counts. Returns run:null when the timeline was not built by a recipe.',
      'Call this before reels_recut_section or reels_selection_candidates.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_recut_section',
    description: [
      'Re-cut one section of a recipe-built reel (e.g. "body", "intro", "drop") with a fresh pick of shots, as one undo step.',
      'Clips in other sections and anything the user added by hand are kept; clips used elsewhere are not reused.',
      'Use when the user asks things like "re-cut the body" or "different shots for the intro". Section names come from reels_run_info.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Section name from reels_run_info.sections.' },
        seed: { type: 'number', description: 'Optional seed; omit for a new random variation.' },
        useNewClips: { type: 'boolean', description: 'Default true: clips imported after the reel was built can be picked too. Pass false to use only the clips the reel was built from.' },
      },
      required: ['section'],
    },
  },
  {
    name: 'reels_snap_cuts_to_beats',
    description: [
      'Snap the cuts on a video track to the music beat grid, every 1, 2 or 4 beats (4 = on the bar in 4/4), as one undo step.',
      'Touching clips stay touching; no clip gets shorter than 0.3 s or longer than its source. Uses the beat grid stored on the music clip,',
      'or analyses the song locally once if there is none. Reports cuts moved and cuts left alone (with reasons).',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        every: { type: 'number', enum: [1, 2, 4], description: 'Snap to every Nth beat (default 1).' },
        track: { type: 'string', description: 'Video track id or alias (default V1).' },
        maxShiftSec: { type: 'number', description: 'Largest move allowed per cut, seconds (default 1).' },
      },
    },
  },
  {
    name: 'reels_strobe',
    description: [
      'Add a strobe flash-cut hook: 3 very short shots (about 0.5 s each, 1.5 s in total) cut on the beat, each from a different clip or a',
      'different part of the footage, with a white Flash transition between them. mode "opener" starts on the first beat of the reel;',
      '"closer" ends on the last bar line before the reel ends. It goes on its own video track above the reel, as one undo step, and',
      'replaces a previous strobe of the same mode. Needs music with a beat grid. Use it when the user asks for a hook, flash opener or closer.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['opener', 'closer'], description: 'Where to put the hook (default opener).' },
        lengthSec: { type: 'number', description: 'Total length of the hook in seconds (default 1.5).' },
        flashSec: { type: 'number', description: 'Length of one flash in seconds, 0.3 to 0.6 (default 0.5).' },
        accent: { type: 'boolean', description: 'White flash between shots (default true).' },
      },
    },
  },
  {
    name: 'reels_selection_candidates',
    description: [
      'For "let my agent choose the shots": list the candidate clips of the recipe run as a compact table (assetId, name, seconds,',
      'heuristic score 0..1, near-duplicate groupId, best window start, capture time) plus how many shots (slots) the reel needs.',
      'Returns selectionKey, framesAllowed and separate B-roll candidates/slot counts for captioned stories. When framesAllowed, call reels_selection_sheet once to see the best candidates in one image, then call propose_selection with the returned selectionKey.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_selection_sheet',
    description: [
      'One look at the candidates: returns numbered contact sheet image(s) of the best ~40 candidate clips (one frame each, at its best window)',
      'plus a legend mapping each cell number to assetId, name and score. Call it once after reels_selection_candidates instead of inspecting clips',
      'one by one (that is slow), judge every cell in this single look, then call propose_selection with the same selectionKey.',
      'Needs frame sharing on; otherwise choose from the candidate table.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_selection',
    description: [
      'Answer a shot-selection request: the assetIds to use, in shot order (at most `slots` from reels_selection_candidates).',
      'Unknown, repeated or near-duplicate picks are rejected and reported; empty slots are filled by the heuristic.',
      'Works across all recipes; captioned stories accept separate brollAssetIds; texts can set the recipe text inputs (textInputs) in the same rebuild. Valid picks lead, remaining slots use the heuristic. Pass selectionKey from the latest candidates call: stale picks are refused. The rebuild is one undo step and manual items are kept; no usable picks leave the current reel unchanged.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        selectionKey: { type: 'string', description: 'Exact selectionKey from the latest reels_selection_candidates response. Refresh candidates after any timeline/media change.' },
        assetIds: { type: 'array', items: { type: 'string' }, description: 'Chosen primary asset ids in shot order.' },
        brollAssetIds: { type: 'array', items: { type: 'string' }, description: 'Optional captioned-story B-roll ids, in slot order; use brollCandidates and brollSlots.' },
        texts: { type: 'object', additionalProperties: { type: 'string' }, description: "Optional text inputs to set in the same rebuild, keyed by the textInputs ids from reels_selection_candidates (e.g. the Travel Diary line, five phrases split with '/'). Keep the user's words; within maxLength." },
        rationale: { type: 'string', description: 'One or two sentences on why, shown to the user.' },
      },
      required: ['selectionKey', 'assetIds'],
    },
  },
  {
    name: 'reels_director_options',
    description: [
      'Director stage 1 (the user gives a story, media and a song; you direct the reel): watches the footage (up to about a minute and a half)',
      'and returns the shot log (each clip numbered #1, #2... with its best moments, where it moves, talks or goes soft), contact sheets taken',
      'at those moments, and the songs with bpm, drop and a timing suggestion. Call once, then write the treatment (reels_director_treatment).',
      'With `reference` (an imported reel the user wants theirs to feel like) it also measures that reel (pace, colour, motion), shows one',
      'cell a shot of it, and leaves it out of the clips.',
    ].join(' '),
    input_schema: { type: 'object', properties: { reference: { type: 'string', description: 'Optional: assetId or file name of an imported reel to match in pace and look (never cast as footage).' } } },
  },
  {
    name: 'reels_director_treatment',
    description: [
      'Director stage 2, before any plan: decide what the reel is. Give two different concepts and pick one, the tone, the hero shots, the arc',
      'on the song (parts with role, beats, move, clips and the line each carries), one signature moment and a small kit from the menu in the',
      'reels-director skill (text styles, transitions, effects, graphics, look). Returns findings (a slow hook, a plain arc, a style that fights',
      'the tone, a drop that lands on nothing, words the user did not write), the full catalogue entries with params for the kit, and how to',
      'write the plan. Changes nothing. With only `lookup` (ids), returns those catalogue entries.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        story: { type: 'string', description: "The user's story, in their words." },
        concepts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, idea: { type: 'string', description: 'One or two sentences: the angle, the feel, how it opens and lands.' } }, required: ['name', 'idea'] }, description: 'At least two genuinely different concepts.' },
        chosen: { type: 'number', description: 'Index of the concept you direct.' },
        tone: { type: 'string', enum: ['epic', 'royal', 'hype', 'playful', 'funny', 'emotional', 'calm', 'nostalgic', 'romantic', 'moody'] },
        heroes: { type: 'array', items: { type: 'string' }, description: 'The 3-6 best shots from the shot log and sheets ("#5@12").' },
        parts: {
          type: 'array',
          description: 'The arc in order, adding up to about the song\'s beatsFor18s.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['hook', 'build', 'journey', 'drop', 'peak', 'payoff', 'ending'] }, beats: { type: 'number' }, move: { type: 'string' },
              clips: { type: 'array', items: { type: 'string' } }, line: { type: 'string', description: 'The words on screen in this part, if any.' }, idea: { type: 'string' },
              purpose: { type: 'string', description: 'Why the part exists: what the viewer knows or feels after it that they did not before.' },
            },
            required: ['role', 'beats', 'move'],
          },
        },
        signature: { type: 'string', description: 'The one moment people will remember, and where (e.g. "velocity slam on #8@6 on the drop").' },
        textStyles: { type: 'array', items: { type: 'string' }, description: '1-3 text style ids.' },
        transitions: { type: 'array', items: { type: 'string' }, description: 'One family of 1-3 transition ids.' },
        effects: { type: 'array', items: { type: 'string' }, description: 'Effect ids you mean to use (few).' },
        graphics: { type: 'array', items: { type: 'string' }, description: 'Graphic ids for what the story names.' },
        look: { type: 'string', description: 'A look id, or leave it out for the footage as shot.' },
        ownWords: { type: 'boolean', description: 'True only when the user asked for lines of your own.' },
        styleGuide: {
          type: 'object', description: 'Required with a reference reel: what you learned from it, in concrete words.',
          properties: {
            pacing: { type: 'string', description: 'Seconds or beats between cuts, where it holds.' }, palette: { type: 'string', description: 'Its actual colours, not "premium".' },
            type: { type: 'string', description: 'Typeface feel, weight, size, where lines sit.' }, motion: { type: 'string', description: 'Snap, glide, overshoot, hold.' },
            texture: { type: 'string', description: 'Grain, glow, clean...' }, doNotCopy: { type: 'string', description: 'Its subjects, words and logos you will not copy.' },
          },
          required: ['pacing', 'palette', 'motion', 'doNotCopy'],
        },
        lookup: { type: 'array', items: { type: 'string' }, description: 'Alone: just return the catalogue entries for these ids.' },
      },
    },
  },
  {
    name: 'reels_director_critique',
    description: [
      'Director stage 4, after the first build: a closer look at the built reel (about three frames a section and every line at its fullest, in',
      'sheets of eight), checks against the treatment (tone, a plain arc, no transition or timed effect, a slow hook), the sound with eyes',
      'closed, the reference reel\'s pace and colour, and a critic\'s checklist. Name the three largest defects from the frames and repair them',
      'with reels_director_fix. Changes nothing.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_director_fix',
    description: [
      'Repair a directed reel in place, as one undo step: the sections you give are rebuilt and every other section comes back with the same',
      'clips and moments; returns frames of the changed sections only and the checks again. Use it for the critique\'s defects (up to three, each',
      'with section, at, evidence, fix) and for the user\'s later changes to a director reel (`request`), also in a new chat. With no changes it',
      'returns the saved treatment and plan of the reel on the timeline.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        defects: {
          type: 'array', description: 'The defects this round fixes, worst first (at most three).',
          items: { type: 'object', properties: { section: { type: 'number' }, at: { type: 'number', description: 'Reel second where it shows.' }, evidence: { type: 'string', description: 'The image and what it shows, or the finding.' }, fix: { type: 'string' } }, required: ['section', 'at', 'evidence', 'fix'] },
        },
        request: { type: 'string', description: 'For a change the user asked for: their words.' },
        sections: { type: 'object', additionalProperties: { type: 'object' }, description: 'Section index ("2") to the whole new section, in the build\'s section shape (move, beats, clips "#n@t", text, textStyle, params, transition, effects...).' },
        plan: { type: 'object', description: 'Reel-wide changes: look, sfx, musicStart, overlays, graphics or tone (each replaces the old value).' },
      },
    },
  },
  {
    name: 'reels_director_build',
    description: [
      'Director stage 3: build the reel from your plan as one undo step. The plan is sections back to back on the beat, each a move with',
      'its clips ("#7" or "#7@4" from the numbered list, in the order the move uses them), an optional on-screen line in a text style, and params;',
      'overlays carry a line across several sections. Invalid plans are refused with every problem listed; nothing changes then. When the',
      'timeline has items, ask the user first and pass replaceTimeline true. The result includes one frame per section, the lint and review',
      'findings; after the first build of a directed reel call reels_director_critique, then rebuild once with its upgrades.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          description: 'The reel plan.',
          properties: {
            ratio: { type: 'string', description: '9:16 (default), 4:5, 1:1 or 16:9.' },
            music: { type: 'string', description: 'Song assetId (imported or libraryMusic). Omit for silent.' },
            musicStart: { description: "'firstDownbeat' (default), 'fromStart' or a second of the song." },
            look: { type: 'string', description: 'Optional look id from reels_director_options.' },
            sfx: { type: 'string', enum: ['auto', 'subtle', 'off'], description: 'Sound effects on transitions, flash cuts, drops and builds: auto (default), subtle (quieter) or off.' },
            loop: { type: 'boolean', description: 'Made to replay: the song runs to the last frame (no fade) and the last shot should hand back to the first. End on a bar, never on black or a dip.' },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  move: { type: 'string' }, beats: { type: 'number' }, seconds: { type: 'number' },
                  clips: { type: 'array', items: { type: 'string' } }, text: { type: 'string' }, textStyle: { type: 'string' },
                  params: { type: 'object', additionalProperties: {}, description: "The move's params and the text style's params." },
                  transition: { type: 'string', description: 'How the section comes in from the one before (a transitions id).' },
                  effects: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', description: 'An effects id, or a custom:fx-* id from reels_custom_shader.' },
                        params: { type: 'object', additionalProperties: { type: 'number' } },
                        strength: { type: 'number', description: '0-1, default 1.' },
                        region: { type: 'string', enum: ['all', 'subject', 'background'], description: 'Only on the person or only behind them (person matte); default all.' },
                        timing: { type: 'string', enum: ['steady', 'fade', 'beat', 'drop', 'build'], description: 'steady (default) all through; fade in and out; beat = punch on every `every` beats and fall back; drop = hit on the first beat and fall away; build = grow into the next section.' },
                        every: { type: 'number', description: 'Beats between punches for timing beat (default 1).' },
                      },
                      required: ['id'],
                    },
                    description: 'Up to 3 effects on this section\'s footage.',
                  },
                  look: { type: 'string', description: 'A look for this section only.' },
                  textBehind: { type: 'boolean', description: 'Draw this section\'s line behind the person in the shot (they are cut out on top). Needs one clear person in video footage.' },
                  naturalSound: { type: 'string', enum: ['under', 'solo'], description: 'The clips\' own sound plays here (a shout, a splash, laughter, a line someone says): under dips the song about 12 dB; solo stops it for the section and brings it back on the next section\'s first beat. Video only.' },
                  sounds: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, beat: { type: 'number' } }, required: ['id'] }, description: 'Hand-placed sound effects (sounds ids), beat counted from the section start. Auto sounds already cover transitions, flash cuts, drops and builds.' },
                },
                required: ['move'],
              },
            },
            overlays: {
              type: 'array',
              items: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' }, params: { type: 'object', additionalProperties: {} }, behind: { type: 'boolean', description: 'Behind the person in the shots it crosses.' } }, required: ['text', 'style', 'from', 'to'] },
            },
            graphics: {
              type: 'array',
              description: 'Drawn graphics over the reel (route-map, chat-bubbles, sticker, confetti, countdown...; catalogue in the reels-director skill), or custom:gfx-* from reels_custom_graphic. Up to 8.',
              items: {
                type: 'object',
                properties: {
                  graphic: { type: 'string' }, from: { type: 'number', description: 'Section index where it starts.' }, to: { type: 'number', description: 'Last section it spans (default from).' },
                  beat: { type: 'number', description: 'Beats into section `from` where it starts (default 0).' }, beats: { type: 'number', description: 'Length in beats (default: to the end of section `to`).' },
                  text: { type: 'string', description: 'Its words; items split with "/".' }, params: { type: 'object', additionalProperties: {} },
                },
                required: ['graphic', 'from'],
              },
            },
          },
          required: ['sections'],
        },
        seed: { type: 'number', description: 'Optional seed; same plan and seed give the same reel.' },
        replaceTimeline: { type: 'boolean', description: 'Pass true only after the user agreed to replace what is on the timeline.' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'reels_time_effect',
    description: [
      'Put an effect on clips timed to the song, as one undo step: "glitch on every beat", "zoom blur hit on the drop", "shake building',
      'into the chorus", "black and white only behind me". timing: beat (punches on every `every` beats, falls back between), drop (hits',
      'once at the start and falls away), build (grows to full by the end), fade (eases in and out), steady. region subject/background',
      'uses the person cut-out. Targets: itemIds, else the picture clips overlapping fromSec..toSec, else the selected clips. The beat',
      'grid comes from the song on the timeline. Re-running with the same effect replaces its timing.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        effect: { type: 'string', description: 'Effect id, e.g. "glitch", "rgb-split", "zoom-blur", "shake", "bounce", "blackout", "duotone" (browse_library category=fx).' },
        timing: { type: 'string', enum: ['steady', 'fade', 'beat', 'drop', 'build'] },
        every: { type: 'number', description: 'Beats between punches for timing beat (default 1; 2 = every other beat, 4 = on the bar).' },
        strength: { type: 'number', description: '0-1, default 1.' },
        region: { type: 'string', enum: ['all', 'subject', 'background'] },
        params: { type: 'object', additionalProperties: { type: 'number' }, description: "The effect's own sliders." },
        itemIds: { type: 'array', items: { type: 'string' } },
        fromSec: { type: 'number', description: 'Timeline seconds where the timing starts (a drop lands here).' },
        toSec: { type: 'number', description: 'Timeline seconds where it ends (a build peaks here).' },
      },
      required: ['effect', 'timing'],
    },
  },
  {
    name: 'reels_custom_shader',
    description: [
      'Director mode, optional: write your own GLSL effect or transition when nothing in the catalogue fits the story (one signature',
      'look per reel, e.g. a paper-burn reveal for a campfire story). You write the shader; it is checked, compiled and registered for this',
      'session, and the returned id goes in a section\'s effects (with strength/region/timing like any effect) or as its transition.',
      'Effect contract: #version 300 es; precision highp float; uniform sampler2D u_input; uniform float u_time (seconds into the clip);',
      'uniform vec2 u_resolution; uniform float u_aspect; uniform float u_<param> per param; in vec2 v_texCoord ((0,0) bottom-left);',
      'out vec4 fragColor; keep alpha from u_input. Transition contract: u_outgoing, u_incoming, u_progress (0 = outgoing exactly,',
      '1 = incoming exactly), u_resolution, u_aspect, u_time, u_<param>, v_texCoord, fragColor. No other samplers, no #include.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['effect', 'transition'] },
        name: { type: 'string', description: 'What it looks like, two or three words.' },
        looks: { type: 'string', description: 'One sentence on what it looks like.' },
        glsl: { type: 'string', description: 'The full fragment shader source.' },
        params: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, default: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' } }, required: ['key'] }, description: 'Adjustable floats, each read in the shader as u_<key>.' },
      },
      required: ['type', 'name', 'glsl'],
    },
  },
  {
    name: 'reels_custom_graphic',
    description: [
      'Director mode, optional: write your own animated graphic (a Remotion component, every frame drawn in code) when no catalogue graphic',
      'fits the story: an altitude profile that draws itself, a scoreboard, a hand-drawn sun rising with the title. One per reel. It is',
      'checked against the sandbox, compiled and registered for this session; place the returned id in the plan\'s graphics like a catalogue',
      'graphic. Shape: const Name = ({ item }) => { ... return React.createElement(AbsoluteFill, null, ...) }; globals only (React,',
      'useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing, random, AbsoluteFill, Sequence), no imports.',
      'item.width/height is the frame; item.props has items (text split on "/"), beats (seconds of each song beat from its start),',
      'sections (seconds where each spanned section starts), total (seconds) and your params. Deterministic from the frame; no timers,',
      'network, window or document. Keep words inside x 6-84% and y 12-75% of the frame.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What it is, two or three words.' },
        looks: { type: 'string', description: 'One sentence on what it looks like.' },
        code: { type: 'string', description: 'The full component source.' },
        params: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, default: {}, min: { type: 'number' }, max: { type: 'number' } }, required: ['key', 'default'] }, description: 'Adjustable props: a number (with min/max), a #rrggbb colour, text or a boolean; read as item.props.<key>.' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'reels_freeze_frame',
    description: [
      'Freeze one moment of a video clip as a real still for holdSec, then play on, as one undo step ("freeze on the jump",',
      '"hold that face for a second"). The still keeps the clip\'s framing, look and effects; cuts after it stay where they are.',
      'resume frozen (default) plays on from the frozen moment; skip continues as if the clip had kept playing under the still.',
      'The clip\'s own sound pauses during the freeze. Never fake a freeze with a slow playback rate: it crawls and reads as slow motion.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        atSec: { type: 'number', description: 'Timeline second of the moment to freeze.' },
        holdSec: { type: 'number', description: 'How long the still holds, 0.1-10 s (default 1); it ends at the clip\'s end at the latest.' },
        itemId: { type: 'string', description: 'The clip, when more than one video plays at atSec.' },
        resume: { type: 'string', enum: ['frozen', 'skip'] },
      },
      required: ['atSec'],
    },
  },
  ...CLIP_TOOL_SCHEMAS,
  {
    name: 'reels_restyle_text',
    description: [
      'Give one on-screen line another text style from the reels-director catalogue, keeping when it shows, as one undo step',
      '("make \'priorities sorted\' a marker highlight", "slam the punchline"). Name the line by its words as they read now (any case,',
      'part of it is enough) or by itemIds; every item of the line is replaced, rebuilt by the style itself on the song\'s beats. newText',
      'changes the words too; params are the style\'s own (only those listed for it in the catalogue).',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The line\'s words as they read now.' },
        itemIds: { type: 'array', items: { type: 'string' } },
        style: { type: 'string', description: 'A text style id, e.g. highlight, slam, caption, big-title, pop-words.' },
        newText: { type: 'string', description: 'New words for the line (optional).' },
        params: { type: 'object', additionalProperties: {}, description: 'The style\'s own params.' },
      },
      required: ['style'],
    },
  },
];

export const REELS_TOOL_NAMES = new Set(REELS_TOOL_SCHEMAS.map((t) => t.name));
export const REELS_READ_TOOL_NAMES = ['reels_lint', 'reels_plan_options', 'reels_director_options', 'reels_director_treatment', 'reels_director_critique', 'reels_run_info', 'reels_selection_candidates', 'reels_selection_sheet'] as const;
export const REELS_EDIT_TOOL_NAMES = ['reels_plan_assemble', 'reels_director_build', 'reels_director_fix', 'reels_custom_shader', 'reels_custom_graphic', 'reels_time_effect', 'reels_freeze_frame', 'reels_reverse', 'reels_clean_speech', 'reels_restyle_text', 'reels_apply_look', 'reels_apply_signature', 'reels_recut_section', 'reels_snap_cuts_to_beats', 'reels_strobe', 'propose_selection'] as const;
