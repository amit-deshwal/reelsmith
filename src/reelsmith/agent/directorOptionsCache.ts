// RS-1273 (3): stage 1's finished result, kept per project while the media and the arguments stay the same. It took
// 116 s on 48 clips, so follow-ups ("include my missing videos", "make it 35 s") skipped it and patched the reel with
// fix calls that cannot add clips. With this a rebuild from stage 1 costs one call that returns at once.
import type { DirectorSession } from '../director/directorSession';

/** How long a result stays good when nothing changes (the clip analysis itself is reused for longer, by the session). */
export const OPTIONS_CACHE_MS = 2 * 60 * 60 * 1000;

/** The session fields stage 1 sets; a cached result puts them back (a new treatment and build follow). */
export const STAGE1_FIELDS = ['fps', 'timelineFps', 'clips', 'song', 'reference', 'brand', 'pool', 'askFirst'] as const;
export type Stage1Session = Pick<DirectorSession, typeof STAGE1_FIELDS[number]>;

interface Entry { key: string; at: number; result: Record<string, unknown>; session: Partial<Stage1Session> }
const entries = new Map<string, Entry>();

export interface OptionsKeyInput {
  fps: number;
  /** every imported picture and audio file: id, file and length (a new import or a re-encode changes the key) */
  media: ReadonlyArray<{ id: string; src?: string; durationInFrames?: number }>;
  args: Record<string, unknown>;
}

export function optionsKey(r: OptionsKeyInput): string {
  const media = r.media.map((a) => `${a.id}:${a.src ?? ''}:${a.durationInFrames ?? 0}`).sort().join(',');
  const args = JSON.stringify(Object.keys(r.args).sort().map((k) => [k, r.args[k]]));
  return `${r.fps}|${media}|${args}`;
}

/** A result worth keeping: finished (not "still watching"), no error, and the visual model had read the clips. */
export function cacheable(result: unknown): result is Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const r = result as Record<string, unknown>;
  if ('watching' in r || 'error' in r || 'tagsNote' in r) return false;
  const shots = r.shots as { unavailable?: unknown } | undefined;
  return !(shots && typeof shots === 'object' && 'unavailable' in shots);
}

export function rememberOptions(projectId: string, key: string, result: Record<string, unknown>, session: Partial<Stage1Session>, now = Date.now()): void {
  entries.set(projectId, { key, at: now, result, session });
}

export function cachedOptions(projectId: string, key: string, now = Date.now()): Entry | undefined {
  const e = entries.get(projectId);
  if (!e || e.key !== key || now - e.at > OPTIONS_CACHE_MS) return undefined;
  return e;
}

export function pickStage1(session: Partial<DirectorSession> | undefined): Partial<Stage1Session> {
  const out: Record<string, unknown> = {};
  for (const k of STAGE1_FIELDS) if (session && session[k] !== undefined) out[k] = session[k];
  return out as Partial<Stage1Session>;
}

export function forgetOptions(projectId?: string): void {
  if (projectId === undefined) entries.clear(); else entries.delete(projectId);
}
