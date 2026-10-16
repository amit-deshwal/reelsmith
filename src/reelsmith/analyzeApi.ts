// Browser client for the local analysis routes in server/reelsmith/analyze-plugin.ts.
import type { ClipFeatures } from './assembler/scoring';
import { analyzeSubjects, mergeSubjectFeatures } from './subjectFeatures';
import type { AnalyzeApi } from './runRecipe';

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
    selectionSheet: async (items) => {
      const result = await post<{ sheets: Array<{ base64: string; labels: string[] }>; skipped: string[] }>('/api/reelsmith/selection-sheet', {
        items: items.map(({ asset, atSec, label }) => ({ src: asset.src, kind: asset.kind === 'image' ? 'image' : 'video', atSec, label })),
      });
      return result?.sheets ? { sheets: result.sheets, skipped: result.skipped ?? [] } : null;
    },
    musicGrid: async (asset) => (await post<{ grid: never }>('/api/reelsmith/music-grid', { src: asset.src }))?.grid ?? null,
  };
}

export const analyzeApi = createAnalyzeApi();
