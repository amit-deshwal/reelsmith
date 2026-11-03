// RS-109: shot tags for the assets of a recipe run, from the visual model's image vectors.
// If the visual-semantics pack is already installed, clips that are not indexed yet are read here (nothing is
// downloaded: with no pack and no vectors this returns no tags and the assemblers use their score-only picks).
import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { MediaAsset } from '../editor/types';
import { fetchModelPackCatalog } from '../../shared/model-packs/client';
import { SemanticClient } from '../media/semantic-search/semanticClient';
import { indexSemanticAssets } from '../media/semantic-search/semanticOperations';
import { isSemanticMedia } from '../media/semantic-search/mediaFrames';
import { readSemanticVectors } from '../media/semantic-search/vectorStore';
import { embedTagPrompts, tagClips, type ClipShotTags, type TagPrompts } from './shotTags';

/** More clips than this are not read automatically (index them from the Media pool instead). */
const MAX_AUTO_INDEX = 60;
const SHOT_TAG_LIMIT_MS = 120_000;
const PACK_ID = 'visual-semantics-lite';

let promptCache: TagPrompts | null = null;

async function packInstalled(): Promise<boolean> {
  try { return (await fetchModelPackCatalog()).find((p) => p.id === PACK_ID)?.status === 'installed'; } catch { return false; }
}

export async function loadShotTags(scopeId: string, assets: MediaAsset[], onProgress?: (text: string) => void): Promise<Map<string, ClipShotTags>> {
  const revisions = new Map(assets.map((a) => [a.id, sourceRevisionOf(a)]));
  const current = async () => (await readSemanticVectors(scopeId)).filter((r) => revisions.has(r.assetId) && r.sourceRevision === revisions.get(r.assetId));
  let records = await current();
  const indexed = new Set(records.map((r) => r.assetId));
  const missing = assets.filter(isSemanticMedia).filter((a) => !indexed.has(a.id));
  let client: SemanticClient | null = null;
  // A stalled visual model (load or indexing) must not block Assemble: after the limit the recipe continues without shot tags.
  const work = async () => {
  try {
    if ((missing.length || (records.length && !promptCache)) && missing.length <= MAX_AUTO_INDEX && await packInstalled()) {
      client = new SemanticClient();
      onProgress?.('Loading the visual model');
      await client.load(typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm');
      if (missing.length) {
        await indexSemanticAssets(scopeId, client, missing, new AbortController().signal, (p) => onProgress?.(`Reading what the shots show ${p.completed + p.skipped}/${missing.length}`));
        records = await current();
      }
      if (!promptCache && records.length) promptCache = await embedTagPrompts((t) => client!.embedText(t));
    }
  } catch {
    // the model could not be used: fall back to whatever vectors exist, or to score-only picks
  } finally { client?.dispose(); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[shot tags] the visual model did not finish within ${SHOT_TAG_LIMIT_MS / 1000}s; continuing without shot tags`);
      client?.dispose();
      resolve();
    }, SHOT_TAG_LIMIT_MS);
  });
  try { await Promise.race([work(), limit]); } finally { clearTimeout(timer); }
  if (!records.length || !promptCache) return new Map();
  return tagClips(records, promptCache);
}

/**
 * RS-1256: the clips' frame vectors and the given phrases as vectors, for finding the shots that show a line. Clips not
 * yet read are read first (the same pass as the shot tags, so a director run pays for it once). Null when the visual
 * model is not installed; nothing is downloaded.
 */
export async function loadSemanticFrames(scopeId: string, assets: MediaAsset[], texts: string[]): Promise<{ frames: Array<{ assetId: string; sampleTime: number; vector: ArrayLike<number> }>; queries: number[][] } | null> {
  if (!await packInstalled()) return null;
  await loadShotTags(scopeId, assets).catch(() => undefined);
  const revisions = new Map(assets.map((a) => [a.id, sourceRevisionOf(a)]));
  const frames = (await readSemanticVectors(scopeId)).filter((r) => revisions.has(r.assetId) && r.sourceRevision === revisions.get(r.assetId));
  if (!frames.length) return null;
  const client = new SemanticClient();
  try {
    await client.load(typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm');
    const queries: number[][] = [];
    for (const text of texts) queries.push(await client.embedText(text));
    return { frames: frames.map((r) => ({ assetId: r.assetId, sampleTime: r.sampleTime, vector: r.vector })), queries };
  } catch { return null; } finally { client.dispose(); }
}
