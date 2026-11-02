// RS-1248: master-quality re-encodes are capped at 2560 px; the VideoToolbox conversion scales in the coded orientation,
// rotates on the GPU and never asks for a CPU colour conversion.
import assert from 'node:assert/strict';
import { capImportSize, importMaxPx } from './importSize.ts';
import { clockwiseRotation, vtTranscodeArgs, vtTransposeDir } from './vtNormalize.ts';

// RS-1250: 2.5x the pixel-scaled rate, never above the source's
assert.deepEqual(capImportSize(2160, 3840, 36_600_000, 1_500_000, 2560), { w: 1440, h: 2560, bitrate: 36_600_000 });
assert.deepEqual(capImportSize(2160, 3840, 52_000_000, 1_500_000, 2560), { w: 1440, h: 2560, bitrate: 52_000_000 });
assert.deepEqual(capImportSize(4320, 7680, 120_000_000, 1_500_000, 2560), { w: 1440, h: 2560, bitrate: 33_333_333 });
assert.deepEqual(capImportSize(1080, 1920, 11_000_000, 1_500_000, 2560), { w: 1080, h: 1920, bitrate: 11_000_000 }, '1080p untouched');
assert.deepEqual(capImportSize(2160, 3840, 52_000_000, 1_500_000, 0), { w: 2160, h: 3840, bitrate: 52_000_000 }, '0 turns it off');
assert.equal(importMaxPx({}), 2560);
assert.equal(importMaxPx({ REELSMITH_IMPORT_MAX_PX: '1920' }), 1920);
assert.equal(importMaxPx({ REELSMITH_IMPORT_MAX_PX: 'x' }), 2560);

assert.equal(vtTransposeDir(0), undefined);
assert.equal(vtTransposeDir(90), 'clock');
assert.equal(vtTransposeDir(270), 'cclock');
assert.equal(vtTransposeDir(180), 'reversal');
assert.equal(vtTransposeDir(45), null);

const base = {
  inputPath: '/in.mov', hasAudio: true, targetW: 1440, targetH: 2560, targetFps: 60, convertToCfr: true, hdr: true,
  encodeArgs: ['-c:v', 'h264_videotoolbox', '-pix_fmt', 'yuv420p', '-q:v', '23'], audioArgs: ['-c:a', 'aac'], outputArgs: ['/out.mp4'],
};
// an iPhone portrait clip as ffprobe 4.4 and 6+ report it: both mean a quarter turn clockwise
assert.equal(clockwiseRotation({ tags: { rotate: '90' }, side_data_list: [{ rotation: -90 }] }), 90);
assert.equal(clockwiseRotation({ side_data_list: [{ rotation: -90 }] }), 90);
assert.equal(clockwiseRotation({ side_data_list: [{ rotation: 90 }] }), 270);
assert.equal(clockwiseRotation({ side_data_list: [{ rotation: 180 }] }), 180);
assert.equal(clockwiseRotation({}), 0);
// coded 3840x2160, turned 90 clockwise
const a = vtTranscodeArgs({ ...base, rotation: 90 })!;
const vf = a[a.indexOf('-vf') + 1]!;
assert.match(vf, /^scale_vt=w=2560:h=1440:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709,transpose_vt=dir=clock,fps=fps=60:/);
assert.ok(!a.includes('-pix_fmt'), 'frames stay on the GPU');
assert.ok(!a.includes('-colorspace') && !a.includes('-color_trc'), 'no CPU colour conversion');
assert.equal(a[a.indexOf('-display_rotation') + 1], '0');
assert.ok(a.indexOf('-display_rotation') < a.indexOf('-i'), 'an input option');
// landscape SDR: no transpose, no colour conversion
const b = vtTranscodeArgs({ ...base, rotation: 0, hdr: false, targetW: 2560, targetH: 1440 })!;
assert.equal(b[b.indexOf('-vf') + 1], 'scale_vt=w=2560:h=1440,fps=fps=60:start_time=0:round=near');
assert.equal(vtTranscodeArgs({ ...base, rotation: 45 }), null);
console.log('importSize.verify ok');
