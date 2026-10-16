// RS-1002: the brief checklist as a pure function ("4/7 clips ✓, song ✓, line ✗"), used by the setup form.
import type { ReelsBrief, BriefRecipeMapping } from '../../shared/reelsmith/brief';
import type { SetupValues } from './setupForm';

export interface BriefChecklistItem { id: string; label: string; complete: boolean; kind: 'shot' | 'plain'; index?: number }
type ChecklistAsset = { id: string; durationInFrames: number };

export function briefChecklist(
  brief: ReelsBrief | undefined,
  mapping: BriefRecipeMapping | null,
  values: SetupValues,
  assets: readonly ChecklistAsset[],
  fps: number,
  confirmedShotRequests: readonly number[],
): { items: BriefChecklistItem[]; complete: boolean } {
  if (!brief || !mapping) return { items: [], complete: !brief };
  const requiredClips = new Map<string, number>();
  for (const { request, input } of mapping.clips) requiredClips.set(input.id, (requiredClips.get(input.id) ?? 0) + request.count);
  const requiredText = new Map<string, number>();
  for (const { request, input } of mapping.text) requiredText.set(input.id, (requiredText.get(input.id) ?? 0) + request.count);
  const items: BriefChecklistItem[] = [
    ...mapping.clips.map(({ request, input }, index) => {
      const selected = (values.media[input.id] ?? []).map((choice) => assets.find((asset) => asset.id === choice.assetId)).filter((asset) => asset && (!request.minLengthSec || asset.durationInFrames / fps >= request.minLengthSec));
      const required = requiredClips.get(input.id) ?? request.count;
      return {
        id: `clip-${index}`, label: `${selected.length}/${required} ${request.shotType} clips${request.minLengthSec ? `, at least ${request.minLengthSec}s` : ''}`,
        complete: selected.length >= required && confirmedShotRequests.includes(index), kind: 'shot' as const, index,
      };
    }),
    ...mapping.text.map(({ request, input }, index) => {
      const pieces = (values.texts[input.id] ?? '').split('/').map((part) => part.trim()).filter(Boolean);
      const wordsFit = request.maxWords === undefined || pieces.every((part) => part.split(/\s+/).filter(Boolean).length <= request.maxWords!);
      const required = requiredText.get(input.id) ?? request.count;
      return { id: `text-${index}`, label: `${pieces.length}/${required} text item${request.count === 1 ? '' : 's'}${request.maxWords ? `, up to ${request.maxWords} words` : ''}${request.tone ? ` · ${request.tone}` : ''}`, complete: pieces.length >= required && wordsFit, kind: 'plain' as const };
    }),
    ...(brief.music ? [{ id: 'music', label: brief.music.mode === 'instagram' ? 'Add music in Instagram' : brief.music.mode === 'named' ? `Music · ${brief.music.name}` : `Music · ${brief.music.description}`, complete: brief.music.mode === 'instagram' || (!!mapping.music && (values.media[mapping.music.id]?.length ?? 0) > 0), kind: 'plain' as const }] : []),
  ];
  return { items, complete: items.every((item) => item.complete) && mapping.warnings.length === 0 };
}
