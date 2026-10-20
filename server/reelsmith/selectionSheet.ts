// One numbered contact sheet of many candidate clips, so the agent judges them in a single look instead of
// inspecting clip after clip. One frame per candidate (at its best window), 20 cells per sheet.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { ffmpegThreadArgs, spawnMediaProcess } from '../media-process.ts';
import { jpegSize, mostlyPortrait, tileContactSheet, type GridCell } from '../frame-grid.ts';

export interface SheetItem { file: string; kind: 'video' | 'image'; atSec: number; label: string }
export const CELLS_PER_SHEET = 20;
/** Most cells one request may ask for (the director's sheets use up to 80). */
export const MAX_SHEET_CELLS = 120;
const CELL_WIDTH = 240;
/**
 * Frames decoded at once. With the GPU decoding, 8 in flight read 80 cells of 1080p HEVC phone footage in 3.2 s; the
 * old 4 at a time on the CPU took 11.3 s (frames are bit-identical: HEVC decoding is exact).
 */
const EXTRACT_CONCURRENCY = Math.max(2, Math.min(8, availableParallelism()));
/** Decode on the GPU on macOS, like clip analysis; ffmpeg falls back to software by itself. */
const decodeArgs = (item: SheetItem) => (item.kind === 'video' && process.platform === 'darwin' && process.env.REELSMITH_ANALYSIS_HWACCEL !== '0' ? ['-hwaccel', 'videotoolbox'] : []);

export { jpegSize };

/** Cell height for a group: 9:16 when most frames are portrait (phone footage), else 16:9. */
export function sheetCellHeight(cells: GridCell[], width = CELL_WIDTH): number {
  return mostlyPortrait(cells) ? Math.round(width * 16 / 9) : Math.round(width * 9 / 16);
}

function extractFrame(item: SheetItem, out: string): Promise<void> {
  const input = item.kind === 'image' ? ['-i', item.file] : ['-ss', String(Math.max(0, item.atSec)), '-i', item.file];
  return new Promise((resolve, reject) => {
    // one thread each: many single-frame decodes side by side beat one wide decode at a time
    const child = spawnMediaProcess(ffmpegBin(), [
      ...ffmpegThreadArgs(1), ...decodeArgs(item), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      ...input, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, 30_000);
    child.stderr?.on('data', (c: Buffer) => { err += String(c); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.slice(-200) || `ffmpeg exit ${code}`)); });
  });
}

/** JPEG sheets (base64) in item order. Items that cannot be decoded are skipped and listed in `skipped`. */
export async function buildSelectionSheets(items: SheetItem[]): Promise<{ sheets: Array<{ base64: string; labels: string[] }>; skipped: string[] }> {
  const work = await mkdtemp(join(tmpdir(), 'rs-sheet-'));
  try {
    const cells: Array<GridCell | null> = new Array(items.length).fill(null);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(EXTRACT_CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const path = join(work, `c-${i}.jpg`);
        try { await extractFrame(items[i]!, path); cells[i] = { jpeg: await readFile(path), label: items[i]!.label }; } catch { /* listed in skipped */ }
      }
    }));
    const skipped = items.filter((_, i) => !cells[i]).map((item) => item.label);
    const ready = cells.filter((c): c is GridCell => !!c);
    const groups = Array.from({ length: Math.ceil(ready.length / CELLS_PER_SHEET) }, (_, k) => ready.slice(k * CELLS_PER_SHEET, (k + 1) * CELLS_PER_SHEET));
    const sheets = await Promise.all(groups.map(async (group) => {
      const jpeg = await tileContactSheet(group, { cellWidth: CELL_WIDTH, cellHeight: sheetCellHeight(group), cols: 5 });
      return { base64: jpeg.toString('base64'), labels: group.map((c) => c.label) };
    }));
    return { sheets, skipped };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
