import assert from 'node:assert/strict';
import type { AtomicAction } from '../editor/reducerActions';
import { focusBand, withTitleClear } from './titleClear';
import { withCropFocus } from './runRecipe';

const canvas = { width: 1080, height: 1920 };
// a portrait photo filling the canvas with a face in the upper-middle of the picture (y 0.40..0.50)
const face = { x: 0.35, y: 0.4, w: 0.3, h: 0.1 };
const clip = { assetId: 'p', name: 'p', src: '/p', kind: 'image' as const, width: 1080, height: 1920, durationInFrames: 90, score: 1,
  sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [], windows: [{ startFrame: 0, endFrame: 90, score: 1, focusRect: face }] } };
const band = focusBand({ width: 1080, height: 1920 }, canvas, face)!;
assert.ok(Math.abs(band[0] - 0.4) < 1e-9 && Math.abs(band[1] - 0.5) < 1e-9, 'a full-canvas picture maps the face straight through');
// a cover-scaled landscape (2x, panned) shifts it
const scaled = focusBand({ width: 1920, height: 1080, transform: { scale: 3.16, y: 0 } }, canvas, { x: 0, y: 0.4, w: 0.1, h: 0.2 })!;
assert.ok(scaled[0] > 0.4 && scaled[1] < 0.7, 'band stays centred around the middle for a centre-pan cover');

const photo = { type: 'add', startFrame: 0, item: { id: 'v', track: 'V1', kind: 'image', name: 'p', src: '/p', sourceAssetId: 'p', durationInFrames: 90 } } as AtomicAction;
const title = (y: number) => ({ type: 'add', startFrame: 0, item: { id: 't', track: 'V2', kind: 'text', name: 't', durationInFrames: 90, props: { text: 'GOA', fontSize: 120 }, transform: { y } } }) as AtomicAction;
const yOf = (a: AtomicAction[]) => { const t = a.find((x) => x.type === 'add' && x.item.id === 't'); return t && t.type === 'add' ? (t.item.transform as { y: number }).y : NaN; };

// a title centred on the face (y = -5 puts the centre at 0.45) moves clear of it and stays in the safe area
const moved = yOf(withTitleClear(withCropFocus([photo, title(-5)], [clip], canvas), [clip], canvas));
const c = 0.5 + moved / 100;
const half = (120 * 1.25) / 2 / 1920;
assert.ok(c + half <= 0.4 - 0.02 + 1e-9 || c - half >= 0.5 + 0.02 - 1e-9, 'title no longer overlaps the face band');
assert.ok(c - half >= 250 / 1920 && c + half <= 1 - 360 / 1920, 'and stays inside the safe area');
// a title already clear of the face is untouched
assert.equal(yOf(withTitleClear(withCropFocus([photo, title(30)], [clip], canvas), [clip], canvas)), 30);
// no analysis, no change
const bare = { ...clip, sourceAnalysis: undefined };
assert.equal(yOf(withTitleClear(withCropFocus([photo, title(-5)], [bare], canvas), [bare], canvas)), -5);
console.log('titleClear.verify: ok');
