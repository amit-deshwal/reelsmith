import assert from 'node:assert/strict';
import { FINALE, finaleWindows } from './postcardGraphics';

// the director's finale on a 9:16 reel: every window frames its clip on the person, and no clip is on screen twice
const subject = finaleWindows(1080, 1920, 0, () => 0, 'subject');
assert.ok(subject.filter((w) => w.s).every((w) => w.cover === 'window'));
const onScreen = (ws: typeof subject, t: number) => ws.filter((w) => w.s && t >= w.from && t < w.to && !(t >= FINALE.fadeOthers[1] && w.s !== 'closer')).map((w) => w.s!);
for (let t = 0; t < FINALE.shut[1]; t += 0.01) {
  const shown = onScreen(subject, t);
  assert.equal(new Set(shown).size, shown.length, `a clip twice at ${t.toFixed(2)} s: ${shown.join(', ')}`);
}
// the full grid ends showing all six
assert.equal(new Set(onScreen(subject, FINALE.pano[0] - 0.01)).size, 6);

// the recipe's 16:9 finale keeps its crop of the full frame and its own swaps
const crop = finaleWindows(1920, 1080, 13.3, () => 0);
assert.ok(crop.every((w) => w.cover === 'frame'));
assert.equal(JSON.stringify(crop), JSON.stringify(finaleWindows(1920, 1080, 13.3, () => 0, 'crop')));

console.log('postcardGraphics.verify: ok');
