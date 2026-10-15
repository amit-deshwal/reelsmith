import assert from 'node:assert/strict';
import { coveredBands, lintSafeZone, safeRect } from './safeZone';

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
console.log('safeZone.verify: ok');
