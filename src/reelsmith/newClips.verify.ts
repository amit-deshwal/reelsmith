import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { withNewClips } from './newClips';
import type { SetupValues } from './setupForm';

const load = (f: string) => { const r = parseRecipe(readFileSync(`recipes/${f}.recipe.json`, 'utf8')); assert.ok(r.ok); return r.recipe; };
const beat = load('beat-cut');
const clipsInput = beat.inputs.find((i) => i.kind === 'media' && i.accept.includes('video'))!;
assert.equal(clipsInput.kind, 'media');
const musicInput = beat.inputs.find((i) => i.kind === 'media' && i.accept.includes('audio'))!;

const values: SetupValues = {
  media: { [clipsInput.id]: [{ assetId: 'a', kind: 'video' }, { assetId: 'b', kind: 'video' }], [musicInput.id]: [{ assetId: 'song', kind: 'audio' }] },
  texts: {}, params: {}, agentPick: 'off',
};
const assets = [
  { id: 'a', kind: 'video' as const }, { id: 'b', kind: 'video' as const }, { id: 'song', kind: 'audio' as const },
  { id: 'c', kind: 'video' as const }, { id: 'd', kind: 'image' as const }, { id: 'other-song', kind: 'audio' as const },
];

// new video/photo clips join the clips input after the saved ones; audio never joins, the song is untouched
let r = withNewClips(values, beat, assets);
assert.deepEqual(r.added, ['c', 'd']);
assert.deepEqual(r.values.media[clipsInput.id]!.map((m) => m.assetId), ['a', 'b', 'c', 'd']);
assert.deepEqual(r.values.media[musicInput.id], values.media[musicInput.id]);
assert.deepEqual(values.media[clipsInput.id]!.map((m) => m.assetId), ['a', 'b'], 'input is not mutated');

// nothing new: same object back
r = withNewClips(values, beat, assets.slice(0, 3));
assert.deepEqual(r.added, []);
assert.equal(r.values, values);

// capped at the input's maximum
const many = [...assets, ...Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, kind: 'video' as const }))];
r = withNewClips(values, beat, many);
assert.equal(r.values.media[clipsInput.id]!.length, (clipsInput as { max: number }).max);

// a clip that is already in any input is not added twice
r = withNewClips({ ...values, media: { ...values.media, [musicInput.id]: [{ assetId: 'c', kind: 'video' }] } }, beat, assets);
assert.ok(!r.added.includes('c'));

console.log('newClips.verify ok');
