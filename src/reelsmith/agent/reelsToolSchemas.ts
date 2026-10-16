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
    name: 'reels_selection_candidates',
    description: [
      'For "let my agent choose the shots": list the candidate clips of the recipe run as a compact table (assetId, name, seconds,',
      'heuristic score 0..1, near-duplicate groupId, best window start, capture time) plus how many shots (slots) the reel needs.',
      'Returns selectionKey, framesAllowed, inspect requests for contact sheets, and separate B-roll candidates/slot counts for captioned stories. Look at uncertain clips only if framesAllowed, then call propose_selection with the returned selectionKey.',
    ].join(' '),
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_selection',
    description: [
      'Answer a shot-selection request: the assetIds to use, in shot order (at most `slots` from reels_selection_candidates).',
      'Unknown, repeated or near-duplicate picks are rejected and reported; empty slots are filled by the heuristic.',
      'Works across all recipes; captioned stories accept separate brollAssetIds. Valid picks lead, remaining slots use the heuristic. Pass selectionKey from the latest candidates call: stale picks are refused. The rebuild is one undo step and manual items are kept; no usable picks leave the current reel unchanged.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        selectionKey: { type: 'string', description: 'Exact selectionKey from the latest reels_selection_candidates response. Refresh candidates after any timeline/media change.' },
        assetIds: { type: 'array', items: { type: 'string' }, description: 'Chosen primary asset ids in shot order.' },
        brollAssetIds: { type: 'array', items: { type: 'string' }, description: 'Optional captioned-story B-roll ids, in slot order; use brollCandidates and brollSlots.' },
        rationale: { type: 'string', description: 'One or two sentences on why, shown to the user.' },
      },
      required: ['selectionKey', 'assetIds'],
    },
  },
];

export const REELS_TOOL_NAMES = new Set(REELS_TOOL_SCHEMAS.map((t) => t.name));
export const REELS_READ_TOOL_NAMES = ['reels_lint', 'reels_run_info', 'reels_selection_candidates'] as const;
export const REELS_EDIT_TOOL_NAMES = ['reels_recut_section', 'reels_snap_cuts_to_beats', 'propose_selection'] as const;
