// reels_clean_speech: every talking clip on the timeline (or the named ones) loses its fillers, stutters and abandoned
// takes in one undo step, later clips move up, and the report names the words that went.
import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline } from '../../editor/types';
import type { TranscriptWord } from '../../transcript/types';
import { parseCleanSpeechArgs, planCleanSpeech } from './cleanSpeechTool';

const speech = (s: string): TranscriptWord[] => s.split(' ').map((text, i) => ({ text, start: 300 + i * 400, end: 300 + i * 400 + 300 }));
const a = speech('um I went I went to the market. uh it was it was busy.');
const b = speech('so the the plan is simple.');
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const clip = (id: string, at: number, words: TranscriptWord[] | undefined, dur: number) =>
  ({ type: 'add', startFrame: at, item: { id, track: 'V1', kind: 'video', name: id, src: `/media/uploads/${id}.mp4`, durationInFrames: dur, srcInFrame: 0, volume: 1, ...(words ? { transcript: words } : {}) } });
h = historyReduce(h, { type: 'batch', label: 'setup', actions: [clip('a', 0, a, 180), clip('b', 180, b, 90), clip('broll', 270, undefined, 60)] } as never);
const state = () => activeTimeline(h.present);

assert.ok('error' in parseCleanSpeechArgs({ level: 'off' }));
assert.ok('error' in parseCleanSpeechArgs({ level: 'medium' }));
assert.deepEqual(parseCleanSpeechArgs({}), { level: 'balanced', pauses: false, smoothCuts: true });
assert.deepEqual(parseCleanSpeechArgs({ smoothCuts: false }), { level: 'balanced', pauses: false, smoothCuts: false });
assert.ok('error' in parseCleanSpeechArgs({ smoothCuts: 'yes' }));
assert.match((planCleanSpeech(state(), { level: 'balanced', pauses: false, smoothCuts: true, itemIds: ['broll'] }, () => 'x') as { error: string }).error, /no transcript/);

let n = 0;
const out = planCleanSpeech(state(), { level: 'balanced', pauses: false, smoothCuts: true }, () => `p${++n}`);
assert.ok(!('error' in out));
const plan = out as Exclude<typeof out, { error: string }>;
assert.deepEqual(plan.clips.map((c) => [c.itemId, c.fillers.join(' '), c.stutters.join(' '), c.retakes.join(' ')]), [
  ['a', 'um uh', '', 'I went it was'],
  ['b', '', 'the', ''],
], 'the words that go, per clip, in timeline order');
assert.ok(plan.clips.every((c) => c.savedSec > 0));
const steps = h.past.length;
h = historyReduce(h, { type: 'batch', label: 'Clean up speech', actions: plan.actions });
assert.equal(h.past.length, steps + 1, 'one undo step');
const items = [...state().items].sort((x, y) => x.startFrame - y.startFrame);
// back to back from 0, b-roll moved up by everything cut, nothing overlapping
items.forEach((it, i) => assert.equal(it.startFrame, i === 0 ? 0 : items[i - 1]!.startFrame + items[i - 1]!.durationInFrames, `${it.id} butts against the clip before`));
const saved = plan.clips.reduce((s, c) => s + c.savedSec, 0);
assert.ok(Math.abs(state().items.find((i) => i.id === 'broll')!.startFrame - (270 - saved * 30)) <= 1, 'the b-roll moved up by what was cut');
assert.equal(state().items.filter((i) => i.name === 'a').length, plan.clips[0]!.pieces);
h = historyReduce(h, { type: 'undo' } as never);
assert.deepEqual(state().items.map((i) => [i.id, i.startFrame, i.durationInFrames]), [['a', 0, 180], ['b', 180, 90], ['broll', 270, 60]]);
console.log('cleanSpeechTool.verify: ok');
