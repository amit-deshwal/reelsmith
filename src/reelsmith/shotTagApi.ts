// RS-109: shot tags for the assets of a recipe run, from image vectors the user's visual search already built.
// Nothing is downloaded or indexed here: with no vectors (visual search not set up) it returns no tags and the
// assemblers use their score-only picks as before.
import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { MediaAsset } from '../editor/types';
import { SemanticClient } from '../media/semantic-search/semanticClient';
import { readSemanticVectors } from '../media/semantic-search/vectorStore';
import { embedTagPrompts, tagClips, type ClipShotTags, type TagPrompts } from './shotTags';

let promptCache: TagPrompts | null = null;

export async function loadShotTags(scopeId: string, assets: MediaAsset[]): Promise<Map<string, ClipShotTags>> {
  const revisions = new Map(assets.map((a) => [a.id, sourceRevisionOf(a)]));
  const records = (await readSemanticVectors(scopeId)).filter((r) => revisions.has(r.assetId) && r.sourceRevision === revisions.get(r.assetId));
  if (!records.length) return new Map();
  if (!promptCache) {
    const client = new SemanticClient();
    try {
      await client.load(typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm');
      promptCache = await embedTagPrompts((t) => client.embedText(t));
    } finally { client.dispose(); }
  }
  return tagClips(records, promptCache);
}
