// Captions behind the speaker, rendered: the same frame with no captions, with the words in front, and with the words
// behind the people. Where the words cross a person the behind render shows the person (it matches the no-caption
// frame); elsewhere it shows the words (it matches the in-front frame). Real render, real person matte, on the
// captioned-story poster (a group selfie).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import type { CaptionsData } from '../../src/captions/types.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline } from '../../src/editor/types.ts';
import { captionsFor } from '../../src/reelsmith/captionStyles.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';

const POSTER = fileURLToPath(new URL('./fixtures/group-selfie.jpg', import.meta.url));
const W = 360, H = 640, FRAME = 20;
const work = mkdtempSync(join(tmpdir(), 'rs-caption-behind-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', POSTER, '-vf', `scale=${W}:${H}`, join(media, 'group.jpg')]);
  const asset = { id: 'g', name: 'group.jpg', kind: 'image' as const, src: '/media/uploads/group.jpg', durationInFrames: 60, width: W, height: H };
  const photo = { id: 'p', track: 'V1', kind: 'image', name: 'group', src: asset.src, sourceAssetId: 'g', durationInFrames: 60, width: W, height: H };
  // two huge words across the two big faces at the front (the matte finds people close to the camera) for the whole second
  const words = (style: string): CaptionsData => ({ ...captionsFor(style), layout: { anchor: 'middle-center', offsetYRatio: 0.15 }, enabled: true, words: [{ text: 'NO', start: 0, end: 1000 }, { text: 'WAY', start: 0, end: 1000 }], offsetFrames: 0 } as CaptionsData);

  const still = async (captions: CaptionsData | null): Promise<Buffer> => {
    let h: History = { past: [], present: emptyProjectDoc(), future: [] };
    h = historyReduce(h, { type: 'addAsset', asset } as never);
    h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: W, height: H, fit: 'cover' }, { type: 'add', startFrame: 0, item: photo }, ...(captions ? [{ type: 'track.create', track: { id: 'C1', kind: 'caption', name: 'Captions' } }, { type: 'setCaptions', captions, track: 'C1' }] : [])] } as never);
    const tl = activeTimeline(h.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    try {
      const [s] = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames: [FRAME] }) as Array<{ base64: string }>;
      if (process.env.RS_KEEP_STILLS) execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-i', 'pipe:0', join(process.env.RS_KEEP_STILLS, `${captions ? (captions.rsBehind ? 'behind' : 'front') : 'plain'}.png`)], { input: Buffer.from(s!.base64, 'base64') });
      // raw RGB of the still
      return execFileSync(ffmpegBin(), ['-v', 'error', '-i', 'pipe:0', '-vf', `scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'], { input: Buffer.from(s!.base64, 'base64') });
    } finally {
      await sub.cleanup();
    }
  };
  const plain = await still(null);
  // the same big words in front of everyone: the behind style with rsBehind off
  const front = await still({ ...words('behind-speaker'), rsBehind: false });
  const behind = await still(words('behind-speaker'));
  const dist = (a: Buffer, b: Buffer, i: number) => Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  let text = 0, hidden = 0, shown = 0;
  for (let i = 0; i < plain.length; i += 3) {
    if (dist(front, plain, i) < 90) continue; // not a word pixel
    text += 1;
    if (dist(behind, plain, i) < 45) hidden += 1; // the person covers the word here
    else if (dist(behind, front, i) < 45) shown += 1;
  }
  const share = (n: number) => `${((n / Math.max(1, text)) * 100).toFixed(0)}%`;
  assert.ok(text > 1500, `the words are on the frame (${text} px)`);
  assert.ok(hidden / text > 0.1, `people cover part of the words (${share(hidden)} hidden, ${share(shown)} shown)`);
  assert.ok(shown / text > 0.1, `the words show where nobody is (${share(hidden)} hidden, ${share(shown)} shown)`);
  console.log(`captionBehindRender.verify: ok (${share(hidden)} of the words behind people, ${share(shown)} in front of the background)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
