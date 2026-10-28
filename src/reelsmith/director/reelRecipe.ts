// A directed reel as a recipe (Cardboard's "recipes are finished edits you remix with your own footage", 2026-10-13).
// Saving keeps the reel's shape: the plan's sections (moves, beats, transitions, effects, text styles, graphics), the
// treatment's tone and kit, and for each section how many shots it cast and what they showed (shot tags). It drops what
// was the user's own: the clips, the song, the moments and the words (kept only as the example in the setup form).
// Remixing casts new footage into the same slots by what it shows, fills the lines from the user's text and compiles
// the plan with director@1, so it needs no agent.
import type { PlanSection, ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { parsePlan } from '../../../shared/reelsmith/directorPlan';
import { RATIO_IDS, RATIO_SIZES, type RatioId } from '../../../shared/reelsmith/ratios';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import type { AssemblyClip } from '../assembler/types';
import type { SavedDirector } from './directorSession';
import { textStyleById } from './moves';
import type { Treatment } from './treatment';

export const REEL_TEMPLATE_VERSION = 1;
/** The text input that holds the lines, separated by "|" (a graphic's own items are split with "/"). */
export const LINES_INPUT = 'lines';
export const LINE_SEP = '|';

/** One section's casting: how many shots and what each one showed (a shot tag, or '' when untagged). */
export interface ReelSlot { tags: string[] }

export interface ReelTemplate {
  v: typeof REEL_TEMPLATE_VERSION;
  /** the plan without clips, song, moments or words */
  plan: ReelPlan;
  slots: ReelSlot[];
  /** the original lines in reel order (sections, then overlays, then graphics), the setup form's example */
  lines: string[];
  /** where each of those lines goes */
  lineAt: LineSlot[];
  treatment?: Omit<Treatment, 'story' | 'heroes'>;
}

/** Where a line goes, in the order lines are filled. */
type LineSlot = { at: 'section' | 'overlay' | 'graphic'; index: number };

function lineSlots(plan: ReelPlan): Array<LineSlot & { text: string }> {
  return [
    ...plan.sections.flatMap((s, index) => (s.text ? [{ at: 'section' as const, index, text: s.text }] : [])),
    ...(plan.overlays ?? []).map((o, index) => ({ at: 'overlay' as const, index, text: o.text })),
    ...(plan.graphics ?? []).flatMap((g, index) => (g.text ? [{ at: 'graphic' as const, index, text: g.text }] : [])),
  ];
}

const isCustom = (id: string | undefined) => !!id && id.startsWith('custom:');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clipId = (ref: string) => ref.split('@')[0]!;

/**
 * The reel saved on the timeline as a recipe. `tags` gives what each cast clip shows (by assetId); `id` must start
 * with "ai-" (user recipes). Custom shaders and graphics are left out: they live only in the session that made them.
 */
export function reelToRecipe(saved: SavedDirector, o: { id: string; name: string; tags?: ReadonlyMap<string, string> }): { recipe: Recipe; dropped: string[] } {
  const build = saved.build;
  if (!build) throw new Error('This reel has no director build to save. Direct a reel first.');
  const dropped: string[] = [];
  const src = build.plan;
  const sections: PlanSection[] = src.sections.map((s, i) => {
    const { clips: _clips, sounds, ...rest } = s;
    const out: PlanSection = { ...rest, ...(sounds?.length ? { sounds } : {}) };
    if (isCustom(out.transition)) { dropped.push(`section ${i + 1}: custom transition ${out.transition}`); delete out.transition; }
    if (out.effects?.some((e) => isCustom(e.id))) {
      dropped.push(...out.effects.filter((e) => isCustom(e.id)).map((e) => `section ${i + 1}: custom effect ${e.id}`));
      out.effects = out.effects.filter((e) => !isCustom(e.id));
      if (!out.effects.length) delete out.effects;
    }
    return out;
  });
  const graphics = (src.graphics ?? []).filter((g) => {
    if (isCustom(g.graphic)) dropped.push(`graphic ${g.graphic}`);
    return !isCustom(g.graphic);
  });
  const plan: ReelPlan = {
    version: 1, ratio: src.ratio, sections,
    ...(src.musicStart === 'fromStart' ? { musicStart: 'fromStart' as const } : {}),
    ...(src.look ? { look: src.look } : {}), ...(src.overlays?.length ? { overlays: src.overlays } : {}),
    ...(graphics.length ? { graphics } : {}), ...(src.sfx ? { sfx: src.sfx } : {}), ...(src.tone ? { tone: src.tone } : {}),
    ...(src.loop ? { loop: true } : {}),
  };
  // each section's shots as cast (from the build), else as the plan named them
  const cast = src.sections.map((s, i) => build.clips?.[i]?.length ? build.clips[i]! : (s.clips ?? []).map(clipId));
  const slots: ReelSlot[] = cast.map((ids) => ({ tags: ids.map((id) => o.tags?.get(id) ?? '') }));
  const found = lineSlots(plan);
  const lines = found.map((l) => l.text);
  const lineAt = found.map(({ at, index }) => ({ at, index }));
  for (const s of plan.sections) delete s.text;
  plan.overlays = plan.overlays?.map((ov) => ({ ...ov, text: '-' }));
  if (!plan.overlays?.length) delete plan.overlays;
  plan.graphics = plan.graphics?.map((g) => (g.text ? { ...g, text: '-' } : g));
  if (!plan.graphics?.length) delete plan.graphics;

  let treatment: ReelTemplate['treatment'];
  if (saved.treatment) {
    const { story: _story, heroes: _heroes, parts, ...t } = saved.treatment;
    treatment = { ...t, parts: parts.map(({ clips: _c, line: _l, ...p }) => p) };
  }
  const template: ReelTemplate = { v: REEL_TEMPLATE_VERSION, plan, slots, lines, lineAt, ...(treatment ? { treatment } : {}) };

  const shots = slots.reduce((n, s) => n + s.tags.length, 0);
  const distinct = new Set(cast.flat()).size;
  const tagCount = new Map<string, number>();
  for (const t of slots.flatMap((s) => s.tags)) if (t) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const mix = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${n} ${t}`).join(', ');
  const moves = [...new Set(plan.sections.map((s) => s.move))];
  const concept = treatment ? treatment.concepts[treatment.chosen]?.name : undefined;
  const size = RATIO_SIZES[plan.ratio];
  const own = plan.ratio;
  const description = [
    concept ? `"${concept}".` : '',
    `${/^[aeiou]/i.test(treatment?.tone ?? plan.tone ?? 'directed') ? 'An' : 'A'} ${treatment?.tone ?? plan.tone ?? 'directed'} reel in ${plan.sections.length} parts (${moves.slice(0, 5).join(', ')}${moves.length > 5 ? '…' : ''}).`,
    // clip references (#2@4) mean nothing without the original footage
    treatment?.signature ? `Signature: ${treatment.signature.replace(/\s*\(?#\d+(@[\d.]+)?\)?/g, '').trim()}` : '',
  ].filter(Boolean).join(' ').slice(0, 400);
  const firstTag = slots[0]?.tags.find(Boolean);
  const lastTag = slots.at(-1)?.tags.filter(Boolean).at(-1);
  const recipe: Recipe = {
    schemaVersion: 1, id: o.id, version: '1.0.0', name: o.name.slice(0, 60), category: 'other', description,
    tags: [...new Set(['remix', ...(treatment?.tone ? [treatment.tone] : plan.tone ? [plan.tone] : []), ...moves])].slice(0, 12).map((t) => t.slice(0, 24)),
    canvas: { width: size.width, height: size.height, fps: { num: saved.fps || 30, den: 1 } },
    duration: { mode: src.music ? 'fitMusic' : 'fitContent' },
    inputs: [
      { id: 'clips', kind: 'media', accept: ['video', 'image'], min: Math.max(1, Math.min(3, distinct)), max: 200, label: 'Your clips and photos',
        hint: `The original cast ${shots} shots from ${distinct} clips${mix ? ` (${mix})` : ''}. Shots are matched by what they show.`.slice(0, 200) },
      { id: 'music', kind: 'media', accept: ['audio'], min: src.music ? 1 : 0, max: 1, label: 'Song (your own file)' },
      ...(lines.length ? [{ id: LINES_INPUT, kind: 'text' as const, label: `Your lines (${lines.length}, separated by ${LINE_SEP})`.slice(0, 80),
        placeholder: lines.join(` ${LINE_SEP} `).slice(0, 120), default: lines.join(` ${LINE_SEP} `).slice(0, 500), optional: true, maxLength: 500 }] : []),
    ],
    params: [],
    music: { inputId: 'music', required: !!src.music, startPolicy: 'firstDownbeat', endPolicy: 'fadeOut', fadeOutSec: 0.6, gainDb: 0, clipAudioGainDb: -96, duckUnderSpeech: false },
    assembler: { strategy: 'director@1', aiSelection: 'off', options: { template } },
    structure: plan.sections.map((s, i) => ({ section: `s${i + 1}-${slug(s.move)}`.slice(0, 32), fill: 'clips' as const, ...(s.beats ? { lengthBeats: s.beats } : {}) })),
    styles: {},
    ...(plan.look ? { look: { reelLook: plan.look } } : {}),
    ratios: Object.fromEntries(RATIO_IDS.filter((r) => r !== own).map((r) => [r, {}])),
    ...(firstTag || lastTag ? { casting: { ...(firstTag ? { opener: [firstTag] } : {}), ...(lastTag ? { closer: [lastTag] } : {}) } } : {}),
    constraints: { noRepeatClips: false, insufficientMediaPolicy: 'allowRepeat', textSafeZone: true },
  };
  return { recipe, dropped };
}

/** The template of a remixable recipe, or undefined for any other recipe. */
export function reelTemplateOf(recipe: Pick<Recipe, 'assembler'>): ReelTemplate | undefined {
  const t = recipe.assembler.options?.template as ReelTemplate | undefined;
  if (recipe.assembler.strategy !== 'director@1' || !t || t.v !== REEL_TEMPLATE_VERSION || !Array.isArray(t.slots) || !Array.isArray(t.lineAt)) return undefined;
  const parsed = parsePlan(t.plan);
  return parsed.ok ? { ...t, plan: parsed.plan } : undefined;
}

/** Cut a line to the style's limit at a word boundary. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : text.slice(0, max)).trim();
}

/**
 * The template as a plan for new footage: each slot gets the unused clip that shows the same thing (then the best
 * scored), reusing clips only when there are fewer than slots; lines come from the user's text split on "|", in reel
 * order. A section left without words loses its line; an overlay or graphic without words is left out.
 */
export function remixPlan(t: ReelTemplate, o: { ratio: RatioId; clips: readonly AssemblyClip[]; music?: string; lines?: string }): { plan: ReelPlan; notes: string[] } {
  const notes: string[] = [];
  const plan: ReelPlan = structuredClone(t.plan);
  plan.ratio = o.ratio;
  if (o.music) plan.music = o.music; else delete plan.music;

  // casting: a shot that matches the slot's tag beats a better-scored one; used clips go to the back of the queue
  const uses = new Map<string, number>();
  const pool = [...o.clips];
  const pick = (tag: string, avoid: ReadonlySet<string>): AssemblyClip | undefined => [...pool].sort((x, y) =>
    (uses.get(x.assetId) ?? 0) - (uses.get(y.assetId) ?? 0)
    || Number(avoid.has(x.assetId)) - Number(avoid.has(y.assetId))
    || Number(!!tag && y.shot?.top === tag) - Number(!!tag && x.shot?.top === tag)
    || (tag ? (y.shot?.scores?.[tag as never] ?? 0) - (x.shot?.scores?.[tag as never] ?? 0) : 0)
    || y.score - x.score || x.assetId.localeCompare(y.assetId))[0];
  let matched = 0;
  let tagged = 0;
  plan.sections.forEach((s, i) => {
    const slot = t.slots[i];
    if (!slot?.tags.length || !pool.length) { delete s.clips; return; }
    const chosen: string[] = [];
    for (const tag of slot.tags) {
      const c = pick(tag, new Set(chosen));
      if (!c) break;
      chosen.push(c.assetId);
      uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1);
      if (tag) { tagged += 1; if (c.shot?.top === tag) matched += 1; }
    }
    s.clips = chosen;
  });
  const shots = t.slots.reduce((n, s) => n + s.tags.length, 0);
  if (pool.length < shots) notes.push(`The original had ${shots} shots; your ${pool.length} clips are reused at different moments.`);
  if (tagged && o.clips.some((c) => c.shot)) notes.push(`${matched} of ${tagged} shots show the same kind of thing as the original.`);

  // lines, in reel order; the template's overlays and graphics hold '-' where a line goes
  const words = (o.lines ?? '').split(LINE_SEP).map((x) => x.replace(/[{}]/g, '').trim());
  const overlays = [...(plan.overlays ?? [])] as Array<NonNullable<ReelPlan['overlays']>[number] | null>;
  const graphics = [...(plan.graphics ?? [])] as Array<NonNullable<ReelPlan['graphics']>[number] | null>;
  t.lineAt.forEach((l, k) => {
    const text = words[k] ?? '';
    if (l.at === 'section') {
      const s = plan.sections[l.index];
      if (!s) return;
      if (!text) { delete s.text; delete s.textBehind; return; }
      const max = textStyleById(s.textStyle ?? 'caption')?.maxChars ?? 140;
      s.text = fit(text, max);
      if (s.text !== text) notes.push(`"${text}" was cut to fit ${s.textStyle ?? 'caption'} (${max} characters).`);
    } else if (l.at === 'overlay') {
      const ov = overlays[l.index];
      if (!ov) return;
      overlays[l.index] = text ? { ...ov, text: fit(text, textStyleById(ov.style)?.maxChars ?? 140) } : null;
    } else {
      const g = graphics[l.index];
      if (g) graphics[l.index] = text ? { ...g, text } : null;
    }
  });
  plan.overlays = overlays.filter((x): x is NonNullable<typeof x> => !!x);
  if (!plan.overlays.length) delete plan.overlays;
  plan.graphics = graphics.filter((x): x is NonNullable<typeof x> => !!x);
  if (!plan.graphics.length) delete plan.graphics;
  if (words.filter(Boolean).length > t.lineAt.length) notes.push(`This recipe has ${t.lineAt.length} lines; the rest of your text was not used.`);
  return { plan, notes: notes.filter(Boolean) };
}

/** The treatment a remixed reel carries (so chat fixes keep its tone and kit), with the user's words as its story. */
export function remixTreatment(t: ReelTemplate, plan: ReelPlan): Treatment | undefined {
  if (!t.treatment) return undefined;
  const story = [...plan.sections.map((s) => s.text), ...(plan.overlays ?? []).map((o) => o.text)].filter(Boolean).join(' / ');
  return { ...t.treatment, story, heroes: [] };
}
