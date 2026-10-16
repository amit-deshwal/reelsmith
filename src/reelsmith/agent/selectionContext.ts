import type { ProjectDoc } from '../../editor/types';
import type { AssembleInput, AssembleResult, AssemblyClip, RecipeRunRecord } from '../assembler';

/** Ignore selection highlights; content, source and active-timeline changes invalidate old picks. */
export function selectionSnapshot(projectId: string, doc: ProjectDoc): string {
  return JSON.stringify({ projectId, ...doc, timelines: doc.timelines.map(({ selectedId: _selectedId, selectedIds: _selectedIds, ...timeline }) => timeline) });
}
export async function selectionKey(snapshot: string, run: RecipeRunRecord): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([snapshot, run]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function selectionPools(input: AssembleInput, heuristic: AssembleResult) {
  const primary = input.recipe.assembler.strategy === 'captioned-story@1'
    ? input.clips.filter((clip) => clip.kind === 'video' && clip.transcript?.length) : input.clips;
  const broll = input.recipe.assembler.strategy === 'captioned-story@1' ? input.broll ?? [] : [];
  const used = new Set(heuristic.report.usedAssetIds);
  return { primary, broll, slots: primary.filter((clip) => used.has(clip.assetId)).length,
    brollSlots: broll.filter((clip) => used.has(clip.assetId) && !primary.some((p) => p.assetId === clip.assetId)).length };
}
export function candidateFacts(clip: AssemblyClip, fps: number, allowFrames: boolean) {
  const start = clip.bestStartFrame ?? 0;
  return {
    assetId: clip.assetId, name: clip.name, seconds: +(clip.durationInFrames / fps).toFixed(1), score: +clip.score.toFixed(2),
    ...(clip.groupId ? { groupId: clip.groupId } : {}),
    bestStartSec: +(start / fps).toFixed(2),
    ...(clip.captureTimeMs !== undefined ? { captured: new Date(clip.captureTimeMs).toISOString() } : {}),
    ...(clip.transcript?.length ? { transcriptExcerpt: clip.transcript.map((word) => word.text).join(' ').slice(0, 240) } : {}),
    ...(allowFrames ? { inspect: { tool: 'view_asset_frames', args: { assetId: clip.assetId, count: clip.kind === 'image' ? 1 : 3 } } } : {}),
  };
}
