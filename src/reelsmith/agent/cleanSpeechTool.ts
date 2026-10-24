// reels_clean_speech (RS-204): cut fillers, stutters and abandoned takes (and with pauses, long pauses) out of talking
// clips already on the timeline, as one undo step. Video clips are cut into the pieces they keep (speechCleanup.ts);
// an audio clip edited by its words drops them the editor's own way (deleteWords).
import type { AtomicAction } from '../../editor/reducerActions';
import type { TimelineItem, TimelineState } from '../../editor/types';
import { hasOperationalTranscript } from '../../transcript/types';
import { CLEANUP_LEVELS, cleanupIndices, cutActions, PAUSE_MS, sourceWindow, speechCuts, type CleanupLevel } from '../speechCleanup';

export interface CleanSpeechArgs { itemIds?: string[]; level: Exclude<CleanupLevel, 'off'>; pauses: boolean }

export function parseCleanSpeechArgs(raw: Record<string, unknown>): CleanSpeechArgs | { error: string } {
  const level = raw.level ?? 'balanced';
  if (typeof level !== 'string' || level === 'off' || !(CLEANUP_LEVELS as readonly string[]).includes(level)) return { error: 'level must be light, balanced or tight' };
  if (raw.itemIds !== undefined && !(Array.isArray(raw.itemIds) && raw.itemIds.every((x) => typeof x === 'string'))) return { error: 'itemIds must be a list of clip ids' };
  if (raw.pauses !== undefined && typeof raw.pauses !== 'boolean') return { error: 'pauses must be true or false' };
  return { level: level as CleanSpeechArgs['level'], pauses: raw.pauses === true, ...(raw.itemIds ? { itemIds: raw.itemIds as string[] } : {}) };
}

export interface CleanSpeechClip { itemId: string; name: string; fillers: string[]; stutters: string[]; retakes: string[]; savedSec: number; pieces: number }

export function planCleanSpeech(state: TimelineState, a: CleanSpeechArgs, newId: () => string): { actions: AtomicAction[]; clips: CleanSpeechClip[] } | { error: string } {
  const talking = (i: TimelineItem) => (i.kind === 'video' || i.kind === 'audio') && hasOperationalTranscript(i);
  let targets: TimelineItem[];
  if (a.itemIds?.length) {
    targets = [];
    for (const id of a.itemIds) {
      const item = state.items.find((i) => i.id === id || i.id.startsWith(id));
      if (!item) return { error: `no clip ${id}` };
      if (!talking(item)) return { error: `${item.id} has no transcript; transcribe it first (right-click it in My Media)` };
      targets.push(item);
    }
  } else targets = state.items.filter(talking);
  if (!targets.length) return { error: 'no clip on the timeline has a transcript; transcribe the talking clips first' };
  const fps = state.fps;
  const actions: AtomicAction[] = [];
  const clips: CleanSpeechClip[] = [];
  // last first: a cut closes the gap after it, which must not move a clip not yet planned
  for (const item of [...targets].sort((x, y) => y.startFrame - x.startFrame)) {
    const words = item.transcript!;
    const clean = cleanupIndices(words, a.level);
    const said = (idxs: number[]) => idxs.map((i) => words[i]!.text);
    const report = { itemId: item.id, name: item.name, fillers: said(clean.fillers), stutters: said(clean.stutters), retakes: said(clean.retakes) };
    if (item.kind === 'audio') {
      if (clean.idxs.length) actions.push({ type: 'deleteWords', id: item.id, idxs: clean.idxs });
      if (a.pauses) actions.push({ type: 'cleanScript', id: item.id, removeFillers: false, silenceFrames: Math.round((PAUSE_MS[a.level] / 1000) * fps) });
      clips.push({ ...report, savedSec: 0, pieces: 1 });
      continue;
    }
    const cuts = speechCuts(words, new Set(clean.idxs), fps, sourceWindow(item), a.pauses ? PAUSE_MS[a.level] : undefined);
    if (!cuts.length) continue;
    const plan = cutActions(item, cuts, newId);
    if (plan.frames >= item.durationInFrames) { clips.push({ ...report, savedSec: 0, pieces: 1 }); continue; }
    actions.push(...plan.actions);
    clips.push({ ...report, savedSec: Math.round(((item.durationInFrames - plan.frames) / fps) * 100) / 100, pieces: cuts.length });
  }
  return { actions, clips: clips.reverse() };
}
