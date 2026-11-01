// RS-1243: Kino-style captions: capitals word by word, the starred word boxed, a small tag above.
import assert from 'node:assert/strict';
import { punchCaps, punchLines, punchSize, punchWords } from './punchCaps';
import { prepareTemplate } from '../../template-host';
import { PUNCH_CAPS_CODE } from './punchCaps';

assert.deepEqual(punchWords('stop wasting your *weekends* in Pune.'), [[
  { w: 'STOP', hi: false }, { w: 'WASTING', hi: false }, { w: 'YOUR', hi: false }, { w: 'WEEKENDS', hi: true }, { w: 'IN', hi: false }, { w: 'PUNE.', hi: false },
]]);
assert.deepEqual(punchWords('LEGS: DEAD. / MOOD: *ELITE*.').map((l) => l.map((x) => `${x.w}${x.hi ? '*' : ''}`).join(' ')), ['LEGS: DEAD.', 'MOOD: ELITE.*']);
// lines wrap greedily unless the writer broke them
assert.equal(punchLines('STOP WASTING YOUR *WEEKENDS* IN PUNE.', 8).length, 3);
assert.equal(punchLines('A / B', 100).length, 2);
// the longest line fits 88% of a 1080 frame
const lines = punchLines('NO AGENCY. NO *MARKUP*. NO PROFIT.', 7);
assert.ok(punchSize(lines, 1080, 1920, 1) <= 1080 * 0.13 && punchSize(lines, 1080, 1920, 1) >= 36);

// the build: one motion graphic with the words' start times inside the section, the kicker and the words for the lint
const emitted: any[] = [];
punchCaps.build({
  W: 1080, H: 1920, fps: 30, start: 30, end: 90, beats: 4, beatFrame: (b: number) => 30 + Math.round(b * 15), seed: 1,
  text: 'DO *THIS* INSTEAD.', params: { kicker: '5:48 AM' }, id: (...p) => p.join('-'), lane: () => 'T1', emit: (a) => emitted.push(a), warn: () => {},
});
const item = emitted[0].item;
assert.equal(item.kind, 'motion-graphic');
assert.equal(item.props.kicker, '5:48 AM');
assert.equal(item.props.text.replace(/\n/g, ' '), 'DO THIS INSTEAD.');
assert.equal(item.props.starts.length, 3);
assert.ok(item.props.starts.every((s: number, i: number, a: number[]) => s >= 0 && (i === 0 || s > a[i - 1]!)) && item.props.starts.at(-1) < 1.2, `${item.props.starts}`);
await prepareTemplate(PUNCH_CAPS_CODE);
console.log('punchCaps.verify: ok');
