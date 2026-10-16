// Gang Reel: a cut on every beat, the caption on both body sections, and a black end card the timeline and music cover.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { defaultValues } from '../setupForm';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { mergeShots } from './beatMontage';

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
// a drop detected near the END of the song (as in the real 20 s track) must not cut the reel down to a few seconds
const lateDrop = assemble({ recipe, clips, music: { ...music, durationSec: 20.15, dropSec: 0.19 + 38 * 0.4625 }, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(lateDrop.report.musicStartSec < 1, `the song starts at the beginning, not ${lateDrop.report.musicStartSec}s in`);
assert.ok(lateDrop.report.totalFrames >= 17 * 30, `a late drop still gives a full reel (${lateDrop.report.totalFrames} frames)`);

// a clip too short for its shot is swapped for another instead of failing the whole reel
const tiny: AssemblyClip = { assetId: 'tiny', name: '3.mov', src: '/tiny', kind: 'video', durationInFrames: 40, score: 1, sourceAnalysis: { minShotFrames: 9, windows: [{ startFrame: 0, endFrame: 6, score: 1 }], shotBoundariesFrame: [] } };
const withTiny = assemble({ recipe, clips: [tiny, ...clips], music, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(withTiny.action, 'still assembles');
assert.ok(!(withTiny.action!.actions as any[]).some((a) => a.item?.sourceAssetId === 'tiny'), 'the too-short clip is not placed');
assert.ok(withTiny.report.warnings.some((w) => /3\.mov is too short/.test(w)), withTiny.report.warnings.join('; '));
// fewer clips than beats: neighbouring shots are joined (spread out, ends untouched) and the full reel still builds
const full = assemble({ recipe, clips, music, texts: defaults.texts, params: defaults.params, seed: 5 });
const fullShots = (full.action!.actions as any[]).filter((a) => a.item?.track === 'V1');
const scarce = assemble({ recipe, clips: clips.slice(0, 26), music, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(scarce.action, `assembles with 26 clips: ${scarce.report.warnings.join('; ')}`);
const scarceShots = (scarce.action!.actions as any[]).filter((a) => a.item?.track === 'V1').sort((a, b) => a.startFrame - b.startFrame);
assert.ok(scarceShots.length <= 26 && scarceShots.length >= 20, `uses the clips it has (${scarceShots.length} shots)`);
assert.equal(new Set(scarceShots.map((a) => a.item.sourceAssetId)).size, scarceShots.length, 'still no repeats');
assert.equal(scarce.report.totalFrames, full.report.totalFrames, 'the reel is as long as with plenty of clips');
assert.ok(scarceShots.every((a, i) => i === 0 || a.startFrame === scarceShots[i - 1].startFrame + scarceShots[i - 1].item.durationInFrames), 'no gaps between shots');
assert.equal(scarceShots[0].item.durationInFrames, fullShots[0].item.durationInFrames, 'the first shot stays one beat');
assert.ok(scarce.report.warnings.some((w) => /joined into 2-beat shots/.test(w)), scarce.report.warnings.join('; '));
const unit = Array.from({ length: 10 }, (_, i) => ({ section: 'drop', startBeat: i, lengthBeats: 1, startFrame: i * 10, durationInFrames: 10 }));
const merged = mergeShots(unit, 3);
assert.equal(merged.length, 7);
assert.equal(merged.reduce((sum, s) => sum + s.durationInFrames, 0), 100, 'total length unchanged');
assert.ok(merged[0]!.lengthBeats === 1 && merged[merged.length - 1]!.lengthBeats === 1, 'first and last stay short');
assert.equal(mergeShots(unit, 0).length, 10);
// the 20 s song is used to its end (not cut back to the last bar line)
const song20: AssemblyMusic = { ...music, durationSec: 20.15, beatTimesSec: Array.from({ length: 43 }, (_, i) => 0.244 + i * 0.4594), dropSec: undefined };
const whole = assemble({ recipe, clips, music: song20, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(whole.report.totalFrames >= 19 * 30, `reel covers the song (${whole.report.totalFrames / 30} s)`);
// 25 clips for ~37 beats, but the videos are long: different moments of them keep every cut one beat (nothing joined)
const longClips: AssemblyClip[] = Array.from({ length: 25 }, (_, i) => ({
  assetId: `L${i}`, name: `L${i}`, src: `/L${i}`, kind: 'video', durationInFrames: 1200, score: 0.9 - i * 0.01, bestStartFrame: 0,
  sourceAnalysis: { minShotFrames: 9, shotBoundariesFrame: [],
    windows: Array.from({ length: 20 }, (_, w) => ({ startFrame: w * 60, endFrame: w * 60 + 60, score: 0.9 - i * 0.01 - w * 0.02 })) },
}));
const moments = assemble({ recipe, clips: longClips, music, texts: defaults.texts, params: defaults.params, seed: 5 });
assert.ok(moments.action, moments.report.warnings.join('; '));
const mShots = (moments.action!.actions as any[]).filter((a) => a.item?.track === 'V1').sort((a, b) => a.startFrame - b.startFrame);
assert.ok(mShots.length >= 30, `a cut on every beat (${mShots.length} shots)`);
assert.ok(mShots.every((a) => Math.abs(a.item.durationInFrames - beat) <= 1), 'every shot is one beat long, none joined');
assert.ok(!moments.report.warnings.some((w) => /joined/.test(w)), moments.report.warnings.join('; '));
assert.ok(mShots.every((a) => /^L\d+$/.test(a.item.sourceAssetId)), 'the timeline names the real asset, not the extra-moment id');
assert.ok(moments.report.usedAssetIds.every((id) => /^L\d+$/.test(id)) && new Set(moments.report.usedAssetIds).size === moments.report.usedAssetIds.length, 'used assets are real and listed once');
const spots = mShots.map((a) => `${a.item.sourceAssetId}@${a.item.srcInFrame}`);
assert.equal(new Set(spots).size, spots.length, 'no moment is used twice');
const perAsset = new Map<string, number[]>();
for (const a of mShots) perAsset.set(a.item.sourceAssetId, [...(perAsset.get(a.item.sourceAssetId) ?? []), a.item.srcInFrame]);
for (const [id, starts] of perAsset) { const s = [...starts].sort((x, y) => x - y); assert.ok(s.every((v, i) => i === 0 || v - s[i - 1]! >= beat), `${id}: moments of one video do not overlap`); }
assert.ok(mShots.every((a, i) => i === 0 || a.item.sourceAssetId !== mShots[i - 1].item.sourceAssetId), 'two moments of the same video are never neighbours');
{
  const { spreadSameSource } = await import('./extraWindows');
  const c = (id: string, base?: string): AssemblyClip => ({ assetId: id, ...(base ? { baseAssetId: base } : {}), name: id, src: '/', kind: 'video', durationInFrames: 100, score: 0.5 });
  const order = [c('a'), c('a#1', 'a'), c('a#2', 'a'), c('b'), c('c'), c('b#1', 'b')];
  const spread = spreadSameSource(order, 1);
  assert.equal(spread[0]!.assetId, 'a', 'the opener stays first');
  assert.ok(spread.every((x, i) => i === 0 || (x.baseAssetId ?? x.assetId) !== (spread[i - 1]!.baseAssetId ?? spread[i - 1]!.assetId)), spread.map((x) => x.assetId).join(','));
  assert.deepEqual(spread.map((x) => x.assetId).sort(), order.map((x) => x.assetId).sort(), 'nothing lost or duplicated');
  assert.deepEqual(spreadSameSource([c('a'), c('b')]).map((x) => x.assetId), ['a', 'b'], 'already fine: unchanged');
}
{
  const { videosOnLongShots } = await import('./extraWindows');
  const m = (id: string, kind: 'video' | 'image'): AssemblyClip => ({ assetId: id, name: id, src: '/', kind, durationInFrames: 100, score: 0.5 });
  const order = [m('v0', 'video'), m('p1', 'image'), m('v2', 'video'), m('v3', 'video'), m('p4', 'image')];
  const swapped = videosOnLongShots(order, [1, 2, 1, 2, 1]);
  assert.equal(swapped[0]!.assetId, 'v0', 'the opener stays');
  assert.ok(swapped[1]!.kind === 'video' && swapped[3]!.kind === 'video', 'long shots hold videos');
  assert.equal(videosOnLongShots(order, [1, 1, 1, 1, 1]).map((x) => x.assetId).join(), order.map((x) => x.assetId).join(), 'no long shots: unchanged');
  assert.equal(videosOnLongShots([m('p', 'image'), m('q', 'image')], [1, 2])[1]!.assetId, 'q', 'no video to swap in: left alone');
}
assert.ok(moments.report.warnings.some((w) => /different moments of your longer videos/.test(w)), moments.report.warnings.join('; '));
console.log('gangReel.verify: ok');
