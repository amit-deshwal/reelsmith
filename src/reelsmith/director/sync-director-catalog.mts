// Regenerates the catalogue section of the reels-director skill from the code. Run after changing moves, styles,
// effects, transitions, looks or sounds: npx tsx src/reelsmith/director/sync-director-catalog.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { catalogueFiles, withCatalog } from './catalogText.ts';

const path = 'src/agent/skills/reels-director/SKILL.md';
const before = readFileSync(path, 'utf8');
const after = withCatalog(before);
if (after !== before) writeFileSync(path, after);
console.log(after === before ? 'director catalogue current' : `director catalogue written (${after.length} chars)`);
// RS-1244: the full menu is in support files the agent loads with load_skill(files=[...])
mkdirSync('src/agent/skills/reels-director/references', { recursive: true });
for (const [rel, text] of Object.entries(catalogueFiles())) {
  const path = `src/agent/skills/reels-director/${rel}`;
  let old = '';
  try { old = readFileSync(path, 'utf8'); } catch { /* new */ }
  if (old !== text) writeFileSync(path, text);
  console.log(old === text ? `${rel} current` : `${rel} written (${text.length} chars)`);
}
