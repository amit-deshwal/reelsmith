// RS-903: choose an object-position that keeps a detected face or subject inside a cover crop.
// Coordinates are normalized to the displayed source frame; 0.5 is the centered fallback.
export interface FocusRect { x: number; y: number; w: number; h: number }
export interface CropPosition { x: number; y: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function cropPositionForFocus(
  sourceWidth: number, sourceHeight: number, targetAspect: number, focus?: FocusRect | null,
): CropPosition {
  if (!(sourceWidth > 0 && sourceHeight > 0 && targetAspect > 0) || !focus
    || ![focus.x, focus.y, focus.w, focus.h].every(Number.isFinite)
    || !(focus.w > 0 && focus.h > 0)) return { x: 0.5, y: 0.5 };
  const sourceAspect = sourceWidth / sourceHeight;
  const visibleWidth = Math.min(1, targetAspect / sourceAspect);
  const visibleHeight = Math.min(1, sourceAspect / targetAspect);
  const centerX = clamp(focus.x + focus.w / 2, 0, 1);
  const centerY = clamp(focus.y + focus.h / 2, 0, 1);
  const left = clamp(centerX - visibleWidth / 2, 0, 1 - visibleWidth);
  const top = clamp(centerY - visibleHeight / 2, 0, 1 - visibleHeight);
  return {
    x: visibleWidth < 1 ? left / (1 - visibleWidth) : 0.5,
    y: visibleHeight < 1 ? top / (1 - visibleHeight) : 0.5,
  };
}

/** Fraction of a detected region retained by the best crop at this target shape. */
export function focusRetention(sourceWidth: number, sourceHeight: number, targetAspect: number, focus?: FocusRect | null): number {
  if (!focus || !(focus.w > 0 && focus.h > 0) || !(sourceWidth > 0 && sourceHeight > 0 && targetAspect > 0)) return 1;
  const sourceAspect = sourceWidth / sourceHeight;
  const width = Math.min(1, targetAspect / sourceAspect);
  const height = Math.min(1, sourceAspect / targetAspect);
  const position = cropPositionForFocus(sourceWidth, sourceHeight, targetAspect, focus);
  const left = position.x * (1 - width);
  const top = position.y * (1 - height);
  const overlapWidth = Math.max(0, Math.min(left + width, focus.x + focus.w) - Math.max(left, focus.x));
  const overlapHeight = Math.max(0, Math.min(top + height, focus.y + focus.h) - Math.max(top, focus.y));
  return clamp((overlapWidth * overlapHeight) / (focus.w * focus.h), 0, 1);
}

export function cropPositionFromProps(props: Record<string, unknown> | undefined): CropPosition {
  const x = props?.rsCropX;
  const y = props?.rsCropY;
  return { x: typeof x === 'number' && Number.isFinite(x) ? clamp(x, 0, 1) : 0.5,
    y: typeof y === 'number' && Number.isFinite(y) ? clamp(y, 0, 1) : 0.5 };
}

export const cropObjectPosition = (props: Record<string, unknown> | undefined): string => {
  const position = cropPositionFromProps(props);
  return `${position.x * 100}% ${position.y * 100}%`;
};

/** Transform for a contain-fitted clip that must cover the canvas (scale about the centre, then pan in % of canvas). */
export interface FillTransform { scale: number; x: number; y: number }

/**
 * Scale a clip whose aspect differs from the canvas until it covers the canvas, and pan the cover so the
 * focus stays in frame. Same scale as the editor's "Fill canvas (centre)". Null when the aspects already match
 * or the source size is unknown, so the clip keeps its normal fit.
 */
export function fillTransformForFocus(
  sourceWidth: number, sourceHeight: number, canvasWidth: number, canvasHeight: number, focus?: FocusRect | null,
): FillTransform | null {
  if (!(sourceWidth > 0 && sourceHeight > 0 && canvasWidth > 0 && canvasHeight > 0)) return null;
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;
  if (Math.abs(sourceAspect / canvasAspect - 1) < 1e-3) return null;
  const scale = sourceAspect > canvasAspect ? sourceAspect / canvasAspect : canvasAspect / sourceAspect;
  const position = cropPositionForFocus(sourceWidth, sourceHeight, canvasAspect, focus);
  // Picture edge (in canvas units) on the filled-over axis: 0 = left/top aligned, -(scale-1) = far edge.
  const edge = -(scale - 1) * (sourceAspect > canvasAspect ? position.x : position.y);
  const pan = (edge - 0.5 + scale / 2) * 100;
  return sourceAspect > canvasAspect
    ? { scale, x: pan, y: 0 }
    : { scale, x: 0, y: pan };
}
