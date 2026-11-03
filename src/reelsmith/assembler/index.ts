// RS-104: deterministic assembler framework (now one strategy: director@1). Same inputs + params + analysis + seed => same actions.
// The output is one BatchAction, so dispatching it is a single undo step. No AI involved.
import type { AssembleInput, AssembleResult } from './types';
import { assembleDirector } from '../director/assembleDirector';
import { ratioOf } from '../../../shared/reelsmith/ratios';
import { withScriptFonts } from '../scriptFonts';

export type { AssembleInput, AssembleResult, AssemblyClip, AssemblyMusic, RecipeRunRecord, AssembleReport } from './types';

export function assemble(raw: AssembleInput): AssembleResult {
  const input: AssembleInput = raw;
  let result: AssembleResult;
  if (input.recipe.assembler.strategy === 'director@1') result = assembleDirector(input);
  else {
    result = {
      action: null,
      report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings: [`strategy ${input.recipe.assembler.strategy} is not supported: only directed reels (director@1) can be built`] },
      run: {
        recipeId: input.recipe.id, recipeVersion: input.recipe.version, assembler: input.recipe.assembler.strategy,
        seed: input.seed, params: input.params, texts: input.texts, assetIds: input.clips.map((c) => c.assetId).sort(),
      },
    };
  }
  const ratio = ratioOf(input.recipe.canvas.width, input.recipe.canvas.height);
  if (ratio) result.run = { ...result.run, ratio };
  // RS-1253: Hindi and Marathi words get the bundled Devanagari face after the style's own
  if (result.action) result.action = { ...result.action, actions: withScriptFonts(result.action.actions).map((action) => action.type === 'add'
    ? { ...action, item: { ...action.item, props: { ...action.item.props, rsRun: `${input.recipe.id}@${input.recipe.version}` } } }
    : action) };
  return result;
}
