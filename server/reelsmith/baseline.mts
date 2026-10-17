// RS-004: baseline on real footage. Scripted stand-in for "import, assemble, export" (no GUI):
//   npx tsx server/reelsmith/baseline.mts <folder with clips + one song> [recipe-id] [--seconds N] [--param k=v] [--text k=v] [--keep]
// Reports per-step timings, then exports the reel through the app's server pipeline, finalizes it for Instagram and
// runs the V1-V9 checks plus the V8 parity sample. Nothing is written outside a temp folder and the report on stdout.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, linkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { parseRecipe } from '../../shared/reelsmith/recipe.ts';
import { REEL_PRESETS, presetForCanvas } from '../../shared/reelsmith/instagramPreset.ts';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { h264RenderOptions, renderTimeline, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { upscalePhoto } from './upscale.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { exportParity } from './exportParity.ts';
import { renderTimelineStills } from '../../remotion/render.mjs';
import { sampleFrames } from './parityCheck.ts';
import { writeFileSync } from 'node:fs';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { runRecipe, type AnalyzeApi } from '../../src/reelsmith/runRecipe.ts';
import { defaultValues } from '../../src/reelsmith/setupForm.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';

const FPS = 30;
const argv = process.argv.slice(2);
const folder = resolve(argv[0] ?? '');
const recipeId = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'travel-beat-montage';
if (!argv[0] || !existsSync(folder)) throw new Error('usage: baseline.mts <folder> [recipe-id]');
const work = mkdtempSync(join(tmpdir(), 'rs-baseline-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });
const t0 = Date.now();
const lap = (label: string, since: number) => { console.log(`${label}: ${((Date.now() - since) / 1000).toFixed(1)} s`); return Date.now(); };

// --- import: link files, probe each one ---------------------------------------------------------
const files = readdirSync(folder).filter((f) => /\.(mov|mp4|m4v|mp3|wav|m4a|jpe?g|png)$/i.test(f)).sort();
const assets: MediaAsset[] = [];
const notes: string[] = [];
let t = Date.now();
files.forEach((f, i) => {
  const safe = `f${i}${extname(f).toLowerCase()}`;
  try { linkSync(join(folder, f), join(media, safe)); } catch { copyFileSync(join(folder, f), join(media, safe)); }
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(folder, f)], { maxBuffer: 1 << 26 }).toString());
  const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const dur = Number(p.format.duration);
  const base = { id: `a${i}`, name: f, src: `/media/uploads/${safe}`, durationInFrames: Math.max(1, Math.floor(dur * FPS)) };
  if (!v) { assets.push({ ...base, kind: 'audio' } as MediaAsset); return; }
  if (/\.(jpe?g|png)$/i.test(f)) { assets.push({ ...base, kind: 'image', durationInFrames: 150, width: v.width, height: v.height } as MediaAsset); notes.push(`${f}: photo ${v.width}x${v.height}`); return; }
  const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  const avg = v.avg_frame_rate.split('/').map(Number); const r = v.r_frame_rate.split('/').map(Number);
  const vfr = Math.abs(avg[0]! / avg[1]! - r[0]! / r[1]!) > 0.5;
  notes.push(`${f}: ${v.codec_name} ${v.width}x${v.height} rot ${rot} ${vfr ? 'VFR' : 'CFR'} ${v.pix_fmt} ${dur.toFixed(1)}s`);
  assets.push({ ...base, kind: 'video', width: w, height: h } as MediaAsset);
});
t = lap(`probe ${files.length} files`, t);
const videos = assets.filter((a) => a.kind === 'video');
const song = assets.find((a) => a.kind === 'audio');
if (!song && !process.argv.includes('--no-song')) console.log('no song in folder: recipes that need one will refuse; the rest run silent');
const byFile = (a: MediaAsset) => join(media, a.src.replace('/media/uploads/', ''));

// --- analysis (what Assemble does) --------------------------------------------------------------
const feat: Record<string, number> = {};
const tagsArg = argv.find((x) => x.startsWith('--tags='))?.slice(7);
const api: AnalyzeApi = {
  // RS-109: shot tags computed beforehand (scripts/tag-clips.mts), keyed by file name
  ...(tagsArg ? { shotTags: async (as: MediaAsset[]) => { const j = JSON.parse(readFileSync(tagsArg, 'utf8')); return new Map(as.filter((a) => j[a.name!]).map((a) => [a.id, j[a.name!]] as const)); } } : {}),
  clipFeatures: async (a, fps) => { const s = Date.now(); const r = await extractClipFeatures(byFile(a), a.id, fps, { maxSec: 90, stillImage: a.kind === 'image' }); feat[a.name ?? a.id] = Date.now() - s; return r; },
  // `--param enhanceSmallPhotos=true` (RS-1109): 2x copies written next to the copied media
  upscale: async (a) => {
    if (!a.width || !a.height) return null;
    const r = await upscalePhoto(byFile(a), { width: a.width, height: a.height });
    return { src: `/media/uploads/${r.name}`, width: r.width, height: r.height };
  },
  musicGrid: async (a) => {
    const g = await analyzeBeatsFile(byFile(a));
    if (!g) return null;
    const drop = detectDropBeat(g.energyPerBeat, 4, 2, g.downbeatIndex);
    console.log(`song: ${g.bpm.toFixed(1)} bpm, ${g.durationSec.toFixed(0)} s, downbeat ${g.downbeatIndex}, drop ${drop === null ? 'none' : g.beatTimesSec[drop]!.toFixed(1)}`);
    return { durationSec: g.durationSec, beatTimesSec: g.beatTimesSec, beatsPerBar: 4, downbeatIndex: g.downbeatIndex, loudestStartSec: g.loudestStartSec, dropSec: drop === null ? undefined : g.beatTimesSec[drop] };
  },
};
const parsed = parseRecipe(readFileSync(join('recipes', `${recipeId}.recipe.json`), 'utf8'));
if (!parsed.ok) throw new Error(parsed.errors[0]);
const recipe = parsed.recipe;
const values = defaultValues(recipe);
for (const input of recipe.inputs) {
  if (input.kind === 'text') { values.texts[input.id] = input.placeholder ?? input.label; continue; }
  const pool = input.accept.includes('audio') ? (song ? [song] : []) : assets.filter((a) => (input.accept as string[]).includes(a.kind));
  values.media[input.id] = pool.slice(0, input.accept.includes('audio') ? 1 : input.max).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'audio' | 'image' }));
}
// --param key=value overrides a setup value (e.g. --param musicStart=fromStart); --text id=value sets a text input
argv.forEach((x, i) => {
  const kv = /^([A-Za-z]\w*)=(.*)$/.exec(argv[i + 1] ?? '');
  if (!kv) return;
  if (x === '--param') values.params[kv[1]!] = kv[2] === 'true' ? true : kv[2] === 'false' ? false : Number.isFinite(Number(kv[2])) && kv[2] !== '' ? Number(kv[2]) : kv[2]!;
  if (x === '--text') values.texts[kv[1]!] = kv[2]!;
});
const ratioArg = argv.find((x) => x.startsWith('--ratio='))?.slice(8) as import('../../shared/reelsmith/ratios.ts').RatioId | undefined;
const out = await runRecipe(api, { recipe, ...(ratioArg ? { ratio: ratioArg } : {}), values, assets, fps: FPS, replaceTimeline: true, seed: 7 });
t = lap('analyse + assemble', t);
console.log(`slowest clip analysis: ${Object.entries(feat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(', ')}`);
if (!out.action) throw new Error(`could not assemble: ${out.messages.join('; ')}`);
if (out.messages.length) console.log(`assembler notes: ${out.messages.join(' | ')}`);
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((asset) => ({ type: 'addAsset', asset })) });
h = historyReduce(h, bindTracks(out.action, activeTimeline(h.present)));
const doc = h.present;
const tl = activeTimeline(doc);
const end = Math.max(...tl.items.map((i) => i.startFrame + i.durationInFrames));
console.log(`reel: ${(end / FPS).toFixed(1)} s, ${tl.items.length} items, canvas ${tl.width}x${tl.height}`);

// --- export + Instagram finalize ----------------------------------------------------------------
const submission = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
const raw = join(work, 'reel.mp4');
t = Date.now();
try {
  const plan = submission.plan;
  const opts = await h264RenderOptions(plan.media.codec, { preferSpeed: true });
  await withExportPermit(() => renderTimeline({ state: plan.state, project: plan.project, timelineId: plan.timelineId, outputLocation: raw, codec: plan.media.codec, frameRange: plan.frameRange, scale: plan.scale, videoBitrate: plan.videoBitrate, ...opts }));
} finally { await submission.cleanup(); }
const exportMs = Date.now() - t;
console.log(`export: ${(exportMs / 1000).toFixed(1)} s for a ${(end / FPS).toFixed(1)} s reel (${(exportMs / 1000 / (end / FPS)).toFixed(2)}x real time), ${(statSync(raw).size / 1e6).toFixed(1)} MB`);
t = Date.now();
const fin = await finalizeForInstagram(raw, presetForCanvas(REEL_PRESETS['instagram-reel']!, tl.width, tl.height) ?? REEL_PRESETS['instagram-reel']!);
t = lap(`instagram finalize (${fin.ok ? (fin.reencoded ? 're-encoded' : 'already passed') : 'FAILED'})`, t);
for (const c of (fin.second ?? fin.first).checks) console.log(`  ${c.id} ${c.status} ${c.detail}`);
const v8 = await exportParity(raw, { ...tl, assets: doc.assets } as never);
console.log(`  ${v8.id} ${v8.status} ${v8.detail}`);
if (argv.includes('--keep')) {
  const sub = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, format: 'video', codec: 'h264' } as never);
  try {
    const frames = sampleFrames(Math.round(end));
    const stills = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames }) as Array<{ frame: number; base64: string }>;
    for (const st of stills) writeFileSync(join(work, `still-${st.frame}.jpg`), Buffer.from(st.base64, 'base64'));
  } finally { await sub.cleanup(); }
}
console.log(`\ninputs:\n${notes.join('\n')}`);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (argv.includes('--keep')) console.log(`kept: ${raw}`); else rmSync(work, { recursive: true, force: true });
