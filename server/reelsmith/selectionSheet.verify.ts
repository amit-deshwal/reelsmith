// The contact-sheet builder, with real ffmpeg on generated clips: one JPEG per 20 cells, bad files skipped.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { buildSelectionSheets, CELLS_PER_SHEET, jpegSize, type SheetItem } from './selectionSheet.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-sheet-verify-'));
try {
  const video = join(dir, 'v.mp4');
  const image = join(dir, 'i.jpg');
  const broken = join(dir, 'b.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=2', '-pix_fmt', 'yuv420p', video]);
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=200x300', '-frames:v', '1', image]);
  writeFileSync(broken, 'not a video');

  const items: SheetItem[] = [
    { file: video, kind: 'video', atSec: 0.5, label: '1' },
    { file: image, kind: 'image', atSec: 0, label: '2' },
    { file: broken, kind: 'video', atSec: 0, label: '3' },
    ...Array.from({ length: 21 }, (_, i) => ({ file: video, kind: 'video' as const, atSec: 1, label: String(i + 4) })),
  ];
  const { sheets, skipped } = await buildSelectionSheets(items);
  assert.deepEqual(skipped, ['3'], 'the unreadable file is reported, not fatal');
  assert.equal(sheets.length, 2, '23 readable cells need two sheets');
  assert.equal(sheets[0]!.labels.length, CELLS_PER_SHEET);
  assert.equal(sheets[1]!.labels.length, 3);
  assert.deepEqual(sheets[0]!.labels.slice(0, 2), ['1', '2'], 'order kept, skipped cell left out');
  for (const sheet of sheets) assert.ok(Buffer.from(sheet.base64, 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8])), 'a JPEG');
  assert.deepEqual((await buildSelectionSheets([])).sheets, []);
  assert.deepEqual(jpegSize(Buffer.from(sheets[1]!.base64, 'base64')), { width: 720, height: 134 }, 'landscape clips keep 16:9 cells (3 left over, so 3 columns)');

  // phone footage: portrait cells, so a 9:16 frame fills its cell instead of a 76 px sliver
  const tall = join(dir, 'tall.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=10:duration=1', '-pix_fmt', 'yuv420p', tall]);
  const portrait = await buildSelectionSheets(Array.from({ length: 6 }, (_, i) => ({ file: i === 5 ? video : tall, kind: 'video' as const, atSec: 0.2, label: String(i + 1) })));
  assert.deepEqual(jpegSize(Buffer.from(portrait.sheets[0]!.base64, 'base64')), { width: 1200, height: 852 }, 'two rows of 240x426 cells');
  console.log('selectionSheet.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
