// Gang Reel: a cut on every beat, the caption on both body sections, and a black end card the timeline and music cover.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { defaultValues } from '../setupForm';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';

const parsed = parseRecipe(readFileSync('recipes/gang-reel.recipe.json', 'utf8'));
assert.ok(parsed.ok, parsed.ok ? '' : JSON.stringify(parsed.errors));
const recipe = parsed.recipe;

const defaults = defaultValues(recipe);
assert.equal(defaults.texts.caption, 'not a single weak link', 'the caption is pre-filled');
assert.equal(defaults.texts.endCard, 'AMK boys');

const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 40,
  beatTimesSec: Array.from({ length: 80 }, (_, i) => 0.19 + i * 0.4625), beatsPerBar: 4, downbeatIndex: 0, dropSec: 0.19 + 8 * 0.4625,
};
const clips: AssemblyClip[] = Array.from({ length: 60 }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 7) % 13) / 13,
}));
const res = assemble({ recipe, clips, music, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(res.action, 'assembles');
const actions = res.action!.actions as any[];
const v1 = actions.filter((a) => a.item?.track === 'V1');
const beat = Math.round(0.4625 * 30);
assert.ok(v1.length >= 24 && v1.length <= 40, `about one cut per beat, got ${v1.length}`);
assert.ok(v1.every((a) => Math.abs(a.item.durationInFrames - beat) <= 1), 'every shot is one beat long');
assert.equal(new Set(v1.map((a) => a.item.sourceAssetId)).size, v1.length, 'no clip is used twice');

const texts = actions.filter((a) => a.item?.kind === 'text');
const caption = texts.filter((a) => a.item.props.text === 'not a single weak link');
assert.equal(caption.length, 2, 'caption on the build and on the drop');
assert.ok(caption.every((a) => a.item.props.align === 'center'));
const lastShotEnd = Math.max(...v1.map((a) => a.startFrame + a.item.durationInFrames));
const card = texts.find((a) => a.item.props.text === 'AMK boys');
assert.ok(card, 'end card text');
assert.ok(card.startFrame >= lastShotEnd - 1, 'the end card starts after the last shot (on black)');
const song = actions.find((a) => a.item?.track === 'A1');
assert.ok(song.item.durationInFrames >= card.startFrame + card.item.durationInFrames - 1, 'the music covers the end card');
assert.equal(res.report.totalFrames, song.item.durationInFrames);

// an empty caption adds no caption text
const blank = assemble({ recipe, clips, music, texts: { caption: '', endCard: '' }, params: defaults.params, seed: 5 });
assert.equal((blank.action!.actions as any[]).filter((a) => a.item?.kind === 'text').length, 0);
console.log('gangReel.verify: ok');
