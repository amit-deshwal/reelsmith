// What one director run has learned so far, by project (RS-1214): the shot log from stage 1, the song's suggestion,
// the treatment from stage 2 and the last build, so later stages check against earlier ones without the agent
// sending them back. In memory only: a reload starts a fresh run, and every tool still works without it.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { ShotLogClip } from './shotLog';
import type { Treatment } from './treatment';

export interface DirectorSession {
  fps: number;
  clips: ShotLogClip[];
  song?: { assetId: string; bpm?: number; beatsFor18s?: number; dropAtBeat?: number };
  treatment?: Treatment;
  lastBuild?: { plan: ReelPlan; spans: Array<{ from: number; to: number }>; builds: number };
}

const sessions = new Map<string, DirectorSession>();

export const directorSession = (projectId: string): DirectorSession | undefined => sessions.get(projectId);

export function updateDirectorSession(projectId: string, patch: Partial<DirectorSession>): DirectorSession {
  const next = { fps: 30, clips: [], ...sessions.get(projectId), ...patch };
  sessions.set(projectId, next);
  return next;
}
