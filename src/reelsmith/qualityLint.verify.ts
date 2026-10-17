// Picture quality lint: enlargement is measured from the source size, the fill transform and the strongest reframe zoom.
import assert from 'node:assert/strict';
import type { TimelineItem, TimelineState } from '../editor/types';
import { lintReel } from './reelLint';
import { lintPictureQuality, upscaleFactor } from './qualityLint';

const canvas = { width: 1080, height: 1920 };
const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 0.01, `${a} vs ${b}`);

// a 1080x1920 clip shows at 1x; a 3:4 photo contain-fitted is 0.9x, and 1.33x fill makes it 1.2x
near(upscaleFactor({ width: 1080, height: 1920 }, canvas), 1);
near(upscaleFactor({ width: 1200, height: 1600 }, canvas), 0.9);
near(upscaleFactor({ width: 1200, height: 1600, transform: { scale: 1.3333 } }, canvas), 1.2);
// the strongest keyframe counts, not the first
const zoom = (m: number[]) => ({ reframeCurve: { version: 1 as const, timebase: 'effect-frame' as const, coordinateSpace: 'composition-normalized' as const, keyframes: m.map((magnification, i) => ({ frame: i * 10, focalPointX: 0.5, focalPointY: 0.5, magnification })) } });
near(upscaleFactor({ width: 540, height: 960, zoom: zoom([1, 1.5]) }, canvas), 3);
// per-axis scale: the larger axis decides
near(upscaleFactor({ width: 1080, height: 1920, transform: { scaleX: 1.5, scaleY: 1 } }, canvas), 1.5);
assert.equal(upscaleFactor({}, canvas), null, 'unknown source size is not judged');

const item = (over: Partial<TimelineItem>): TimelineItem => ({ id: 'a', track: 'V1', kind: 'image', name: 'a.jpg', startFrame: 0, durationInFrames: 60, props: {}, ...over } as TimelineItem);
const state = (items: TimelineItem[]): TimelineState => ({ items, width: 1080, height: 1920, fps: 30 } as unknown as TimelineState);

// the case from the Hazy Overture export: a 4:3 photo drifting to 5.6x
const wide = item({ width: 1600, height: 1200, transform: { scale: 1 }, zoom: zoom([5.57]) });
const issues = lintPictureQuality(state([wide]));
assert.equal(issues.length, 1);
assert.match(issues[0]!.message, /blocky/);
const soft = lintPictureQuality(state([item({ width: 540, height: 960, zoom: zoom([1.2]) })]));
assert.match(soft[0]!.message, /soft/);
assert.equal(lintPictureQuality(state([item({ width: 4000, height: 3000 })])).length, 0, 'a large photo is fine');
assert.equal(lintPictureQuality(state([{ ...item({ width: 100, height: 100 }), kind: 'text' } as TimelineItem])).length, 0, 'only pictures are judged');

// reaches the agent's lint, as a warning (never an error)
const full = lintReel(state([item({ width: 540, height: 960, durationInFrames: 60, zoom: zoom([1.8]) })]));
assert.ok(full.issues.some((i) => /enlarged/.test(i.message)));
assert.equal(full.errors, 0);
console.log('qualityLint verify ok');
