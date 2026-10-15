// RS-104: deterministic assembler framework. Same inputs + params + analysis + seed => same actions.
// The output is one BatchAction, so dispatching it is a single undo step. No AI involved.
import type { AssembleInput, AssembleResult } from './types';
import { assembleBeatMontage } from './beatMontage';

export type { AssembleInput, AssembleResult, AssemblyClip, AssemblyMusic, RecipeRunRecord, AssembleReport } from './types';

export function assemble(input: AssembleInput): AssembleResult {
  switch (input.recipe.assembler.strategy) {
    case 'beat-montage@1':
      return assembleBeatMontage(input);
    default:
      return {
        action: null,
        report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings: [`strategy ${input.recipe.assembler.strategy} not implemented yet`] },
        run: {
          recipeId: input.recipe.id, recipeVersion: input.recipe.version, assembler: input.recipe.assembler.strategy,
          seed: input.seed, params: input.params, texts: input.texts, assetIds: input.clips.map((c) => c.assetId).sort(),
        },
      };
  }
}
