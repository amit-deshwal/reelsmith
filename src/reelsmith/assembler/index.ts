// RS-104: deterministic assembler framework. Same inputs + params + analysis + seed => same actions.
// The output is one BatchAction, so dispatching it is a single undo step. No AI involved.
import type { AssembleInput, AssembleResult } from './types';
import { assembleBeatMontage } from './beatMontage';
import { assembleStoryVlog } from './storyVlog';
import { assembleCollageGrid } from './collageGrid';
import { assembleCaptionedStory } from './captionedStory';

export type { AssembleInput, AssembleResult, AssemblyClip, AssemblyMusic, RecipeRunRecord, AssembleReport } from './types';

export function assemble(input: AssembleInput): AssembleResult {
  let result: AssembleResult;
  switch (input.recipe.assembler.strategy) {
    case 'beat-montage@1':
      result = assembleBeatMontage(input); break;
    case 'story-vlog@1':
      result = assembleStoryVlog(input); break;
    case 'collage-grid@1':
      result = assembleCollageGrid(input); break;
    case 'captioned-story@1':
      result = assembleCaptionedStory(input); break;
    default:
      result = {
        action: null,
        report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings: [`strategy ${input.recipe.assembler.strategy} not implemented yet`] },
        run: {
          recipeId: input.recipe.id, recipeVersion: input.recipe.version, assembler: input.recipe.assembler.strategy,
          seed: input.seed, params: input.params, texts: input.texts, assetIds: input.clips.map((c) => c.assetId).sort(),
        },
      };
  }
  if (result.action) result.action = { ...result.action, actions: result.action.actions.map((action) => action.type === 'add'
    ? { ...action, item: { ...action.item, props: { ...action.item.props, rsRun: `${input.recipe.id}@${input.recipe.version}` } } }
    : action) };
  return result;
}
