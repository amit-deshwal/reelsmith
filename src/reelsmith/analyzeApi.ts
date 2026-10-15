// Browser client for the local analysis routes in server/reelsmith/analyze-plugin.ts.
import type { AnalyzeApi } from './runRecipe';

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export const analyzeApi: AnalyzeApi = {
  clipFeatures: async (a, fps) => (await post<{ features: never }>('/api/reelsmith/clip-features', { src: a.src, assetId: a.id, fps }))?.features ?? null,
  musicGrid: async (a) => (await post<{ grid: never }>('/api/reelsmith/music-grid', { src: a.src }))?.grid ?? null,
};
