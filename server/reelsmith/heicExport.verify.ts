import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeServerExportMedia } from '../plugins/export-media-plan.ts';

// an export with a HEIC photo renders a staged JPEG copy, removed afterwards
const dir = mkdtempSync(join(tmpdir(), 'rs-heic-'));
try {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240', '-frames:v', '1', join(dir, 'src.jpg')]);
  let heic = true;
  try { execFileSync('sips', ['-s', 'format', 'heic', join(dir, 'src.jpg'), '--out', join(dir, 'photo.heic')], { stdio: 'ignore' }); } catch { heic = false; }
  if (!heic) { copyFileSync(join(dir, 'src.jpg'), join(dir, 'photo.heic')); }
  const snap = { items: [{ id: 'i', kind: 'image', src: '/media/uploads/photo.heic' }, { id: 'j', kind: 'image', src: '/media/uploads/src.jpg' }] };
  const m = await materializeServerExportMedia(snap, { uploadDirectory: dir, publicDirectory: dir, resolveUpload: (n) => join(dir, n), resolveUploadReference: (n) => join(dir, n) });
  const items = (m.snapshot as typeof snap).items;
  assert.match(items[0]!.src, /^\/media\/uploads\/photo\.export-[0-9a-f]{8}\.jpg$/);
  assert.ok(items[1]!.src.endsWith('/src.jpg') && !/\.export-/.test(items[1]!.src), 'other media not converted');
  const staged = join(dir, items[0]!.src.replace('/media/uploads/', ''));
  assert.ok(existsSync(staged));
  assert.equal(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', staged]).toString().trim(), 'mjpeg');
  await m.cleanup();
  assert.ok(!existsSync(staged), 'staged copy removed');
  assert.ok(existsSync(join(dir, 'photo.heic')), 'original kept');
  console.log('heicExport.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
