// Every person in one picture: MediaPipe's object detector (EfficientDet-Lite0, "person" only) for a box per body,
// which still finds someone whose face is covered or who stands behind another, and the face detector to put the
// head on the face when it shows. Browser only; lazy, and anything failing returns no people (the marker keeps the
// face the build found). WASM and models are self-hosted under /mediapipe (scripts/sync-mediapipe.mjs).
import type { FaceDetector, ObjectDetector } from '@mediapipe/tasks-vision';
import type { AimShot } from './director/graphics';
import type { FoundPerson } from './director/aimMarkers';

const WASM_PATH = '/mediapipe/wasm';
const PERSON_MODEL = '/mediapipe/efficientdet_lite0.tflite';
const FACE_MODEL = '/mediapipe/blaze_face_short_range.tflite';
/** Long edge of the picture handed to the detectors; small people at the back need more than the models' 320 px. */
const EDGE = 640;
const MIN_SCORE = 0.3;
const TIMEOUT_MS = 15_000;

let detectors: Promise<{ people: ObjectDetector; faces: FaceDetector } | null> | null = null;

function load() {
  detectors ??= (async () => {
    const { FaceDetector, FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM_PATH);
    const [people, faces] = await Promise.all([
      ObjectDetector.createFromOptions(files, { baseOptions: { modelAssetPath: PERSON_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: MIN_SCORE, categoryAllowlist: ['person'], maxResults: 10 }),
      FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 }),
    ]);
    return { people, faces };
  })().catch(() => { detectors = null; return null; });
  return detectors;
}

async function frameOf(shot: AimShot, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, EDGE / Math.max(shot.width, shot.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(shot.width * scale));
  canvas.height = Math.max(2, Math.round(shot.height * scale));
  const ctx = canvas.getContext('2d')!;
  if (shot.kind === 'image') {
    const response = await fetch(shot.src, { signal });
    const bitmap = await createImageBitmap(await response.blob());
    try { ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); } finally { bitmap.close(); }
    return canvas;
  }
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = shot.src;
  try {
    const once = (event: string) => new Promise<void>((resolve, reject) => {
      video.addEventListener(event, () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('video failed')), { once: true });
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    await once('loadeddata');
    video.currentTime = Math.max(0, Math.min(shot.sec, (video.duration || shot.sec) - 0.05));
    await once('seeked');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** The people in the shot's picture, biggest box first, as fractions of the picture. */
export async function findPeople(shot: AimShot): Promise<FoundPerson[]> {
  if (typeof document === 'undefined') return [];
  const ready = await load();
  if (!ready) return [];
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const canvas = await frameOf(shot, signal);
  const W = canvas.width, H = canvas.height;
  const faces = ready.faces.detect(canvas).detections.flatMap((d) => (d.boundingBox ? [{ x: d.boundingBox.originX / W, y: d.boundingBox.originY / H, w: d.boundingBox.width / W, h: d.boundingBox.height / H }] : []));
  const people = ready.people.detect(canvas).detections.flatMap((d) => {
    const b = d.boundingBox;
    return b ? [{ x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H, score: d.categories[0]?.score ?? 0 }] : [];
  }).sort((a, b) => b.w * b.h - a.w * a.h);
  // each face goes to the smallest box whose top half holds its centre (the face of the person at the back, not the one in front)
  const used = new Set<number>();
  const out: FoundPerson[] = people.map((p) => ({ ...p }));
  for (const [i, p] of [...out.entries()].reverse()) {
    const k = faces.findIndex((f, j) => !used.has(j) && f.x + f.w / 2 >= p.x && f.x + f.w / 2 <= p.x + p.w && f.y + f.h / 2 >= p.y && f.y + f.h / 2 <= p.y + p.h * 0.6);
    if (k >= 0) { used.add(k); out[i] = { ...p, face: faces[k]! }; }
  }
  // a face with no body box (cropped out of frame, a close selfie) is a person too
  for (const [j, f] of faces.entries()) if (!used.has(j)) out.push({ x: f.x - f.w * 0.5, y: f.y, w: f.w * 2, h: Math.min(1 - f.y, f.h * 4), score: 0.5, face: f });
  return out.sort((a, b) => b.w * b.h - a.w * a.h);
}
