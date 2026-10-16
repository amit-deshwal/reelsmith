// "Reframe to subject": the editor's own subject detection (src/reframe/detect.ts, also used by the agent tool
// auto_reframe) as a plain editor action, so 9:16 reframing works without AI. One undo step replaces any old curve.
import { detectFocalPoints, magnificationForAspect, type DetectedKeyframe } from '../reframe/detect';
import type { AtomicAction } from '../editor/reducerActions';
import type { TimelineItem } from '../editor/types';

export const canSubjectReframe = (item: TimelineItem): boolean => item.kind === 'video' && !!item.src;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Zoom origin (0..1) that puts a subject at `focal` in the middle of the canvas after zooming by `m`.
 * Scaling about origin o moves a point p to o + m*(p - o); solving for 0.5 gives o = (0.5 - m*p) / (1 - m),
 * clamped so the zoomed picture still covers the canvas edge to edge.
 */
export function originCentringSubject(focal: number, m: number): number {
  if (!(m > 1.0001)) return 0.5;
  return clamp01((0.5 - m * focal) / (1 - m));
}

/**
 * The detector reports where the subject is; the editor zooms about a point. A contain-fitted clip already
 * fills the canvas on one axis, so only the other axis may move (the filled axis stays centred, or empty
 * bands appear). Wide clip in a tall canvas: only X moves. Tall clip in a wide canvas: only Y moves.
 */
export function framingOrigin(k: DetectedKeyframe, srcAspect: number, dstAspect: number): { x: number; y: number } {
  const wideSource = srcAspect >= dstAspect;
  return wideSource
    ? { x: originCentringSubject(k.focalPointX, k.magnification), y: 0.5 }
    : { x: 0.5, y: originCentringSubject(k.focalPointY, k.magnification) };
}

/** Remove the clip's existing reframe keyframes and write the new ones. Pure. */
export function reframeBatchActions(
  item: Pick<TimelineItem, 'id' | 'zoom'>, keyframes: readonly DetectedKeyframe[], aspects: { src: number; dst: number },
): AtomicAction[] {
  const old = item.zoom?.reframeCurve?.keyframes ?? [];
  return [
    ...old.map((k) => ({ type: 'removeReframeKeyframe' as const, id: item.id, frame: k.frame })),
    ...keyframes.map((k) => {
      const o = framingOrigin(k, aspects.src, aspects.dst);
      return { type: 'reframeKeyframe' as const, id: item.id, frame: k.frame, focalPointX: o.x, focalPointY: o.y, magnification: k.magnification };
    }),
  ];
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    const timer = setTimeout(() => (video.readyState >= 1 ? resolve(video) : reject(new Error('The video could not be read'))), 8000);
    video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(video); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('The video could not be read')); }, { once: true });
    video.src = src;
  });
}

/** Browser only: sample the clip, find the subject over time, return the actions that frame it in the canvas. */
export async function subjectReframeActions(item: TimelineItem, canvas: { width: number; height: number; fps: number }): Promise<AtomicAction[]> {
  if (!canSubjectReframe(item)) throw new Error('Only video clips can be reframed');
  const video = await loadVideo(item.src!);
  const keyframes = await detectFocalPoints(video, {
    durationInFrames: item.durationInFrames, fps: canvas.fps, dstAspect: canvas.width / canvas.height,
    srcInFrame: item.srcInFrame ?? 0, playbackRate: item.playbackRate,
    srcWidth: video.videoWidth || item.width, srcHeight: video.videoHeight || item.height,
  });
  if (!keyframes.length) throw new Error('No frames could be read from this clip');
  const srcW = video.videoWidth || item.width || 0;
  const srcH = video.videoHeight || item.height || 0;
  return reframeBatchActions(item, keyframes, { src: srcH > 0 ? srcW / srcH : 16 / 9, dst: canvas.width / canvas.height });
}

/** Centre crop: scale a contain-fitted clip until it fills the canvas, keeping its centre. Pure. */
export function fillCanvasActions(item: Pick<TimelineItem, 'id' | 'zoom'>, srcW: number, srcH: number, dstAspect: number): AtomicAction[] {
  const m = magnificationForAspect(srcW, srcH, dstAspect);
  return [
    ...reframeBatchActions(item, [], { src: srcW / srcH, dst: dstAspect }),
    { type: 'setTransform', id: item.id, patch: { scale: m, scaleX: m, scaleY: m, x: 0, y: 0 } },
  ];
}

/** Browser only: read the clip's real size, then fill the canvas. */
export async function centreFillActions(item: TimelineItem, canvas: { width: number; height: number }): Promise<AtomicAction[]> {
  if (!canSubjectReframe(item)) throw new Error('Only video clips can be reframed');
  const video = await loadVideo(item.src!);
  const srcW = video.videoWidth || item.width || 0;
  const srcH = video.videoHeight || item.height || 0;
  if (!(srcW > 0 && srcH > 0)) throw new Error('The clip size could not be read');
  return fillCanvasActions(item, srcW, srcH, canvas.width / canvas.height);
}
