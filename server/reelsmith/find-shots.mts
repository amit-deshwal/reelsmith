// RS-1256: try shot search on real footage without the app: the same visual model the app uses (Chinese-CLIP, read from
// the installed model folder), the same ranking (director/shotSearch.ts).
//   node --import tsx server/reelsmith/find-shots.mts <clips folder> "a calm lake" "friends laughing" [--every 2] [--limit 4]
// Clips are numbered #1.. in the folder's sorted order, like reels_director_options numbers them. Vectors are cached in
// the temp folder (per file size and time), so the second question costs seconds.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AutoProcessor, AutoTokenizer, ChineseCLIPModel, RawImage, env } from '@huggingface/transformers';
import { ffmpegBin } from '../media-binaries.ts';
import { searchMoments, showsOf, type FrameVector } from '../../src/reelsmith/director/shotSearch.ts';

const MODEL = 'Xenova/chinese-clip-vit-base-patch16';
const EDGE = 224;
const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const every = flag('--every', 2);
const limit = flag('--limit', 4);
const [folderArg, ...queries] = args;
if (!folderArg || !queries.length) throw new Error('usage: find-shots.mts <clips folder> "phrase" ["phrase"...] [--every 2] [--limit 4]');

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = join(homedir(), '.reelsmith', 'asr-models');
const [tokenizer, processor, model] = await Promise.all([
  AutoTokenizer.from_pretrained(MODEL), AutoProcessor.from_pretrained(MODEL), ChineseCLIPModel.from_pretrained(MODEL, { dtype: 'q4' }),
]);
const blankText = tokenizer([''], { padding: true, truncation: true });
const norm = (v: ArrayLike<number>) => { let m = 0; for (const x of v) m += x * x; const s = Math.sqrt(m) || 1; return Array.from(v, (x) => x / s); };
const vectorOf = (output: unknown, key: string) => norm(((output as Record<string, { data: ArrayLike<number> }>)[key]).data);

/** raw RGBA frames, one every `every` seconds, squashed to the model's square (the app's processor squashes too) */
function frames(file: string): Promise<Buffer[]> {
  return new Promise((done, fail) => {
    const ff = spawn(ffmpegBin(), ['-v', 'error', '-i', file, '-an', '-vf', `fps=1/${every},scale=${EDGE}:${EDGE}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => chunks.push(d));
    ff.stderr.resume();
    ff.on('error', fail);
    ff.on('close', () => {
      const all = Buffer.concat(chunks);
      const size = EDGE * EDGE * 4;
      done(Array.from({ length: Math.floor(all.length / size) }, (_, i) => all.subarray(i * size, (i + 1) * size)));
    });
  });
}

const folder = resolve(folderArg);
const files = readdirSync(folder).filter((f) => /\.(mov|mp4|m4v)$/i.test(f)).sort();
const cacheDir = join(tmpdir(), 'rs-find-shots');
mkdirSync(cacheDir, { recursive: true });
const all: FrameVector[] = [];
const started = Date.now();
for (const [i, f] of files.entries()) {
  const path = join(folder, f);
  const st = statSync(path);
  const cache = join(cacheDir, `${f}-${st.size}-${Math.round(st.mtimeMs)}-${every}.json`);
  let rows: Array<{ t: number; v: number[] }>;
  if (existsSync(cache)) rows = JSON.parse(readFileSync(cache, 'utf8'));
  else {
    rows = [];
    for (const [k, rgba] of (await frames(path)).entries()) {
      const image = new RawImage(new Uint8ClampedArray(rgba), EDGE, EDGE, 4);
      rows.push({ t: k * every, v: vectorOf(await model({ ...blankText, ...await processor(image) }), 'image_embeds') });
    }
    writeFileSync(cache, JSON.stringify(rows));
  }
  for (const r of rows) all.push({ assetId: `#${i + 1}`, sampleTime: r.t, vector: r.v });
  process.stderr.write(`\r${i + 1}/${files.length} clips, ${all.length} frames, ${Math.round((Date.now() - started) / 1000)} s`);
}
process.stderr.write('\n');
for (const q of queries) {
  const qv = vectorOf(await model({ ...tokenizer([q], { padding: true, truncation: true }), ...(await processor(new RawImage(new Uint8ClampedArray(EDGE * EDGE * 4), EDGE, EDGE, 4))) }), 'text_embeds');
  const hits = searchMoments(all, qv, { limit });
  console.log(`\n"${q}"`);
  for (const h of hits) console.log(`  ${h.assetId}@${h.atSec}  shows ${showsOf(h.match)}  match ${h.match}  (${files[Number(h.assetId.slice(1)) - 1]})`);
}
