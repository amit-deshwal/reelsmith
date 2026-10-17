// RS-107: build the recipe gallery's posters and hover loops from SYNTHETIC media only (ffmpeg lavfi;
// no third-party footage). Each recipe is assembled exactly as in the app (real clip analysis and beat
// detection on the synthetic files) and rendered through the app's own export pipeline.
// Run: npx tsx server/reelsmith/build-previews.mts [recipe-id ...] [--param key=value ...] [--out <dir>]
// --parity also runs the RS-302 V8 sample (editor stills vs the rendered frames) on each recipe's render.
// --user: build previews for the AI-made recipes in the user's recipe folder instead (--user-dir <dir> to override),
// writing <dir>/previews/<id>.jpg|mp4 and setting `preview` in the recipe file (served by the user-recipes plugin).
// Output: assets/recipe-previews/<id>.jpg (poster) and <id>.mp4 (muted 360x640 loop, ~4 s), served at /recipe-previews/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe.ts';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import type { TranscriptWord } from '../../src/transcript/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { h264RenderOptions, renderTimeline, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { renderTimelineStills } from '../../remotion/render.mjs';
import { checkParity, sampleFrames } from './parityCheck.ts';
import { seedKeystore } from '../keystore.ts';
import { userRecipeDir } from './user-recipes.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { runRecipe, type AnalyzeApi } from '../../src/reelsmith/runRecipe.ts';
import { defaultValues } from '../../src/reelsmith/setupForm.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';

const FPS = 30;
const argv = process.argv.slice(2);
const flag = (name: string) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] ? [argv[i + 1]!] : []));
const USER_MODE = argv.includes('--user');
const USER_DIR = flag('user-dir')[0] ?? userRecipeDir();
const OUT = flag('out')[0] ?? (USER_MODE ? join(USER_DIR, 'previews') : join(process.cwd(), 'assets', 'recipe-previews'));
const PARAM_OVERRIDES = Object.fromEntries(flag('param').map((kv) => [kv.split('=')[0]!, kv.split('=').slice(1).join('=')]));
const only = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const RECIPE_DIR = USER_MODE ? USER_DIR : 'recipes';
const work = mkdtempSync(join(tmpdir(), 'rs-previews-'));
const media = join(work, 'media');
mkdirSync(media, { recursive: true });
mkdirSync(OUT, { recursive: true });
setUploadsDirProvider(() => media);
// in-memory only: point media resolution at the temp folder (nothing is written to the user's keystore)
seedKeystore({ MEDIA_DIR: media });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

// --- synthetic media ---------------------------------------------------------------------------
const PALETTE = [
  ['0xff5f6d', '0xffc371'], ['0x2193b0', '0x6dd5ed'], ['0xcc2b5e', '0x753a88'], ['0x42275a', '0x734b6d'],
  ['0x56ab2f', '0xa8e063'], ['0xf7971e', '0xffd200'], ['0x1d976c', '0x93f9b9'], ['0xeb3349', '0xf45c43'],
  ['0x4568dc', '0xb06ab3'], ['0x00b09b', '0x96c93d'], ['0xff512f', '0xdd2476'], ['0x1a2980', '0x26d0ce'],
];
function clip(i: number, kind: 'video' | 'image'): MediaAsset {
  const [c0, c1] = PALETTE[i % PALETTE.length]!;
  const name = `synthetic-${kind}-${i}.${kind === 'video' ? 'mp4' : 'png'}`;
  const file = join(media, name);
  // gradient direction and block layout vary per clip, so no two clips read as near-duplicates
  const r = (k: number) => ((i + 1) * 2654435761 * (k + 3)) % 1000 / 1000;
  const ang = (i * 47) % 360 * Math.PI / 180;
  const [x0, y0, x1, y1] = [270 - 260 * Math.cos(ang), 480 - 470 * Math.sin(ang), 270 + 260 * Math.cos(ang), 480 + 470 * Math.sin(ang)].map((v) => Math.max(0, Math.round(v)));
  const src = `gradients=s=540x960:c0=${c0}:c1=${c1}:x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:speed=${0.01 + (i % 5) * 0.01}:rate=${FPS}`;
  const t = kind === 'video' ? 't' : String(i);
  const boxes = [0, 1, 2].map((k) => {
    const w = 80 + Math.round(r(k) * 220); const h = 80 + Math.round(r(k + 5) * 300);
    return `drawbox=x='${Math.round(r(k + 1) * 400)}+40*sin(${t}*${k + 1})':y='${Math.round(r(k + 2) * 700)}+60*cos(${t})':w=${w}:h=${h}:color=${k === 0 ? 'white@0.85' : k === 1 ? 'black@0.35' : '0x101820@0.6'}:t=fill`;
  }).join(',');
  if (kind === 'video') ff('-f', 'lavfi', '-i', src, '-t', '5', '-vf', boxes, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', file);
  else ff('-f', 'lavfi', '-i', src, '-frames:v', '1', '-vf', boxes, file);
  return { id: `syn-${kind}-${i}`, name: `Clip ${i + 1}`, kind, src: `/media/uploads/${name}`, durationInFrames: 5 * FPS, width: 540, height: 960 };
}
function song(): MediaAsset {
  const name = 'synthetic-beat-120bpm.wav';
  // 120 bpm: kick on every beat, a louder accent on each bar, hats in between, a bass drone
  const expr = '0.8*sin(2*PI*55*t)*exp(-18*mod(t,0.5))*(1+0.6*lt(mod(t,2),0.5))+0.15*sin(2*PI*110*t)+0.08*(random(0)*2-1)*exp(-60*mod(t+0.25,0.5))';
  ff('-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=40`, '-ac', '2', join(media, name));
  return { id: 'syn-song', name: 'Synthetic beat', kind: 'audio', src: `/media/uploads/${name}`, durationInFrames: 40 * FPS };
}
function talking(i: number): MediaAsset {
  const a = clip(100 + i, 'video');
  const lines = 'this weekend we finally made it up the mountain and the view was worth every step of the climb'.split(' ');
  const words: TranscriptWord[] = lines.map((text, k) => ({ text, start: 200 + k * 230, end: 200 + k * 230 + 190 }));
  return { ...a, name: `Talking ${i + 1}`, transcript: words } as MediaAsset;
}

const clips = Array.from({ length: 24 }, (_, i) => clip(i, i % 5 === 4 ? 'image' : 'video'));
const music = song();
const talk = [talking(0), talking(1)];
// photo-only recipes (Photo Dump) need their own stills; the shared pool above has too few images and stays unchanged
const photoPool = Array.from({ length: 12 }, (_, i) => clip(200 + i, 'image'));
const assets = [...clips, music, ...talk, ...photoPool];
const byFile = (a: MediaAsset) => join(media, a.src.replace('/media/uploads/', ''));

const api: AnalyzeApi = {
  clipFeatures: (a, fps) => extractClipFeatures(byFile(a), a.id, fps, { maxSec: 10 }),
  musicGrid: async (a) => {
    const g = await analyzeBeatsFile(byFile(a));
    if (!g) return null;
    const drop = detectDropBeat(g.energyPerBeat, 4, 2, g.downbeatIndex);
    return { durationSec: g.durationSec, beatTimesSec: g.beatTimesSec, beatsPerBar: 4, downbeatIndex: g.downbeatIndex, loudestStartSec: g.loudestStartSec, dropSec: drop === null ? undefined : g.beatTimesSec[drop] };
  },
};

// --- per recipe ----------------------------------------------------------------------------------
const recipes: Recipe[] = readdirSync(RECIPE_DIR).filter((f) => f.endsWith('.recipe.json')).map((f) => {
  const r = parseRecipe(readFileSync(join(RECIPE_DIR, f), 'utf8'));
  if (!r.ok) throw new Error(`${f}: ${r.errors[0]}`);
  return r.recipe;
}).filter((r) => !only.length || only.includes(r.id));

const SAMPLE_TEXT: Record<string, string> = { place: 'Harishchandragad', title: 'Monsoon days', about: 'A day in Pune', hook: 'We almost turned back' };

for (const recipe of recipes) {
  const started = Date.now();
  const values = defaultValues(recipe);
  for (const [k, v] of Object.entries(PARAM_OVERRIDES)) if (k in values.params) values.params[k] = typeof values.params[k] === 'number' ? Number(v) : v;
  for (const input of recipe.inputs) {
    if (input.kind === 'text') { values.texts[input.id] = SAMPLE_TEXT[input.id] ?? input.default ?? input.placeholder ?? input.label.slice(0, input.maxLength); continue; }
    const pool = input.accept.includes('audio') ? [music] : input.id === 'talking' ? talk : input.accept.length === 1 && input.accept[0] === 'image' ? photoPool : clips.filter((c) => input.accept.includes(c.kind as never));
    const want = Math.max(input.min, Math.min(input.max, input.accept.includes('audio') ? 1 : 20));
    values.media[input.id] = pool.slice(0, want).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' | 'audio' }));
  }
  const out = await runRecipe(api, { recipe, values, assets, fps: FPS, replaceTimeline: true, seed: 7 });
  if (!out.action) { console.error(`${recipe.id}: could not assemble: ${out.messages.join('; ')}`); continue; }
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((asset) => ({ type: 'addAsset', asset })) });
  h = historyReduce(h, bindTracks(out.action, activeTimeline(h.present)));
  const doc = h.present;
  const tl = activeTimeline(doc);
  const end = Math.max(...tl.items.map((i) => i.startFrame + i.durationInFrames));
  const from = recipe.id === 'collage-grid' ? Math.max(0, Math.round(end * 0.35)) : 0;
  const to = Math.min(end, from + 6 * FPS);

  const submission = await acceptExportSubmission({
    state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '720p',
    startFrame: from, endFrameExclusive: to,
  } as never);
  const plan = submission.plan;
  const raw = join(work, `${recipe.id}.raw.mp4`);
  try {
    const renderOpts = await h264RenderOptions(plan.media.codec, { preferSpeed: true });
    await withExportPermit(() => renderTimeline({
      state: plan.state, project: plan.project, timelineId: plan.timelineId, outputLocation: raw,
      codec: plan.media.codec, frameRange: plan.frameRange, scale: plan.scale, videoBitrate: plan.videoBitrate,
      ...renderOpts,
    }));
    if (argv.includes('--parity')) {
      const frames = sampleFrames(to - from).map((f) => f + from);
      const stills = await renderTimelineStills({ state: plan.state, project: plan.project, timelineId: plan.timelineId, frames }) as Array<{ frame: number; base64: string }>;
      const v8 = await checkParity({ file: raw, fps: FPS, frames, stills, firstFrame: from });
      console.log(`${recipe.id}: V8 ${v8.status} ${v8.detail}`);
    }
  } finally {
    await submission.cleanup();
  }
  const loop = join(OUT, `${recipe.id}.mp4`);
  const poster = join(OUT, `${recipe.id}.jpg`);
  ff('-i', raw, '-t', '4.5', '-an', '-vf', 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,fps=24',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', loop);
  ff('-ss', '1.2', '-i', raw, '-frames:v', '1', '-vf', 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2', '-q:v', '4', poster);
  if (USER_MODE) {
    const file = join(USER_DIR, `${recipe.id}.recipe.json`);
    const next = { ...JSON.parse(readFileSync(file, 'utf8')), preview: { poster: `previews/${recipe.id}.jpg`, loop: `previews/${recipe.id}.mp4`, generatedFrom: 'synthetic-sample' } };
    writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  }
  console.log(`${recipe.id}: ${((Date.now() - started) / 1000).toFixed(1)} s  poster ${(statSync(poster).size / 1024).toFixed(0)} KB  loop ${(statSync(loop).size / 1024).toFixed(0)} KB`);
}
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
