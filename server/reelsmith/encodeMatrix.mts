// Upload test matrix for Instagram: from one master reel, writes the variants to upload (bitrate 8/12/25 Mbps; grain x sharpen
// grid), and a table of what survives a stand-in platform re-encode, measured against the master with SSIM/PSNR.
//   npx tsx server/reelsmith/encodeMatrix.mts <master.mp4> <output folder> [--platform-kbps 3500]
// The stand-in re-encode is plain x264, NOT Instagram: it only ranks variants by how much detail a lossy pass keeps. The real
// answer comes from posting each file privately, downloading the result and running `ffprobe` and compare on it (see the report).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ffmpegBin, ffprobeBin } from '../media-binaries.ts';

const [masterArg, outArg, ...rest] = process.argv.slice(2);
if (!masterArg || !outArg) throw new Error('usage: encodeMatrix.mts <master.mp4> <output folder> [--platform-kbps N]');
const kbpsAt = rest.indexOf('--platform-kbps');
const PLATFORM_KBPS = kbpsAt >= 0 ? Number(rest[kbpsAt + 1]) : 3500;
const master = resolve(masterArg);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const ff = (...args: string[]) => execFileSync(ffmpegBin(), ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const x264 = (kbps: number, crf?: number) => ['-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30',
  ...(crf !== undefined ? ['-crf', String(crf)] : ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`]), '-an', '-movflags', '+faststart'];

interface Variant { name: string; group: 'bitrate' | 'grain-sharpen'; vf: string; kbps?: number }
const variants: Variant[] = [
  ...[8000, 12000, 25000].map((kbps): Variant => ({ name: `bitrate-${kbps / 1000}M`, group: 'bitrate', vf: 'null', kbps })),
  // grain: ffmpeg `noise` strength on luma (temporal+uniform); sharpen: unsharp luma amount after the grain
  ...[0, 5, 10, 20].flatMap((grain) => [0, 0.4].map((sharp): Variant => ({
    name: `grain${grain}-sharp${sharp}`, group: 'grain-sharpen',
    vf: [grain ? `noise=alls=${grain}:allf=t+u` : '', sharp ? `unsharp=5:5:${sharp}:5:5:0` : ''].filter(Boolean).join(',') || 'null',
  }))),
];

const probe = (file: string) => {
  const j = JSON.parse(execFileSync(ffprobeBin(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,bit_rate,r_frame_rate', '-show_entries', 'format=bit_rate,size', '-of', 'json', file]).toString());
  return { kbps: Math.round(Number(j.streams[0].bit_rate || j.format.bit_rate) / 1000), mb: Number(j.format.size) / 1e6, size: `${j.streams[0].width}x${j.streams[0].height}` };
};
const scoreOf = (distorted: string, reference: string) => {
  const text = spawnSync(ffmpegBin(), ['-hide_banner', '-i', distorted, '-i', reference, '-lavfi', '[0:v][1:v]ssim;[0:v][1:v]psnr', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return { ssim: Number(/SSIM[^\n]*All:([\d.]+)/.exec(text)?.[1] ?? NaN), psnr: Number(/PSNR[^\n]*average:([\d.]+)/.exec(text)?.[1] ?? NaN) };
};

// the grain/sharpen grid is uploaded at one fixed bitrate so only the look differs
const GRID_KBPS = 12000;
const rows: string[] = [];
const header = '| file | what | upload kbps | survives stand-in re-encode: SSIM vs master | PSNR dB |\n|---|---|---|---|---|';
for (const v of variants) {
  const file = join(out, `${v.name}.mp4`);
  ff('-i', master, '-vf', v.vf, ...x264(v.kbps ?? GRID_KBPS), file);
  const reenc = join(out, `.platform-${v.name}.mp4`);
  ff('-i', file, ...x264(PLATFORM_KBPS), reenc);
  // compare against the master with the grain/sharpen look included in neither: grain is an intentional change, so a fair
  // reference for the grid is the same variant before re-encode (how much the look is damaged), and the master for bitrates
  const ref = v.group === 'bitrate' ? master : file;
  const s = scoreOf(reenc, ref);
  const p = probe(file);
  rows.push(`| ${v.name}.mp4 | ${v.group} ${v.vf === 'null' ? '' : `(${v.vf})`} | ${p.kbps} | ${s.ssim.toFixed(4)} | ${s.psnr.toFixed(2)} |`);
}
writeFileSync(join(out, 'report.md'), `# Upload matrix for ${master}

Stand-in platform pass: x264 slow at ${PLATFORM_KBPS} kbps (not Instagram). Higher SSIM = more of the file survived that pass.
For bitrate rows the reference is the master; for grain/sharpen rows it is the same file before the pass.

${header}
${rows.join('\n')}

## Real test (needs your Instagram account)
1. Post each file as a private/"close friends" Reel with the same audio, then save or download the delivered version.
2. \`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,bit_rate -of json delivered.mp4\` for each.
3. Compare crops (face, sky gradient, text) side by side; extract frames with \`ffmpeg -i delivered.mp4 -vf "select=eq(n\\,60)" -frames:v 1 f.png\`.
4. Write down which bitrate and which grain/sharpen cell still looks clean on the phone; that is the number to adopt.
`);
console.log(`wrote ${variants.length} variants and report.md in ${out}`);
