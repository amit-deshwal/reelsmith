// Person matte for clip effects: MediaPipe's selfie segmenter run on the frame an effect is about to process, giving a soft
// matte texture (u_mask) and where the subject is (u_subjectCenter / u_subjectSize). Lazy: nothing loads until a clip carries an
// effect that asks for a mask. WASM and model are served from /mediapipe (the editor and the export bundle both provide it).
import { matteFromConfidence, NO_SUBJECT, syntheticPersonConfidence, type SubjectInfo } from './personMaskMath';

export { subjectUniforms, type SubjectInfo } from './personMaskMath';

const WASM_PATH = '/mediapipe/wasm';
/** 'selfie' is tiny and fast and cleans up a single prominent person; 'deeplab' also finds groups and people far from the camera. */
export type PersonModel = 'selfie' | 'deeplab';
const MODEL_FILE: Record<PersonModel, string> = { selfie: '/mediapipe/selfie_segmenter.tflite', deeplab: '/mediapipe/deeplab_v3.tflite' };
/** the PASCAL VOC class index of "person" in DeepLab's 21 masks */
const DEEPLAB_PERSON = 15;
export const DEFAULT_PERSON_MODEL: PersonModel = 'selfie';
/** Long edge of the picture handed to the segmenter; the model itself works at 256 px. */
const SEGMENT_EDGE = 512;

export interface PersonMaskFrame { mask: HTMLCanvasElement; subject: SubjectInfo }
export interface PersonMaskProvider { frameFor: (source: HTMLCanvasElement) => PersonMaskFrame }

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray, w: number, h: number): void {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
}

/** Everything is "subject": what effects get when segmentation is unavailable, so they degrade instead of breaking. */
export function fullFrameMask(): PersonMaskFrame {
  const mask = makeCanvas(2, 2);
  paint(mask, new Uint8ClampedArray(16).fill(255), 2, 2);
  return { mask, subject: { cx: 0.5, cy: 0.5, w: 1, h: 1, area: 1 } };
}

/** A head-and-shoulders stand-in for the effect thumbnails. */
export function syntheticMaskFrame(w = 96, h = 54): PersonMaskFrame {
  const { rgba, subject } = matteFromConfidence(syntheticPersonConfidence(w, h), w, h);
  const mask = makeCanvas(w, h);
  paint(mask, rgba, w, h);
  return { mask, subject: { ...subject, area: Math.max(subject.area, 0.1) } };
}

const loading = new Map<PersonModel, Promise<PersonMaskProvider | null>>();

export function loadPersonMask(model: PersonModel = DEFAULT_PERSON_MODEL): Promise<PersonMaskProvider | null> {
  const cached = loading.get(model);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const segmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_FILE[model], delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      const input = makeCanvas(SEGMENT_EDGE, SEGMENT_EDGE);
      const matte = makeCanvas(2, 2);
      const frameFor = (source: HTMLCanvasElement): PersonMaskFrame => {
        const scale = SEGMENT_EDGE / Math.max(source.width, source.height);
        const w = Math.max(2, Math.round(source.width * scale)), h = Math.max(2, Math.round(source.height * scale));
        if (input.width !== w || input.height !== h) { input.width = w; input.height = h; }
        input.getContext('2d', { willReadFrequently: true })?.drawImage(source, 0, 0, w, h);
        const result = segmenter.segment(input);
        try {
          const conf = result.confidenceMasks?.[model === 'deeplab' ? DEEPLAB_PERSON : 0];
          if (!conf) return fullFrameMask();
          const { rgba, subject } = matteFromConfidence(conf.getAsFloat32Array(), conf.width, conf.height);
          paint(matte, rgba, conf.width, conf.height);
          return { mask: matte, subject };
        } finally {
          result.confidenceMasks?.forEach((m) => m.close());
          result.categoryMask?.close();
          result.close();
        }
      };
      return { frameFor };
    } catch (error) {
      console.warn('[person-mask] segmentation unavailable; mask effects fall back to the whole frame:', error);
      return null;
    }
  })();
  loading.set(model, promise);
  return promise;
}

export { NO_SUBJECT };
