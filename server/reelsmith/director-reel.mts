// A director plan built and exported headlessly, through the same steps as the app (real clip analysis with face finding,
// beat detection, the director compiler, track binding, the export renderer). For checking director features (RS-1213
// graphics) on real footage without the agent in the loop.
//   node --import tsx server/reelsmith/director-reel.mts <clips folder> <song file> <plan.json> <out.mp4>
// The plan names clips "#n" in the folder's sorted order (videos and photos), like reels_director_options numbers them;
// "musicStart": "suggest" uses the song suggestion the agent gets.
import { execFileSync } from 'node:child_process';
import { ffprobeBin } from '../media-binaries.ts';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { parsePlan } from '../../shared/reelsmith/directorPlan.ts';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { h264RenderOptions, renderTimeline, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { runRecipe, type AnalyzeApi } from '../../src/reelsmith/runRecipe.ts';
import { defaultValues } from '../../src/reelsmith/setupForm.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';
import { directorRecipe } from '../../src/reelsmith/director/assembleDirector.ts';
import { resolveClipRef, songSuggestion } from '../../src/reelsmith/agent/directorTools.ts';

const FPS = 30;
const [folderArg, songArg, planArg, outArg] = process.argv.slice(2);
if (!folderArg || !songArg || !planArg || !outArg) throw new Error('usage: director-reel.mts <clips folder> <song file> <plan.json> <out.mp4>');
const work = mkdtempSync(join(tmpdir(), 'rs-director-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

const probe = (file: string) => JSON.parse(execFileSync(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { maxBuffer: 1 << 26 }).toString());
const link = (file: string, safe: string) => { try { linkSync(file, join(media, safe)); } catch { copyFileSync(file, join(media, safe)); } };
const folder = resolve(folderArg);
const files = readdirSync(folder).filter((f) => /\.(mov|mp4|m4v|jpe?g|png)$/i.test(f)).sort();
const assets: MediaAsset[] = files.map((f, i) => {
  const safe = `c${i}${extname(f).toLowerCase()}`;
  link(join(folder, f), safe);
  const p = probe(join(folder, f));
  const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  const image = /\.(jpe?g|png)$/i.test(f);
  return { id: `clip${i + 1}`, name: f, kind: image ? 'image' : 'video', src: `/media/uploads/${safe}`, durationInFrames: image ? 150 : Math.floor(Number(p.format.duration) * FPS), width: w, height: h } as MediaAsset;
});
const songFile = resolve(songArg);
link(songFile, `song${extname(songFile).toLowerCase()}`);
const song = { id: 'song', name: 'song', kind: 'audio', src: `/media/uploads/song${extname(songFile).toLowerCase()}`, durationInFrames: Math.floor(Number(probe(songFile).format.duration) * FPS) } as MediaAsset;
const byFile = (a: MediaAsset) => join(media, a.src.replace('/media/uploads/', ''));
const api: AnalyzeApi = {
  clipFeatures: (a, fps) => extractClipFeatures(byFile(a), a.id, fps, { maxSec: 10 }),
  musicGrid: async (a) => {
    const g = await analyzeBeatsFile(byFile(a));
    if (!g) return null;
    const drop = detectDropBeat(g.energyPerBeat, 4, 2, g.downbeatIndex);
    return { durationSec: g.durationSec, beatTimesSec: g.beatTimesSec, beatsPerBar: 4, downbeatIndex: g.downbeatIndex, loudestStartSec: g.loudestStartSec, dropSec: drop === null ? undefined : g.beatTimesSec[drop], energyPerBeat: g.energyPerBeat };
  },
};

const rawPlan = JSON.parse(readFileSync(resolve(planArg), 'utf8'));
const grid = await api.musicGrid(song);
if (rawPlan.musicStart === 'suggest' && grid) {
  const gaps = grid.beatTimesSec.slice(1).map((t, i) => t - grid.beatTimesSec[i]!).sort((a, b) => a - b);
  const bpm = Math.round(60 / gaps[Math.floor(gaps.length / 2)]!);
  const sug = songSuggestion(grid, bpm, grid.durationSec);
  console.log(`song: ${bpm} bpm, ${sug.note}${sug.energy ? `\n${sug.energy}` : ''}`);
  rawPlan.musicStart = sug.musicStart;
}
const visual = assets;
for (const s of rawPlan.sections ?? []) if (s.clips) s.clips = s.clips.map((r: string) => resolveClipRef(r, visual) ?? r);
const parsed = parsePlan({ ...rawPlan, music: 'song' });
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const plan = parsed.plan;
const recipe = directorRecipe(plan);
const values = defaultValues(recipe);
values.media.clips = assets.map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
values.media.music = [{ assetId: song.id, kind: 'audio' }];
const started = Date.now();
const out = await runRecipe(api, { recipe, values, assets: [...assets, song], fps: FPS, replaceTimeline: true, plan, seed: 7 });
if (!out.action) throw new Error(out.messages.join('; '));
for (const m of out.messages) console.log(`note: ${m}`);
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'pool', actions: [...assets, song].map((asset) => ({ type: 'addAsset', asset })) } as never);
h = historyReduce(h, bindTracks(out.action, activeTimeline(h.present)));
const doc = h.present;
const tl = activeTimeline(doc);
const submission = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
try {
  const p = submission.plan;
  const opts = await h264RenderOptions(p.media.codec, { preferSpeed: true });
  await withExportPermit(() => renderTimeline({ state: p.state, project: p.project, timelineId: p.timelineId, outputLocation: resolve(outArg), codec: p.media.codec, frameRange: p.frameRange, scale: p.scale, videoBitrate: p.videoBitrate, ...opts }));
} finally { await submission.cleanup(); }
console.log(`exported ${resolve(outArg)} (${(out.result.report.totalFrames / FPS).toFixed(1)} s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
rmSync(work, { recursive: true, force: true });
