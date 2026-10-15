// Turns what the Recipes panel has (pool assets + setup values) into an AssembleInput, runs the assembler,
// and returns one batch action ready for `commands.batch`. Analysis calls are injected so this stays testable.
import type { Recipe } from '../../shared/reelsmith/recipe';
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import type { MediaAsset } from '../editor/types';
import { assemble, type AssembleInput, type AssembleResult, type AssemblyClip, type AssemblyMusic, type RecipeRunRecord } from './assembler';
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
  /** validated AI picks (RS-106), in shot order */
  preferredAssetIds?: string[];
  onProgress?: (text: string) => void;
}

export interface RunOutcome {
  result: AssembleResult;
  /** batch to dispatch, with canvas set and (optionally) the timeline cleared */
  action: BatchAction | null;
  messages: string[];
  /** what to save with the project (RS-108) */
  run: RecipeRunRecord;
}

export interface Prepared {
  input: AssembleInput;
  messages: string[];
}

const timelineKind = (a: MediaAsset): 'video' | 'image' | null => (a.kind === 'video' ? 'video' : a.kind === 'image' ? 'image' : null);

/** Analyse the chosen media and build the assembler input (no timeline changes). */
export async function prepareAssembly(api: AnalyzeApi, o: RunOptions): Promise<Prepared> {
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
      if (kind) base.push({ assetId: a.id, name: a.name, src: a.src, kind, durationInFrames: a.durationInFrames, input: input.id, ...(a.transcript?.length ? { transcript: a.transcript } : {}) });
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

  return {
    messages,
    input: {
      recipe, clips: primary, broll: secondary, music,
      texts: o.values.texts, params: o.values.params, seed: o.seed ?? 1,
      ...(o.preferredAssetIds?.length ? { preferredAssetIds: o.preferredAssetIds } : {}),
    },
  };
}

/** The saved run: the assembler's record plus which assets went into which input. */
export function runRecord(result: AssembleResult, values: SetupValues): RecipeRunRecord {
  const media = Object.fromEntries(Object.entries(values.media).map(([k, v]) => [k, v.map((m) => m.assetId)]));
  return { ...result.run, media };
}

/** Put the song's beat grid on the music clip so snapping (RS-403) works without re-analysis. */
export function withBeatGrid(actions: AtomicAction[], music: AssemblyMusic | undefined): AtomicAction[] {
  if (!music) return actions;
  const rsBeats = { beatTimesSec: music.beatTimesSec, beatsPerBar: music.beatsPerBar, downbeatIndex: music.downbeatIndex };
  return actions.map((a) => (a.type === 'add' && a.item.kind === 'audio' && a.item.sourceAssetId === music.assetId
    ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), rsBeats } } }
    : a));
}

export async function runRecipe(api: AnalyzeApi, o: RunOptions): Promise<RunOutcome> {
  const { input, messages } = await prepareAssembly(api, o);
  o.onProgress?.('Assembling');
  const result = assemble(input);
  messages.push(...result.report.warnings);
  const run = runRecord(result, o.values);
  if (!result.action) return { result, action: null, messages, run };

  const prefix: AtomicAction[] = [
    ...(o.replaceTimeline ? [{ type: 'clear' } as AtomicAction] : []),
    { type: 'setCanvas', width: input.recipe.canvas.width, height: input.recipe.canvas.height, fit: 'cover' } as AtomicAction,
  ];
  return {
    result, messages, run,
    action: { type: 'batch', label: result.action.label, actions: [...prefix, ...withBeatGrid(result.action.actions, input.music)] },
  };
}
