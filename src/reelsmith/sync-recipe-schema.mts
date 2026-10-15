// Regenerates shared/reelsmith/recipe-schema.ts from the JSON schema in reelsmith-docs.
import { readFileSync, writeFileSync } from 'node:fs';

const json = readFileSync('reelsmith-docs/plan/schemas/recipe.schema.json', 'utf8').trim();
writeFileSync(
  'shared/reelsmith/recipe-schema.ts',
  `// Generated from reelsmith-docs/plan/schemas/recipe.schema.json. Edit the JSON, then re-run: npx tsx src/reelsmith/sync-recipe-schema.mts\nexport const RECIPE_SCHEMA = ${json} as const;\n`,
);
