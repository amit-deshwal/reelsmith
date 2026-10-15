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

interface LintItem {
  id: string; kind: string; name?: string; startFrame: number; durationInFrames: number;
  width?: number; height?: number; props?: Record<string, unknown>; transform?: { x?: number; y?: number; scale?: number };
}
export interface SafeZoneIssue { itemId: string; startFrame: number; message: string }

/** Estimated text box: single or multi line, centred on the canvas then offset by transform x/y (percent of canvas). */
export function textBox(item: LintItem, canvas: { width: number; height: number }): Rect {
  const props = item.props ?? {};
  const text = String(props.text ?? '');
  const size = Number(props.fontSize ?? 96) * (item.transform?.scale ?? 1);
  const lines = text.split('\n');
  const w = Math.min(canvas.width, Math.max(...lines.map((l) => l.length), 1) * size * 0.55);
  const h = lines.length * size * 1.2;
  const cx = canvas.width / 2 + ((item.transform?.x ?? 0) / 100) * canvas.width;
  const cy = canvas.height / 2 + ((item.transform?.y ?? 0) / 100) * canvas.height;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function lintSafeZone(
  items: ReadonlyArray<LintItem>, canvas: { width: number; height: number }, z: SafeZone = DEFAULT_SAFE_ZONE,
): SafeZoneIssue[] {
  const safe = safeRect(canvas, z);
  const issues: SafeZoneIssue[] = [];
  for (const it of items) {
    if (it.kind !== 'text') continue;
    const b = textBox(it, canvas);
    const out: string[] = [];
    if (b.y < safe.y) out.push('top');
    if (b.y + b.h > safe.y + safe.h) out.push('bottom');
    if (b.x < safe.x) out.push('left');
    if (b.x + b.w > safe.x + safe.w) out.push('right');
    if (out.length) issues.push({ itemId: it.id, startFrame: it.startFrame, message: `Text "${String(it.props?.text ?? it.name ?? '').slice(0, 24)}" overlaps the Instagram UI (${out.join(', ')})` });
  }
  return issues;
}
