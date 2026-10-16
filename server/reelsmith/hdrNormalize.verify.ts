// RS-304: HLG footage is converted to SDR Rec.709 on import, so preview and export decode the same, neutral pixels.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isHdrTransfer, normalizeReason, resolveStreamPlan, type ProbeMeta } from '../media-normalization.ts';
import { normalizeMediaFile } from '../media-normalization-runner.ts';
import { makeFixtures } from './avsyncFixtures.ts';

assert.ok(isHdrTransfer('arib-std-b67') && isHdrTransfer('smpte2084'));
assert.ok(!isHdrTransfer('bt709') && !isHdrTransfer(undefined));
const sdr: ProbeMeta = { width: 1080, height: 1920, duration: 4, videoCodec: 'hevc', audioCodec: 'aac', hasAudio: true, sourceBitrate: 8e6, size: 4e6, variableFrameRate: false };
assert.equal(normalizeReason(sdr, 1e7, false, false), null, 'SDR HEVC stays untouched');
assert.match(normalizeReason({ ...sdr, hdr: true }, 1e7, false, false) ?? '', /HDR/);
assert.equal(resolveStreamPlan({ ...sdr, hdr: true }, false, false).transcodeVideo, true);
assert.equal(resolveStreamPlan(sdr, false, false).transcodeVideo, false);

const work = mkdtempSync(join(tmpdir(), 'rs-hdr-'));
try {
  const hlg = makeFixtures(join(work, 'src')).find((f) => f.id === 'hlg')!;
  mkdirSync(join(work, 'media'));
  const input = join(work, 'media', 'hlg.mp4');
  copyFileSync(hlg.path, input);
  const res = await normalizeMediaFile({ inputPath: input, publicSrc: '/media/uploads/hlg.mp4', uploadsDirectory: join(work, 'media'), preserveInput: false });
  assert.ok(res.normalized, 'HLG file must be converted');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,color_transfer,color_primaries,color_space', '-of', 'json', res.outputPath]).toString()) as { streams: Array<Record<string, string>> };
  const s = probe.streams[0]!;
  assert.equal(s.pix_fmt, 'yuv420p');
  assert.ok(!isHdrTransfer(s.color_transfer), `still tagged ${s.color_transfer}`);
  assert.ok(['bt709', undefined, 'unknown'].includes(s.color_space), `colour space ${s.color_space}`);
  // The grey background (RGB 48) should stay a neutral dark grey: reference tone-map gives ~49 and no colour cast.
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', res.outputPath, '-frames:v', '1', '-vf', 'scale=4:4:flags=area,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  const [r, g, b] = [raw[(2 * 4 + 2) * 3]!, raw[(2 * 4 + 2) * 3 + 1]!, raw[(2 * 4 + 2) * 3 + 2]!];
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6, `colour cast: ${r},${g},${b}`);
  assert.ok(g >= 40 && g <= 60, `grey patch off: ${g}`);
  console.log(`hdrNormalize.verify ok: grey ${r},${g},${b}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
