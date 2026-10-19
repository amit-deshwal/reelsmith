// Titles and captions must not sit on a face. After a reel is assembled, any text whose band overlaps the face or subject
// of the shot under it is moved above or below that region, whichever is closer and still inside the Instagram safe area.
import type { AtomicAction } from '../editor/reducerActions';
import type { AssemblyClip } from './assembler/types';
import type { FocusRect } from './cropFocus';
import { fitTextInSafeWidth, safeRect } from './safeZone';

type Canvas = { width: number; height: number };
type Band = [number, number]; // canvas fractions, top to bottom

/** Face or subject rect of the analysed window that overlaps the played source range most. */
export function focusForRange(clip: AssemblyClip, startFrame: number, endFrame: number): FocusRect | undefined {
  const overlapOf = (w: { startFrame: number; endFrame: number }) => clip.kind === 'image' ? 1 : Math.max(0, Math.min(endFrame, w.endFrame) - Math.max(startFrame, w.startFrame));
  let best: { focusRect?: FocusRect; startFrame: number; endFrame: number } | undefined;
  for (const w of clip.sourceAnalysis?.windows ?? []) if (w.focusRect && overlapOf(w) > (best ? overlapOf(best) : -1)) best = w;
  return best?.focusRect;
}

/** Where the focus rect lands vertically on the canvas, given how the shot is placed (cover transform, or contain fit). */
export function focusBand(item: { width?: number; height?: number; transform?: { scale?: number; scaleY?: number; y?: number } }, canvas: Canvas, focus: FocusRect): Band | null {
  const { width: w, height: h } = item;
  if (!(w && h)) return null;
  const containH = Math.min(canvas.width / w, canvas.height / h) * h; // px of canvas height the contain-fitted picture spans
  const scale = Math.abs(item.transform?.scaleY ?? item.transform?.scale ?? 1);
  const drawn = containH * scale;
  const top = canvas.height / 2 + ((item.transform?.y ?? 0) / 100) * canvas.height - drawn / 2;
  return [(top + focus.y * drawn) / canvas.height, (top + (focus.y + focus.h) * drawn) / canvas.height];
}

const MARGIN = 0.02;

export function withTitleClear(actions: AtomicAction[], clips: AssemblyClip[], canvas: Canvas): AtomicAction[] {
  const byId = new Map(clips.map((c) => [c.assetId, c]));
  const visuals = actions.flatMap((a) => (a.type === 'add' && (a.item.kind === 'video' || a.item.kind === 'image') ? [a] : []));
  const safe = safeRect(canvas);
  const safeTop = safe.y / canvas.height;
  const safeBottom = (safe.y + safe.h) / canvas.height;
  const placed = actions.map((action) => {
    if (action.type !== 'add') return action;
    const behind = !!(action.item.props as { rsBehind?: unknown } | undefined)?.rsBehind;
    if (action.item.kind !== 'text' && !(behind && action.item.kind === 'motion-graphic')) return action;
    const text = action.item;
    // Layouts that place their words exactly (postcard-collage@1) keep them where they are.
    if ((text.props as { rsFixedPosition?: unknown } | undefined)?.rsFixedPosition) return action;
    const textStart = action.startFrame ?? 0;
    const textEnd = textStart + text.durationInFrames;
    const under = visuals
      .map((v) => ({ v, overlap: Math.min(textEnd, (v.startFrame ?? 0) + v.item.durationInFrames) - Math.max(textStart, v.startFrame ?? 0) }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)[0]?.v;
    const clip = under?.item.sourceAssetId ? byId.get(under.item.sourceAssetId) : undefined;
    if (!under || !clip) return action;
    const rate = under.item.playbackRate ?? 1;
    const from = under.item.srcInFrame ?? 0;
    const focus = focusForRange(clip, from, from + under.item.durationInFrames * rate);
    const band = focus ? focusBand(under.item, canvas, focus) : null;
    if (!band) return action;
    // a line behind the person crosses their head and shoulders (they are cut out on top), as on a magazine cover
    if (behind) {
      const target = Math.min(safeBottom - 0.05, Math.max(safeTop + 0.05, band[0] + (band[1] - band[0]) * 0.4));
      return text.kind === 'motion-graphic'
        ? { ...action, item: { ...text, props: { ...(text.props ?? {}), x: 0.5, y: target } } }
        : { ...action, item: { ...text, transform: { ...(text.transform as object | undefined), y: (target - 0.5) * 100 } } };
    }
    const lines = String(text.props?.text ?? '').split('\n').length;
    const fontSize = typeof text.props?.fontSize === 'number' ? text.props.fontSize : 96;
    const half = (fontSize * 1.25 * lines) / 2 / canvas.height;
    const y = (text.transform as { y?: number } | undefined)?.y ?? 0;
    const centre = 0.5 + y / 100;
    if (centre + half < band[0] - MARGIN || centre - half > band[1] + MARGIN) return action; // already clear
    const options = [band[0] - MARGIN - half, band[1] + MARGIN + half] // centre above the face, centre below it
      .filter((c) => c - half >= safeTop && c + half <= safeBottom)
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
    if (!options.length) return action;
    return { ...action, item: { ...text, transform: { ...(text.transform as object | undefined), y: (options[0]! - 0.5) * 100 } } };
  });
  // and clear of the side UI: a long line centred on the canvas runs under the like/comment/share column
  return placed.map((action) => action.type === 'add' && action.item.kind === 'text' && !(action.item.props as { rsFixedPosition?: unknown } | undefined)?.rsFixedPosition
    ? { ...action, item: fitTextInSafeWidth(action.item, canvas) }
    : action);
}
