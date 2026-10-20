import assert from 'node:assert/strict';
import { reviewDirectorPlan } from './review';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';

const spans = (lens: number[]) => { let t = 0; return lens.map((l) => { const s = { from: t, to: t + l }; t += l; return s; }); };
const plain: any = { version: 1, ratio: '9:16', sections: [{ move: 'cut', clips: ['a', 'b'] }, { move: 'cut', clips: ['c'] }, { move: 'hold', clips: ['d'], text: 'yun hi chala chal' }] };
// a long song started in its intro, a drop in a plain section, no signature moment
const f = reviewDirectorPlan({ plan: plain, spans: spans([4, 5, 4]), musicStartSec: 0.1, song: { seconds: 446, loudestSec: 58, dropSec: 6, bpm: 107, suggest: { musicStart: 54 } } });
assert.ok(f.some((x) => /before where it lifts/.test(x.issue) && /54/.test(x.fix)));
// starting where the suggestion says is never flagged, even when the loudest part is much later
assert.ok(!reviewDirectorPlan({ plan: plain, spans: spans([4, 5, 4]), musicStartSec: 13.6, song: { seconds: 446, loudestSec: 226, dropSec: 18, bpm: 107, suggest: { musicStart: 13.6 } } }).some((x) => /lifts/.test(x.issue)));
// a drop a fraction of a second before a section starts belongs to that section
assert.ok(!reviewDirectorPlan({ plan: { ...plain, sections: [{ move: 'cut', clips: ['a'] }, { move: 'zoom-punch', clips: ['b', 'c'] }, { move: 'hold', clips: ['d'] }] }, spans: spans([4.48, 4, 3]), musicStartSec: 0, song: { seconds: 20, dropSec: 4.4, bpm: 107 } }).some((x) => /drop/.test(x.issue)));
// a cut every 2 beats is not a hold, however long the section
assert.ok(!reviewDirectorPlan({ plan: { ...plain, sections: [{ move: 'cut', clips: ['a', 'b', 'c'], params: { every: 2 } }, { move: 'velocity', clips: ['d'] }] }, spans: spans([9, 4]), song: { seconds: 20, bpm: 107 } }).some((x) => /one shot/.test(x.issue)));
assert.ok(f.some((x) => x.section === 1 && /drop/.test(x.issue)));
assert.ok(f.some((x) => /signature/.test(x.issue)));
// the same reel started at the loud part with a peak on the drop and a signature move is clean
const good: any = { ...plain, sections: [{ move: 'cut', clips: ['a', 'b'] }, { move: 'velocity', clips: ['c'] }, { move: 'hold', clips: ['d'], text: 'yun hi chala chal' }] };
assert.deepEqual(reviewDirectorPlan({ plan: good, spans: spans([4, 3, 3]), musicStartSec: 52, song: { seconds: 446, loudestSec: 55, dropSec: 56.5, bpm: 107 } }), []);
// a long hold, a line too fast to read, a small behind-line, a repeated clip
const busy: any = { version: 1, ratio: '9:16', sections: [
  { move: 'hold', clips: ['a'], text: 'one two three four five six seven eight nine ten eleven twelve', textStyle: 'caption', textBehind: true },
  { move: 'hold', clips: ['a'] }, { move: 'velocity', clips: ['b'] },
] };
const b = reviewDirectorPlan({ plan: busy, spans: spans([2, 7, 3]), song: { seconds: 20, bpm: 120 } });
assert.ok(b.some((x) => x.section === 1 && /one shot for 7/.test(x.issue)));
assert.ok(b.some((x) => x.section === 0 && /too fast to read/.test(x.issue)));
assert.ok(b.some((x) => x.section === 0 && /small text/.test(x.issue)));
assert.ok(b.some((x) => x.section === 1 && /repeats a clip/.test(x.issue)));
// one-clip reel (mela run): different moments of the same clip are different shots; the same moment is still a repeat
const oneClip: any = { version: 1, ratio: '9:16', sections: [
  { move: 'hold', clips: ['a@0.3'] }, { move: 'cut', clips: ['a@3.0', 'a@4.0'] }, { move: 'velocity', clips: ['a@7.2'] },
  { move: 'cut', clips: ['a@5.0', 'a@6.2', 'a@9.3'] }, { move: 'hold', clips: ['a@10.3'] }, { move: 'hold', clips: ['a@10.6'] },
] };
const repeats = reviewDirectorPlan({ plan: oneClip, spans: spans([3, 2, 2.5, 2.5, 2, 1]) }).filter((x) => /repeats a clip/.test(x.issue));
assert.deepEqual(repeats.map((x) => x.section), [5], 'only the section starting 0.3 s after the previous one repeats it');
// run 6: a 5.6 s hold under a 9-word line was flagged, shortened, then flagged as too fast to read
const calm: any = { ...plain, sections: [{ move: 'cut', clips: ['a', 'b'] }, { move: 'hold', clips: ['d'], text: 'sat on the edge and took in the view' }, { move: 'hold', clips: ['e'] }] };
assert.ok(!reviewDirectorPlan({ plan: calm, spans: spans([4, 5.6, 3]), musicStartSec: 0, song: { seconds: 20, bpm: 107 } }).some((x) => /one shot/.test(x.issue)), 'a calm hold may last as long as its line needs');
const tooLong = reviewDirectorPlan({ plan: calm, spans: spans([4, 8, 3]), musicStartSec: 0, song: { seconds: 20, bpm: 107 } }).find((x) => /one shot/.test(x.issue));
assert.match(tooLong!.fix, /no shorter than 2\.8 s/, 'the fix never asks for a hold too short to read');
// graphics: two at once, and a chat over a burst of cuts
{
  const sections = [{ move: 'hold', beats: 8 }, { move: 'flash-cuts', beats: 4 }, { move: 'hold', beats: 8 }] as ReelPlan['sections'];
  const gspans = [{ from: 0, to: 4 }, { from: 4, to: 6 }, { from: 6, to: 10 }];
  const gf = (graphics: ReelPlan['graphics']) => reviewDirectorPlan({ plan: { version: 1, ratio: '9:16', sections, graphics }, spans: gspans }).map((x) => x.issue).join('; ');
  assert.match(gf([{ graphic: 'chat-bubbles', from: 0, to: 0, text: 'hi' }, { graphic: 'countdown', from: 0, to: 0, beat: 4 }]), /chat-bubbles and countdown are on screen together for 2.0 s/);
  assert.doesNotMatch(gf([{ graphic: 'chat-bubbles', from: 0, to: 0, beats: 4, text: 'hi' }, { graphic: 'countdown', from: 0, to: 0, beat: 4 }]), /together/);
  assert.doesNotMatch(gf([{ graphic: 'chapter-bar', from: 0, to: 2 }, { graphic: 'sticker', from: 1, to: 1, text: 'x' }]), /together/, 'chapter bars frame the reel');
  assert.match(gf([{ graphic: 'route-map', from: 1, to: 1, text: 'a / b' }]), /route-map has to be read, but runs over flash-cuts/);
  assert.equal(gf([{ graphic: 'sticker', from: 1, to: 1, text: 'x' }]), '');
}
// a person the story names gets pointed out (the first real run left "bro" unseen)
{
  const sections = [{ move: 'cut', beats: 8, text: 'bro lied to me about taking me to simple trek' }, { move: 'hold', beats: 8 }] as ReelPlan['sections'];
  const spans2 = [{ from: 0, to: 4 }, { from: 4, to: 8 }];
  const find = (plan: Partial<ReelPlan>) => reviewDirectorPlan({ plan: { version: 1, ratio: '9:16', sections, ...plan }, spans: spans2 }).map((x) => x.issue).join('; ');
  assert.match(find({}), /the story names "bro" but nothing shows who that is/);
  assert.doesNotMatch(find({ graphics: [{ graphic: 'annotate', from: 1, to: 1, text: 'bro' }] }), /names "bro"/);
  // the marker on a velocity shot points at blur: it wants a hold
  const whip = reviewDirectorPlan({ plan: { version: 1, ratio: '9:16', sections: [sections[0]!, { move: 'velocity', beats: 8 }], graphics: [{ graphic: 'annotate', from: 1, to: 1, text: 'bro' }] }, spans: spans2 }).map((x) => x.issue).join('; ');
  assert.match(whip, /annotate mark needs its person still in frame, but runs over velocity/);
  assert.doesNotMatch(find({ sections: [sections[0]!, { move: 'hold', beats: 8, text: 'bro', textStyle: 'follow-tag' }] }), /names "bro"/);
  assert.doesNotMatch(reviewDirectorPlan({ plan: { version: 1, ratio: '9:16', sections: [{ move: 'cut', beats: 8, text: 'brother-in-arms, browsing' }] }, spans: [{ from: 0, to: 4 }] }).map((x) => x.issue).join(), /names/);
}
console.log('review: ok');
