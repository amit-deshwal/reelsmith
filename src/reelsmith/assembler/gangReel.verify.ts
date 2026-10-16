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
assert.ok(v1.length >= 24 && v1.length <= 50, `about one cut per beat, got ${v1.length}`);
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
// tagged footage: character moments win over prettier scenery
const tagged: AssemblyClip[] = clips.map((c, i) => {
  const top = i % 4 === 0 ? 'scenery' : 'laughing';
  return { ...c, score: top === 'scenery' ? 0.9 : 0.5, shot: { top, confidence: 0.8, scores: { scenery: top === 'scenery' ? 0.8 : 0.02, laughing: top === 'laughing' ? 0.8 : 0.02 } as never } };
});
const cast = assemble({ recipe, clips: tagged, music, texts: defaults.texts, params: defaults.params, seed: 5 });
const used = new Set((cast.action!.actions as any[]).filter((a) => a.item?.track === 'V1').map((a) => a.item.sourceAssetId));
const sceneryUsed = [...used].filter((id) => tagged.find((c) => c.assetId === id)!.shot!.top === 'scenery').length;
assert.ok(sceneryUsed <= 3, `scenery is avoided (${sceneryUsed} of ${used.size} shots)`);
// the user's chosen opener is the first shot, used once, and kept even if it scores low
const firstShot = (a: ReturnType<typeof assemble>) => (a.action!.actions as any[]).filter((x) => x.item?.track === 'V1').sort((x, y) => x.startFrame - y.startFrame)[0].item.sourceAssetId;
const weakest = [...clips].sort((a, b) => a.score - b.score)[0]!.assetId;
const withOpener = assemble({ recipe, clips, music, texts: defaults.texts, params: defaults.params, seed: 5, openerAssetId: weakest });
assert.equal(firstShot(withOpener), weakest, 'the chosen clip opens the reel');
const placed = (withOpener.action!.actions as any[]).filter((x) => x.item?.track === 'V1').map((x) => x.item.sourceAssetId);
assert.equal(placed.filter((id) => id === weakest).length, 1, 'used once');
assert.equal(new Set(placed).size, placed.length, 'still no repeats');
assert.equal(placed.length, v1.length, 'same number of shots');
assert.ok(firstShot(assemble({ recipe, clips, music, texts: defaults.texts, params: defaults.params, seed: 5, openerAssetId: 'nope' })) !== 'nope', 'an unknown opener is ignored');
console.log('gangReel.verify: ok');
