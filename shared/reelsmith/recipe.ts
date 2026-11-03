// RS-101: recipe manifest types, validation and loader helpers.
// Recipes are declarative JSON. Validation = JSON Schema (structure) + semantic checks (cross references, templates).
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import { RECIPE_SCHEMA } from './recipe-schema';
import { RATIO_IDS, RATIO_SIZES, ratioOf, type RatioId } from './ratios';

export type RecipeParamType = 'number' | 'integer' | 'boolean' | 'enum' | 'color' | 'font' | 'seconds';

export interface RecipeMediaInput {
  id: string; kind: 'media'; accept: Array<'video' | 'image' | 'audio'>;
  min: number; max: number; label: string; hint?: string;
  constraints?: { minClipSec?: number; preferOrientation?: 'portrait' | 'landscape' | 'any'; requiresSpeech?: boolean };
}
export interface RecipeTextInput {
  id: string; kind: 'text'; label: string; placeholder?: string; default?: string; optional?: boolean; maxLength?: number;
}
export type RecipeInput = RecipeMediaInput | RecipeTextInput;

export interface RecipeParam {
  id: string; type: RecipeParamType; label: string; default: unknown;
  min?: number; max?: number; step?: number; options?: Array<string | number>; agentEditable?: boolean;
}

export interface RecipeOverlay {
  kind: 'title' | 'label' | 'captions' | 'timestamp' | 'placeName';
  text?: string; styleId?: string; animationIn?: string; position?: string; atBeat?: number; durationBeats?: number;
}

/** A built-in clip effect a recipe puts on its shots (builtin:fx-* / builtin:look-*). */
export interface RecipeEffect { assetId: string; overrides?: Record<string, number | number[]> }

export interface RecipeSection {
  section: string; lengthBeats?: number; lengthSec?: number;
  fill?: 'none' | 'clips' | 'photos' | 'speech' | 'layout';
  cutRule?: 'everyBeat' | 'every2Beats' | 'everyBar' | 'onSpeechPhrases' | 'fixedSec';
  shotSec?: [number, number]; layout?: string; transition?: string; strobe?: boolean; overlays?: RecipeOverlay[];
  effects?: RecipeEffect[];
}

export interface Recipe {
  schemaVersion: 1; id: string; version: string; name: string;
  category: 'travel' | 'vlog' | 'beat-cut' | 'captioned-story' | 'collage' | 'other';
  description?: string; tags?: string[];
  preview?: { poster?: string; loop?: string; generatedFrom?: 'synthetic-sample' | 'user-footage' };
  canvas: { width: number; height: number; fps: { num: number; den: number } };
  duration?: { mode?: 'fitMusic' | 'fixed' | 'fitContent'; minSec?: number; targetSec?: number; maxSec?: number };
  inputs: RecipeInput[]; params: RecipeParam[];
  music?: {
    inputId?: string; required?: boolean; startPolicy?: string; endPolicy?: string;
    fadeOutSec?: number; gainDb?: number; clipAudioGainDb?: number; duckUnderSpeech?: boolean;
  };
  assembler: { strategy: 'beat-montage@1' | 'story-vlog@1' | 'captioned-story@1' | 'collage-grid@1' | 'travel-diary@1' | 'photo-dump@1' | 'postcard-collage@1' | 'director@1'; options?: Record<string, unknown>; aiSelection?: 'off' | 'optional' | 'recommended' };
  structure: RecipeSection[];
  styles: Record<string, Record<string, unknown>>;
  look?: { colorLook?: string; reelLook?: string; effects?: RecipeEffect[]; grain?: number; vignette?: number };
  /** RS-901: other shapes this recipe supports; each may replace keys of named styles (text size, position) */
  ratios?: Partial<Record<RatioId, { styles?: Record<string, Record<string, unknown>> }>>;
  /** RS-109: tags wanted for the opening and closing shot (scenery, people, portrait, action, food, detail, city, water, night) */
  casting?: { opener?: string[]; closer?: string[]; boost?: string[]; avoid?: string[] };
  agentHints?: string;
  constraints?: { noRepeatClips?: boolean; insufficientMediaPolicy?: 'lengthenShots' | 'askUser' | 'allowRepeat' | 'mergeShots'; keepChronological?: boolean; textSafeZone?: boolean };
}

export type RecipeValidation =
  | { ok: true; recipe: Recipe }
  | { ok: false; errors: string[] };

const TEMPLATE = /\{\{([^{}]*)\}\}/g;
const TEMPLATE_REF = /^(inputs|params)\.([a-z][a-zA-Z0-9_]*)$/;

let validator: ReturnType<Ajv2020['compile']> | null = null;
function schemaValidator() {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validator = ajv.compile(RECIPE_SCHEMA as unknown as object);
  }
  return validator;
}

function formatAjvError(e: ErrorObject): string {
  return `${e.instancePath || '/'} ${e.message ?? 'invalid'}`;
}

/** Collect every string leaf with its JSON path, so templates are checked anywhere in the manifest. */
function stringLeaves(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => stringLeaves(v, `${path}/${i}`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringLeaves(v, `${path}/${k}`, out);
  }
}

function semanticErrors(r: Recipe): string[] {
  const errors: string[] = [];
  const inputIds = new Set<string>();
  const paramIds = new Set<string>();
  for (const i of r.inputs) {
    if (inputIds.has(i.id)) errors.push(`duplicate input id "${i.id}"`);
    inputIds.add(i.id);
    if (i.kind === 'media' && i.min > i.max) errors.push(`input "${i.id}": min > max`);
  }
  for (const p of r.params) {
    if (paramIds.has(p.id)) errors.push(`duplicate param id "${p.id}"`);
    paramIds.add(p.id);
    if (p.type === 'enum') {
      if (!p.options?.length) errors.push(`param "${p.id}": enum needs options`);
      else if (!p.options.includes(p.default as string | number)) errors.push(`param "${p.id}": default not in options`);
    }
    if ((p.type === 'number' || p.type === 'integer' || p.type === 'seconds') && typeof p.default === 'number') {
      if (p.min !== undefined && p.default < p.min) errors.push(`param "${p.id}": default below min`);
      if (p.max !== undefined && p.default > p.max) errors.push(`param "${p.id}": default above max`);
    }
    if (p.type === 'boolean' && typeof p.default !== 'boolean') errors.push(`param "${p.id}": default must be boolean`);
  }
  if (r.music?.inputId) {
    const m = r.inputs.find((i) => i.id === r.music!.inputId);
    if (!m) errors.push(`music.inputId "${r.music.inputId}" is not an input`);
    else if (m.kind !== 'media' || !m.accept.includes('audio')) errors.push(`music.inputId "${m.id}" must accept audio`);
  }
  const styleIds = new Set(Object.keys(r.styles));
  const baseRatio = ratioOf(r.canvas.width, r.canvas.height);
  for (const [ratio, o] of Object.entries(r.ratios ?? {})) {
    if (ratio === baseRatio) errors.push(`ratios/${ratio}: this is the recipe's own canvas; leave it out`);
    for (const id of Object.keys(o?.styles ?? {})) if (!styleIds.has(id)) errors.push(`ratios/${ratio}/styles: unknown style "${id}"`);
  }
  const sections = new Set<string>();
  for (const [si, s] of r.structure.entries()) {
    if (sections.has(s.section)) errors.push(`duplicate section "${s.section}"`);
    sections.add(s.section);
    for (const [oi, o] of (s.overlays ?? []).entries()) {
      if (o.styleId && !styleIds.has(o.styleId)) errors.push(`structure/${si}/overlays/${oi}: unknown styleId "${o.styleId}"`);
    }
  }
  // Templates: only {{inputs.X}} / {{params.X}} of declared ids, anywhere in the manifest.
  const leaves: Array<[string, string]> = [];
  stringLeaves(r, '', leaves);
  for (const [path, text] of leaves) {
    for (const m of text.matchAll(TEMPLATE)) {
      const ref = TEMPLATE_REF.exec(m[1]!);
      if (!ref) { errors.push(`${path}: template "{{${m[1]}}}" not allowed`); continue; }
      const known = ref[1] === 'inputs' ? inputIds : paramIds;
      if (!known.has(ref[2]!)) errors.push(`${path}: template refers to unknown ${ref[1]} "${ref[2]}"`);
    }
    const stripped = text.replace(TEMPLATE, '');
    if (/\{\{|\}\}/.test(stripped)) errors.push(`${path}: unbalanced template braces`);
  }
  return errors;
}

export function validateRecipe(data: unknown): RecipeValidation {
  const validate = schemaValidator();
  if (!validate(data)) return { ok: false, errors: (validate.errors ?? []).map(formatAjvError) };
  const recipe = data as unknown as Recipe;
  const errors = semanticErrors(recipe);
  return errors.length ? { ok: false, errors } : { ok: true, recipe };
}

/** Parse JSON text and validate. Never throws. */
export function parseRecipe(text: string): RecipeValidation {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] }; }
  return validateRecipe(data);
}

/** Substitute {{inputs.X}} / {{params.X}}. Unknown or missing values become ''. Validated recipes only contain these forms. */
export function renderTemplate(
  text: string, scope: { inputs: Record<string, string>; params: Record<string, string | number | boolean> },
): string {
  return text.replace(TEMPLATE, (_, ref: string) => {
    const m = TEMPLATE_REF.exec(ref);
    if (!m) return '';
    const v = m[1] === 'inputs' ? scope.inputs[m[2]!] : scope.params[m[2]!];
    return v === undefined ? '' : String(v);
  });
}

/** Ratios a recipe can be made in: its own canvas first (when it is one of the supported shapes), then `ratios`. */
export function supportedRatios(recipe: Recipe): RatioId[] {
  const own = ratioOf(recipe.canvas.width, recipe.canvas.height);
  const extra = RATIO_IDS.filter((id) => id !== own && recipe.ratios?.[id]);
  return own ? [own, ...extra] : extra;
}

/**
 * The recipe as it should run in `ratio`: the canvas of that shape and the ratio's style overrides.
 * Returns null when the recipe does not support the ratio. The result has no `ratios` of its own.
 */
export function recipeForRatio(recipe: Recipe, ratio: RatioId): Recipe | null {
  if (!supportedRatios(recipe).includes(ratio)) return null;
  const { ratios, ...rest } = recipe;
  if (ratio === ratioOf(recipe.canvas.width, recipe.canvas.height)) return rest;
  const styles = { ...recipe.styles };
  for (const [id, override] of Object.entries(ratios?.[ratio]?.styles ?? {})) styles[id] = { ...styles[id], ...override };
  return { ...rest, canvas: { ...recipe.canvas, ...RATIO_SIZES[ratio] }, styles };
}
