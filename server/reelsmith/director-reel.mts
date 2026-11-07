// A director plan built and exported headlessly, through the same steps as the app (real clip analysis (no face finding: that needs a browser),
// beat detection, the director compiler, track binding, the export renderer). For checking director features (RS-1213
// graphics) on real footage without the agent in the loop.
//   node --import tsx server/reelsmith/director-reel.mts <clips folder> <song file> <plan.json> <out.mp4> [song-words.json]
// song-words.json: the song's transcript ([{ text, start, end }] in ms), as the app has it after import, so lines can
// come in with the singer.
// The plan names clips "#n" in the folder's sorted order (videos and photos), like reels_director_options numbers them;
// "musicStart": "suggest" uses the song suggestion the agent gets.
import { execFileSync } from 'node:child_process';
import { ffprobeBin } from '../media-binaries.ts';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
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
import { pickFindings } from '../../src/reelsmith/director/pickAudit.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { vocalPhraseStarts } from '../../src/reelsmith/director/vocalEntry.ts';
import { noSoundCopy } from './noSoundCopy.ts';
import { musicNote, songOnTimeline, withoutSong } from '../../src/reelsmith/exportMusic.ts';
import { reverseSpan } from './reverseClip.ts';
import { depthMapFor, depthPackInstalled } from './depthMap.ts';
import { depthTrackFor } from './depthTrack.ts';
import { withDepthMaps } from '../../src/reelsmith/depthMaps.ts';
import { smoothSlowSpan } from './smoothSlow.ts';
import { rewindClips } from '../../src/reelsmith/agent/rewindClips.ts';
import { smoothSlowClips } from '../../src/reelsmith/agent/smoothSlowClips.ts';
import { REEL_PRESETS, presetForCanvas } from '../../shared/reelsmith/instagramPreset.ts';
import type { ClipFeatures } from '../../src/reelsmith/assembler/scoring.ts';

const FPS = 30;
const [folderArg, songArg, planArg, outArg, wordsArg] = process.argv.slice(2);
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
const song = { id: 'song', name: basename(songFile), kind: 'audio', src: `/media/uploads/song${extname(songFile).toLowerCase()}`, durationInFrames: Math.floor(Number(probe(songFile).format.duration) * FPS) } as MediaAsset;
const byFile = (a: Pick<MediaAsset, 'src'>) => join(media, decodeURIComponent(a.src.replace('/media/uploads/', '')));
const upload = (name: string) => `/media/uploads/${encodeURIComponent(name)}`;
const analysed = new Map<string, ClipFeatures>();
const api: AnalyzeApi = {
  clipFeatures: async (a, fps) => { const f = await extractClipFeatures(byFile(a), a.id, fps, { maxSec: 10 }); if (f) analysed.set(a.id, f); return f; },
  musicGrid: async (a) => {
    const g = await analyzeBeatsFile(byFile(a));
    if (!g) return null;
    const drop = detectDropBeat(g.energyPerBeat, 4, 2, g.downbeatIndex);
    return { durationSec: g.durationSec, beatTimesSec: g.beatTimesSec, beatsPerBar: 4, downbeatIndex: g.downbeatIndex, loudestStartSec: g.loudestStartSec, dropSec: drop === null ? undefined : g.beatTimesSec[drop], energyPerBeat: g.energyPerBeat };
  },
  // the copies the app's build makes after the compile (finishBuild.ts): rewinds reversed, slow motion smoothed (RS-1259)
  reverseClip: async (src, startSec, frames, fps) => {
    const r = await reverseSpan(byFile({ src }), startSec, frames, fps);
    return { src: upload(r.name), width: r.width, height: r.height, frames: r.frames };
  },
  smoothSlow: async (src, startSec, rate, frames, fps) => {
    const r = await smoothSlowSpan(byFile({ src }), startSec, rate, frames, fps);
    return 'skipped' in r ? r : { src: upload(r.name), width: r.width, height: r.height, frames: r.frames };
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
const vocalStarts = wordsArg ? vocalPhraseStarts(JSON.parse(readFileSync(resolve(wordsArg), 'utf8'))) : [];
if (wordsArg) console.log(`singer: ${vocalStarts.length} phrases (${vocalStarts.slice(0, 12).join(', ')}${vocalStarts.length > 12 ? '...' : ''} s)`);
const out = await runRecipe(api, { recipe, values, assets: [...assets, song], fps: FPS, replaceTimeline: true, plan, seed: 7, ...(vocalStarts.length ? { vocalStarts } : {}) });
if (!out.action) throw new Error(out.messages.join('; '));
for (const m of out.messages) console.log(`note: ${m}`);
for (const e of out.result.report.lineEntries ?? []) console.log(`line with the singer: section ${e.section} comes in ${e.afterSec} s after its cut`);
for (const f of out.result.report.actionFits ?? []) console.log(`start moved for the movement: section ${f.section} ${assets.find((a) => a.id === f.assetId)?.name} ${f.shiftSec > 0 ? '+' : ''}${f.shiftSec} s`);
{
  const at = Date.now();
  const notes = [...await rewindClips(out.action.actions, api, FPS), ...await smoothSlowClips(out.action.actions, api, FPS)];
  for (const m of notes) console.log(`note: ${m}`);
  const smoothed = out.action.actions.flatMap((a) => {
    const from = a.type === 'add' ? (a.item.props as { rsSmooth?: { playbackRate: number } } | undefined)?.rsSmooth : undefined;
    return a.type === 'add' && from ? [`${((a.startFrame ?? 0) / FPS).toFixed(2)}-${(((a.startFrame ?? 0) + a.item.durationInFrames) / FPS).toFixed(2)} s at ${from.playbackRate}x`] : [];
  });
  if (smoothed.length) console.log(`slow motion: ${smoothed.length} clip${smoothed.length === 1 ? '' : 's'} smoothed in ${((Date.now() - at) / 1000).toFixed(1)} s: ${smoothed.join(', ')}`);
}
// RS-1255: the pick audit the build review runs in the app
console.log(`pick audit: ${out.result.report.momentUse?.length ?? 0} shots checked against ${analysed.size} analysed clips`);
for (const f of pickFindings({ used: out.result.report.momentUse ?? [], features: analysed, fps: FPS, usedIds: new Set(out.result.report.usedAssetIds), clipCount: assets.length, label: (id) => `#${assets.findIndex((a) => a.id === id) + 1}`, isImage: (id) => assets.find((a) => a.id === id)?.kind === 'image' })) console.log(`pick audit: ${f.issue} -> ${f.fix}`);
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'pool', actions: [...assets, song].map((asset) => ({ type: 'addAsset', asset })) } as never);
h = historyReduce(h, bindTracks(out.action, activeTimeline(h.present)));
const doc = h.present;
const tl = activeTimeline(doc);
// depth and sky maps, as the app's export fills them in (withDepthMaps), made here directly instead of through its route
// (the render reads the project's timeline, so the project carries them too)
const depthFetcher = async (url: string, init: RequestInit) => {
  const req = JSON.parse(String(init.body)) as { src: string; atSec?: number; fromSec?: number; toSec?: number };
  if (!depthPackInstalled()) return { ok: true, json: async () => ({ available: false }) };
  const source = join(media, decodeURIComponent(req.src.replace('/media/uploads/', '')));
  const r = url.endsWith('/depth-track') ? await depthTrackFor(source, req.fromSec!, req.toSec!) : await depthMapFor(source, req.atSec);
  return { ok: true, json: async () => ({ available: true, src: `/media/uploads/${encodeURIComponent(r.name)}` }) };
};
const exportState = await withDepthMaps({ ...tl, assets: doc.assets }, depthFetcher);
const exportProject = await withDepthMaps(doc, depthFetcher);
const submission = await acceptExportSubmission({ state: exportState, project: exportProject, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
try {
  const p = submission.plan;
  const opts = await h264RenderOptions(p.media.codec, { preferSpeed: true });
  await withExportPermit(() => renderTimeline({ state: p.state, project: p.project, timelineId: p.timelineId, outputLocation: resolve(outArg), codec: p.media.codec, frameRange: p.frameRange, scale: p.scale, videoBitrate: p.videoBitrate, ...opts }));
} finally { await submission.cleanup(); }
// the app's "Make it Instagram-ready": check the file against the Instagram rules, fix only the sound when that is all that fails
{
  const preset = presetForCanvas(REEL_PRESETS['instagram-reel']!, tl.width, tl.height) ?? REEL_PRESETS['instagram-reel']!;
  const fin = await finalizeForInstagram(resolve(outArg), preset);
  console.log(`instagram check: ${fin.ok ? (fin.reencoded ? 'fixed (sound re-encoded)' : 'passed as rendered') : 'FAILED'}`);
  for (const c of (fin.second ?? fin.first).checks) console.log(`  ${c.id} ${c.status} ${c.detail}`);
}
// RS-1241/1264: the copy for Instagram's music, as the app's export makes it: the sound rendered again without the song
{
  const s = songOnTimeline(tl);
  if (s) {
    const { state, project } = withoutSong(s.id, exportState, exportProject, tl.id);
    const stem = join(media, 'no-song-sound.mp3');
    const sub = await acceptExportSubmission({ state, project, timelineId: tl.id, format: 'audio', codec: 'mp3' } as never);
    try { await withExportPermit(() => renderTimeline({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, outputLocation: stem, codec: 'mp3' })); } finally { await sub.cleanup(); }
    const copy = await noSoundCopy(resolve(outArg), stem);
    console.log(`no-song copy: ${copy.name} (${copy.kept === 'sound' ? 'voice and natural sound kept' : 'no sound'}). ${musicNote(s)}`);
  }
}
console.log(`exported ${resolve(outArg)} (${(out.result.report.totalFrames / FPS).toFixed(1)} s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
rmSync(work, { recursive: true, force: true });
