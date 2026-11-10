import assert from 'node:assert/strict';
import { defectKinds, scoreRun, summariseRuns } from './runScore';

// A session log as the claude CLI writes it: one JSON object a line; tool calls in assistant messages, results in user ones.
const P = 'mcp__openchatcut-builtin__';
let clock = Date.parse('2026-11-07T21:00:00Z');
const at = (sec: number) => new Date((clock += sec * 1000)).toISOString();
const lines: string[] = [];
let n = 0;
const call = (name: string, input: unknown, result: unknown, toolSec = 2, thinkSec = 10) => {
  const id = `t${(n += 1)}`;
  lines.push(JSON.stringify({ type: 'assistant', timestamp: at(thinkSec), message: { model: 'claude-opus-5-5', content: [{ type: 'tool_use', id, name: P + name, input }] } }));
  lines.push(JSON.stringify({ type: 'user', timestamp: at(toolSec), message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] }] } }));
};
lines.push(JSON.stringify({ type: 'user', timestamp: at(0), message: { content: 'USER:\nDirect my reel' } }));
lines.push('not json', JSON.stringify({ type: 'attachment' }));
call('reels_director_options', { find: ['the view from the top'] }, { ok: true }, 30, 3);
call('reels_director_treatment', { tone: 'epic' }, { ok: true, findings: [{ issue: '5 of 6 parts are plain cuts or holds (3 different moves)' }] }, 0, 40);
const plan = { sections: [{ move: 'cut' }, { move: 'hold' }, { move: 'zoom-punch' }, { move: 'hold' }] };
call('reels_director_build', { plan }, { error: 'The plan breaks 2 rules; nothing was built. [phrase] new titles off a phrase | [plain] 3 of 4 sections are plain cuts or holds' }, 0, 15);
call('reels_director_build', { plan: { sections: [{ move: 'cut' }, { move: 'velocity' }, { move: 'zoom-punch' }, { move: 'hold' }] } }, { ok: true, critique: {} }, 8, 12);
call('reels_director_fix', { defects: [{ section: 3, at: 14, evidence: "image 2 [3]: 'WE MADE IT' is mostly hidden behind his head", fix: 'raise it' }, { section: 0, at: 0.2, evidence: 'image 1 [1]: the night shot is almost pure black', fix: 'another moment' }] },
  { ok: true, frames: 'frames did not render: Export media preflight failed for 1 reference: missing_source: /media/uploads/a.depthv-1-2.png' }, 3, 18);
call('view_timeline_frames', { frames: [10] }, { error: 'Export media preflight failed' }, 0, 4);
call('reels_director_fix', { request: 'make the ending slower', sections: {} }, { ok: true }, 3, 9);
call('review_edit_session', {}, { status: 'applied' }, 2, 3);
lines.push(JSON.stringify({ type: 'assistant', timestamp: at(8), message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Dark to light: 17.9 s on the song from 1:05. Ask for a slower ending or a look.' }] } }));

const score = scoreRun(lines)!;
assert.equal(score.model, 'claude-opus-5-5');
assert.equal(score.startedAt, '2026-11-07T21:00:00.000Z');
assert.deepEqual(score.stages, { options: 1, treatment: 1, build: 2, fix: 2, critique: 0 });
assert.equal(score.full, true);
assert.equal(score.seconds, 158);
assert.equal(score.toolSeconds, 46);
assert.deepEqual(score.refusals, ['phrase', 'plain'], 'the rules a refusal names');
assert.equal(score.tone, 'epic');
assert.deepEqual(score.moves, ['cut', 'velocity', 'zoom-punch', 'hold'], 'the plan that built, not the refused one');
assert.deepEqual(score.defects.map((d) => d.kinds), [['text on a person'], ['dark shot']]);
assert.equal(score.extraChecks, 1, 'a frame call after the build');
assert.equal(score.frameFailures, 2);
assert.equal(score.reportWords, 18);
assert.equal(score.treatmentFindings.length, 1);

// a malformed plan is a refusal without a rule; a session with no director call is no run
const bad = [...lines.slice(0, 3)];
assert.equal(scoreRun(bad), null);
assert.equal(scoreRun([]), null);
assert.deepEqual(defectKinds('frames f24 and f96: the landscape shots crop to a cap badge and a torso, so the first frame has no clear subject'), ['text on a person', 'line on the wrong picture', 'crop']);
assert.deepEqual(defectKinds('the reel ends on beat 31, mid-bar'), ['sound']);
assert.deepEqual(defectKinds('something else entirely'), []);

const summary = summariseRuns([score, { ...score, seconds: 120, refusals: [], stages: { ...score.stages, fix: 1 }, defects: [], extraChecks: 0, frameFailures: 0, reportWords: 40, moves: ['cut', 'hold', 'cut', 'hold'] }, { ...score, full: false }]);
assert.equal(summary.runs, 2, 'only full runs count');
assert.equal(summary.medianSeconds, 158);
assert.equal(summary.refusedRuns, 1);
assert.deepEqual(summary.refusalsByRule, { phrase: 1, plain: 1 });
assert.equal(summary.fixRoundsPerRun, 1.5);
assert.deepEqual(summary.defectsByKind, { 'text on a person': 1, 'dark shot': 1 });
assert.equal(summary.extraCheckRuns, 1);
assert.equal(summary.plainShare, 0.75);
assert.equal(summary.movesUsed.velocity, 1);
console.log('runScore.verify: ok');
