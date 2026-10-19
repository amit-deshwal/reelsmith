// RS-303: Instagram safe zones and the timeline lint that warns when text lands outside them.
// Defaults are configurable; confirm the real values in the Instagram app.
export interface SafeZone { topPx: number; bottomPx: number; rightFrac: number; leftFrac: number }

/** Reference canvas 1080x1920. Values scale with the canvas. */
export const DEFAULT_SAFE_ZONE: SafeZone = { topPx: 250, bottomPx: 360, rightFrac: 0.1, leftFrac: 0.04 };

export interface Rect { x: number; y: number; w: number; h: number }

export function safeRect(canvas: { width: number; height: number }, z: SafeZone = DEFAULT_SAFE_ZONE): Rect {
  const sy = canvas.height / 1920;
  const x = canvas.width * z.leftFrac;
  const y = z.topPx * sy;
  return { x, y, w: canvas.width - x - canvas.width * z.rightFrac, h: canvas.height - y - z.bottomPx * sy };
}

/** The four UI-covered bands, for drawing the overlay. */
export function coveredBands(canvas: { width: number; height: number }, z: SafeZone = DEFAULT_SAFE_ZONE): Rect[] {
  const s = safeRect(canvas, z);
  return [
    { x: 0, y: 0, w: canvas.width, h: s.y },
    { x: 0, y: s.y + s.h, w: canvas.width, h: canvas.height - s.y - s.h },
    { x: 0, y: s.y, w: s.x, h: s.h },
    { x: s.x + s.w, y: s.y, w: canvas.width - s.x - s.w, h: s.h },
  ];
}

/**
 * RS-904: which guide applies to a canvas. 9:16 gets the Reel UI zones; 4:5 and 1:1 feed posts show the centred
 * 3:4 tile the profile grid crops to; 3:4 is that tile already, and landscape shapes have no overlay.
 */
export type SafeArea =
  | { kind: 'reel'; safe: Rect; bands: Rect[]; labels: string[] }
  | { kind: 'grid'; safe: Rect; bands: Rect[]; labels: string[] }
  | { kind: 'none' };

export function safeAreaFor(canvas: { width: number; height: number }, z: SafeZone = DEFAULT_SAFE_ZONE): SafeArea {
  const ratio = canvas.width / canvas.height;
  if (Math.abs(ratio - 9 / 16) < 0.01) {
    return { kind: 'reel', safe: safeRect(canvas, z), bands: coveredBands(canvas, z), labels: ['Instagram header', 'Caption and audio', '', 'Like / comment / share'] };
  }
  if (ratio > 3 / 4 + 0.01 && ratio <= 1.01) {
    const w = canvas.height * 3 / 4;
    const x = (canvas.width - w) / 2;
    return {
      kind: 'grid',
      safe: { x, y: 0, w, h: canvas.height },
      bands: [{ x: 0, y: 0, w: x, h: canvas.height }, { x: x + w, y: 0, w: x, h: canvas.height }],
      labels: ['Cropped in grid', 'Cropped in grid'],
    };
  }
  return { kind: 'none' };
}

interface LintItem {
  id: string; kind: string; name?: string; startFrame: number; durationInFrames: number;
  width?: number; height?: number; props?: Record<string, unknown>; transform?: { x?: number; y?: number; scale?: number };
}
export interface SafeZoneIssue { itemId: string; startFrame: number; message: string }

/** Average glyph width in em for faces whose real width is well under the 0.55 default (the director styles fit text with the same numbers). */
const FACE_EM: Record<string, number> = { 'Bebas Neue': 0.42, Anton: 0.5 };

/** Estimated text box: single or multi line, centred on the canvas then offset by transform x/y (percent of canvas). */
export function textBox(item: LintItem, canvas: { width: number; height: number }): Rect {
  const props = item.props ?? {};
  const text = String(props.text ?? '');
  const size = Number(props.fontSize ?? 96) * (item.transform?.scale ?? 1);
  const lines = text.split('\n');
  const w = Math.min(canvas.width, Math.max(...lines.map((l) => l.length), 1) * size * (FACE_EM[String(props.fontFamily)] ?? 0.55));
  const h = lines.length * size * 1.2;
  const cx = canvas.width / 2 + ((item.transform?.x ?? 0) / 100) * canvas.width;
  const cy = canvas.height / 2 + ((item.transform?.y ?? 0) / 100) * canvas.height;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function lintSafeZone(
  items: ReadonlyArray<LintItem>, canvas: { width: number; height: number }, z: SafeZone = DEFAULT_SAFE_ZONE,
): SafeZoneIssue[] {
  const area = safeAreaFor(canvas, z);
  if (area.kind === 'none') return [];
  const safe = area.safe;
  const where = area.kind === 'reel' ? 'the Instagram UI' : 'the 3:4 profile-grid crop';
  const issues: SafeZoneIssue[] = [];
  for (const it of items) {
    if (it.kind !== 'text') continue;
    const b = textBox(it, canvas);
    const out: string[] = [];
    if (b.y < safe.y) out.push('top');
    if (b.y + b.h > safe.y + safe.h) out.push('bottom');
    if (b.x < safe.x) out.push('left');
    if (b.x + b.w > safe.x + safe.w) out.push('right');
    if (out.length) issues.push({ itemId: it.id, startFrame: it.startFrame, message: `Text "${String(it.props?.text ?? it.name ?? '').slice(0, 24)}" overlaps ${where} (${out.join(', ')})` });
  }
  return issues;
}
