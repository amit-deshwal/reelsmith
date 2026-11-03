// Reelsmith RS-1260: drawing a depth track's tiles for ClipFx (see shared/reelsmith/depthTrack.ts).
import type { AspectFit } from '../editor/types';
import type { CropPosition } from '../reelsmith/cropFocus';
import { subjectDepth } from '../../shared/reelsmith/depthTrack';

// Reelsmith RS-1260: one tile of a depth track's atlas placed like drawFit places the whole frame; `alpha` < 1 blends it
// over what is there (the tile before it), so two tiles mix by time
export function drawFitTile(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, rect: { x: number; y: number; w: number; h: number }, fit: AspectFit, position: CropPosition, alpha: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const scale = fit === 'cover' ? Math.max(W / rect.w, H / rect.h) : Math.min(W / rect.w, H / rect.h);
  const dw = rect.w * scale;
  const dh = rect.h * scale;
  if (alpha >= 1) ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = alpha;
  ctx.drawImage(atlas, rect.x, rect.y, rect.w, rect.h, (W - dw) * position.x, (H - dh) * position.y, dw, dh);
  ctx.globalAlpha = 1;
}

/** RS-1260: the subject's depth in a still depth map (a photo with lens blur), read once from a small copy. */
export function subjectOfImage(image: HTMLImageElement): number {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = Math.max(1, Math.round((96 * image.naturalHeight) / Math.max(1, image.naturalWidth)));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0.7;
  ctx.drawImage(image, 0, 0, c.width, c.height);
  try { return subjectDepth(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 4); } catch { return 0.7; }
}

