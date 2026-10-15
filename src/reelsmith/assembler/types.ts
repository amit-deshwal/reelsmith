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
}

export interface AssembleInput {
  recipe: Recipe;
  clips: AssemblyClip[];
  music?: AssemblyMusic;
  texts: Record<string, string>;
  params: Record<string, string | number | boolean>;
  seed: number;
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
