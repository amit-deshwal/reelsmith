import assert from 'node:assert/strict';
import { coveredBands, fitTextInSafeWidth, lintSafeZone, safeAreaFor, safeRect } from './safeZone';

const canvas = { width: 1080, height: 1920 };
const r = safeRect(canvas);
assert.equal(r.y, 250);
assert.equal(r.y + r.h, 1920 - 360);
assert.equal(Math.round(r.x + r.w), 1080 - 108);
assert.equal(coveredBands(canvas).length, 4);
// scales with canvas height
assert.equal(safeRect({ width: 540, height: 960 }).y, 125);

const t = (id: string, text: string, y: number, extra: Record<string, unknown> = {}) => ({
  id, kind: 'text', startFrame: 0, durationInFrames: 30, props: { text, fontSize: 80, ...extra }, transform: { y },
});
assert.deepEqual(lintSafeZone([t('mid', 'Hello', 0)], canvas), [], 'centre is safe');
assert.equal(lintSafeZone([t('low', 'Hello', 40)], canvas).length, 1, 'bottom UI area');
assert.match(lintSafeZone([t('low', 'Hello', 40)], canvas)[0]!.message, /bottom/);
assert.match(lintSafeZone([t('hi', 'Hello', -45)], canvas)[0]!.message, /top/);
assert.match(lintSafeZone([t('wide', 'This is a very long line of caption text', 0)], canvas)[0]!.message, /left|right/);
assert.deepEqual(lintSafeZone([{ id: 'v', kind: 'video', startFrame: 0, durationInFrames: 5 }], canvas), [], 'only text is linted');
// configurable
assert.equal(lintSafeZone([t('low', 'Hello', 40)], canvas, { topPx: 0, bottomPx: 0, rightFrac: 0, leftFrac: 0 }).length, 0);

// RS-904: per-ratio guides
assert.equal(safeAreaFor(canvas).kind, 'reel');
assert.equal(safeAreaFor({ width: 1080, height: 1440 }).kind, 'none', '3:4 is the grid tile already');
assert.equal(safeAreaFor({ width: 1920, height: 1080 }).kind, 'none');
assert.equal(safeAreaFor({ width: 1440, height: 1080 }).kind, 'none');
const feed = safeAreaFor({ width: 1080, height: 1350 });
assert.equal(feed.kind, 'grid');
if (feed.kind === 'grid') {
  assert.equal(Math.round(feed.safe.w), 1013);
  assert.equal(feed.bands.length, 2);
}
const square = safeAreaFor({ width: 1080, height: 1080 });
assert.equal(square.kind === 'grid' && square.safe.w, 810);
const wide = { id: 'w', kind: 'text', startFrame: 0, durationInFrames: 30, props: { text: 'This is a very long caption line', fontSize: 80 }, transform: { y: 0 } };
assert.equal(lintSafeZone([wide], { width: 1920, height: 1080 }).length, 0, 'no zones in landscape');
assert.match(lintSafeZone([wide], { width: 1080, height: 1080 })[0]!.message, /3:4 profile-grid/);
// the build keeps lines clear of the side UI: shifted when they fit, shrunk when they do not; vertical place kept
const nudge = fitTextInSafeWidth(t('n', 'Yun hi chala chal', 10, { fontSize: 96 }), canvas);
assert.deepEqual(lintSafeZone([nudge], canvas), [], 'moved left into the safe area');
assert.equal(nudge.props.fontSize, 96, 'fits without shrinking');
assert.ok(((nudge.transform as { x?: number }).x ?? 0) < 0);
assert.equal(nudge.transform.y, 10);
const long = fitTextInSafeWidth(t('l', 'This is a very long line of caption text', 0), canvas);
assert.deepEqual(lintSafeZone([long], canvas), [], 'shrunk to the safe width');
assert.ok(Number(long.props.fontSize) < 80);
const fine = t('ok', 'Hello', 0);
assert.equal(fitTextInSafeWidth(fine, canvas), fine, 'a line already inside is untouched');
assert.equal(fitTextInSafeWidth(wide, { width: 1920, height: 1080 }), wide, 'no zones in landscape');

console.log('safeZone.verify: ok');
