import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { MediaAsset } from '../editor/types';
import type { VisualGeometryAsset } from '../geometry/visual-geometry';
import type { GeomRect } from '../geometry/geometry-math';
import type { ClipFeatures } from './assembler/scoring';

function area(rect: GeomRect | null): number {
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(1, rect.x + rect.w) - Math.max(0, rect.x))
    * Math.max(0, Math.min(1, rect.y + rect.h) - Math.max(0, rect.y));
}

/** Weight local face/person measurements by overlap with each scoring window. */
export function mergeSubjectFeatures(features: ClipFeatures, geometry: VisualGeometryAsset | null, fps: number): ClipFeatures {
  if (!geometry || geometry.assetId !== features.assetId || !(fps > 0)) return features;
  return { ...features, windows: features.windows.map((window) => {
    const start = window.startFrame / fps; const end = window.endFrame / fps;
    let face = 0; let subject = 0;
    for (const segment of geometry.segments) {
      const overlap = Math.max(0, Math.min(end, segment.endSec) - Math.max(start, segment.startSec));
      face += overlap * area(segment.zone.face);
      subject += overlap * area(segment.zone.subject);
    }
    const length = end - start;
    return { ...window, face: length > 0 ? Math.min(1, face / length) : 0,
      subject: Math.max(window.subject, length > 0 ? Math.min(1, subject / length) : 0) };
  }) };
}

/** Reuse bundled MediaPipe models; failures/timeouts leave the model-free scores usable. */
async function computeSubjects(asset: MediaAsset): Promise<VisualGeometryAsset | null> {
  if (typeof document === 'undefined' || !asset.src.startsWith('/media/uploads/')) return null;
  const signal = AbortSignal.timeout(4_000);
  try {
    if (asset.kind === 'video') {
      const { analyzeAssetGeometry } = await import('../geometry/visual-geometry');
      return (await analyzeAssetGeometry(asset, signal, { maxSamples: 12 })).geometry;
    }
    if (asset.kind !== 'image') return null;
    const { getMediaPipeRuntime, inferFrameFromPixels, INFERENCE_EDGE } = await import('../geometry/mediapipe');
    const runtime = await getMediaPipeRuntime(signal);
    if (!runtime) return null;
    const response = await fetch(asset.src, { signal });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    try {
      signal.throwIfAborted();
      const scale = Math.min(1, INFERENCE_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const frame = inferFrameFromPixels(runtime, image);
      // A still has the same detected face at every source time.
      return { assetId: asset.id, sourceRevision: '', algorithmVersion: 'reels-still-v1', durationSec: 1,
        segments: [{ startSec: 0, endSec: Number.MAX_SAFE_INTEGER, person: 'none', zone: { rects: [], face: frame.face, subject: null } }] };
    } finally { bitmap.close(); }
  } catch { return null; }
}

const subjectCache = new Map<string, Promise<VisualGeometryAsset | null>>();
export function analyzeSubjects(asset: MediaAsset): Promise<VisualGeometryAsset | null> {
  const key = `${asset.id}:${sourceRevisionOf(asset)}`;
  const cached = subjectCache.get(key);
  if (cached) return cached;
  const work = computeSubjects(asset).then((geometry) => {
    if (!geometry && subjectCache.get(key) === work) subjectCache.delete(key);
    return geometry;
  });
  if (subjectCache.size >= 100) subjectCache.delete(subjectCache.keys().next().value!);
  subjectCache.set(key, work);
  return work;
}
