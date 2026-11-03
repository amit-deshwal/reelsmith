// A one-time, project-scoped handoff from the home screen to the Director tab: the new project opens on the Director tab
// in the shape the reel was started in.
import { isRatioId, RATIO_SIZES, type RatioId } from '../../shared/reelsmith/ratios';
import type { ProjectDoc } from '../editor/types';

export interface DirectorStart { ratio?: RatioId }
const pending = new Map<string, DirectorStart>();
const key = (projectId: string) => `reelsmith:director-start:${projectId}`;

export function rememberDirectorStart(projectId: string, start: DirectorStart = {}): void {
  pending.set(projectId, start);
  try { sessionStorage.setItem(key(projectId), JSON.stringify(start)); } catch { /* Memory works when storage is unavailable. */ }
}
export function pendingDirectorStart(projectId: string): DirectorStart | undefined {
  const cached = pending.get(projectId);
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(key(projectId));
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as { ratio?: unknown } | null;
    const start: DirectorStart = isRatioId(parsed?.ratio) ? { ratio: parsed.ratio } : {};
    pending.set(projectId, start);
    return start;
  } catch { return undefined; }
}
export function clearDirectorStart(projectId: string): void {
  pending.delete(projectId);
  try { sessionStorage.removeItem(key(projectId)); } catch { /* Optional storage. */ }
}

/** An empty project on the canvas of one shape, for a reel the director builds. */
export function directorProjectDoc(empty: ProjectDoc, ratio: RatioId): ProjectDoc {
  const size = RATIO_SIZES[ratio];
  return { ...empty, timelines: empty.timelines.map((timeline) => ({ ...timeline, width: size.width, height: size.height, fps: 30 })) };
}

export async function startDirectorProject(ratio: RatioId, deps: {
  create: (name: string, ratio: RatioId) => Promise<{ id: string }>;
  refresh: () => Promise<void>;
  open: (id: string) => void;
}): Promise<void> {
  const project = await deps.create('New reel', ratio);
  rememberDirectorStart(project.id, { ratio });
  await deps.refresh();
  deps.open(project.id);
}
