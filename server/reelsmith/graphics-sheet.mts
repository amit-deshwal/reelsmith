// Contact sheet of the director's graphics (RS-1213) over a real clip: one row per graphic, frames across its length.
//   node --import tsx server/reelsmith/graphics-sheet.mts <clip> <out.jpg> [graphic id ...] [--seconds=4] [--cols=5] [--ratio=9:16]
// Rendered through the app's own export renderer (remotion), so what you see is what an export draws.
import { execFileSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { GRAPHICS } from '../../src/reelsmith/director/graphics.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { renderTimelineStills } from '../../remotion/render.mjs';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';

/** Words and params that show each graphic off (the director gets the user's own words instead). */
const SAMPLES: Record<string, { text?: string; params?: Record<string, unknown> }> = {
  'route-map': { text: 'Mumbai / Lonavala / Harishchandragad', params: { sub: '212 km' } },
  'boarding-pass': { text: 'Delhi / Goa', params: { sub: '21 Oct · window seat', stamp: 'finally' } },
  'chat-bubbles': { text: 'are we there yet / >2 more hours / 😭 / >worth it, trust me', params: { name: 'Rahul', every: 1.5 } },
  notification: { text: 'Mom / where are you?? / Mom / pick up the phone / Boss / see you monday?', params: { every: 1.5 } },
  annotate: { text: "that's me", params: { shape: 'arrow' } },
  sticker: { text: '🔥 / OMG / 😂' },
  confetti: {},
  countdown: { text: '3 / 2 / 1 / GO' },
  'hud-stats': { text: 'ALT 1,424 m / DIST 18 km / TIME 6 h' },
  'chapter-bar': { text: 'Day 1 / Day 2 / Summit' },
  'loading-bar': { text: 'loading weekend... / 100% vacation' },
  'cta-card': { text: 'Pune Trekkers / Join free on WhatsApp / link in bio', params: { ask: 'save-share', accent: '#244936' } },
  'handle-tag': { text: '@punetrekkers', params: { accent: '#ffb020' } },
  camcorder: { text: 'OCT 21 2026' },
  'type-stack': { text: 'one / last / trip' },
};

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=') as [string, string]));
const pos = args.filter((a) => !a.startsWith('--'));
const clip = pos[0] ? resolve(pos[0]) : '';
const out = pos[1] ? resolve(pos[1]) : '';
if (!clip || !out) throw new Error('usage: graphics-sheet.mts <clip> <out.jpg> [graphic id ...] [--seconds=4] [--cols=5] [--ratio=9:16]');
const ids = pos.length > 2 ? pos.slice(2) : GRAPHICS.map((g) => g.id);
const FPS = 30;
const seconds = Number(flags.seconds ?? 4);
const cols = Number(flags.cols ?? 5);
const [W, H] = flags.ratio === '16:9' ? [1920, 1080] : [1080, 1920];
const work = mkdtempSync(join(tmpdir(), 'rs-gfxsheet-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

const safe = `f0${extname(clip).toLowerCase()}`;
try { linkSync(clip, join(media, safe)); } catch { copyFileSync(clip, join(media, safe)); }
const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', clip]).toString());
const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
const asset = { id: 'a0', name: 'clip', kind: 'video', src: `/media/uploads/${safe}`, durationInFrames: Math.floor(Number(p.format.duration) * FPS), width: w, height: h } as MediaAsset;
const len = Math.round(seconds * FPS);
const beats = Array.from({ length: Math.ceil(seconds * 2) + 2 }, (_, i) => i * 0.5);

async function row(id: string): Promise<string> {
  const def = GRAPHICS.find((g) => g.id === id);
  if (!def) throw new Error(`unknown graphic ${id}`);
  const sample = SAMPLES[id] ?? {};
  const params = Object.fromEntries(def.params.map((x) => [x.id, x.default]));
  const props: Record<string, unknown> = { ...params, ...sample.params, items: (sample.text ?? '').split('/').map((s) => s.trim()).filter(Boolean), total: seconds, beats, sections: [0, seconds / 3, (2 * seconds) / 3] };
  for (const k of ['x', 'y']) if (typeof props[k] === 'number' && (props[k] as number) < 0) delete props[k];
  if (def.focus) Object.assign(props, { tx: 0.5, ty: 0.38, tr: 0.1 });
  if (id === 'type-stack') props.background = 'none';
  let hist: History = { past: [], present: emptyProjectDoc(), future: [] };
  hist = historyReduce(hist, { type: 'addAsset', asset } as never);
  hist = historyReduce(hist, { type: 'setCanvas', width: W, height: H, fit: 'cover' } as never);
  const batch = bindTracks({ type: 'batch', label: 'sheet', actions: [
    { type: 'add', startFrame: 0, item: { id: 'v0', track: 'V1', kind: 'video', name: 'clip', src: asset.src, durationInFrames: len, sourceAssetId: asset.id, srcInFrame: 30 } },
    { type: 'add', startFrame: 0, item: { id: 'g0', track: 'T30', kind: 'motion-graphic', name: def.name, code: def.code, durationInFrames: len, width: W, height: H, props } },
  ] } as never, activeTimeline(hist.present));
  hist = historyReduce(hist, batch as never);
  const doc = hist.present;
  const tl = activeTimeline(doc);
  const sub = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  const frames = Array.from({ length: cols }, (_, i) => Math.min(len - 1, Math.round(((i + 0.6) / cols) * len)));
  try {
    const r = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames }) as Array<{ frame: number; base64: string }>;
    const tiles = r.map((x, i) => { const f = join(work, `${id}-${i}.jpg`); writeFileSync(f, Buffer.from(x.base64, 'base64')); return f; });
    const file = join(work, `row-${id}.jpg`);
    const tw = W > H ? 384 : 216;
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...tiles.flatMap((f) => ['-i', f]), '-filter_complex', `${tiles.map((_, k) => `[${k}:v]scale=${tw}:-2[s${k}]`).join(';')};${tiles.map((_, k) => `[s${k}]`).join('')}hstack=inputs=${tiles.length}`, '-frames:v', '1', file]);
    return file;
  } finally { await sub.cleanup(); }
}

const rows: string[] = [];
for (const id of ids) { rows.push(await row(id)); console.log(`rendered ${id}`); }
if (rows.length === 1) copyFileSync(rows[0]!, out);
else execFileSync('ffmpeg', ['-y', '-v', 'error', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', `${rows.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${rows.length}`, '-frames:v', '1', out]);
console.log(`sheet: ${out}  (rows: ${ids.join(', ')})`);
rmSync(work, { recursive: true, force: true });
