// RS-1238: a depth map per photo (Depth Anything V2 small, the `depth-lite` model pack), made once and saved next to the
// source in the uploads folder as `<name>.depth.png` (white = near). Clip effects that move the camera through a photo
// (`builtin:fx-photo-parallax`) read it as a texture; the clip carries it as `props.rsDepthSrc`, so the export renderer
// (a static bundle with no /api) finds it among the uploads like any other media file.
// Nothing is downloaded here: with the pack absent the route answers `available: false` and the effect stays a flat push.
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { modelPackDefinition } from '../../shared/model-packs/catalog.ts';
import { modelCacheDir } from '../plugins/hf-proxy.ts';
import { extractStill } from './stillFrame.ts';
import { depthToGray } from './depthMath.ts';

export const DEPTH_PACK_ID = 'depth-lite';
const MODEL_DTYPE = 'fp32';
/** The model works on a 518 px short edge. */
const INPUT_SHORT_EDGE = 518;
/** The map is saved at twice that, snapped to the photo's edges there (depthMath.ts), so thin things keep their outline. */
const OUTPUT_SHORT_EDGE = 1036;

export interface DepthMap { name: string; width: number; height: number; cached: boolean }

/** File name of the depth map of `sourceName` (of the frame at `atSec` for a video). */
export function depthName(sourceName: string, atSec?: number): string {
  const base = basename(sourceName, extname(sourceName));
  return atSec === undefined ? `${base}.depth.png` : `${base}.depth-${Math.max(0, Math.round(atSec * 1000))}.png`;
}

export function depthPackInstalled(cacheDir = modelCacheDir()): boolean {
  const pack = modelPackDefinition(DEPTH_PACK_ID);
  return !!pack && pack.files.every((f) => existsSync(join(cacheDir, pack.modelId, ...f.path.split('/'))));
}

// sharp ships with transformers.js; its typings do not resolve through its package exports, so the few calls used here
interface SharpImage {
  rotate(): SharpImage;
  resize(o: { width: number; height: number; fit: 'outside' | 'fill'; withoutEnlargement?: boolean }): SharpImage;
  removeAlpha(): SharpImage;
  raw(): SharpImage;
  png(): SharpImage;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  toFile(path: string): Promise<unknown>;
  metadata(): Promise<{ width?: number; height?: number }>;
}
type Sharp = (input: string | Buffer, o?: { raw: { width: number; height: number; channels: 1 | 3 } }) => SharpImage;
const loadSharp = async (): Promise<Sharp> => ((await import('sharp' as string)) as { default: Sharp }).default;

interface DepthModel { run: (rgb: Uint8Array, width: number, height: number) => Promise<{ depth: Float32Array; width: number; height: number }> }

let modelFlight: Promise<DepthModel> | null = null;

async function loadModel(): Promise<DepthModel> {
  const pack = modelPackDefinition(DEPTH_PACK_ID)!;
  const { AutoModel, AutoImageProcessor, RawImage, env } = await import('@huggingface/transformers');
  env.localModelPath = modelCacheDir();
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const processor = await AutoImageProcessor.from_pretrained(pack.modelId);
  const model = await AutoModel.from_pretrained(pack.modelId, { dtype: MODEL_DTYPE, device: 'cpu' });
  return {
    run: async (rgb, width, height) => {
      const inputs = await processor(new RawImage(rgb, width, height, 3));
      const { predicted_depth } = await model(inputs) as { predicted_depth: { data: Float32Array; dims: number[] } };
      const dims = predicted_depth.dims;
      return { depth: predicted_depth.data, width: dims[dims.length - 1]!, height: dims[dims.length - 2]! };
    },
  };
}

function depthModel(): Promise<DepthModel> {
  modelFlight ??= loadModel().catch((error) => { modelFlight = null; throw error; });
  return modelFlight;
}

// one photo at a time: the model is a few hundred MB of activations, and a director build asks for several at once
let queue: Promise<unknown> = Promise.resolve();
const flights = new Map<string, Promise<DepthMap>>();

/** The depth map of a photo (or of the frame at `atSec` of a video), made once and reused while newer than its source. */
export function depthMapFor(file: string, atSec?: number): Promise<DepthMap> {
  const name = depthName(file, atSec);
  const out = join(dirname(file), name);
  const existing = flights.get(out);
  if (existing) return existing;
  const work = (async (): Promise<DepthMap> => {
    const sharp = await loadSharp();
    if (existsSync(out) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) {
      const meta = await sharp(out).metadata();
      return { name, width: meta.width ?? 0, height: meta.height ?? 0, cached: true };
    }
    if (!depthPackInstalled()) throw new Error('the depth-lite model pack is not installed');
    const picture = atSec === undefined ? file : join(dirname(file), (await extractStill(file, atSec)).name);
    // the photo as the browser shows it (EXIF orientation applied), short edge at the model's size
    const { data, info } = await sharp(picture).rotate().resize({ width: INPUT_SHORT_EDGE, height: INPUT_SHORT_EDGE, fit: 'outside', withoutEnlargement: false })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const run = queue.then(async () => (await depthModel()).run(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height));
    queue = run.catch(() => undefined);
    const result = await run;
    // the photo's colours at the output size guide the map's edges
    const guide = await sharp(picture).rotate().resize({ width: OUTPUT_SHORT_EDGE, height: OUTPUT_SHORT_EDGE, fit: 'outside' })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const gray = depthToGray(result.depth, result.width, result.height, {
      guide: new Uint8Array(guide.data.buffer, guide.data.byteOffset, guide.data.length), outWidth: guide.info.width, outHeight: guide.info.height,
      radius: 12, eps: 1e-2, grow: 1, blur: 2,
    });
    await sharp(Buffer.from(gray), { raw: { width: guide.info.width, height: guide.info.height, channels: 1 } }).png().toFile(out);
    return { name, width: guide.info.width, height: guide.info.height, cached: false };
  })();
  flights.set(out, work);
  return work.finally(() => flights.delete(out));
}
