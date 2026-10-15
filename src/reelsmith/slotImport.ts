import type { RecipeMediaInput } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import type { SetupValues } from './setupForm';

type Selection = SetupValues['media'][string];

/** Use the editor's normal importer; keep successful files selected if another fails. */
export async function importSlotMedia(
  slot: RecipeMediaInput,
  selected: Selection,
  files: File[],
  importMedia: (file: File) => Promise<MediaAsset>,
  onProgress?: (text: string) => void,
): Promise<{ selected: Selection; messages: string[] }> {
  const capacity = slot.max === 1 ? 1 : slot.max - selected.length;
  if (files.length > capacity) return { selected, messages: [`${slot.label}: choose at most ${capacity} more file(s).`] };
  const next = slot.max === 1 && files.length ? [] : [...selected];
  const messages: string[] = [];
  for (const [index, file] of files.entries()) {
    onProgress?.(`Importing ${index + 1}/${files.length}: ${file.name}`);
    try {
      const asset = await importMedia(file);
      if (!slot.accept.includes(asset.kind as never)) {
        messages.push(`${file.name}: choose ${slot.accept.join('/')} files for ${slot.label}.`);
        continue;
      }
      if (!next.some((pick) => pick.assetId === asset.id)) next.push({ assetId: asset.id, kind: asset.kind as Selection[number]['kind'] });
    } catch (error) {
      messages.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // A failed replacement must leave the previous song selected.
  return { selected: next.length || slot.max !== 1 ? next : selected, messages };
}
