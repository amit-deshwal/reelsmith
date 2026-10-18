// Sections whose effects fold the picture into a pattern (kaleidoscope, mirror) need bright, colourful, sharp shots:
// dark or flat shots turn to mush and faces get sliced apart. This moves the best-suited clips onto those slots
// (swapping in an unused clip when it suits clearly better) and leaves faces and dark shots for the plain sections.
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AssemblyClip, PlannedShot } from './types';
import { realAssetId } from './extraWindows';

export const PATTERN_EFFECTS = ['builtin:fx-kaleidoscope', 'builtin:fx-mirror'];

/** An unused clip replaces a picked one only when it suits the pattern this much better. */
const SPARE_MARGIN = 0.1;

/** Names of the sections that apply a pattern effect. */
export function patternSections(recipe: Recipe): Set<string> {
  return new Set(recipe.structure.filter((s) => s.effects?.some((e) => PATTERN_EFFECTS.includes(e.assetId))).map((s) => s.section));
}

/** 0..1: how well a clip survives a kaleidoscope. Unknown measurements count as middling. */
export function patternSuitability(c: AssemblyClip): number {
  let brightness = 0.5;
  let colourful = 0.4;
  if (c.color) {
    const { r, g, b } = c.color;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // best around mid-bright; crushed shots are worst, blown-out ones lose detail too
    brightness = luma < 0.55 ? Math.max(0, (luma - 0.12) / 0.43) : Math.max(0.4, 1 - (luma - 0.55) * 1.5);
    const max = Math.max(r, g, b);
    colourful = max > 0 ? Math.min(1, ((max - Math.min(r, g, b)) / max) * 2) : 0;
  }
  const sharp = c.sharpness ?? 0.5;
  const s = c.shot?.scores;
  const tags = s ? (s.scenery + s.detail + s.water + s.city) * 0.25 - s.portrait * 0.45 - s.people * 0.2 - s.night * 0.3 : 0;
  return 0.35 * brightness + 0.2 * colourful + 0.3 * sharp + 0.15 + tags;
}

/**
 * Reorder `picked` (one clip per shot) so pattern-section shots get the best-suited clips. Each slot keeps its clip
 * kind (video/image), so placement and the long-shot video rule are unaffected. `lockFirst` keeps a user-chosen opener.
 */
export function castPatternSlots(
  picked: AssemblyClip[], shots: PlannedShot[], pool: AssemblyClip[], pattern: Set<string>, lockFirst: boolean,
): { order: AssemblyClip[]; swapped: number } {
  const out = [...picked];
  const isPattern = (i: number) => pattern.has(shots[i]!.section) && !(lockFirst && i === 0);
  const movable = out.map((_, i) => i).filter((i) => !(lockFirst && i === 0));
  if (!movable.some(isPattern)) return { order: out, swapped: 0 };
  const suit = new Map<AssemblyClip, number>();
  const suitOf = (c: AssemblyClip) => suit.get(c) ?? suit.set(c, patternSuitability(c)).get(c)!;
  const usedAssets = new Set(out.map(realAssetId));
  const usedGroups = new Set(out.flatMap((c) => (c.groupId ? [c.groupId] : [])));
  let swapped = 0;
  for (const kind of ['video', 'image'] as const) {
    const slots = movable.filter((i) => out[i]!.kind === kind);
    const pSlots = slots.filter(isPattern);
    if (!pSlots.length) continue;
    const oSlots = slots.filter((i) => !isPattern(i));
    const own = slots.map((i) => out[i]!);
    const spares = pool
      .filter((c) => c.kind === kind && !usedAssets.has(realAssetId(c)) && !(c.groupId && usedGroups.has(c.groupId)))
      .sort((a, b) => suitOf(b) - suitOf(a) || a.assetId.localeCompare(b.assetId));
    const rank = [...own.map((c) => ({ c, v: suitOf(c) })), ...spares.map((c) => ({ c, v: suitOf(c) - SPARE_MARGIN }))]
      .sort((a, b) => b.v - a.v || a.c.assetId.localeCompare(b.c.assetId));
    const chosen: AssemblyClip[] = [];
    for (const { c } of rank) {
      if (chosen.length === pSlots.length) break;
      if (!own.includes(c)) {
        if (usedAssets.has(realAssetId(c)) || (c.groupId && usedGroups.has(c.groupId))) continue;
        usedAssets.add(realAssetId(c));
        if (c.groupId) usedGroups.add(c.groupId);
        swapped += 1;
      }
      chosen.push(c);
    }
    // pattern slots: chosen clips in their original order; plain slots: the rest in theirs, dropping the weakest
    // picked clips when spares took their places
    let rest = own.filter((c) => !chosen.includes(c));
    while (rest.length > oSlots.length) {
      const worst = rest.reduce((w, c) => (c.score < w.score ? c : w));
      rest = rest.filter((c) => c !== worst);
    }
    const inOrder = [...own.filter((c) => chosen.includes(c)), ...chosen.filter((c) => !own.includes(c))];
    pSlots.forEach((i, k) => { out[i] = inOrder[k]!; });
    oSlots.forEach((i, k) => { out[i] = rest[k]!; });
  }
  // two moments of one video side by side read as a stutter: swap one with a later pattern slot of the same kind
  for (let i = 1; i < out.length; i += 1) {
    if (realAssetId(out[i]!) !== realAssetId(out[i - 1]!) || !isPattern(i)) continue;
    const j = movable.find((k) => k > i && isPattern(k) && out[k]!.kind === out[i]!.kind
      && realAssetId(out[k]!) !== realAssetId(out[i - 1]!) && (k + 1 >= out.length || realAssetId(out[k + 1]!) !== realAssetId(out[i]!))
      && realAssetId(out[k - 1]!) !== realAssetId(out[i]!));
    if (j !== undefined) [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { order: out, swapped };
}
