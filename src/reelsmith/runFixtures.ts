// Small shared fixtures for the tests of the run pipeline (analysis, assembly): a directed plan and its recipe.
import { parsePlan, type ReelPlan } from '../../shared/reelsmith/directorPlan';
import { directorRecipe } from './director/assembleDirector';

/** A short valid plan: cuts on every second beat, a hold, then a closing line. */
export function samplePlan(ratio: '9:16' | '4:5' | '1:1' | '16:9' = '9:16'): ReelPlan {
  const parsed = parsePlan({
    ratio, music: 'song',
    sections: [
      { move: 'cut', beats: 8, params: { every: 2 } },
      { move: 'hold', beats: 4 },
      { move: 'cut', beats: 8, params: { every: 2 }, text: 'worth it', textStyle: 'caption' },
    ],
  });
  if (!parsed.ok) throw new Error(`sample plan is invalid: ${parsed.errors.join('; ')}`);
  return parsed.plan;
}

export function sampleRecipe(plan: ReelPlan = samplePlan()) {
  return directorRecipe(plan);
}
