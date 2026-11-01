// What one director run has learned so far, by project (RS-1214): the shot log from stage 1, the song's suggestion,
// the treatment from stage 2 and the last build, so later stages check against earlier ones without the agent
// sending them back. RS-1222: the parts a later edit needs (the treatment, the last plan and how it was cast, the
// reference and the open defects) are also saved on the reel's black canvas item, so a reload or a new chat starts
// from the director's intent; the shot log is not saved (stage 1 measures it again).
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { Defect } from './critique';
import type { ReferenceProfile } from './reference';
import type { ShotLogClip } from './shotLog';
import type { SoundFinding } from './soundCheck';
import type { Treatment } from './treatment';
import type { BrandKit } from '../../../shared/reelsmith/brandKit';

export interface DirectorBuildRecord {
  plan: ReelPlan;
  spans: Array<{ from: number; to: number }>;
  builds: number;
  /** each section's clips as cast and the source frame of each shot (RS-1216) */
  clips?: string[][];
  moments?: number[][];
  /** seconds of each shot on the main lane, for the pace check against the reference */
  shotSec?: number[];
  sound?: SoundFinding[];
  /** fix rounds since the critique, and the defects of the last one */
  fixes?: number;
  defects?: Defect[];
}

export interface DirectorSession {
  fps: number;
  clips: ShotLogClip[];
  song?: { assetId: string; bpm?: number; beatsFor18s?: number; dropAtBeat?: number };
  treatment?: Treatment;
  /** RS-1217: the reel to match (left out of the clip list); its measurements once stage 1 has watched it */
  reference?: { assetId: string; profile?: ReferenceProfile };
  lastBuild?: DirectorBuildRecord;
  /** RS-1230: the user asked to see the treatment before the build; `waiting` until they answer it */
  askFirst?: boolean;
  gate?: 'waiting' | 'approved';
  /** RS-1239: the brand kit of a promo reel's page (stage 1, when the user named one) */
  brand?: BrandKit;
}

const sessions = new Map<string, DirectorSession>();

export const directorSession = (projectId: string): DirectorSession | undefined => sessions.get(projectId);

export function updateDirectorSession(projectId: string, patch: Partial<DirectorSession>): DirectorSession {
  const next = { fps: 30, clips: [], ...sessions.get(projectId), ...patch };
  sessions.set(projectId, next);
  return next;
}

/** The prop on the canvas item that carries the saved run. */
export const DIRECTOR_PROP = 'rsDirector';

export interface SavedDirector {
  v: 1;
  fps: number;
  song?: DirectorSession['song'];
  treatment?: Treatment;
  reference?: DirectorSession['reference'];
  build?: Omit<DirectorBuildRecord, 'plan' | 'spans'> & { plan: ReelPlan; spans: DirectorBuildRecord['spans'] };
}

/** What is saved with the reel: everything but the shot log (which is large and measured again). */
export function savedDirector(s: DirectorSession): SavedDirector {
  let build: SavedDirector['build'];
  if (s.lastBuild) {
    const { keep: _replayed, ...plan } = s.lastBuild.plan;
    build = { ...s.lastBuild, plan };
  }
  return { v: 1, fps: s.fps, ...(s.song ? { song: s.song } : {}), ...(s.treatment ? { treatment: s.treatment } : {}), ...(s.reference ? { reference: s.reference } : {}), ...(build ? { build } : {}) };
}

/** The saved run on the timeline (the canvas item of the last director build), if there is one. */
export function findSavedDirector(items: ReadonlyArray<{ props?: Record<string, unknown> }>): SavedDirector | undefined {
  for (const item of items) {
    const saved = item.props?.[DIRECTOR_PROP] as SavedDirector | undefined;
    if (saved && saved.v === 1 && typeof saved.fps === 'number') return saved;
  }
  return undefined;
}

/**
 * The session for a project: the one in memory, or the run saved on its timeline after a reload or in a new chat. The
 * saved build only counts while its canvas is still on the timeline (a reel built since by hand or a recipe has none).
 */
export function restoreDirectorSession(projectId: string, items: ReadonlyArray<{ props?: Record<string, unknown> }>): DirectorSession | undefined {
  const live = sessions.get(projectId);
  const saved = findSavedDirector(items);
  // RS-1233: a project can hold the reel in several shapes, one timeline each; the open timeline's own run wins
  const otherShape = !!saved?.build && !!live?.lastBuild && saved.build.plan.ratio !== live.lastBuild.plan.ratio;
  if ((live?.lastBuild || live?.treatment) && !otherShape) return live;
  if (!saved) return live;
  return updateDirectorSession(projectId, {
    fps: saved.fps, ...(saved.song ? { song: saved.song } : {}), ...(saved.treatment ? { treatment: saved.treatment } : {}),
    ...(saved.reference ? { reference: saved.reference } : {}), ...(saved.build ? { lastBuild: saved.build } : {}),
  });
}
