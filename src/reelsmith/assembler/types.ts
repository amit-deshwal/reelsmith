import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { BatchAction } from '../../editor/reducerActions';

/** A media item the assembler may place. All frame values are at the recipe's fps. */
export interface AssemblyClip {
  assetId: string;
  name: string;
  src: string;
  kind: 'video' | 'image';
  /** source length in frames (images: ignored, any length works) */
  durationInFrames: number;
  /** higher = better; produced by the scorer (RS-105), 0..1 */
  score: number;
  /** near-duplicate group id; at most one clip per group is used */
  groupId?: string;
  /** capture time (epoch ms) for chronological ordering */
  captureTimeMs?: number;
  /** best window inside the source, frames (default: from 0) */
  bestStartFrame?: number;
  /** optional place name for labels */
  place?: string;
  /** word-timed transcript in source ms (talking clips) */
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
}

export interface AssembleInput {
  recipe: Recipe;
  clips: AssemblyClip[];
  /** B-roll pool for captioned-story@1 */
  broll?: AssemblyClip[];
  music?: AssemblyMusic;
  texts: Record<string, string>;
  params: Record<string, string | number | boolean>;
  seed: number;
  /** validated AI picks, in shot order (RS-106); gaps are filled by the heuristic */
  preferredAssetIds?: string[];
  /** RS-108: regenerate one section only, never reusing clips placed elsewhere */
  /** 0..1: how much randomness (from the seed) may override score when picking; 0 = pure score */
  variety?: number;
  onlySection?: { name: string; excludeAssetIds: string[] };
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
}

/** Stored with the project (RS-108) so the run can be repeated. */
export interface RecipeRunRecord {
  recipeId: string;
  recipeVersion: string;
  assembler: string;
  seed: number;
  params: Record<string, string | number | boolean>;
  texts: Record<string, string>;
  assetIds: string[];
}

export interface AssembleResult {
  action: BatchAction | null;
  report: AssembleReport;
  run: RecipeRunRecord;
}
