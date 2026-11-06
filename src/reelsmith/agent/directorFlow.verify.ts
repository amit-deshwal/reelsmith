// RS-1258: a director run in fewer model turns, on a real in-memory editor: stage 1 returns the shots for the story's
// things, the first build carries the critique, the sheets render at once and keep their order.
// Run: node --import tsx src/reelsmith/agent/directorFlow.verify.ts
import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline, type MediaAsset } from '../../editor/types';
import { directorSession } from '../director/directorSession';
import { directorBuild, directorOptions, directorTreatment } from './directorTools';
import { FINISH, frameSheets } from './directorRepairTools';

const video = (id: string): MediaAsset => ({ id, name: `${id}.MOV`, kind: 'video', src: `/media/uploads/${id}.mov`, durationInFrames: 300, width: 1080, height: 1920 } as MediaAsset);
const assets = [video('v1'), video('v2'), video('v3')];

/** The editor as the agent sees it: the reducer behind ctx.commands, the active timeline as its state. */
function editor(id: string) {
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((asset) => ({ type: 'addAsset', asset })) } as never);
  const batches: string[] = [];
  const ctx = {
    getProjectId: () => id,
    getState: () => ({ ...activeTimeline(h.present), assets: h.present.assets }),
    getDoc: () => h.present,
    audio: [], templates: [], getCreativeMode: () => null,
    commands: {
      batch: (actions: unknown[], label: string) => { batches.push(label); h = historyReduce(h, { type: 'batch', label, actions } as never); },
      setProjectFps: () => { throw new Error('this test keeps 30 fps'); },
    },
  };
  return { ctx: ctx as never, batches, items: () => activeTimeline(h.present).items };
}

const api = { clipFeatures: async () => null, mediaFps: async (s: string[]) => s.map(() => 30), musicGrid: async () => null } as never;

// stage 1 with `find`: the shots for the story's things come back in the same call
{
  const { ctx } = editor('flow1');
  const asked: unknown[] = [];
  const search = async (args: Record<string, unknown>) => { asked.push(args.queries); return { results: [{ query: 'the summit', shots: [{ ref: '#2@3', shows: 'sure', match: 0.47 }] }], clipsRead: '3 of 3' }; };
  const out = await directorOptions({ find: ['the summit', '', 7] }, ctx, { api } as never, search) as Record<string, any>;
  assert.deepEqual(asked, [['the summit']], 'only the real phrases are searched');
  assert.equal(out.shots.results[0].shots[0].ref, '#2@3');
  const without = await directorOptions({ find: ['the summit'] }, ctx, { api } as never, async () => ({ error: 'The visual model is not installed' })) as Record<string, any>;
  assert.match(without.shots.unavailable, /not installed/);
  const plain = await directorOptions({}, ctx, { api } as never) as Record<string, any>;
  assert.equal(plain.shots, undefined, 'no find, no search');
}

// the first build of a directed reel brings the critique; later builds do not
{
  const { ctx, batches, items } = editor('flow2');
  await directorOptions({}, ctx, { api } as never);
  const treatment = {
    story: 'two days on the trek', concepts: [{ name: 'Earned', idea: 'a royal climb' }, { name: 'Rain', idea: 'a moody slog' }], chosen: 0, tone: 'epic', heroes: ['#1@2', '#2@4', '#3@1'],
    parts: [
      { role: 'hook', beats: 4, move: 'zoom-punch', clips: ['#1', '#2'], line: 'two days', purpose: 'where we are' },
      { role: 'build', beats: 4, move: 'cut', clips: ['#2', '#1'], purpose: 'how hard it was' },
      { role: 'ending', beats: 8, move: 'hold', clips: ['#3'], purpose: 'we made it' },
    ],
    signature: 'the hold on the top', textStyles: ['rise-lines'], transitions: ['light-dissolve'], effects: [], graphics: [],
  };
  const t = directorTreatment(treatment, ctx) as Record<string, any>;
  assert.equal(t.ok, true, JSON.stringify(t));
  let critiques = 0;
  const critique = async () => { critiques += 1; return { images: [{ frame: 0, base64: 'AAAA' }], body: { frames: ['image 1: [1] 0.0s first frame'], checklist: 'Stage 4: critique.' } }; };
  const plan = { ratio: '9:16', sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1', '#2'], text: 'two days', textStyle: 'rise-lines', params: { every: 1 } }, { move: 'cut', beats: 4, clips: ['#2', '#1'] }, { move: 'hold', beats: 8, clips: ['#3'] }] };
  const first = await directorBuild({ plan }, ctx, { api } as never, critique) as Record<string, any>;
  assert.equal(first.ok, true, JSON.stringify(first).slice(0, 400));
  assert.equal(critiques, 1);
  assert.deepEqual(first.__images, [{ frame: 0, base64: 'AAAA' }], 'the critique frames come with the build');
  assert.equal(first.critique.checklist, 'Stage 4: critique.');
  assert.match(first.next, /reels_director_fix/);
  assert.match(first.next, /no separate reels_director_critique call/);
  assert.ok(first.review.findings, 'the build review is still there');
  assert.deepEqual(batches, ['Director: build reel'], 'one undo step');
  assert.ok(items().length > 0, 'the reel is on the timeline');
  // a rebuild (the fix rounds go through runBuild too) is judged on its own frames
  const again = await directorBuild({ plan, replaceTimeline: true }, ctx, { api } as never, critique) as Record<string, any>;
  assert.equal(again.ok, true);
  assert.equal(critiques, 1, 'only the first build carries the critique');
  assert.equal(again.critique, undefined);
  assert.equal(directorSession('flow2')?.lastBuild?.builds, 2);
}

// a build with no treatment (not a directed run) never runs the critique
{
  const { ctx } = editor('flow3');
  let called = false;
  const out = await directorBuild({ plan: { ratio: '9:16', sections: [{ move: 'hold', beats: 8, clips: ['#1'] }] } }, ctx, { api } as never, async () => { called = true; return { images: [], body: {} }; }) as Record<string, any>;
  assert.equal(out.ok, true);
  assert.equal(called, false);
}

// RS-1267: a plan that breaks the treatment's brief is refused before anything is drafted, once; the tool says the same
{
  const { ctx, batches, items } = editor('flow5');
  await directorOptions({}, ctx, { api } as never);
  const t = directorTreatment({
    story: 'a 6 s teaser, and use the summit shot #3', concepts: [{ name: 'Teaser', idea: 'fast' }, { name: 'Slow', idea: 'calm' }], chosen: 0, tone: 'epic', heroes: ['#3@1'],
    parts: [{ role: 'hook', beats: 4, move: 'zoom-punch', line: 'go' }, { role: 'build', beats: 4, move: 'cut' }, { role: 'ending', beats: 4, move: 'hold' }],
    signature: 'the hold', textStyles: ['rise-lines'], transitions: [], effects: [], graphics: [],
    brief: { seconds: 6, mustUse: ['#3'] },
  }, ctx) as Record<string, any>;
  assert.equal(t.ok, true, JSON.stringify(t));
  const long = { ratio: '9:16', sections: [{ move: 'cut', beats: 8, clips: ['#1', '#2'] }, { move: 'hold', beats: 8, clips: ['#2@6'] }] };
  const refused = await directorBuild({ plan: long }, ctx, { api } as never) as Record<string, any>;
  assert.match(refused.error, /nothing was built/);
  assert.match(refused.error, /\[length\] the reel is 8 s, the brief asks for 6 s/);
  assert.match(refused.error, /\[must-use\] the brief's shot #3 is not cast/);
  assert.deepEqual(batches, [], 'nothing reached the draft');
  assert.equal(items().length, 0);
  const { validatePlanTool } = await import('./directorTools');
  const checked = await validatePlanTool({ plan: long }, ctx, { api } as never) as Record<string, any>;
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.violations.map((v: { rule: string }) => v.rule), ['length', 'must-use']);
  assert.deepEqual(checked.brief, { seconds: 6, mustUse: ['#3'] }, 'the brief from the treatment');
  assert.equal((await validatePlanTool({ plan: long, brief: { maxSeconds: 10 } }, ctx, { api } as never) as Record<string, any>).ok, true, 'a brief passed in replaces it');
  // the same plan again is built (a rule the footage cannot meet never loops), with the violations in its notes
  const asIs = await directorBuild({ plan: long }, ctx, { api } as never) as Record<string, any>;
  assert.equal(asIs.ok, true, JSON.stringify(asIs).slice(0, 300));
  assert.ok(asIs.notes.some((n: string) => /built although it breaks: \[length\]/.test(n)));
  // the plan that follows the brief builds clean
  const good = { ratio: '9:16', sections: [{ move: 'cut', beats: 8, clips: ['#1', '#2'] }, { move: 'hold', beats: 4, clips: ['#3@1'] }] };
  const built = await directorBuild({ plan: good, replaceTimeline: true }, ctx, { api } as never) as Record<string, any>;
  assert.equal(built.ok, true);
  assert.ok(!built.notes.some((n: string) => /breaks/.test(n)));
  // a new treatment starts the refusals over
  directorTreatment({ ...t, story: 'again', concepts: [{ name: 'A', idea: 'a' }, { name: 'B', idea: 'b' }], chosen: 0, tone: 'epic', heroes: [], parts: [{ role: 'hook', beats: 4, move: 'cut' }, { role: 'build', beats: 4, move: 'cut' }, { role: 'ending', beats: 4, move: 'hold' }], signature: 's', textStyles: [], transitions: [], effects: [], graphics: [], brief: { seconds: 6 } }, ctx);
  assert.equal(directorSession('flow5')?.refusedRules, undefined);
}

// the sheets render at once and come back in their order, whichever finishes first
{
  const { ctx } = editor('flow4');
  const picks = Array.from({ length: 18 }, (_, i) => ({ frame: i * 30, label: `s${i} mid` }));
  let inFlight = 0, most = 0;
  const render = async (frames: number[]) => {
    inFlight += 1; most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, frames[0] === 0 ? 30 : 5)); // the first sheet is the slowest
    inFlight -= 1;
    return { __images: [{ frame: frames[0], base64: `sheet-${frames[0]}` }] };
  };
  const { images, sheets } = await frameSheets(picks, 30, ctx, render);
  assert.equal(most, 3, 'three sheets at once');
  assert.deepEqual((images as Array<{ base64: string }>).map((x) => x.base64), ['sheet-0', 'sheet-240', 'sheet-480']);
  assert.match(sheets[0]!, /^image 1: \[1\] 0\.0s s0 mid/);
  assert.match(sheets[2]!, /^image 3: \[1\] 16\.0s s16 mid/);
  // a sheet that fails is left out; the others keep their numbers in order
  const flaky = await frameSheets(picks, 30, ctx, async (frames) => (frames[0] === 240 ? Promise.reject(new Error('x')) : { __images: [{ frame: frames[0], base64: 'ok' }] }));
  assert.equal(flaky.images.length, 2);
  assert.match(flaky.sheets[1]!, /^image 2: \[1\] 16\.0s/);
}

assert.match(FINISH, /review_edit_session/);
assert.match(FINISH, /at most three short lines/);
console.log('directorFlow.verify: ok');
