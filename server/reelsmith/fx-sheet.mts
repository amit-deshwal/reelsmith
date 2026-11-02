// Contact sheet of per-clip effects on a real clip: the original first, then each effect at its default settings.
// Pass `look:<id>` (or `looks` for all of them) to render Reel looks instead of single effects.
//   node --import tsx server/reelsmith/fx-sheet.mts <clip> <out.jpg> [effect id ...] [--at=FRAME] [--cols=N]
// Rendered through the app's own export renderer (remotion), so what you see is what an export draws.
import { execFileSync } from 'node:child_process';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { REEL_FX_ORDER } from '../../src/gl/fx/reelFx.ts';
import { lookById, lookEffects, REEL_LOOKS } from '../../src/reelsmith/looks.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { renderTimelineStills } from '../../remotion/render.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=') as [string, string]));
const pos = args.filter((a) => !a.startsWith('--'));
const clip = pos[0] ? resolve(pos[0]) : '';
const out = pos[1] ? resolve(pos[1]) : '';
if (!clip || !out) throw new Error('usage: fx-sheet.mts <clip> <out.jpg> [effect id ...] [--at=FRAME] [--cols=N]');
const wanted = pos.slice(2).flatMap((id) => (id === 'looks' ? REEL_LOOKS.map((l) => `look:${l.id}`) : [id]));
const ids = wanted.length ? wanted.map((id) => (id.startsWith('builtin:') || id.startsWith('look:') ? id : `builtin:fx-${id}`)) : [...REEL_FX_ORDER];
const FPS = 30;
const at = Number(flags.at ?? 20);
const cols = Number(flags.cols ?? 4);
const work = mkdtempSync(join(tmpdir(), 'rs-fxsheet-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

const safe = `f0${extname(clip).toLowerCase()}`;
try { linkSync(clip, join(media, safe)); } catch { copyFileSync(clip, join(media, safe)); }
const p = JSON.parse(execFileSync(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', clip]).toString());
const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
const asset = { id: 'a0', name: 'clip', kind: 'video', src: `/media/uploads/${safe}`, durationInFrames: Math.floor(Number(p.format.duration) * FPS), width: w, height: h } as MediaAsset;

async function still(effectId: string | null): Promise<Buffer> {
  let hist: History = { past: [], present: emptyProjectDoc(), future: [] };
  hist = historyReduce(hist, { type: 'addAsset', asset } as never);
  hist = historyReduce(hist, { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' } as never);
  hist = historyReduce(hist, { type: 'add', startFrame: 0, item: { id: 'v0', track: 'V1', kind: 'video', name: 'clip', src: asset.src, durationInFrames: 60, sourceAssetId: asset.id, srcInFrame: 60 } } as never);
  if (effectId?.startsWith('look:')) hist = historyReduce(hist, { type: 'setEffects', id: 'v0', effects: lookEffects(lookById(effectId.slice(5))!), defs: [] } as never);
  else if (effectId) hist = historyReduce(hist, { type: 'setEffects', id: 'v0', effects: [{ id: `fx_${effectId}`, assetId: effectId, overrides: {} }], defs: [] } as never);
  const doc = hist.present;
  const tl = activeTimeline(doc);
  const sub = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  try {
    const r = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames: [at] }) as Array<{ frame: number; base64: string }>;
    return Buffer.from(r[0]!.base64, 'base64');
  } finally { await sub.cleanup(); }
}

const tiles: string[] = [];
for (const id of [null, ...ids]) {
  const f = join(work, `${tiles.length}.jpg`);
  writeFileSync(f, await still(id));
  tiles.push(f);
  console.log(`rendered ${id ?? 'original'}`);
}
const rows: string[] = [];
for (let i = 0; i < tiles.length; i += cols) {
  const group = tiles.slice(i, i + cols);
  while (group.length < cols) group.push(group[0]!);   // pad the last row with the original
  const row = join(work, `row-${i}.jpg`);
  execFileSync(ffmpegBin(), ['-y', '-v', 'error', ...group.flatMap((f) => ['-i', f]), '-filter_complex', `${group.map((_, k) => `[${k}:v]scale=270:-1[s${k}]`).join(';')};${group.map((_, k) => `[s${k}]`).join('')}hstack=inputs=${group.length}`, '-frames:v', '1', row]);
  rows.push(row);
}
if (rows.length === 1) copyFileSync(rows[0]!, out);
else execFileSync(ffmpegBin(), ['-y', '-v', 'error', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', `${rows.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${rows.length}`, '-frames:v', '1', out]);
console.log(`sheet: ${out}  (order: original, ${ids.map((i) => i.replace('builtin:fx-', '').replace('look:', 'look ')).join(', ')})`);
rmSync(work, { recursive: true, force: true });
