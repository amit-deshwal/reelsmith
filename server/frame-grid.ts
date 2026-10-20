// Build a labeled contact-sheet JPEG from still frames (backs the view_*_frames tools).
// Label burn-in strategy (first that works):
//   1. ffmpeg drawtext  — needs libfreetype (Homebrew `ffmpeg-full`, not stock `ffmpeg`)
//   2. Python PIL       — stamps text when drawtext is missing (common on macOS bottles)
//   3. no pixel labels  — still tiles; labels remain in the tool note
// Used by extract-frames + render-still grid mode.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from './media-binaries.ts';
import { ffmpegThreadArgs, spawnMediaProcess } from './media-process.ts';

export { ffmpegBin } from './media-binaries.ts';

export interface GridCell {
  /** JPEG bytes */
  jpeg: Buffer;
  /** Overlay label, e.g. "12.0s" or "f90" */
  label: string;
}

export interface TileOptions {
  /** Target cell width (px). Default 320. */
  cellWidth?: number;
  /** Cell height (px). Default 16:9 of cellWidth; pass a taller one for portrait frames. */
  cellHeight?: number;
  /** Max columns. Default auto (ceil sqrt(n)). */
  cols?: number;
  /** JPEG quality 2-31 (ffmpeg -q:v, lower=better). Default 5. */
  quality?: number;
}

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnMediaProcess(cmd, [...ffmpegThreadArgs(), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stderr?.on('data', (c: Buffer) => {
      stderr += String(c);
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

type LabelBackend = 'drawtext' | 'pil' | 'none';

/** Cells prepared at once (each is a small single-frame ffmpeg run). */
const TILE_CONCURRENCY = 6;

let cachedBackend: LabelBackend | null = null;

/** Probe once: drawtext (freetype) → PIL → none. */
export function detectLabelBackend(): LabelBackend {
  if (cachedBackend) return cachedBackend;
  try {
    const r = spawnSync(ffmpegBin(), ['-hide_banner', '-filters'], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    if (/\bdrawtext\b/.test(out)) {
      cachedBackend = 'drawtext';
      return cachedBackend;
    }
  } catch { /* fall through */ }

  try {
    const r = spawnSync('python3', ['-c', 'from PIL import Image, ImageDraw, ImageFont; print("ok")'], {
      encoding: 'utf8',
    });
    if (r.status === 0 && (r.stdout ?? '').includes('ok')) {
      cachedBackend = 'pil';
      return cachedBackend;
    }
  } catch { /* fall through */ }

  cachedBackend = 'none';
  return cachedBackend;
}

/** Test helper — reset cached probe. */
export function __resetLabelBackendCache(): void {
  cachedBackend = null;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '%%');
}

/** Common macOS / Linux font paths for drawtext. */
function fontFile(): string | null {
  const candidates = [
    process.env.OPENCHATCUT_FONT_FILE,
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function stampWithDrawtext(
  input: string,
  output: string,
  label: string,
  cellWidth: number,
  cellH: number,
  quality: number,
): Promise<void> {
  const text = escapeDrawtext(label || '');
  const font = fontFile();
  const fontOpt = font ? `:fontfile=${font.replace(/:/g, '\\:').replace(/\\/g, '/')}` : '';
  // fontsize scales lightly with cell width
  const fs = Math.max(14, Math.round(cellWidth * 0.07));
  // Reelsmith: fit, pad and stamp in one pass (it was three ffmpeg runs per cell)
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-vf',
    [
      `scale=w=${cellWidth}:h=${cellH}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      `pad=${cellWidth}:${cellH}:(ow-iw)/2:(oh-ih)/2:black`,
      `drawtext=text='${text}':x=8:y=8:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4${fontOpt}`,
    ].join(','),
    '-frames:v', '1',
    '-update', '1',
    '-q:v', String(quality),
    output,
  ]);
}

/** PIL stamp: scale+pad via ffmpeg first, then burn text with Pillow. */
async function stampWithPil(
  input: string,
  output: string,
  label: string,
  cellWidth: number,
  cellH: number,
  quality: number,
): Promise<void> {
  const scaled = `${output}.scaled.jpg`;
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-vf', `scale=w=${cellWidth}:h=${cellH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${cellWidth}:${cellH}:(ow-iw)/2:(oh-ih)/2:black`,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', String(quality),
    scaled,
  ]);

  const script = `
import sys
from PIL import Image, ImageDraw, ImageFont
path_in, path_out, label = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(path_in).convert("RGB")
draw = ImageDraw.Draw(im)
# Prefer a real TTF; fall back to default bitmap font
font = None
for fp in [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]:
    try:
        font = ImageFont.truetype(fp, max(14, im.width // 14))
        break
    except Exception:
        pass
if font is None:
    font = ImageFont.load_default()
pad = 6
bbox = draw.textbbox((0, 0), label, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
# semi-opaque black bar
draw.rectangle([4, 4, 4 + tw + pad * 2, 4 + th + pad * 2], fill=(0, 0, 0, 180))
draw.text((4 + pad, 4 + pad), label, fill=(255, 255, 255), font=font)
im.save(path_out, "JPEG", quality=88)
`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn('python3', ['-c', script, scaled, output, label || ''], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (c: Buffer) => { err += String(c); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PIL stamp failed: ${err.slice(-300)}`));
    });
  });
}

async function prepareCell(
  rawPath: string,
  outPath: string,
  label: string,
  cellWidth: number,
  cellH: number,
  quality: number,
  backend: LabelBackend,
): Promise<void> {
  if (backend === 'drawtext' && label) {
    try {
      await stampWithDrawtext(rawPath, outPath, label, cellWidth, cellH, quality);
      return;
    } catch {
      // fall through to pil/none
    }
  }
  if (backend === 'pil' && label) {
    try {
      await stampWithPil(rawPath, outPath, label, cellWidth, cellH, quality);
      return;
    } catch {
      // fall through
    }
  }
  // no labels — just scale+pad
  await run(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', rawPath,
    '-vf', `scale=w=${cellWidth}:h=${cellH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${cellWidth}:${cellH}:(ow-iw)/2:(oh-ih)/2:black`,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', String(quality),
    outPath,
  ]);
}

/** Width and height from a baseline/progressive JPEG's SOF marker, or null. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) return null;
    const marker = jpeg[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) };
    }
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  return null;
}

/** True when most cells are taller than wide. */
export function mostlyPortrait(cells: readonly GridCell[]): boolean {
  const portrait = cells.filter((c) => { const size = jpegSize(c.jpeg); return !!size && size.height > size.width; }).length;
  return portrait * 2 > cells.length;
}

/**
 * Tile cells into one contact-sheet JPEG (row-major L→R, T→B).
 * Burns labels onto pixels when drawtext or PIL is available.
 */
export async function tileContactSheet(cells: GridCell[], opts: TileOptions = {}): Promise<Buffer> {
  if (!cells.length) throw new Error('tileContactSheet: no cells');
  // Even dimensions required for yuv420 / many ffmpeg paths.
  const cellWidth = Math.max(120, Math.min(640, opts.cellWidth ?? 320)) & ~1;
  const quality = Math.max(2, Math.min(12, opts.quality ?? 5));
  const n = cells.length;
  const cols = Math.max(1, Math.min(n, opts.cols ?? Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  // Reelsmith: without a cell height, portrait frames (9:16 reels, phone clips) get portrait cells; they were
  // squeezed into 16:9 cells as ~100 px slivers the agent could not judge.
  const cellH = Math.max(2, Math.min(1280, Math.round(opts.cellHeight ?? (mostlyPortrait(cells) ? cellWidth * 16 / 9 : cellWidth * 9 / 16)))) & ~1;
  const backend = detectLabelBackend();

  const dir = await mkdtemp(join(tmpdir(), 'cc-grid-'));
  try {
    // Reelsmith: each cell is sized and labelled straight into its sequence slot, several at once
    // (it was four ffmpeg runs per cell, one after another: about 0.5 s for a 20-cell sheet, now ~0.1 s).
    const seq = (i: number) => join(dir, `seq-${String(i).padStart(3, '0')}.jpg`);
    const total = cols * rows;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, total) }, async () => {
      while (next < total) {
        const i = next++;
        if (i < n) {
          const raw = join(dir, `raw-${i}.jpg`);
          await writeFile(raw, cells[i]!.jpeg);
          await prepareCell(raw, seq(i), cells[i]!.label || '', cellWidth, cellH, quality, backend);
        } else {
          // Pad empty cells for incomplete last row
          await run(ffmpegBin(), [
            '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', `color=c=black:s=${cellWidth}x${cellH}`,
            '-frames:v', '1',
            '-q:v', String(quality),
            seq(i),
          ]);
        }
      }
    }));

    const sheet = join(dir, 'sheet.jpg');
    if (total === 1) {
      await run(ffmpegBin(), [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', join(dir, 'seq-000.jpg'),
        '-frames:v', '1',
        '-update', '1',
        '-q:v', String(quality),
        sheet,
      ]);
    } else {
      await run(ffmpegBin(), [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-framerate', '1',
        '-i', join(dir, 'seq-%03d.jpg'),
        '-vf', `tile=${cols}x${rows}`,
        '-frames:v', '1',
        '-update', '1',
        '-q:v', String(quality),
        sheet,
      ]);
    }
    return await readFile(sheet);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Format ms → "12.0s" or "1:23" for labels. */
export function formatTimeLabel(ms: number): string {
  const sec = Math.max(0, ms / 1000);
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatFrameLabel(frame: number, fps: number): string {
  const sec = fps > 0 ? frame / fps : 0;
  return `f${frame} · ${formatTimeLabel(sec * 1000)}`;
}
