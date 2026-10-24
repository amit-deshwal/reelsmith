// Reverse clip end to end: a clip relinked to its reversed copy exports backwards, picture and sound, through the real
// render pipeline (the composition the Player also plays), from frame 0 of the copy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline } from '../../src/editor/types.ts';
import { reverseActions, reverseSpanOf } from '../../src/reelsmith/clipOps.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { reverseSpan } from './reverseClip.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimeline } from '../../remotion/render.mjs';

const work = mkdtempSync(join(tmpdir(), 'rs-reverse-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // 4 s at 30 fps: frame n has brightness 10 + 2n; the tone grows louder over time
  execFileSync(ffmpegBin(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=360x640:r=30:d=4,format=gray,geq=lum=10+2*N',
    '-f', 'lavfi', '-i', 'aevalsrc=0.25*t*sin(2*PI*440*t):s=48000:d=4',
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', join(media, 'ramp.mp4')]);
  const asset = { id: 'a0', name: 'ramp.mp4', kind: 'video' as const, src: '/media/uploads/ramp.mp4', durationInFrames: 120, width: 360, height: 640 };
  // the clip shows source frames 30-89 (1-3 s)
  const clip = { id: 'c', track: 'V1', kind: 'video', name: 'ramp', src: asset.src, sourceAssetId: 'a0', durationInFrames: 60, srcInFrame: 30, width: 360, height: 640, volume: 1 };
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'addAsset', asset } as never);
  h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: 360, height: 640, fit: 'cover' }, { type: 'add', startFrame: 0, item: clip }] } as never);
  const exportOf = async (history: History, name: string) => {
    const tl = activeTimeline(history.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: history.present.assets }, project: history.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    const out = join(work, name);
    try {
      await renderTimeline({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, outputLocation: out, codec: 'h264' });
    } finally {
      await sub.cleanup();
    }
    const lumas = [...execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-'])];
    const pcm = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vn', '-ac', '1', '-f', 's16le', '-']);
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const rms = (from: number, to: number) => Math.sqrt(samples.subarray(from, to).reduce((sum, v) => sum + v * v, 0) / Math.max(1, to - from));
    return { lumas, loud: [rms(0, samples.length / 2), rms(samples.length / 2, samples.length)] as const };
  };
  const forwards = await exportOf(h, 'forwards.mp4');

  const item = activeTimeline(h.present).items.find((i) => i.id === 'c')!;
  const span = reverseSpanOf(item, 30);
  const rev = await reverseSpan(join(media, 'ramp.mp4'), span.startSec, span.frames, 30);
  h = historyReduce(h, { type: 'batch', label: 'Reverse', actions: reverseActions(item, { src: `/media/uploads/${rev.name}`, width: rev.width, height: rev.height, frames: rev.frames }) });
  const backwards = await exportOf(h, 'backwards.mp4');

  assert.equal(forwards.lumas.length, 60);
  assert.equal(backwards.lumas.length, 60);
  assert.ok(forwards.lumas[0]! < forwards.lumas[59]! - 100, 'the forwards export brightens over time');
  // every exported frame of the reversed clip is the forwards export's frame from the other end (across the 1 s join too)
  backwards.lumas.forEach((luma, f) => {
    const mirror = forwards.lumas[59 - f]!;
    assert.ok(Math.abs(luma - mirror) <= 3, `reversed frame ${f} is forwards frame ${59 - f} (luma ${luma} vs ${mirror})`);
  });
  assert.ok(forwards.loud[1] > forwards.loud[0] * 1.2, 'the forwards sound grows louder');
  assert.ok(backwards.loud[0] > backwards.loud[1] * 1.2, `the exported sound is backwards: loud first (${backwards.loud[0].toFixed(0)} vs ${backwards.loud[1].toFixed(0)})`);
  console.log('reverseRender.verify: ok');
} finally {
  rmSync(work, { recursive: true, force: true });
}
