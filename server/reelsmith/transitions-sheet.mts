// Contact sheet of Reels transitions on real clips: each row is one transition at progress 0, 25, 50, 75 and 100 %.
//   node --import tsx server/reelsmith/transitions-sheet.mts <clipA> <clipB> <out.jpg> [type ...] [--dir=left|right|up|down] [--seconds=N] [--points=0.25,0.5,0.75]
// It renders through the app's own export renderer (remotion), and checks that progress 0 and 100 % are the untouched
// pictures (the same frame of the same timeline with a hard cut instead of the transition).
import { execFileSync } from 'node:child_process';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, defaultTransitionSeconds, REEL_TRANSITION_SECONDS, type MediaAsset, type TransitionDirection, type TransitionType } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { renderTimelineStills } from '../../remotion/render.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=') as [string, string]));
const pos = args.filter((a) => !a.startsWith('--'));
const [clipA, clipB, out] = pos.map((p) => resolve(p));
if (!clipA || !clipB || !out) throw new Error('usage: transitions-sheet.mts <clipA> <clipB> <out.jpg> [type ...] [--dir=left] [--seconds=N]');
const types = (pos.slice(3).length ? pos.slice(3) : Object.keys(REEL_TRANSITION_SECONDS)) as TransitionType[];
const direction = (flags.dir ?? 'left') as TransitionDirection;
const FPS = 30;
const work = mkdtempSync(join(tmpdir(), 'rs-trsheet-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

function asset(file: string, i: number): MediaAsset {
  const safe = `f${i}${extname(file).toLowerCase()}`;
  try { linkSync(file, join(media, safe)); } catch { copyFileSync(file, join(media, safe)); }
  const p = JSON.parse(execFileSync(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = p.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const rot = Math.abs(Number(v.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  return { id: `a${i}`, name: `clip${i}`, kind: 'video', src: `/media/uploads/${safe}`, durationInFrames: Math.floor(Number(p.format.duration) * FPS), width: w, height: h } as MediaAsset;
}
const assets = [asset(clipA, 0), asset(clipB, 1)];

const CUT = 60;
function build(type: TransitionType | null, seconds: number) {
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((a) => ({ type: 'addAsset', asset: a })) } as never);
  h = historyReduce(h, { type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' } as never);
  assets.forEach((a, i) => {
    h = historyReduce(h, { type: 'add', startFrame: i * CUT, item: { id: `v${i}`, track: 'V1', kind: 'video', name: a.name, src: a.src, durationInFrames: CUT, sourceAssetId: a.id, srcInFrame: 90 } } as never);
  });
  const length = Math.round(seconds * FPS);
  if (type) h = historyReduce(h, { type: 'addTransition', id: 't', incomingItemId: 'v1', transType: type, durationInFrames: length } as never);
  const tl = activeTimeline(h.present);
  const t = tl.transitions?.[0];
  if (t) h = historyReduce(h, { type: 'setTransition', id: 't', patch: { direction } } as never);
  return h.present;
}

async function stills(type: TransitionType | null, seconds: number, frames: number[]): Promise<Buffer[]> {
  const doc = build(type, seconds);
  const tl = activeTimeline(doc);
  const sub = await acceptExportSubmission({ state: { ...tl, assets: doc.assets }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  try {
    const r = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames }) as Array<{ frame: number; base64: string }>;
    return frames.map((f) => Buffer.from(r.find((x) => x.frame === f)!.base64, 'base64'));
  } finally { await sub.cleanup(); }
}

const mad = (a: Buffer, b: Buffer, name: string) => {
  const ja = join(work, `${name}-a.jpg`), jb = join(work, `${name}-b.jpg`);
  writeFileSync(ja, a); writeFileSync(jb, b);
  const o = execFileSync(ffmpegBin(), ['-v', 'error', '-i', ja, '-i', jb, '-filter_complex', '[1][0]scale2ref[b][a];[a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return Number(/YAVG=([\d.]+)/.exec(o)?.[1] ?? NaN);
};

const rows: string[] = [];
let failed = 0;
for (const type of types) {
  const seconds = flags.seconds ? Number(flags.seconds) : defaultTransitionSeconds(type) ?? 0.4;
  const len = Math.round(seconds * FPS);
  const from = CUT - Math.floor(len / 2);
  const points = flags.points ? flags.points.split(',').map(Number) : [0.25, 0.5, 0.75];
  const frames = [0, ...points, 1].map((p) => from + Math.min(len - 1, Math.round(p * len)));
  const first = from, last = from + len;
  const withT = await stills(type, seconds, [first, ...frames.slice(1, -1), last]);
  const plain = await stills(null, seconds, [first, last]);
  const d0 = mad(withT[0]!, plain[0]!, `${type}-0`), d1 = mad(withT.at(-1)!, plain[1]!, `${type}-1`);
  const ok = d0 < 3 && d1 < 3; // the first frame sits a hair inside the transition: cross-dissolve reads 1.79 here
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${type.padEnd(16)} ${seconds}s  start diff ${d0.toFixed(2)}  end diff ${d1.toFixed(2)}`);
  const files = withT.map((b, i) => { const f = join(work, `${type}-${i}.jpg`); writeFileSync(f, b); return f; });
  const row = join(work, `row-${type}.jpg`);
  execFileSync(ffmpegBin(), ['-y', '-v', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=216:-1[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${files.length}`, '-frames:v', '1', row]);
  rows.push(row);
}
if (rows.length === 1) copyFileSync(rows[0]!, out);
else execFileSync(ffmpegBin(), ['-y', '-v', 'error', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', `${rows.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${rows.length}`, '-frames:v', '1', out]);
console.log(`sheet: ${out}  (rows: ${types.join(', ')})`);
rmSync(work, { recursive: true, force: true });
if (failed) { console.error(`${failed} transition(s) changed the untouched ends`); process.exit(1); }
