// RS-304: HDR / VFR / rotation correctness. Builds flash-and-beep fixtures, puts each on a one-clip timeline, exports it
// through the app's server pipeline and measures the flash-to-beep offset, orientation and HLG tone in the export.
//   node --import tsx server/reelsmith/avsync.mts [--keep]
import { basename, join } from 'node:path';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type MediaAsset } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { renderExportPlan, setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';
import { seedKeystore } from '../keystore.ts';
import { bindTracks } from '../../src/reelsmith/trackBinding.ts';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { normalizeMediaFile } from '../media-normalization-runner.ts';
import { makeFixtures, measureOffsets, FLASH_TIMES } from './avsyncFixtures.ts';

const FPS = 30;
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 'rs-avsync-'));
const media = join(work, 'media');
mkdirSync(media);
setUploadsDirProvider(() => media);
seedKeystore({ MEDIA_DIR: media });

let failed = 0;
for (const fx of makeFixtures(join(work, 'src'))) {
  const safe = `${fx.id}.mp4`;
  linkSync(fx.path, join(media, safe));
  // Import step: HDR clips are converted to SDR first, exactly as the app does on import.
  const imported = await normalizeMediaFile({ inputPath: join(media, safe), publicSrc: `/media/uploads/${safe}`, uploadsDirectory: media });
  const file = basename(imported.outputPath);
  const asset = { id: fx.id, name: safe, kind: 'video', src: `/media/uploads/${file}`, durationInFrames: Math.round(fx.durationSec * FPS), width: fx.displayWidth, height: fx.displayHeight } as MediaAsset;
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: 1080, height: 1920, fit: 'cover' }, { type: 'addAsset', asset }] } as never);
  const action = { type: 'batch', label: 'one clip', actions: [{ type: 'add', startFrame: 0, item: { id: 'clip', track: 'V1', kind: 'video', name: safe, src: asset.src, sourceAssetId: fx.id, durationInFrames: asset.durationInFrames } }] } as never;
  h = historyReduce(h, bindTracks(action, activeTimeline(h.present)));
  const tl = activeTimeline(h.present);
  const submission = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '1080p' } as never);
  const out = join(work, `${fx.id}.export.mp4`);
  try {
    await withExportPermit(() => renderExportPlan(submission.plan, out, () => {}));
  } finally { await submission.cleanup(); }
  const raw = measureOffsets(out, FLASH_TIMES);
  if (keep) copyFileSync(out, join(work, `${fx.id}.raw.mp4`));
  const fin = await finalizeForInstagram(out, REEL_PRESETS['instagram-reel']!);
  const m = measureOffsets(out, FLASH_TIMES);
  const src = measureOffsets(fx.path, FLASH_TIMES);
  const f = (xs: number[]) => xs.map((x) => x.toFixed(1)).join('/');
  console.log(`${fx.id}: source offsets ${f(src.offsetsMs)} ms | raw export ${f(raw.offsetsMs)} ms | after Instagram finalize (${fin.reencoded ? 're-encoded' : 'unchanged'}) ${f(m.offsetsMs)} ms | export ${m.size} | marker ${m.markerQuadrant} | grey ${src.greyLuma.toFixed(0)} -> ${m.greyLuma.toFixed(0)}`);
  if (m.offsetsMs.some((x) => !Number.isFinite(x) || Math.abs(x) > 1)) failed++;
}
if (keep) console.log(`kept: ${work}`); else rmSync(work, { recursive: true, force: true });
if (failed) { console.log(`${failed} fixture(s) outside 1 ms`); process.exitCode = 1; }
