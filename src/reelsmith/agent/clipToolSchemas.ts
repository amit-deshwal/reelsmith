// Schemas of the clip tools that work on what is already on the timeline (RS-1223 reverse, RS-204 speech cleanup);
// executors in reverseTool.ts and cleanSpeechTool.ts. Part of REELS_TOOL_SCHEMAS.
import type { AgentToolSchema } from '../../agent/tool-schema';

export const CLIP_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'reels_reverse',
    description: [
      'Play a video clip backwards, picture and sound, as one undo step ("reverse that", "rewind the jump", "play the splash backwards").',
      'Name the clip by itemId or a timeline second inside it; fromSec/toSec reverse only that stretch (it is split off, the rest and every',
      'cut after it stay put). The clip keeps its place, speed, look and effects. forwards true puts a reversed clip back. For a rewind',
      'that plays, rewinds and plays again inside a director reel, use the rewind move in the plan instead.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'The clip (or name it by atSec).' },
        atSec: { type: 'number', description: 'A timeline second inside the clip.' },
        fromSec: { type: 'number', description: 'Start of the stretch to reverse (timeline seconds; default the clip start).' },
        toSec: { type: 'number', description: 'End of the stretch to reverse (default the clip end).' },
        forwards: { type: 'boolean', description: 'true: put a reversed clip back to forwards.' },
      },
    },
  },
  {
    name: 'reels_clean_speech',
    description: [
      'Cut fillers (um, uh), stutters, cut-off words and abandoned takes ("we went to, we went to the fort" keeps the second take) out of',
      'talking clips that have a transcript, as one undo step ("clean up my talking", "remove the ums", "cut the retakes"). light: only',
      'um/uh; balanced (default): plus stutters and restarted phrases; tight: plus "like", "you know", "I mean" when used as fillers.',
      'pauses true also shortens long pauses (900/600/350 ms at the three levels). Video clips are cut on word boundaries with the gaps',
      'closed and captions follow; clips after them move up. Each jump the cuts leave in a video gets a smooth cut (a few frames',
      'morphing across it on a track above; smoothCuts false keeps hard jump cuts). Returns the words cut per clip; tell the user what went.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' }, description: 'The clips (default: every clip with a transcript).' },
        level: { type: 'string', enum: ['light', 'balanced', 'tight'] },
        pauses: { type: 'boolean', description: 'Also shorten long pauses.' },
        smoothCuts: { type: 'boolean', description: 'Morph over each jump cut in a video (default true).' },
      },
    },
  },
];
