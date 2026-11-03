// The Postcard Collage helpers the director's moves are built from (the film itself is no longer a recipe).
import assert from 'node:assert/strict';
import { validateTemplate } from '../../template-host';
import { POSTCARD_GRAPHIC_CODE } from '../postcardGraphics';
import { BAR_STEPS, bandCover, isCloseUp, postcardOrder, scrambleStates } from './postcardCollage';
import type { AssemblyClip } from './types';

const clip = (id: string): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', durationInFrames: 90, score: 0.5 });
const clips = ['a', 'b', 'c', 'd'].map(clip);

// every clip in turn, never one twice running, the last is not the one to avoid
const two = postcardOrder(clips.slice(0, 2), 10, clips[0]);
assert.equal(two.length, 10);
assert.ok(two.every((c, i) => i === 0 || c !== two[i - 1]) && two.at(-1) !== clips[0]);
const four = postcardOrder(clips, 12);
assert.ok(new Set(four.slice(0, 4).map((c) => c.assetId)).size === 4, 'the first lap uses every clip once');

// the band opens at a constant rate and never goes negative
assert.ok(bandCover(13.4) > 0 && bandCover(13.4) < 0.03);
assert.equal(bandCover(100), 0);

// a close-up is a wide or big subject box
assert.equal(isCloseUp({ w: 0.5, h: 0.5 }), true);
assert.equal(isCloseUp({ w: 0.1, h: 0.6 }), false);

// bar closing steps go inwards
assert.ok(BAR_STEPS.length >= 2);

// the letters shuffle and settle on the place
const states = scrambleStates('NORWAY', 27, 1);
assert.equal(states.at(-1), 'NORWAY');
assert.ok(states.every((s) => s.length === 6 && [...s].every((ch) => 'NORWAY'.includes(ch))), 'shuffled letters come from the place');
assert.notEqual(states[0], 'NORWAY');
assert.equal(scrambleStates('SÃO PAULO', 10, 1).at(-1), 'SÃO PAULO');

// the graphic passes the template sandbox
validateTemplate(POSTCARD_GRAPHIC_CODE);

console.log('postcardCollage.verify: ok');
