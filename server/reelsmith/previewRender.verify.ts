// RS-107 check: "Preview with my footage" (analysis + assemble + render) finishes in <= 8 s.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRecipe } from '../../shared/reelsmith/recipe.ts';
import { readFileSync } from 'node:fs';
import type { MediaAsset } from '../../src/editor/types.ts';
import { runRecipe, type AnalyzeApi } from '../../src/reelsmith/runRecipe.ts';
import { previewDoc } from '../../src/reelsmith/previewClient.ts';
import { defaultValues } from '../../src/reelsmith/setupForm.ts';
import { seedKeystore } from '../keystore.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { renderRecipePreview } from './previewRender.ts';

const work = mkdtempSync(join(tmpdir(), 'rs-prev-'));
const media = join(work, 'media');
mkdirSync(media);
seedKeystore({ MEDIA_DIR: media });
setUploadsDirProvider(() => media);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
try {
  // "my footage": 8 phone-like clips (1080x1920, 6 s) and a song
  const assets: MediaAsset[] = [];
  for (let i = 0; i < 8; i++) {
    const name = `phone-${i}.mp4`;
    ff('-f', 'lavfi', '-i', `testsrc2=size=1080x1920:rate=30,hue=h=${i * 45}`, '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', join(media, name));
    assets.push({ id: `c${i}`, name, kind: 'video', src: `/media/uploads/${name}`, durationInFrames: 180, width: 1080, height: 1920 });
  }
  ff('-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*55*t)*exp(-18*mod(t,0.5))':s=44100:d=30", join(media, 'song.wav'));
  assets.push({ id: 'song', name: 'song.wav', kind: 'audio', src: '/media/uploads/song.wav', durationInFrames: 900 });
  const file = (a: MediaAsset) => join(media, a.src.replace('/media/uploads/', ''));
  const api: AnalyzeApi = {
    clipFeatures: (a, fps) => extractClipFeatures(file(a), a.id, fps, { maxSec: 90 }),
    musicGrid: async (a) => { const g = await analyzeBeatsFile(file(a)); return g && { durationSec: g.durationSec, beatTimesSec: g.beatTimesSec, beatsPerBar: 4, downbeatIndex: g.downbeatIndex }; },
  };
  const r = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
  assert.ok(r.ok);
  const values = defaultValues(r.recipe);
  values.media.clips = assets.filter((a) => a.kind === 'video').map((a) => ({ assetId: a.id, kind: 'video' as const }));
  values.media.music = [{ assetId: 'song', kind: 'audio' }];
  values.texts.place = 'Lonavala';

  const t0 = performance.now();
  const out = await runRecipe(api, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: false });
  assert.ok(out.action, out.messages.join('; '));
  const p = await renderRecipePreview({ project: previewDoc(out, assets, 30) as never, seconds: 5 });
  const ms = performance.now() - t0;
  const outFile = join(media, p.src.replace('/media/uploads/', ''));
  assert.ok(existsSync(outFile));
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', outFile]).toString();
  const info = JSON.parse(probe) as { streams: Array<{ width: number; height: number }>; format: { duration: string } };
  assert.deepEqual([info.streams[0]!.width, info.streams[0]!.height], [360, 640]);
  assert.ok(Number(info.format.duration) >= 3 && Number(info.format.duration) <= 6.1);
  console.log(`previewRender.verify ok: ${(ms / 1000).toFixed(1)} s end to end`);
  assert.ok(ms <= 8000, `preview took ${(ms / 1000).toFixed(1)} s (> 8 s)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
