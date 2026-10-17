// Showcase reels of the Reels effects, looks and transitions on real clips, exported through the app's own pipeline
// and finalised for Instagram (9:16, 1080x1920).
//   npx tsx server/reelsmith/showcase.mts <folder with clips> <output folder> [effects-1] [effects-2] [looks] [transitions]
// Each segment shows the name of what it demonstrates. Nothing is written outside the output folder and a temp folder.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { REEL_FX_ORDER, REEL_FX_EFFECTS } from '../../src/gl/fx/reelFx.ts';
import { REEL_LOOKS, lookEffects } from '../../src/reelsmith/looks.ts';
import { REEL_PRESETS, presetForCanvas } from '../../shared/reelsmith/instagramPreset.ts';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, REEL_TRANSITION_SECONDS, TRANSITION_LABELS, type MediaAsset, type TransitionType } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { h264RenderOptions, renderTimeline, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';

const FPS = 30;
const [folderArg, outArg, ...which] = process.argv.slice(2);
if (!folderArg || !outArg) throw new Error('usage: showcase.mts <clips folder> <output folder> [effects-1] [effects-2] [looks] [transitions]');
const folder = resolve(folderArg);
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'rs-showcase-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

// ---- clips: the phone videos in the folder, probed once -----------------------------------------
const files = readdirSync(folder).filter((f) => /\.(mov|mp4|m4v)$/i.test(f)).sort();
const assets: MediaAsset[] = files.map((f, i) => {
  const safe = `f${i}${extname(f).toLowerCase()}`;
  try { linkSync(join(folder, f), join(media, safe)); } catch { copyFileSync(join(folder, f), join(media, safe)); }
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(folder, f)], { maxBuffer: 1 << 26 }).toString());
  const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  return { id: `a${i}`, name: f, kind: 'video', src: `/media/uploads/${safe}`, durationInFrames: Math.floor(Number(p.format.duration) * FPS), width: w, height: h } as MediaAsset;
});
// portrait clips that are long enough, mixed so neighbours look different
function brightness(a: MediaAsset): number {
  const file = join(media, a.src.split('/').pop()!);
  try {
    const at = (sec: string) => Number(/YAVG=([\d.]+)/.exec(execFileSync('ffmpeg', ['-v', 'error', '-ss', sec, '-i', file, '-frames:v', '1', '-vf', 'scale=96:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString())?.[1] ?? 128);
    return Math.max(at('2'), at('3'));
  } catch { return 128; }
}
// portrait, long enough, and neither a white-out nor a black frame (they hide what an effect does)
const usable = assets.filter((a) => (a.height ?? 0) > (a.width ?? 0) && a.durationInFrames > 150).filter((a) => { const y = brightness(a); return y > 45 && y < 175; });
console.log(`using ${usable.length} of ${assets.length} clips`);
if (usable.length < 6) throw new Error(`need at least 6 portrait clips, found ${usable.length}`);
const pick = (i: number, prefer?: string) => (prefer ? assets.find((a) => a.name === prefer) : undefined) ?? usable[(i * 7) % usable.length]!;

// ---- timeline builder ------------------------------------------------------------------------------
interface Segment { clip?: string; label: string; sub?: string; frames: number; effects?: Array<{ id: string; assetId: string; overrides?: Record<string, number | number[]> }>; transition?: TransitionType }

function build(segments: Segment[]): History {
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((asset) => ({ type: 'addAsset', asset })) } as never);
  h = historyReduce(h, { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' } as never);
  const adds: unknown[] = [];
  const later: unknown[] = [];
  let start = 0;
  segments.forEach((seg, i) => {
    const a = pick(i, seg.clip);
    const id = `s${i}`;
    adds.push({ type: 'add', startFrame: start, item: { id, track: 'V1', kind: 'video', name: a.name, src: a.src, durationInFrames: seg.frames, sourceAssetId: a.id, srcInFrame: 45 + (i % 3) * 20, volume: 0 } });
    if (seg.effects) later.push({ type: 'setEffects', id, effects: seg.effects, defs: [] });
    if (seg.transition && i > 0) later.push({ type: 'addTransition', id: `t${i}`, incomingItemId: id, transType: seg.transition });
    const textStart = start + (seg.transition ? Math.round((REEL_TRANSITION_SECONDS[seg.transition] ?? 0.4) * FPS) : 0);
    const textFrames = Math.max(15, seg.frames - (textStart - start) - 6);
    const label = (itemId: string, lane: string, text: string, size: number, color: string, weight: number, y: number) => adds.push({
      type: 'add', startFrame: textStart,
      item: { id: itemId, track: lane, kind: 'text', name: text.slice(0, 24), durationInFrames: textFrames, width: 1080, height: 1920, props: { text, fontSize: size, color, fontWeight: weight, align: 'center' }, transform: { y } },
    });
    label(`l${i}`, 'V2', seg.label, 80, '#ffffff', 800, 22);
    if (seg.sub) label(`m${i}`, 'V3', seg.sub, 38, '#ffe9c2', 600, 29);
    start += seg.frames;
  });
  const batch = { type: 'batch', label: 'showcase', actions: [...adds, ...later] } as never;
  return historyReduce(h, bindTracks(batch, activeTimeline(h.present)) as never);
}

async function exportReel(name: string, segments: Segment[]): Promise<string> {
  console.log(`\n== ${name}: ${segments.length} segments`);
  const h = build(segments);
  const doc = h.present;
  const tl = activeTimeline(doc);
  const end = Math.max(...tl.items.map((i) => i.startFrame + i.durationInFrames));
  const raw = join(work, `${name}.mp4`);
  const t0 = Date.now();
  const submission = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  try {
    const plan = submission.plan;
    const opts = await h264RenderOptions(plan.media.codec, { preferSpeed: true });
    await withExportPermit(() => renderTimeline({ state: plan.state, project: plan.project, timelineId: plan.timelineId, outputLocation: raw, codec: plan.media.codec, frameRange: plan.frameRange, scale: plan.scale, videoBitrate: plan.videoBitrate, ...opts }));
  } finally { await submission.cleanup(); }
  const fin = await finalizeForInstagram(raw, presetForCanvas(REEL_PRESETS['instagram-reel']!, tl.width, tl.height) ?? REEL_PRESETS['instagram-reel']!);
  const dest = join(outDir, `${name}.mp4`);
  copyFileSync(raw, dest);
  const checks = (fin.second ?? fin.first).checks;
  console.log(`   ${(end / FPS).toFixed(1)} s, ${(statSync(dest).size / 1e6).toFixed(1)} MB, rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s, Instagram checks ${checks.filter((c) => c.status === 'PASS').length}/${checks.length} pass${fin.reencoded ? ' (re-encoded)' : ''}`);
  for (const c of checks.filter((x) => x.status !== 'PASS')) console.log(`   ${c.id} ${c.status} ${c.detail}`);
  return dest;
}

// ---- the four reels --------------------------------------------------------------------------------
// short on-screen taglines, and a clip that shows the effect (lights for glow and flares, a face for the mist)
const TAGLINE: Record<string, { sub: string; clip?: string }> = {
  'builtin:fx-halation': { sub: 'Warm glow around highlights', clip: 'IMG_8776.MOV' },
  'builtin:fx-pro-mist': { sub: 'Dreamy diffusion glow', clip: 'IMG_0622.MOV' },
  'builtin:fx-anamorphic-flare': { sub: 'Blue cinema streaks from lights', clip: 'IMG_8776.MOV' },
  'builtin:fx-light-rays': { sub: 'Rays streaming from the light', clip: 'IMG_8776.MOV' },
  'builtin:fx-zoom-blur': { sub: 'Punch-in streaks' },
  'builtin:fx-lens-distortion': { sub: 'Barrel warp with a colour fringe' },
  'builtin:fx-soft-vignette': { sub: 'Draws the eye in' },
  'builtin:fx-fine-grain': { sub: 'Fine film grain' },
  'builtin:fx-film-damage': { sub: 'Dust, scratches and flicker' },
  'builtin:fx-vhs': { sub: 'Worn tape playback' },
  'builtin:fx-cartoon': { sub: 'Flat colour with ink outlines' },
  'builtin:fx-water-ripple': { sub: 'Heat haze wobble' },
  'builtin:fx-cinema-bars': { sub: 'Widescreen letterbox' },
  'builtin:fx-swirl': { sub: 'A twist around a point' },
};
const effectSeg = (id: string): Segment => ({
  label: REEL_FX_EFFECTS[id]!.name, sub: TAGLINE[id]?.sub, ...(TAGLINE[id]?.clip ? { clip: TAGLINE[id]!.clip } : {}),
  frames: 75, effects: [{ id: `fx_${id}`, assetId: id, overrides: {} }],
});
const EFFECT_GROUPS: Record<string, string[]> = {
  'effects-1': ['builtin:fx-halation', 'builtin:fx-pro-mist', 'builtin:fx-anamorphic-flare', 'builtin:fx-light-rays', 'builtin:fx-zoom-blur', 'builtin:fx-lens-distortion', 'builtin:fx-soft-vignette'],
  'effects-2': ['builtin:fx-fine-grain', 'builtin:fx-film-damage', 'builtin:fx-vhs', 'builtin:fx-cartoon', 'builtin:fx-water-ripple', 'builtin:fx-cinema-bars', 'builtin:fx-swirl'],
};
for (const group of Object.values(EFFECT_GROUPS)) for (const id of group) if (!(REEL_FX_ORDER as readonly string[]).includes(id)) throw new Error(`${id} missing from REEL_FX_ORDER`);

const jobs: Record<string, () => Segment[]> = {
  'effects-1': () => EFFECT_GROUPS['effects-1']!.map(effectSeg),
  'effects-2': () => EFFECT_GROUPS['effects-2']!.map(effectSeg),
  looks: () => REEL_LOOKS.map((look) => ({ label: look.name, sub: look.mood, frames: 84, effects: lookEffects(look) })),
  transitions: () => (Object.keys(REEL_TRANSITION_SECONDS) as TransitionType[]).reduce<Segment[]>((acc, type) => [...acc, { label: TRANSITION_LABELS[type], sub: 'transition into this shot', frames: 66, transition: type }], [{ label: 'Transitions', sub: '10 new Reels transitions', frames: 60 }]),
};
const names: Record<string, string> = { 'effects-1': 'reelsmith_effects_1_glow_and_lens', 'effects-2': 'reelsmith_effects_2_texture_and_style', looks: 'reelsmith_looks', transitions: 'reelsmith_transitions' };
const todo = which.length ? which : Object.keys(jobs);
const done: string[] = [];
for (const key of todo) {
  if (!jobs[key]) throw new Error(`unknown reel ${key}; choose from ${Object.keys(jobs).join(', ')}`);
  done.push(await exportReel(names[key]!, jobs[key]!()));
}
console.log(`\nexported:\n${done.join('\n')}`);
if (existsSync(work)) rmSync(work, { recursive: true, force: true });
