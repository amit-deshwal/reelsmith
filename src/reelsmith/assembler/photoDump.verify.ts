import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';

const r = parseRecipe(readFileSync('recipes/photo-dump.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;
const photos = (n: number): AssemblyClip[] => Array.from({ length: n }, (_, i) => ({
  assetId: `p${i}`, name: `p${i}`, src: `/p${i}.jpg`, kind: 'image', width: i % 2 ? 3000 : 4000, height: i % 2 ? 4000 : 3000,
  durationInFrames: 1, score: ((i * 5) % 7) / 7,
}));
const song: AssemblyMusic = { assetId: 'song', name: 's', src: '/s.mp3', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const base = { recipe, texts: { caption: 'weekend, unedited' }, params: {}, seed: 3 };
const acts = (res: ReturnType<typeof assemble>) => res.action!.actions as any[];

// -- no song: a silent reel on a steady pulse, nothing audio, nothing pointing at a missing file
const silent = assemble({ ...base, clips: photos(12) });
assert.ok(silent.action, silent.report.warnings.join('; '));
assert.ok(!acts(silent).some((a) => a.type === 'add' && a.item.kind === 'audio'), 'the stand-in pulse must not become an audio clip');
assert.ok(silent.report.warnings.some((w) => /no song/.test(w)), 'says it has no song');
assert.equal(silent.run.assembler, 'photo-dump@1', 'the run keeps the recipe strategy, so re-cuts still match it');
assert.equal(silent.run.recipeId, 'photo-dump');

// -- every photo gets two reframe keyframes (start and end of its shot)
const imageAdds = acts(silent).filter((a) => a.type === 'add' && a.item.kind === 'image');
assert.equal(imageAdds.length, 12, 'every photo appears once (the reel is sized to the photos)');
for (const add of imageAdds) {
  const keys = acts(silent).filter((a) => a.type === 'reframeKeyframe' && a.id === add.item.id);
  assert.equal(keys.length, 2, `${add.item.id} has a start and an end pose`);
  assert.equal(keys[0].frame, 0);
  assert.equal(keys[1].frame, Math.max(1, add.item.durationInFrames - 1));
  // the move is real: pose changes between the two keyframes
  assert.ok(keys[0].focalPointX !== keys[1].focalPointX || keys[0].focalPointY !== keys[1].focalPointY || keys[0].magnification !== keys[1].magnification);
}
// neighbouring photos do not move the same way
const poseOf = (id: string) => { const k = acts(silent).filter((a) => a.type === 'reframeKeyframe' && a.id === id); return `${k[0].focalPointX}/${k[0].focalPointY}/${k[0].magnification}>${k[1].focalPointX}/${k[1].focalPointY}/${k[1].magnification}`; };
const ordered = imageAdds.sort((a, b) => a.startFrame - b.startFrame);
for (let i = 1; i < ordered.length; i += 1) assert.notEqual(poseOf(ordered[i]!.item.id), poseOf(ordered[i - 1]!.item.id), 'neighbours move differently');

// -- the length follows the photo count: 12 photos x 2 beats x 0.5 s = 12 s; 5 photos = 5 s (no photo is dropped to reach a minimum)
assert.equal(silent.report.totalFrames, 12 * 30);
const few = assemble({ ...base, clips: photos(5) });
assert.equal(acts(few).filter((a) => a.type === 'add' && a.item.kind === 'image').length, 5);
assert.equal(few.report.totalFrames, 5 * 30);
// more photos than fit the 40 s ceiling: the best 40 shots, no more
const many = assemble({ ...base, clips: photos(60) });
assert.ok(many.report.totalFrames <= 40 * 30);
// a faster cut rule shows the same photos in half the time
const quick = assemble({ ...base, clips: photos(12), params: { cutRule: 'everyBeat' } });
assert.equal(quick.report.totalFrames, 6 * 30);

// -- never repeats a photo
const used = imageAdds.map((a: any) => a.item.sourceAssetId);
assert.equal(new Set(used).size, used.length);

// -- deterministic; a different seed rotates the moves
const again = assemble({ ...base, clips: photos(12) });
assert.deepEqual(acts(again), acts(silent), 'same inputs and seed -> identical actions');
const other = assemble({ ...base, clips: photos(12), seed: 4 });
assert.notEqual(poseOf(ordered[0]!.item.id), (() => { const o = acts(other).filter((a) => a.type === 'add' && a.item.kind === 'image').sort((a, b) => a.startFrame - b.startFrame)[0]; const k = acts(other).filter((a) => a.type === 'reframeKeyframe' && a.id === o.item.id); return `${k[0].focalPointX}/${k[0].focalPointY}/${k[0].magnification}>${k[1].focalPointX}/${k[1].focalPointY}/${k[1].magnification}`; })(), 'seed changes the first photo\'s move');

// -- motion switched off: plain stills
const still = assemble({ ...base, clips: photos(12), params: { motion: false } });
assert.ok(!acts(still).some((a) => a.type === 'reframeKeyframe'));

// -- RS-1238 depth motion: each photo gets the photo-parallax effect instead of Ken Burns keys, the moves in turn
const deep = assemble({ ...base, clips: photos(12), params: { depthMotion: true } });
const deepPhotos = acts(deep).filter((a) => a.type === 'add' && a.item.kind === 'image');
assert.ok(deepPhotos.length >= 6);
assert.ok(deepPhotos.every((a) => a.item.effects?.some((e: { assetId: string }) => e.assetId === 'builtin:fx-photo-parallax')));
assert.ok(!acts(deep).some((a) => a.type === 'reframeKeyframe'), 'no Ken Burns on top of the camera move');
const deepMoves = deepPhotos.map((a) => a.item.effects.at(-1).overrides.move);
assert.ok(deepMoves.every((m: number, i: number) => i === 0 || m !== deepMoves[i - 1]), 'neighbours move differently');
assert.ok(deep.report.warnings.some((w) => /3D camera move/.test(w)));
// motion off wins
assert.ok(!acts(assemble({ ...base, clips: photos(12), params: { motion: false, depthMotion: true } })).some((a) => a.type === 'add' && a.item.effects?.length));
// the recipe offers it, on by default
assert.equal(recipe.params.find((p: { id: string }) => p.id === 'depthMotion')?.default, true);

// -- with a song: the song is added and the cuts are on its beats
const withSong = assemble({ ...base, clips: photos(12), music: song });
assert.ok(withSong.action);
assert.equal(acts(withSong).filter((a) => a.type === 'add' && a.item.kind === 'audio').length, 1, 'the real song is kept');
assert.ok(!withSong.report.warnings.some((w) => /no song/.test(w)));
const beatFrames = 15; // 0.5 s at 30 fps
for (const add of acts(withSong).filter((a) => a.type === 'add' && a.item.kind === 'image')) assert.equal(add.startFrame % beatFrames, 0, 'cuts land on beats');

// -- the caption text is on the reel
assert.ok(acts(silent).some((a) => a.type === 'add' && a.item.kind === 'text' && /weekend, unedited/.test(String(a.item.text ?? a.item.props?.text ?? ''))), 'caption is present');

console.log('photoDump.verify ok');
