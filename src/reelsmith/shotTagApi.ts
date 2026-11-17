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
import { pageWork } from './pageWork';

/** More clips than this are not read automatically (index them from the Media pool instead). */
const MAX_AUTO_INDEX = 200;
/** How long one caller waits for the reading; the reading itself goes on and the next caller joins it. */
const SHOT_TAG_LIMIT_MS = 120_000;
/** The wait on a reading that already outlasted one caller: a build must not pay the full limit a second time. */
const SLOW_WAIT_MS = 20_000;
/** A reading that gets nowhere for this long (a model that never loads) is stopped. */
const STALL_MS = 120_000;
const PACK_ID = 'visual-semantics-lite';

let promptCache: TagPrompts | null = null;

async function packInstalled(): Promise<boolean> {
  try { return (await fetchModelPackCatalog()).find((p) => p.id === PACK_ID)?.status === 'installed'; } catch { return false; }
}

/**
 * RS-1270: one reading of a project's clips at a time, owned by no caller. Each caller's timer used to dispose the model
 * mid-read, and stage 1, its shot search and the build each started their own: three 120 s waits on a slow model, which
 * alone took the director past its tool timeout.
 */
interface Reading { done: Promise<void>; slow: boolean; report?: (text: string) => void }
const readings = new Map<string, Reading>();
/**
 * Clips the visual model could not get through (asset and source revision), and when: not tried again for a while.
 * RS-1272 (1): "for the life of the page" kept 13 of 33 Goa clips out of every later search after one contended run.
 */
const unreadable = new Map<string, number>();
const RETRY_UNREADABLE_MS = 10 * 60_000;
const isUnreadable = (a: MediaAsset) => { const at = unreadable.get(unreadableKey(a)); return at !== undefined && Date.now() - at < RETRY_UNREADABLE_MS; };
const unreadableKey = (a: MediaAsset) => `${a.id}:${sourceRevisionOf(a)}`;
/** One clip's frames and vectors take a few seconds; a seek that never answers used to hang the whole reading. */
const CLIP_LIMIT_MS = 45_000;

const device = () => (typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm');
const timeLimit = <T>(work: Promise<T>, ms: number): Promise<T | 'late'> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), ms); })]).finally(() => clearTimeout(timer));
};

function startReading(scopeId: string, missing: MediaAsset[], report?: (text: string) => void): Reading {
  const reading: Reading = { done: Promise.resolve(), slow: false, ...(report ? { report } : {}) };
  const held: { client: SemanticClient | null } = { client: null };
  const load = async () => {
    held.client?.dispose();
    held.client = new SemanticClient();
    const loaded = await timeLimit(held.client.load(device()), STALL_MS);
    if (loaded === 'late') throw new Error('the visual model did not load');
  };
  reading.done = (async () => {
    try {
      reading.report?.('Loading the visual model');
      await load();
      // the tag phrases first: clips read before a caller stops waiting can then be tagged
      if (!promptCache) promptCache = await embedTagPrompts((t) => held.client!.embedText(t));
      let done = 0;
      for (const asset of missing) {
        const controller = new AbortController();
        // RS-1272 (1): the clock starts when the GPU is ours: alongside face finding every clip ran out its 45 s
        const read = await pageWork('vectors', () => timeLimit(indexSemanticAssets(scopeId, held.client!, [asset], controller.signal, () => undefined).catch(() => undefined), CLIP_LIMIT_MS));
        if (read === 'late') {
          console.warn(`[shot tags] ${asset.name} could not be read within ${CLIP_LIMIT_MS / 1000}s; skipped`);
          controller.abort();
          unreadable.set(unreadableKey(asset), Date.now());
          await load();
        }
        reading.report?.(`Reading what the shots show ${++done}/${missing.length}`);
      }
    } catch (error) {
      // the model could not be used: fall back to whatever vectors exist, or to score-only picks
      console.warn(`[shot tags] stopped: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      held.client?.dispose();
      if (readings.get(scopeId) === reading) readings.delete(scopeId);
    }
  })();
  readings.set(scopeId, reading);
  return reading;
}

export async function loadShotTags(scopeId: string, assets: MediaAsset[], onProgress?: (text: string) => void): Promise<Map<string, ClipShotTags>> {
  const revisions = new Map(assets.map((a) => [a.id, sourceRevisionOf(a)]));
  const current = async () => (await readSemanticVectors(scopeId)).filter((r) => revisions.has(r.assetId) && r.sourceRevision === revisions.get(r.assetId));
  let records = await current();
  const deadline = Date.now() + SHOT_TAG_LIMIT_MS;
  // a reading in progress may be of other clips: after it, what is still missing gets its own
  for (let round = 0; round < 3; round += 1) {
    let reading = readings.get(scopeId);
    if (!reading) {
      const indexed = new Set(records.map((r) => r.assetId));
      const missing = assets.filter(isSemanticMedia).filter((a) => !indexed.has(a.id) && !isUnreadable(a));
      if (!(missing.length || (records.length && !promptCache)) || missing.length > MAX_AUTO_INDEX || !await packInstalled()) break;
      reading = readings.get(scopeId) ?? startReading(scopeId, missing, onProgress);
    } else if (onProgress) reading.report = onProgress;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waitMs = Math.max(0, Math.min(deadline - Date.now(), reading.slow ? SLOW_WAIT_MS : SHOT_TAG_LIMIT_MS));
    const finished = await Promise.race([reading.done.then(() => true), new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), waitMs); })]);
    clearTimeout(timer);
    records = await current();
    if (!finished) {
      // A slow visual model must not block Assemble: the caller continues with the clips read so far
      console.warn(`[shot tags] the visual model did not finish within ${Math.round(waitMs / 1000)}s; continuing with ${new Set(records.map((r) => r.assetId)).size} of ${assets.length} clips read (the reading goes on)`);
      reading.slow = true;
      break;
    }
  }
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
    const queries = await pageWork('vectors', async () => {
      await client.load(device());
      const out: number[][] = [];
      for (const text of texts) out.push(await client.embedText(text));
      return out;
    });
    return { frames: frames.map((r) => ({ assetId: r.assetId, sampleTime: r.sampleTime, vector: r.vector })), queries };
  } catch { return null; } finally { client.dispose(); }
}
