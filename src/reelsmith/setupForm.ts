// RS-103: the setup form model. Built from a recipe's inputs/params; says whether "Assemble" is allowed and why not.
import type { Recipe, RecipeMediaInput, RecipeParam } from '../../shared/reelsmith/recipe';
import { musicDefaults, musicFormErrors } from './musicPolicy';

export type PickKind = 'off' | 'claude';
type AvailableAsset = { id: string; kind: string };

export interface SetupValues {
  media: Record<string, Array<{ assetId: string; kind: 'video' | 'image' | 'audio' }>>;
  texts: Record<string, string>;
  params: Record<string, string | number | boolean>;
  agentPick: PickKind;
}

export interface FieldError { field: string; message: string }

export function defaultValues(recipe: Recipe): SetupValues {
  const params: SetupValues['params'] = musicDefaults(recipe);
  for (const p of recipe.params) params[p.id] = p.default as string | number | boolean;
  const texts: SetupValues['texts'] = {};
  for (const input of recipe.inputs) if (input.kind === 'text' && input.default) texts[input.id] = input.default;
  return { media: {}, texts, params, agentPick: 'off' };
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
  errors.push(...musicFormErrors(v.params));
  if (v.agentPick !== 'off' && v.agentPick !== 'claude') errors.push({ field: 'agentPick', message: 'choose Off or Claude' });
  const aiAllowed = recipe.assembler.aiSelection ?? 'optional';
  if (v.agentPick !== 'off' && aiAllowed === 'off') errors.push({ field: 'agentPick', message: 'this recipe does not use an agent' });
  return errors;
}

export function canAssemble(recipe: Recipe, v: SetupValues, assets?: readonly AvailableAsset[]): boolean {
  return validateSetup(recipe, v, assets).length === 0;
}

/** Widget a param needs, for the form renderer. */
export function widgetFor(p: RecipeParam): 'toggle' | 'select' | 'color' | 'font' | 'slider' | 'stepper' {
  switch (p.type) {
    case 'boolean': return 'toggle';
    case 'enum': return 'select';
    case 'color': return 'color';
    case 'font': return 'font';
    case 'integer': return 'stepper';
    default: return p.min !== undefined && p.max !== undefined ? 'slider' : 'stepper';
  }
}

export const mediaInputs = (recipe: Recipe): RecipeMediaInput[] =>
  recipe.inputs.filter((i): i is RecipeMediaInput => i.kind === 'media');
