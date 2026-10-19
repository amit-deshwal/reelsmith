// One numbered contact sheet of many candidate clips, so the agent judges them in a single look instead of
// inspecting clip after clip. One frame per candidate (at its best window), 20 cells per sheet.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { ffmpegThreadArgs, spawnMediaProcess } from '../media-process.ts';
import { tileContactSheet, type GridCell } from '../frame-grid.ts';

export interface SheetItem { file: string; kind: 'video' | 'image'; atSec: number; label: string }
export const CELLS_PER_SHEET = 20;
/** Most cells one request may ask for (the director's sheets use up to 80). */
export const MAX_SHEET_CELLS = 120;
const CELL_WIDTH = 240;

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

/** Cell height for a group: 9:16 when most frames are portrait (phone footage), else 16:9. */
export function sheetCellHeight(cells: GridCell[], width = CELL_WIDTH): number {
  const portrait = cells.filter((c) => { const s = jpegSize(c.jpeg); return !!s && s.height > s.width; }).length;
  return portrait * 2 > cells.length ? Math.round(width * 16 / 9) : Math.round(width * 9 / 16);
}

function extractFrame(item: SheetItem, out: string): Promise<void> {
  const input = item.kind === 'image' ? ['-i', item.file] : ['-ss', String(Math.max(0, item.atSec)), '-i', item.file];
  return new Promise((resolve, reject) => {
    const child = spawnMediaProcess(ffmpegBin(), [
      ...ffmpegThreadArgs(), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
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
    const cells: GridCell[] = [];
    const skipped: string[] = [];
    // a few frames at a time: each ffmpeg call is a cheap seek
    for (let i = 0; i < items.length; i += 4) {
      await Promise.all(items.slice(i, i + 4).map(async (item, j) => {
        const path = join(work, `c-${i + j}.jpg`);
        try { await extractFrame(item, path); cells[i + j] = { jpeg: await readFile(path), label: item.label }; } catch { skipped.push(item.label); }
      }));
    }
    const ready = cells.filter(Boolean);
    const sheets: Array<{ base64: string; labels: string[] }> = [];
    for (let i = 0; i < ready.length; i += CELLS_PER_SHEET) {
      const group = ready.slice(i, i + CELLS_PER_SHEET);
      const jpeg = await tileContactSheet(group, { cellWidth: CELL_WIDTH, cellHeight: sheetCellHeight(group), cols: 5 });
      sheets.push({ base64: jpeg.toString('base64'), labels: group.map((c) => c.label) });
    }
    return { sheets, skipped };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
