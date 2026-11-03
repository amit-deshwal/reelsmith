// The setup values of a run (picked media, lines, params) and their checks. The director builds them from its plan.
import type { Recipe, RecipeParam } from '../../shared/reelsmith/recipe';

type AvailableAsset = { id: string; kind: string };

export interface SetupValues {
  media: Record<string, Array<{ assetId: string; kind: 'video' | 'image' | 'audio' }>>;
  texts: Record<string, string>;
  params: Record<string, string | number | boolean>;
}

export interface FieldError { field: string; message: string }

export function defaultValues(recipe: Recipe): SetupValues {
  const params: SetupValues['params'] = {};
  for (const p of recipe.params) params[p.id] = p.default as string | number | boolean;
  const texts: SetupValues['texts'] = {};
  for (const input of recipe.inputs) if (input.kind === 'text' && input.default) texts[input.id] = input.default;
  return { media: {}, texts, params };
}

function paramError(p: RecipeParam, v: unknown): string | null {
  switch (p.type) {
    case 'boolean': return typeof v === 'boolean' ? null : 'must be on or off';
    case 'enum': return p.options?.includes(v as string | number) ? null : 'pick one of the options';
    case 'color': return typeof v === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v) ? null : 'use a colour like #FFD23F';
    case 'font': return typeof v === 'string' && v.trim() ? null : 'choose a font';
    case 'integer': case 'number': case 'seconds': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'enter a number';
      if (p.type === 'integer' && !Number.isInteger(v)) return 'whole numbers only';
      if (p.min !== undefined && v < p.min) return `at least ${p.min}`;
      if (p.max !== undefined && v > p.max) return `at most ${p.max}`;
      return null;
    }
  }
}

export function validateSetup(recipe: Recipe, v: SetupValues, assets?: readonly AvailableAsset[]): FieldError[] {
  const errors: FieldError[] = [];
  const available = assets ? new Map(assets.map((asset) => [asset.id, asset])) : undefined;
  for (const input of recipe.inputs) {
    if (input.kind === 'media') {
      const picked = v.media[input.id] ?? [];
      const missing = available && picked.some((m) => !available.has(m.assetId));
      const bad = picked.filter((m) => !input.accept.includes(m.kind) || (available && !input.accept.includes(available.get(m.assetId)?.kind as never)));
      if (missing) errors.push({ field: input.id, message: 'a selected file is no longer in the project; choose it again' });
      else if (bad.length) errors.push({ field: input.id, message: `${bad.length} file(s) are not ${input.accept.join('/')}` });
      else if (picked.length < input.min) errors.push({ field: input.id, message: `add at least ${input.min} (have ${picked.length})` });
      else if (picked.length > input.max) errors.push({ field: input.id, message: `at most ${input.max} (have ${picked.length})` });
      else if (new Set(picked.map((m) => m.assetId)).size !== picked.length) errors.push({ field: input.id, message: 'the same file is added twice' });
    } else {
      const text = (v.texts[input.id] ?? '').trim();
      if (!text && !input.optional) errors.push({ field: input.id, message: 'required' });
      else if (input.maxLength && text.length > input.maxLength) errors.push({ field: input.id, message: `at most ${input.maxLength} characters` });
    }
  }
  for (const p of recipe.params) {
    const e = paramError(p, v.params[p.id]);
    if (e) errors.push({ field: p.id, message: e });
  }
  return errors;
}
