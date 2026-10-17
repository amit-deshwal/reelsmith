// Reelsmith agent tools (RS-106, RS-108, RS-403). Executors: ./reelsTools.ts.
import type { AgentToolSchema } from '../../agent/tool-schema';

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
      'ratios, target length, media inputs (accept, min, max), text inputs (maxLength) and params. Songs say beat steady/none/unknown and recipes say needsBeat: never pair a needsBeat recipe with a song whose beat is none. Use it to pick the recipe that fits what the user',
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
        fallbackRecipeId: { type: 'string', description: 'Optional recipe that needs no beat (needsBeat false); built instead, in the same call, if the song turns out to have no steady beat.' },
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
];

export const REELS_TOOL_NAMES = new Set(REELS_TOOL_SCHEMAS.map((t) => t.name));
export const REELS_READ_TOOL_NAMES = ['reels_lint', 'reels_plan_options', 'reels_run_info', 'reels_selection_candidates', 'reels_selection_sheet'] as const;
export const REELS_EDIT_TOOL_NAMES = ['reels_plan_assemble', 'reels_apply_look', 'reels_apply_signature', 'reels_recut_section', 'reels_snap_cuts_to_beats', 'reels_strobe', 'propose_selection'] as const;
