// The Recipes panel's side of reel recipes (director/reelRecipe.ts): save the directed reel on the timeline as a
// recipe with a poster, finish a remix built from one, and share a recipe as one file (Cardboard shares a link; we
// stay local: the file carries the recipe and its poster, and importing it validates it like any user recipe).
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import type { BatchAction } from '../editor/reducerActions';
import type { MediaAsset, TimelineItem } from '../editor/types';
import { findSavedDirector, savedDirector, updateDirectorSession, type SavedDirector } from './director/directorSession';
import { finishDirectorActions, sectionSpans, stampDirector } from './director/finishBuild';
import { reelTemplateOf, reelToRecipe, remixTreatment } from './director/reelRecipe';
import type { AnalyzeApi, RunOutcome } from './runRecipe';
import type { ClipShotTags } from './shotTags';
import { saveUserRecipe } from './userRecipesApi';

export const SHARE_FORMAT = 'reelsmith-recipe';
export const SHARE_EXT = '.reelrecipe.json';

const slug = (s: string, n = 32) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n) || 'reel';
export const newRecipeId = (name: string) => `ai-${slug(name, 40)}-${crypto.randomUUID().slice(0, 6)}`;

/** The base shot to make the poster from: the first shot of the longest section, at the moment it plays. */
export function posterShot(items: readonly TimelineItem[], saved: SavedDirector, fps: number, assets: readonly Pick<MediaAsset, 'id' | 'src'>[] = []): { src: string; atSec: number } | undefined {
  const srcOf = (it: TimelineItem) => it.src ?? assets.find((a) => a.id === it.sourceAssetId)?.src;
  const spans = saved.build?.spans ?? [];
  const order = spans.map((s, i) => ({ i, len: s.to - s.from })).sort((a, b) => b.len - a.len).map((s) => s.i);
  for (const i of order) {
    const shot = items.filter((it) => (it.kind === 'video' || it.kind === 'image') && !it.effects?.some((e) => e.assetId === 'builtin:fx-person-cutout') && String(it.props?.rsSection ?? '').startsWith(`${i + 1}-`) && srcOf(it))
      // tracks are bound to real ids by now: the section's earliest shot, the longest if several start together (the base, not a strip)
      .sort((a, b) => (a.startFrame ?? 0) - (b.startFrame ?? 0) || b.durationInFrames - a.durationInFrames)[0];
    const src = shot && srcOf(shot);
    if (shot && src) return { src, atSec: shot.kind === 'video' ? ((shot.srcInFrame ?? 0) + shot.durationInFrames * 0.45 * (shot.playbackRate ?? 1)) / fps : 0 };
  }
  return undefined;
}

/** A frame of the source, cropped to the recipe's shape and scaled to 540 px wide, as base64 JPEG. */
async function posterJpeg(src: string, atSec: number, aspect: number): Promise<string | undefined> {
  const res = await fetch('/api/reelsmith/frame-jpeg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, atSec }) });
  const body = await res.json().catch(() => null) as { base64?: string } | null;
  if (!res.ok || !body?.base64) return undefined;
  const img = new Image();
  img.src = `data:image/jpeg;base64,${body.base64}`;
  await img.decode();
  const W = 540;
  const H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  canvas.getContext('2d')!.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
}

async function writePoster(id: string, base64: string): Promise<string | undefined> {
  const res = await fetch('/api/reelsmith/user-recipe-previews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, base64 }) });
  const body = await res.json().catch(() => null) as { poster?: string } | null;
  return res.ok ? body?.poster : undefined;
}

/** Save the directed reel on the timeline as a user recipe; returns it and what could not come along. */
export async function saveReelAsRecipe(o: {
  name: string; projectId: string; items: readonly TimelineItem[]; assets: readonly MediaAsset[]; fps: number;
  shotTags?: (assets: MediaAsset[]) => Promise<Map<string, ClipShotTags>>;
}): Promise<{ recipe: Recipe; notes: string[] }> {
  const saved = findSavedDirector(o.items);
  if (!saved?.build) throw new Error('There is no directed reel on this timeline to save.');
  const cast = new Set(saved.build.clips?.flat() ?? saved.build.plan.sections.flatMap((s) => (s.clips ?? []).map((c) => c.split('@')[0]!)));
  const castAssets = o.assets.filter((a) => cast.has(a.id));
  const tags = new Map<string, string>();
  const found = await o.shotTags?.(castAssets).catch(() => new Map<string, ClipShotTags>());
  for (const [id, t] of found ?? []) tags.set(id, t.top);
  const id = newRecipeId(o.name);
  const { recipe, dropped } = reelToRecipe(saved, { id, name: o.name, tags });
  const notes: string[] = [];
  if (dropped.length) notes.push(`Left out (they exist only in the session that made them): ${dropped.join(', ')}.`);
  if (!tags.size) notes.push('Shots could not be tagged (the visual model is not installed), so a remix casts by score only.');
  const shot = posterShot(o.items, saved, o.fps, o.assets);
  const poster = shot ? await posterJpeg(shot.src, shot.atSec, recipe.canvas.width / recipe.canvas.height).catch(() => undefined) : undefined;
  const path = poster ? await writePoster(id, poster).catch(() => undefined) : undefined;
  if (path) recipe.preview = { poster: path, generatedFrom: 'user-footage' };
  return { recipe: await saveUserRecipe(recipe), notes };
}

/**
 * A remix built from the Recipes panel: the same finishing steps as an agent build, and the run saved on the reel
 * and in the director session, so "make the ending stronger" in chat works on it like on a directed reel.
 */
export async function finishRemix(out: RunOutcome, recipe: Recipe, o: { projectId: string; assets: readonly MediaAsset[]; fps: number; api: Pick<AnalyzeApi, 'reverseClip'>; onProgress?: (text: string) => void }): Promise<BatchAction | null> {
  const template = reelTemplateOf(recipe);
  if (!out.action || !out.plan || !template) return out.action;
  out.messages.push(...await finishDirectorActions(out.action.actions, [...o.assets], o.api, o.fps, o.onProgress));
  const report = out.result.report;
  const treatment = remixTreatment(template, out.plan);
  const session = updateDirectorSession(o.projectId, {
    fps: o.fps, ...(treatment ? { treatment } : {}), reference: undefined, askFirst: undefined, gate: undefined,
    lastBuild: { plan: out.plan, spans: sectionSpans(out.action.actions, out.plan.sections.length, o.fps), builds: 1, clips: report.sectionClips ?? [], moments: report.sectionMoments ?? [], shotSec: report.shotSec ?? [] },
  });
  return { ...out.action, actions: stampDirector(out.action.actions, savedDirector(session)) };
}

/** One file with the recipe and its poster (base64 JPEG), to send to someone. */
export async function recipeShareFile(recipe: Recipe): Promise<{ name: string; blob: Blob }> {
  let poster: string | undefined;
  if (recipe.preview?.poster) {
    const res = await fetch(`/api/reelsmith/user-recipe-previews/${recipe.id}.jpg`).catch(() => null);
    if (res?.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      poster = btoa(bin);
    }
  }
  const { preview: _local, ...portable } = recipe;
  const body = JSON.stringify({ format: SHARE_FORMAT, v: 1, recipe: portable, ...(poster ? { poster } : {}) }, null, 2);
  return { name: `${slug(recipe.name, 48)}${SHARE_EXT}`, blob: new Blob([body], { type: 'application/json' }) };
}

/**
 * A shared file (or a bare recipe JSON) read back: validated, given a fresh ai- id so it never replaces one of yours,
 * stripped of agentHints (only built-in recipes may instruct the agent) and saved with its poster.
 */
export async function importRecipeFile(text: string): Promise<Recipe> {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a recipe (not JSON).'); }
  const wrapped = !!data && typeof data === 'object' && (data as { format?: unknown }).format === SHARE_FORMAT;
  const raw = (wrapped ? (data as { recipe?: unknown }).recipe : data) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') throw new Error('This file has no recipe in it.');
  const { agentHints: _hints, preview: _preview, ...rest } = raw;
  const name = typeof rest.name === 'string' ? rest.name : 'Imported recipe';
  const id = newRecipeId(name);
  const parsed = parseRecipe(JSON.stringify({ ...rest, id }));
  if (!parsed.ok) throw new Error(`This recipe is not valid: ${parsed.errors.slice(0, 4).join('; ')}`);
  const recipe = parsed.recipe;
  const poster = wrapped ? (data as { poster?: unknown }).poster : undefined;
  const path = typeof poster === 'string' ? await writePoster(id, poster).catch(() => undefined) : undefined;
  if (path) recipe.preview = { poster: path, generatedFrom: 'user-footage' };
  return saveUserRecipe(recipe);
}
