import type { MediaAsset } from '../editor/types';
import { kindOfDescriptor } from './mediaProbe';
import { projectFileAssetKind } from './projectFile';

/**
 * Folder relink matching: candidates must match the recorded byte size when
 * available, then exact filename wins over extension-insensitive stem
 * matching. Multiple stem candidates prefer the file whose kind matches.
 */
export function matchRelinkFile(
  asset: Pick<MediaAsset, 'sourceFilename' | 'name' | 'kind' | 'sourceSize'>,
  files: readonly File[],
): File | null {
  const key = (asset.sourceFilename ?? asset.name).toLowerCase();
  if (!key) return null;
  const candidatesBySize = asset.sourceSize === undefined
    ? files
    : files.filter((file) => file.size === asset.sourceSize);
  const exact = candidatesBySize.find((file) => file.name.toLowerCase() === key);
  if (exact) return exact;

  const stem = key.replace(/\.[^.]+$/, '');
  if (!stem) return null;
  const candidates = candidatesBySize.filter((file) => {
    const name = file.name.toLowerCase();
    return name !== key && name.replace(/\.[^.]+$/, '') === stem;
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const kindMatch = candidates.find((file) => (
    kindOfDescriptor(file.name, file.type) ?? projectFileAssetKind(file)
  ) === asset.kind);
  return kindMatch ?? null;
}
