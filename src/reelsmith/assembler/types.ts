import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { ReelsBrief } from '../../../shared/reelsmith/brief';
import type { BatchAction } from '../../editor/reducerActions';
import type { ShotTag } from '../shotTags';
import type { FocusRect } from '../cropFocus';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';

/** A media item the assembler may place. All frame values are at the recipe's fps. */
export interface AssemblyClip {
  assetId: string;
  /** set on an extra moment of a long video: the real asset it comes from (assetId is then "<asset>#<n>") */
  baseAssetId?: string;
  name: string;
  src: string;
  kind: 'video' | 'image';
  width?: number;
  height?: number;
  /** source length in frames (images: ignored, any length works) */
  durationInFrames: number;
  /** higher = better; produced by the scorer (RS-105), 0..1 */
  score: number;
  /** sharpness of the best window, 0..1 (absent without analysis) */
  sharpness?: number;
  /** near-duplicate group id; at most one clip per group is used */
  groupId?: string;
  /** mean display colour (0..1) from analysis; drives shot matching */
  color?: { r: number; g: number; b: number };
  /** capture time (epoch ms) for chronological ordering */
  captureTimeMs?: number;
  /** best window inside the source, frames (default: from 0) */
  bestStartFrame?: number;
  /** RS-1201: the director chose where this clip starts (frames); every use starts here */
  pinnedStartFrame?: number;
  /** Scored source windows and hard cuts, retained for duration-aware placement. */
  sourceAnalysis?: {
    minShotFrames: number;
    windows: Array<{ startFrame: number; endFrame: number; score: number; focusRect?: FocusRect; speech?: boolean }>;
    shotBoundariesFrame: number[];
  };
  /** RS-109: what the clip shows, from the local visual model (absent when the model is not installed) */
  shot?: { top: ShotTag; confidence: number; scores: Record<ShotTag, number> };
  /** optional place name for labels */
  place?: string;
  /** word-timed transcript in source ms (talking clips) */
  transcript?: Array<{ text: string; start: number; end: number }>;
}

/** RS-1251: the user's narration for a director reel: played whole, its words become the captions. */
export interface AssemblyVoiceover {
  assetId: string;
  name: string;
  src: string;
  /** audio or video (a video's sound only; its picture is not placed by this) */
  kind: 'audio' | 'video';
  durationSec: number;
  /** word-timed transcript in source ms; none = no captions */
  transcript?: Array<{ text: string; start: number; end: number }>;
}

export interface AssemblyMusic {
  assetId: string;
  name: string;
  src: string;
  durationSec: number;
  /** beat times in seconds in the source, ascending */
  beatTimesSec: number[];
  beatsPerBar: number;
  /** index in beatTimesSec of the first downbeat */
  downbeatIndex: number;
  /** start of the loudest section, if analysed */
  loudestStartSec?: number;
  /** detected drop time in the source song (RS-203) */
  dropSec?: number;
  /** RS-1253: the song's sung words (ms in the song file), for a lyric reel */
  lyrics?: Array<{ text: string; start: number; end: number }>;
  /** RS-1224: loudness of each beat (any positive scale), for the director's song map */
  energyPerBeat?: number[];
}

export interface AssembleInput {
  recipe: Recipe;
  clips: AssemblyClip[];
  /** B-roll pool for captioned-story@1 */
  broll?: AssemblyClip[];
  music?: AssemblyMusic;
  /** RS-1251: director@1 only */
  voiceover?: AssemblyVoiceover;
  texts: Record<string, string>;
  params: Record<string, string | number | boolean>;
  seed: number;
  /** validated AI picks, in shot order (RS-106); gaps are filled by the heuristic */
  preferredAssetIds?: string[];
  /** The user's chosen opening clip: it becomes the first shot (beat-montage recipes). */
  openerAssetId?: string;
  /** Optional B-roll order for captioned stories. */
  preferredBrollAssetIds?: string[];
  /** RS-108: regenerate one section only, never reusing clips placed elsewhere */
  /** 0..1: how much randomness (from the seed) may override score when picking; 0 = pure score */
  variety?: number;
  onlySection?: { name: string; excludeAssetIds: string[] };
  /** RS-1201: the agent's plan, for director@1 */
  plan?: ReelPlan;
}

export interface PlannedShot {
  section: string;
  startBeat: number;
  lengthBeats: number;
  startFrame: number;
  durationInFrames: number;
  transition?: string;
}

export interface AssembleReport {
  shots: number;
  usedAssetIds: string[];
  musicStartSec: number;
  totalFrames: number;
  warnings: string[];
  /** set when the recipe's policy is askUser and footage is short */
  needsMoreMedia?: { have: number; need: number };
  /** RS-109: how shots were cast by content, when they were */
  castingNote?: string;
  /** director@1 (RS-1216): each section's clips as cast and the source frame of each shot, so a fix can rebuild them unchanged */
  sectionClips?: string[][];
  sectionMoments?: number[][];
  /** seconds of each shot (cuts on the base lane), for the pace check against a reference reel */
  shotSec?: number[];
  /** RS-1228: how far the subject jumps across the frame at each fast cut (0..1 of the frame), by section */
  eyeJumps?: Array<{ section: number; at: number; jump: number }>;
  /** RS-1225: shots where someone talks while the clip's sound is off under the song */
  voices?: Array<{ section: number; at: number; seconds: number }>;
}

/** Stored with the project (RS-108) so the run can be repeated. */
export interface RecipeRunRecord {
  recipeId: string;
  recipeVersion: string;
  /** RS-901: output shape, so re-cuts from chat rebuild the same canvas (absent = the recipe's own canvas) */
  ratio?: string;
  assembler: string;
  seed: number;
  params: Record<string, string | number | boolean>;
  texts: Record<string, string>;
  assetIds: string[];
  /** RS-108: asset ids per recipe input, so the run can be rebuilt from chat */
  media?: Record<string, string[]>;
  preferredAssetIds?: string[];
  preferredBrollAssetIds?: string[];
  /** The clip the user chose to open the reel with */
  openerAssetId?: string;
  selectionRationale?: string;
  /** RS-1002: the guide shown while preparing this recipe run. */
  brief?: ReelsBrief;
  /** RS-1002: clip requests the user confirmed by hand when no shot classifier was available. */
  briefConfirmedShotRequests?: number[];
}

export interface AssembleResult {
  action: BatchAction | null;
  report: AssembleReport;
  run: RecipeRunRecord;
}
