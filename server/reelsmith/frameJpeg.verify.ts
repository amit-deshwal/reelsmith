import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frameJpeg } from './stillFrame.ts';

// RS-1234: the cover's frame comes back full size, as JPEG bytes, without writing a file
const dir = mkdtempSync(join(tmpdir(), 'rs-cover-'));
try {
  const file = join(dir, 'reel.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', file]);
  const f = await frameJpeg(file, 1.2);
  assert.equal(f.width, 1080);
  assert.equal(f.height, 1920);
  assert.equal(Buffer.from(f.base64, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
  await assert.rejects(frameJpeg(join(dir, 'missing.mp4'), 0));
  console.log('frameJpeg.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
