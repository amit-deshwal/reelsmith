// Draws one cell of the "Text behind you" effect: the word in heavy capitals, white on black, with a gap after it so cells tile
// sideways. Cached per word; the shader scrolls and repeats it.
import { behindWord } from './behindText';

const CELL_HEIGHT = 256;
const GAP = 0.32;   // gap after the word, as a share of the cell height
export interface TextCell { canvas: HTMLCanvasElement; aspect: number }
const cells = new Map<string, TextCell>();

export function textCellFor(wordIndex: number): TextCell {
  const word = behindWord(wordIndex);
  const cached = cells.get(word);
  if (cached) return cached;
  const font = `900 ${Math.round(CELL_HEIGHT * 0.78)}px "Arial Black", "Impact", "Helvetica Neue", Arial, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const width = Math.ceil(probe.measureText(word).width + CELL_HEIGHT * GAP);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(8192, width);
  canvas.height = CELL_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(word, CELL_HEIGHT * GAP * 0.5, CELL_HEIGHT * 0.54, canvas.width - CELL_HEIGHT * GAP);
  const cell = { canvas, aspect: canvas.width / canvas.height };
  cells.set(word, cell);
  return cell;
}
