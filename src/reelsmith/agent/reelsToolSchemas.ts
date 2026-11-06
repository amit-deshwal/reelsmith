// Reelsmith agent tools (RS-106, RS-108, RS-403). Executors: ./reelsTools.ts.
import type { AgentToolSchema } from '../../agent/tool-schema';
import { CLIP_TOOL_SCHEMAS } from './clipToolSchemas';
import { DIRECTOR_TOOL_SCHEMAS } from './directorToolSchemas';

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
      'Transitions are only added when the reel has none yet (a directed reel places its own); pass transitions false to keep hard cuts. Replaces a previous signature or look.',
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
  ...DIRECTOR_TOOL_SCHEMAS,
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
        region: { type: 'string', enum: ['all', 'subject', 'background', 'land', 'sky'] },
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
export const REELS_READ_TOOL_NAMES = ['reels_review_export', 'reels_qa_report', 'reels_lint', 'reels_director_options', 'reels_find_shots', 'reels_director_treatment', 'reels_director_critique'] as const;
export const REELS_EDIT_TOOL_NAMES = ['reels_director_build', 'reels_director_fix', 'reels_director_reshape', 'reels_custom_shader', 'reels_custom_graphic', 'reels_time_effect', 'reels_freeze_frame', 'reels_reverse', 'reels_clean_speech', 'reels_restyle_text', 'reels_apply_look', 'reels_apply_signature', 'reels_snap_cuts_to_beats', 'reels_strobe'] as const;
