// Browser client for the local analysis routes in server/reelsmith/analyze-plugin.ts.
import type { ClipFeatures } from './assembler/scoring';
import { analyzeSubjects, mergeSubjectFeatures } from './subjectFeatures';
import type { AnalyzeApi } from './runRecipe';
import type { BrandKit } from '../../shared/reelsmith/brandKit';
import { transcribePath } from '../transcript/provider';

export function createAnalyzeApi(fetcher: typeof fetch = fetch, subjects: typeof analyzeSubjects = analyzeSubjects, tags?: AnalyzeApi['shotTags']): AnalyzeApi {
  async function post<T>(path: string, body: unknown): Promise<T | null> {
    const response = await fetcher(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.ok ? await response.json() as T : null;
  }
  return {
    ...(tags ? { shotTags: tags } : {}),
    clipFeatures: async (asset, fps) => {
      const [result, geometry] = await Promise.all([
        post<{ features: ClipFeatures }>('/api/reelsmith/clip-features', { src: asset.src, assetId: asset.id, kind: asset.kind, fps }),
        subjects(asset).catch(() => null),
      ]);
      return result?.features ? mergeSubjectFeatures(result.features, geometry, fps) : null;
    },
    referenceCuts: async (asset, fps) => post<{ cutsFrame: number[]; color?: { r: number; g: number; b: number } }>('/api/reelsmith/reference-cuts', { src: asset.src, fps }),
    selectionSheet: async (items) => {
      const result = await post<{ sheets: Array<{ base64: string; labels: string[] }>; skipped: string[] }>('/api/reelsmith/selection-sheet', {
        items: items.map(({ asset, atSec, label }) => ({ src: asset.src, kind: asset.kind === 'image' ? 'image' : 'video', atSec, label })),
      });
      return result?.sheets ? { sheets: result.sheets, skipped: result.skipped ?? [] } : null;
    },
    upscale: async (asset) => {
      if (!asset.width || !asset.height) return null;
      const r = await post<{ available: boolean; src?: string; width?: number; height?: number }>('/api/reelsmith/upscale', { src: asset.src, width: asset.width, height: asset.height });
      return r?.available && r.src && r.width && r.height ? { src: r.src, width: r.width, height: r.height } : null;
    },
    stillFrame: async (asset, atSec) => {
      const r = await post<{ src: string; width: number; height: number }>('/api/reelsmith/still-frame', { src: asset.src, atSec });
      return r?.src && r.width && r.height ? r : null;
    },
    reverseClip: async (src, startSec, frames, fps) => {
      const response = await fetcher('/api/reelsmith/reverse-clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, startSec, frames, fps }) });
      const r = await response.json().catch(() => ({})) as { src?: string; width?: number; height?: number; frames?: number; error?: string };
      return response.ok && r.src && r.width && r.height && r.frames ? { src: r.src, width: r.width, height: r.height, frames: r.frames } : { error: r.error ?? `reverse failed (${response.status})` };
    },
    smoothSlow: async (src, startSec, rate, frames, fps) => {
      const response = await fetcher('/api/reelsmith/smooth-slow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, startSec, rate, frames, fps }) });
      const r = await response.json().catch(() => ({})) as { src?: string; width?: number; height?: number; frames?: number; skipped?: string; unavailable?: boolean; error?: string };
      if (response.ok && r.skipped) return { skipped: r.skipped, ...(r.unavailable ? { unavailable: true } : {}) };
      return response.ok && r.src && r.width && r.height && r.frames ? { src: r.src, width: r.width, height: r.height, frames: r.frames } : { error: r.error ?? `smoothing failed (${response.status})` };
    },
    motionBlur: async (src, startSec, rate, frames, fps, strength) => {
      const response = await fetcher('/api/reelsmith/motion-blur', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, startSec, rate, frames, fps, strength }) });
      const r = await response.json().catch(() => ({})) as { src?: string; width?: number; height?: number; frames?: number; skipped?: string; unavailable?: boolean; error?: string };
      if (response.ok && r.skipped) return { skipped: r.skipped, ...(r.unavailable ? { unavailable: true } : {}) };
      return response.ok && r.src && r.width && r.height && r.frames ? { src: r.src, width: r.width, height: r.height, frames: r.frames } : { error: r.error ?? `motion blur failed (${response.status})` };
    },
    smoothCut: async (src, fromSec, toSec, frames, fps) => {
      const response = await fetcher('/api/reelsmith/smooth-cut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, fromSec, toSec, frames, fps }) });
      const r = await response.json().catch(() => ({})) as { src?: string; width?: number; height?: number; frames?: number; skipped?: string; unavailable?: boolean; error?: string };
      if (response.ok && r.skipped) return { skipped: r.skipped, ...(r.unavailable ? { unavailable: true } : {}) };
      return response.ok && r.src && r.width && r.height && r.frames ? { src: r.src, width: r.width, height: r.height, frames: r.frames } : { error: r.error ?? `smooth cut failed (${response.status})` };
    },
    mediaFps: async (srcs) => (await post<{ fps: Array<number | null> }>('/api/reelsmith/media-fps', { srcs }))?.fps ?? srcs.map(() => null),
    brandKit: async (url) => {
      const response = await fetcher('/api/reelsmith/brand-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const r = await response.json().catch(() => ({})) as { kit?: BrandKit; error?: string };
      return response.ok && r.kit ? r.kit : { error: r.error ?? `could not read the page (${response.status})` };
    },
    speechShare: async (asset) => (await post<{ share: number | null }>('/api/reelsmith/speech-share', { src: asset.src }))?.share ?? null,
    transcribe: async (asset, onProgress, opts) => {
      const r = await transcribePath(asset.src, (note) => { if (note) onProgress?.(note); }, opts?.language ? { languageCode: opts.language } : {});
      return r.words.length ? r.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) : null;
    },
    musicGrid: async (asset) => (await post<{ grid: never }>('/api/reelsmith/music-grid', { src: asset.src }))?.grid ?? null,
  };
}

export const analyzeApi = createAnalyzeApi();
