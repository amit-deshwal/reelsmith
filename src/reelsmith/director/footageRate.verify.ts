// RS-1250: the Director builds a reel of 60 fps clips on a 60 fps timeline, and only while the timeline is empty.
// Run: npx tsx src/reelsmith/director/footageRate.verify.ts
import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { directorTimelineFps, footageTimelineFps } from './footageRate';
import type { ProjectDoc, Timeline } from '../../editor/types';
import { parseRate } from '../../../server/reelsmith/mediaFps';

assert.equal(footageTimelineFps([60, 59.94, 60]), 60, 'iPhone 4K60');
assert.equal(footageTimelineFps([60, 30]), 60, 'half or more at 60');
assert.equal(footageTimelineFps([30, 30, 60]), null, 'mostly 30 stays 30');
assert.equal(footageTimelineFps([null, 60]), 60, 'unreadable rates do not count');
assert.equal(footageTimelineFps([null]), null);
assert.equal(footageTimelineFps([]), null);

const timeline = (patch: Partial<Timeline> = {}): Timeline => ({
  id: 'tl', name: 'tl', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, items: [],
  trackOrder: ['track_v1'], tracks: { track_v1: { kind: 'video' } }, ...patch,
});
const doc = (t: Timeline): ProjectDoc => ({ version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], timelines: [t], activeTimelineId: t.id });
assert.equal(directorTimelineFps(doc(timeline()), 30, [60, 60]), 60);
assert.equal(directorTimelineFps(doc(timeline({ fps: 60 })), 60, [60]), null, 'already 60');
const placed = timeline({ items: [{ id: 'c', track: 'track_v1', startFrame: 0, durationInFrames: 30, name: 'c', kind: 'solid', props: { color: '#000' } }] });
assert.equal(directorTimelineFps(doc(placed), 30, [60]), null, 'locked once anything is placed');

assert.equal(parseRate('60/1'), 60);
assert.equal(parseRate('30000/1001'), 29.97);
assert.equal(parseRate('0/0'), null);
assert.equal(parseRate(undefined), null);
console.log('footageRate.verify: ok');
