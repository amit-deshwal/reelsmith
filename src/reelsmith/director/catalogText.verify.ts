import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withCatalog, CATALOG_START } from './catalogText';
import { MOVES, TEXT_STYLES } from './moves';
import { DIRECTOR_EFFECTS, DIRECTOR_TRANSITIONS } from './catalog';
import { directorOptions, resolveClipRef, sheetSamples, songSuggestion } from '../agent/directorTools';

// the skill carries the current catalogue (run sync-director-catalog.mts after changing the library)
const skill = readFileSync(new URL('../../agent/skills/reels-director/SKILL.md', import.meta.url), 'utf8');
assert.equal(withCatalog(skill), skill, 'the reels-director catalogue is stale: npx tsx src/reelsmith/director/sync-director-catalog.mts');
const cat = skill.slice(skill.indexOf(CATALOG_START));
for (const id of [...MOVES.map((m) => m.id), ...TEXT_STYLES.map((t) => t.id), ...DIRECTOR_EFFECTS.map((e) => e.id.replace('builtin:fx-', '')), ...DIRECTOR_TRANSITIONS.map((t) => t.id)]) {
  assert.ok(cat.includes(`\`${id}\``), `catalogue lists ${id}`);
}
// the whole skill loads in one load_skill result (64k characters with its metadata)
assert.ok(skill.length < 56_000, `skill is ${skill.length} characters`);

// options stay far under the 16k-character limit above which an external agent only gets an artifact pointer
const assets = Array.from({ length: 60 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `IMG_${7800 + i}.MOV`, kind: 'video', src: '/x', durationInFrames: 300, width: 1080, height: 1920 }));
const ctx: any = { getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets }), audio: [] };
const warmed: string[] = [];
const out: any = await directorOptions(ctx, { api: { musicGrid: async () => null, clipFeatures: async (a: any) => { warmed.push(a.id); return null; } } } as any);
await new Promise((r) => setTimeout(r, 20));
assert.equal(new Set(warmed).size, assets.filter((a: any) => a.kind !== 'audio').length, 'clip analysis warmed for every clip while the agent plans');
assert.equal(warmed.length, new Set(warmed).size, 'each clip once');
const { __images: _i, ...text } = out;
assert.ok(JSON.stringify(text).length < 12_000, `options are ${JSON.stringify(text).length} characters`);
assert.equal(out.clips[6].startsWith('#7 IMG_7806.MOV'), true);
// "#n" references
assert.equal(resolveClipRef('#7', assets), assets[6]!.id);
assert.equal(resolveClipRef('#7@4.5', assets), `${assets[6]!.id}@4.5`);
assert.equal(resolveClipRef('#61', assets), null);
assert.equal(resolveClipRef('abc@2', assets), 'abc@2');
// song timing done for the agent: a long song starts 8 beats before its drop, which lands on beat 8 of the reel
const grid = { beatTimesSec: Array.from({ length: 800 }, (_, i) => 0.1 + i * 0.56), downbeatIndex: 0, dropSec: 61.7, loudestStartSec: 58 };
const sug = songSuggestion(grid, 107, 446);
assert.equal(sug.dropAtBeat, 8);
assert.ok(Math.abs(sug.musicStart - (61.7 - 8 * 0.56)) < 0.3);
assert.equal(sug.beatsFor18s, 32);
// a short song starts on its first downbeat
assert.equal(songSuggestion({ ...grid, beatTimesSec: grid.beatTimesSec.slice(0, 40) }, 107, 22).musicStart, 0.1);
// every clip fits on the contact sheets: four moments each while they fit, fewer for long lists
assert.deepEqual(sheetSamples(20, 0), [0.1, 0.37, 0.63, 0.9], '20 videos: 80 cells');
assert.equal(sheetSamples(21, 0).length, 3);
assert.deepEqual(sheetSamples(40, 0), [0.1, 0.9]);
assert.deepEqual(sheetSamples(60, 0), [0.5]);
assert.equal(sheetSamples(19, 10).length, 3, 'photos take cells too');
console.log('catalogText: ok');
