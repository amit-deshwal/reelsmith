// Turns what the Recipes panel has (pool assets + setup values) into an AssembleInput, runs the assembler,
// and returns one batch action ready for `commands.batch`. Analysis calls are injected so this stays testable.
import type { Recipe } from '../../shared/reelsmith/recipe';
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import type { MediaAsset } from '../editor/types';
import { assemble, type AssembleResult, type AssemblyClip, type AssemblyMusic } from './assembler';
import { toAssemblyClips, type ClipFeatures } from './assembler/scoring';
import type { SetupValues } from './setupForm';

export interface AnalyzeApi {
  clipFeatures(asset: MediaAsset, fps: number): Promise<ClipFeatures | null>;
  musicGrid(asset: MediaAsset): Promise<Omit<AssemblyMusic, 'assetId' | 'name' | 'src'> | null>;
}

export interface RunOptions {
  recipe: Recipe;
  values: SetupValues;
  assets: MediaAsset[];
  /** timeline fps; the recipe's frame math follows the timeline */
  fps: number;
  /** clear existing items first */
  replaceTimeline: boolean;
  seed?: number;
  onProgress?: (text: string) => void;
}

export interface RunOutcome {
  result: AssembleResult;
  /** batch to dispatch, with canvas set and (optionally) the timeline cleared */
  action: BatchAction | null;
  messages: string[];
}

const timelineKind = (a: MediaAsset): 'video' | 'image' | null => (a.kind === 'video' ? 'video' : a.kind === 'image' ? 'image' : null);

export async function runRecipe(api: AnalyzeApi, o: RunOptions): Promise<RunOutcome> {
  const recipe: Recipe = { ...o.recipe, canvas: { ...o.recipe.canvas, fps: { num: o.fps, den: 1 } } };
  const byId = new Map(o.assets.map((a) => [a.id, a]));
  const messages: string[] = [];
  const pick = (inputId: string) => (o.values.media[inputId] ?? []).map((m) => byId.get(m.assetId)).filter((a): a is MediaAsset => !!a);

  const mediaInputs = recipe.inputs.filter((i) => i.kind === 'media');
  const musicInput = recipe.music?.inputId ? mediaInputs.find((i) => i.id === recipe.music!.inputId) : undefined;
  const clipInputs = mediaInputs.filter((i) => i !== musicInput);

  // 1. analyse clips (score, near-duplicates)
  const base: Array<Omit<AssemblyClip, 'score' | 'groupId' | 'bestStartFrame' | 'captureTimeMs'> & { input: string }> = [];
  for (const input of clipInputs) {
    for (const a of pick(input.id)) {
      const kind = timelineKind(a);
      if (kind) base.push({ assetId: a.id, name: a.name, src: a.src, kind, durationInFrames: a.durationInFrames, input: input.id });
    }
  }
  const features: ClipFeatures[] = [];
  let done = 0;
  for (const b of base) {
    o.onProgress?.(`Analysing clips ${++done}/${base.length}`);
    if (b.kind !== 'video') continue;
    const f = await api.clipFeatures(byId.get(b.assetId)!, o.fps).catch(() => null);
    if (f) features.push({ ...f, assetId: b.assetId });
    else messages.push(`${b.name}: could not be analysed, using a neutral score`);
  }
  const minShot = Math.round(o.fps * 1.0);
  const scored = toAssemblyClips(base.map(({ input: _i, ...rest }) => rest), features, minShot);
  // clips without features keep a neutral score so they are still usable
  const clips = scored.map((c) => (features.some((f) => f.assetId === c.assetId) ? c : { ...c, score: 0.5 }));
  const primary = clips.filter((c) => base.find((b) => b.assetId === c.assetId)?.input === clipInputs[0]?.id);
  const secondary = clips.filter((c) => base.find((b) => b.assetId === c.assetId)?.input !== clipInputs[0]?.id);

  // 2. music grid
  let music: AssemblyMusic | undefined;
  const musicAsset = musicInput ? pick(musicInput.id)[0] : undefined;
  if (musicAsset) {
    o.onProgress?.('Finding the beat');
    const grid = await api.musicGrid(musicAsset).catch(() => null);
    if (grid) music = { assetId: musicAsset.id, name: musicAsset.name, src: musicAsset.src, ...grid };
    else messages.push('Could not find a steady beat in the song');
  }

  o.onProgress?.('Assembling');
  const result = assemble({
    recipe, clips: primary, broll: secondary, music,
    texts: o.values.texts, params: o.values.params, seed: o.seed ?? 1,
  });
  messages.push(...result.report.warnings);
  if (!result.action) return { result, action: null, messages };

  const prefix: AtomicAction[] = [
    ...(o.replaceTimeline ? [{ type: 'clear' } as AtomicAction] : []),
    { type: 'setCanvas', width: recipe.canvas.width, height: recipe.canvas.height, fit: 'cover' } as AtomicAction,
  ];
  return {
    result, messages,
    action: { type: 'batch', label: result.action.label, actions: [...prefix, ...result.action.actions] },
  };
}
