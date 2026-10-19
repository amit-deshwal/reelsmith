// Regenerates the catalogue section of the reels-director skill from the code. Run after changing moves, styles,
// effects, transitions, looks or sounds: npx tsx src/reelsmith/director/sync-director-catalog.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { withCatalog } from './catalogText.ts';

const path = 'src/agent/skills/reels-director/SKILL.md';
const before = readFileSync(path, 'utf8');
const after = withCatalog(before);
if (after !== before) writeFileSync(path, after);
console.log(after === before ? 'director catalogue current' : `director catalogue written (${after.length} chars)`);
