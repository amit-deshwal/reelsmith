// Director tool schemas (RS-1201 and on), spread into REELS_TOOL_SCHEMAS at their old position. Executors: ./reelsTools.ts.
import type { AgentToolSchema } from '../../agent/tool-schema';

export const DIRECTOR_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'reels_director_options',
    description: [
      'Director stage 1 (the user gives a story, media and a song; you direct the reel): watches the footage (up to about a minute and a half)',
      'and returns the shot log (each clip numbered #1, #2... with its best moments, where it moves, talks or goes soft), contact sheets taken',
      'at those moments, and the songs with bpm, drop and a timing suggestion. With `find` (short phrases for what the story names to see) it',
      'also returns the best matching moments for each as ready "#n@s" refs (`shots`). Call once, then write the treatment (reels_director_treatment).',
      'With `reference` (an imported reel the user wants theirs to feel like) it also measures that reel (pace, colour, motion), shows one',
      'cell a shot of it, and leaves it out of the clips. With `brandUrl` (a promo reel) it also reads that one page for its brand kit.',
    ].join(' '),
    input_schema: { type: 'object', properties: {
      reference: { type: 'string', description: 'Optional: assetId or file name of an imported reel to match in pace and look (never cast as footage).' },
      askFirst: { type: 'boolean', description: 'True when the user wants to approve the treatment before the build (the treatment then returns a card to show them).' },
      brandUrl: { type: 'string', description: 'Optional, for a promo reel (a club, shop, page or event): the web address the user gave (e.g. "punetrekkers.org"). Returns its brand kit: name, tagline, lines, facts, actions, links and colours, whose words you may then put on screen.' },
      find: { type: 'array', items: { type: 'string' }, description: 'Up to eight short phrases for what the story names to see ("climbing a rock face", "friends laughing at camp", "the view from the top"): the visual model returns, for each, the best moments across the clips (one per clip) marked shows sure, maybe or weak, with `none` when nothing shows it. Same as reels_find_shots, in this one call.' },
    } },
  },
  {
    name: 'reels_find_shots',
    description: [
      'Which clips show this? Give up to eight short phrases (what a shot should show: "climbing a rock face", "friends laughing around a fire",',
      '"the view from the top") and the visual model returns, for each, the best moments across the numbered clips as ready "#n@seconds" refs,',
      'one per clip so the answers are different shots, each marked `shows` sure, maybe or weak. Stage 1 takes the same phrases as `find`;',
      'use this for anything else later (a part or a line you add while planning or fixing). Cast the sure refs in the plan\'s clips and check a',
      'maybe on its sheet cell. When even the best is weak (`none`) the footage does not show it: leave the line out, use a graphic, or ask.',
      'Read-only; needs the visual model (it says when it is missing).',
    ].join(' '),
    input_schema: { type: 'object', properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'One to eight short phrases, in plain words, each describing what one shot should show.' },
      limit: { type: 'number', description: 'Moments per phrase, 1 to 8 (default 4).' },
    }, required: ['queries'] },
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
        shotList: { type: 'boolean', description: 'True when the user gave a shot list (timed shots with their own lines): it is built as written (references/shotlist.md). Detected from the story when it has three or more timed shots.' },
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
      'Director stage 4: a closer look at the built reel (about three frames a section and every line at its fullest, in sheets of eight),',
      'checks against the treatment (tone, a plain arc, no transition or timed effect, a slow hook), the sound with eyes closed, the reference',
      'reel\'s pace and colour, and a critic\'s checklist. The first build of a directed reel already returns this critique; call it only to',
      'look again at the reel as it stands (a later chat, after a reload). Name the three largest defects and repair them with reels_director_fix. Changes nothing.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_director_reshape',
    description: [
      'The directed reel in another shape (4:5 for the feed, 1:1, 16:9...), as a new timeline next to it: the same sections, clips, moments,',
      'lines and beats, laid out again for that canvas (text, graphics, crops on the subject, safe area), not a crop of the first. The first',
      'reel is unchanged. Returns one frame per section of the new version.',
    ].join(' '),
    input_schema: { type: 'object', properties: { ratio: { type: 'string', enum: ['9:16', '4:5', '1:1', '16:9', '3:4', '4:3'] } }, required: ['ratio'] },
  },
  {
    name: 'reels_review_export',
    description: [
      'Look at the reel as exported: contact sheets taken from the exported MP4 itself (the hook, inside each section or shot, on each cut,',
      'and the last frame) and its export checks (Instagram format, loudness, black, frozen or stuttering picture). Use it after the user',
      'exports, or when they say the export looks different from the preview. Changes nothing.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reels_qa_report',
    description: [
      'The QA report of the last export, as short JSON with the file\'s sha256: the export checks (V1-V10), a click scan at every hard audio cut,',
      'the export re-transcribed against the words the timeline deleted (a deleted word still heard), and captions and titles against the faces',
      'in the exported frames and Instagram\'s covered bands. Call it once after each export of a directed reel; on failures fix them, export',
      'again and call it again: at most two fix passes, then ask the user. Says when the timeline changed after the export. Changes nothing.',
    ].join(' '),
    input_schema: { type: 'object', properties: { sha256: { type: 'string', description: 'Optional: the sha256 of the report you reviewed before, to confirm it is still the latest export.' } } },
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
      'timeline has items, ask the user first and pass replaceTimeline true. Params it can repair (a value out of range, a key the move or style',
      'does not take) are repaired and listed in `notes`. The first build of a directed reel returns the critique (about three frames a section,',
      'the checks and the critic\'s checklist) with the lint and review findings: name its largest defects and repair them with reels_director_fix.',
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
            voiceover: { type: 'string', description: 'The user\'s own narration (assetId from voiceovers): plays whole at full level, never cut or ducked; its words become captions. The sections must add up to at least its length. Never pass it as music.' },
            voiceoverStart: { type: 'number', description: 'Second of the voiceover file to start from (default 0).' },
            captions: { description: 'Caption style id for the voiceover\'s words (default highlight-word), or false for none.' },
            lyrics: {
              description: 'A lyric reel: the song\'s sung words appear one at a time as they are sung, huge and behind the person (style lyrics-behind). true, or { text, language, color, style }. text = the lyrics the user gave (laid onto the sung timing; transcription mishears singing, so ask for them); language = what it is sung in (hi, mr, en; hi when text is Devanagari). Needs music. Put the clearest single-person shots under the sung lines.',
              anyOf: [{ type: 'boolean' }, { type: 'object', properties: { text: { type: 'string' }, language: { type: 'string' }, color: { type: 'string' }, style: { type: 'string' } }, additionalProperties: false }],
            },
            look: { type: 'string', description: 'Optional look id from reels_director_options.' },
            sfx: { type: 'string', enum: ['auto', 'subtle', 'off'], description: 'Sound effects on transitions, flash cuts, drops and builds: auto (default), subtle (quieter) or off.' },
            shotList: { type: 'boolean', description: 'The user\'s own shot list: no motion of ours on cuts and holds, the critique checks against their list. Filled from the treatment.' },
            loop: { type: 'boolean', description: 'Made to replay: the song runs to the last frame (no fade) and the last shot should hand back to the first. End on a bar, never on black or a dip.' },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  move: { type: 'string' }, beats: { type: 'number' }, seconds: { type: 'number' },
                  clips: { type: 'array', items: { type: 'string' } }, text: { type: 'string' }, textStyle: { type: 'string' },
                  params: { type: 'object', additionalProperties: {}, description: "The move's params and the text style's params (each gets the values it can use: every 4 on a cut under punch-caps is the cut's beats per shot). x and y (0-1) place any line." },
                  transition: { type: 'string', description: 'How the section comes in from the one before (a transitions id).' },
                  effects: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', description: 'An effects id, or a custom:fx-* id from reels_custom_shader.' },
                        params: { type: 'object', additionalProperties: { type: 'number' } },
                        strength: { type: 'number', description: '0-1, default 1.' },
                        region: { type: 'string', enum: ['all', 'subject', 'background', 'land', 'sky'], description: 'Only on the person or only behind them (person matte), or only on the land or the sky (sky map); default all.' },
                        timing: { type: 'string', enum: ['steady', 'fade', 'beat', 'drop', 'build'], description: 'steady (default) all through; fade in and out; beat = punch on every `every` beats and fall back; drop = hit on the first beat and fall away; build = grow into the next section.' },
                        every: { type: 'number', description: 'Beats between punches for timing beat (default 1).' },
                      },
                      required: ['id'],
                    },
                    description: 'Up to 3 effects on this section\'s footage.',
                  },
                  look: { type: 'string', description: 'A look for this section only.' },
                  textBehind: { type: 'boolean', description: 'Draw this section\'s line behind the person in the shot (they are cut out on top). Needs one clear person in video footage.' },
                  speed: { type: 'number', description: 'Playback speed of this section\'s footage, 0.25-2: 0.5 is the user\'s "slow motion 50%". Slowed footage is silent.' },
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
        approvedBy: { type: 'string', description: 'When the user asked to approve the treatment first: their reply that approved it, in their words.' },
      },
      required: ['plan'],
    },
  },
];
