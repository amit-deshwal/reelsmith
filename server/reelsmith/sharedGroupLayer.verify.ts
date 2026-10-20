// A run of contiguous moments of one clip shares one decoder (SharedVideoVisualGroup). It must paint at its own layer:
// it was painted under everything, so a director reel's black canvas (lowest track) covered the whole section, in the
// agent's review frames and in the export. Real render through the still renderer, on a generated clip.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline } from '../../src/editor/types.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';

const work = mkdtempSync(join(tmpdir(), 'rs-shared-layer-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // a bright mid-grey clip: any black or white frame is a layering mistake
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x808080:s=360x640:r=30:d=4', '-pix_fmt', 'yuv420p', join(media, 'grey.mp4')]);
  const asset = { id: 'a0', name: 'grey.mp4', kind: 'video' as const, src: '/media/uploads/grey.mp4', durationInFrames: 120, width: 360, height: 640 };
  const clip = (id: string, at: number, srcIn: number) => ({ type: 'add', startFrame: at, item: { id, track: 'V2', kind: 'video', name: 'grey', src: asset.src, sourceAssetId: 'a0', durationInFrames: 30, srcInFrame: srcIn, width: 360, height: 640, volume: 1 } });
  const solid = (id: string, track: string, at: number, len: number, color: string) => ({ type: 'add', startFrame: at, item: { id, track, kind: 'solid', name: id, durationInFrames: len, width: 360, height: 640, props: { color } } });
  const actions = [
    { type: 'setCanvas', width: 360, height: 640, fit: 'cover' },
    solid('canvas', 'V1', 0, 120, '#000000'), // under everything, like the director's black canvas
    clip('a', 0, 0), clip('b', 30, 30), // frames 0-60: one shared run (srcIn continues)
    clip('c', 60, 60), clip('d', 90, 90), // frames 60-120: another run...
    solid('top', 'V3', 60, 60, '#ffffff'), // ...under a white solid on the track above
  ];
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'addAsset', asset } as never);
  h = historyReduce(h, bindTracks({ type: 'batch', label: 'layers', actions } as never, activeTimeline(h.present)));
  const tl = activeTimeline(h.present);
  const sub = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
  try {
    const stills = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames: [15, 45, 75] }) as Array<{ frame: number; base64: string }>;
    const luma = (frame: number) => {
      const jpg = join(work, `f${frame}.jpg`);
      execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', 'pipe:0', jpg], { input: Buffer.from(stills.find((s) => s.frame === frame)!.base64, 'base64') });
      return execFileSync(ffmpegBin(), ['-v', 'error', '-i', jpg, '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-'])[0]!;
    };
    for (const f of [15, 45]) assert.ok(Math.abs(luma(f) - 128) < 30, `frame ${f}: the shared run shows over the black canvas (luma ${luma(f)})`);
    assert.ok(luma(75) > 230, `frame 75: the white solid on the track above stays on top of the shared run (luma ${luma(75)})`);
  } finally {
    await sub.cleanup();
  }
  console.log('sharedGroupLayer.verify: ok');
} finally {
  rmSync(work, { recursive: true, force: true });
}
