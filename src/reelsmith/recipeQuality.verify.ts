// Audit: every bundled recipe built from realistic phone footage must not enlarge any shot into a blocky picture.
// Source shapes are the ones real phones make: 12 MP landscape and portrait photos, 4K portrait video, 1080p landscape video.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import type { AtomicAction } from '../editor/reducerActions';
import { activeTimeline, type MediaAsset } from '../editor/types';
import { runRecipe, type AnalyzeApi } from './runRecipe';
import { defaultValues, mediaInputs } from './setupForm';
import { lintReel } from './reelLint';
import { UPSCALE_BLOCKY, upscaleFactor } from './qualityLint';

const recipes: Recipe[] = readdirSync('recipes').filter((f) => f.endsWith('.recipe.json')).map((f) => {
  const r = parseRecipe(readFileSync(`recipes/${f}`, 'utf8')); assert.ok(r.ok, f); return r.recipe;
});
assert.ok(recipes.length >= 9);

const hash = (n: number) => (((n + 1) * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + (((n + 7) * 0x85ebca6b) >>> 0).toString(16).padStart(8, '0');
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: hash(Number(a.id.replace(/\D/g, '')) || 0), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.5, exposure: 0.7, motion: 0.4, subject: 0, face: 0, speech: 0 } as never], cuts: [] } as never),
  musicGrid: async () => ({ durationSec: 120, beatTimesSec: Array.from({ length: 240 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};

interface Shape { name: string; kind: 'image' | 'video'; width: number; height: number; frames: number }
const SHAPES: Shape[] = [
  { name: 'landscape photo 4032x3024', kind: 'image', width: 4032, height: 3024, frames: 150 },
  { name: 'portrait photo 3024x4032', kind: 'image', width: 3024, height: 4032, frames: 150 },
  { name: 'portrait 4K video', kind: 'video', width: 2160, height: 3840, frames: 300 },
  { name: 'landscape 1080p video', kind: 'video', width: 1920, height: 1080, frames: 300 },
  // downsized or messaged photos and phone-screen video: what the Hazy Overture reel was built from
  { name: 'small landscape photo 1600x1200', kind: 'image', width: 1600, height: 1200, frames: 150 },
  { name: 'small portrait photo 1200x1600', kind: 'image', width: 1200, height: 1600, frames: 150 },
  { name: 'portrait 1080p video', kind: 'video', width: 1080, height: 1920, frames: 300 },
];

const report: string[] = [];
let built = 0;
for (const recipe of recipes) {
  for (const shape of SHAPES) {
    const accepted = mediaInputs(recipe).some((i) => i.accept.includes(shape.kind));
    if (!accepted) continue;
    const media: MediaAsset[] = Array.from({ length: 24 }, (_, i) => ({
      id: `m${i}`, name: `${shape.kind}${i}`, kind: shape.kind, src: `/media/uploads/m${i}`, durationInFrames: shape.frames, width: shape.width, height: shape.height,
    }));
    const song: MediaAsset = { id: 'song', name: 'song', kind: 'audio', src: '/media/uploads/song', durationInFrames: 3600 };
    const assets = [...media, song];
    const values = defaultValues(recipe);
    values.media = Object.fromEntries(mediaInputs(recipe).map((i) => [i.id, (i.accept.includes('audio') && !i.accept.includes('video') ? [song] : media.filter((m) => i.accept.includes(m.kind as 'image' | 'video' | 'audio')).slice(0, i.max)).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' | 'audio' }))]));
    let out;
    try { out = await runRecipe(api, { recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3 }); } catch (e) { if (/add at least/.test(String(e))) continue; report.push(`${recipe.id} / ${shape.name}: threw ${String(e)}`); continue; }
    if (!out.action) continue; // refused (not enough footage etc.) is not a quality problem
    let h: History = { past: [], present: emptyProjectDoc(), future: [] };
    h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
    h = historyReduce(h, { type: 'batch', label: recipe.id, actions: out.action.actions });
    const state = activeTimeline(h.present);
    built += 1;
    let worst = 0; let worstName = '';
    for (const item of state.items) {
      if (item.kind !== 'image' && item.kind !== 'video') continue;
      const up = upscaleFactor(item, { width: state.width, height: state.height });
      if (up !== null && up > worst) { worst = up; worstName = item.name; }
    }
    const lint = lintReel(state);
    const blocky = lint.issues.filter((i) => /blocky/.test(i.message));
    report.push(`${recipe.id.padEnd(20)} ${shape.name.padEnd(28)} worst enlargement ${worst.toFixed(2)}x${blocky.length ? `  BLOCKY x${blocky.length} (${worstName})` : ''}`);
  }
}
console.log(report.join('\n'));
assert.ok(built >= 30, `only ${built} recipe x footage combinations built`);
const bad = report.filter((l) => /BLOCKY|threw/.test(l));
assert.deepEqual(bad, [], `shots enlarged beyond ${UPSCALE_BLOCKY}x on normal phone footage`);
console.log('recipeQuality verify ok');
