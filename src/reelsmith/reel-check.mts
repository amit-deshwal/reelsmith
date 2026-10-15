// Usage: npx tsx src/reelsmith/reel-check.mts <video.mp4> [--fix]
// Checks an exported reel against the Instagram rules (V1-V7, V9). With --fix, writes <name>.instagram.mp4:
// 1080x1920, 30 fps, H.264 High, AAC 48k, -14 LUFS, faststart.
import { basename, dirname, extname, join } from 'node:path';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';
import { encodeForInstagram } from '../../server/reelsmith/instagramEncode.ts';
import { formatReport, validateReel } from '../../server/reelsmith/exportValidate.ts';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: reel-check.mts <video.mp4> [--fix]'); process.exit(2); }
const preset = REEL_PRESETS['instagram-reel']!;
const first = await validateReel(file, { preset });
console.log(formatReport(first));
console.log(first.ok ? '\nReady for Instagram.' : '\nNot ready.');
if (flag === '--fix' && !first.ok) {
  const out = join(dirname(file), `${basename(file, extname(file))}.instagram.mp4`);
  console.log(`\nRe-encoding to ${out} ...`);
  await encodeForInstagram(file, out, preset);
  const again = await validateReel(out, { preset });
  console.log(formatReport(again));
  console.log(again.ok ? '\nReady for Instagram.' : '\nStill has problems.');
}
