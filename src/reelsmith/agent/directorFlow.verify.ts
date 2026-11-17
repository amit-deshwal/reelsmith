// RS-1258: a director run in fewer model turns, on a real in-memory editor: stage 1 returns the shots for the story's
// things, the first build carries the critique, the sheets render at once and keep their order.
// Run: node --import tsx src/reelsmith/agent/directorFlow.verify.ts
import assert from 'node:assert/strict';
import { GROUP_QUERY, withGroupQuery } from './directorOptions';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline, type MediaAsset } from '../../editor/types';
import { directorSession } from '../director/directorSession';
import { directorBuild, directorOptions, directorTreatment } from './directorTools';
import { FINISH, frameSheets, framesFailed } from './directorRepairTools';

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
  // RS-1271 (5): with the group of friends added, since no phrase asked for them
  assert.deepEqual(asked, [['the summit', GROUP_QUERY]], 'only the real phrases are searched, and the group shot');
  assert.deepEqual(withGroupQuery(['the summit', 'friends laughing at camp']), ['the summit', 'friends laughing at camp'], 'a group phrase is there already');
  assert.deepEqual(withGroupQuery([]), []);
  assert.equal(out.shots.results[0].shots[0].ref, '#2@3');
  const without = await directorOptions({ find: ['the summit'] }, ctx, { api } as never, async () => ({ error: 'The visual model is not installed' })) as Record<string, any>;
  assert.match(without.shots.unavailable, /not installed/);
  const plain = await directorOptions({}, ctx, { api } as never) as Record<string, any>;
  assert.equal(plain.shots, undefined, 'no find, no search');
}

// RS-1270: lengths are in the project's frames even when the reel will be built at the footage's 60 fps
{
  const { ctx } = editor('flow-rate');
  const sixty = { clipFeatures: async () => null, mediaFps: async (s: string[]) => s.map(() => 60), musicGrid: async () => null } as never;
  const out = await directorOptions({}, ctx, { api: sixty } as never) as Record<string, any>;
  const doc = (ctx as any).getDoc();
  const first = doc.assets.find((a: any) => a.kind === 'video');
  assert.match(out.frameRate ?? '', /60 fps/);
  assert.ok(out.clips[0].includes(` ${Math.round((first.durationInFrames / (ctx as any).getState().fps) * 10) / 10}s `), `the clip's real length, not half: ${out.clips[0]}`);
}

// RS-1270: clips not read inside the budget: "watching, call again"; the second call picks up the cached readings,
// and a call that gets no further builds the log from what it has
{
  const { ctx } = editor('flow-slow');
  const { STAGE1_BUDGET } = await import('./directorOptions');
  const before = STAGE1_BUDGET.watchMs;
  STAGE1_BUDGET.watchMs = 30;
  const cache = new Map<string, Promise<null>>();
  let delay = 80;
  const slow = { clipFeatures: (a: { id: string }) => { if (!cache.has(a.id)) cache.set(a.id, new Promise((r) => setTimeout(() => r(null), delay))); return cache.get(a.id)!; }, mediaFps: async (s: string[]) => s.map(() => 30), musicGrid: async () => null } as never;
  const first = await directorOptions({}, ctx, { api: slow } as never) as Record<string, any>;
  assert.match(first.watching, /^0 of \d+ clips watched/);
  assert.match(first.next, /again/);
  assert.equal(first.clips, undefined, 'no log to plan from yet');
  await new Promise((r) => setTimeout(r, 100));
  const second = await directorOptions({}, ctx, { api: slow } as never) as Record<string, any>;
  assert.ok(Array.isArray(second.clips) && second.watching === undefined, 'the second call has the log');
  // nothing gets read at all: one "watching", then the log with the clips marked not analysed
  cache.clear(); delay = 400;
  const stuck1 = await directorOptions({}, ctx, { api: slow } as never) as Record<string, any>;
  const stuck2 = await directorOptions({}, ctx, { api: slow } as never) as Record<string, any>;
  assert.ok(stuck1.watching && Array.isArray(stuck2.clips));
  assert.match(stuck2.clips.join(' '), /not analysed/);
  STAGE1_BUDGET.watchMs = before;
}

// RS-1272 (8): the second run of a brief in a project reaches stage 2 in one stage 1 call: clips the last stage 1 read
// are not read again
{
  const { ctx } = editor('flow-again');
  const features = (id: string) => ({ assetId: id, dHash: '0'.repeat(16), windows: [{ startFrame: 0, endFrame: 60, sharpness: 0.7, exposure: 0.8, motion: 0.3, subject: 0.2, speech: false }] });
  let reads = 0;
  const once = { clipFeatures: async (a: { id: string }) => { reads += 1; return features(a.id); }, mediaFps: async (s: string[]) => s.map(() => 30), musicGrid: async () => null } as never;
  const first = await directorOptions({}, ctx, { api: once } as never) as Record<string, any>;
  assert.ok(Array.isArray(first.clips));
  assert.equal(reads, 3);
  const { STAGE1_BUDGET } = await import('./directorOptions');
  const before = STAGE1_BUDGET.watchMs;
  STAGE1_BUDGET.watchMs = 30;
  // the server would now take 400 ms a clip: the earlier reading is used instead
  const stuck = { clipFeatures: (a: { id: string }) => new Promise((r) => setTimeout(() => r(features(a.id)), 400)), mediaFps: async (s: string[]) => s.map(() => 30), musicGrid: async () => null } as never;
  const again = await directorOptions({}, ctx, { api: stuck } as never) as Record<string, any>;
  STAGE1_BUDGET.watchMs = before;
  assert.ok(Array.isArray(again.clips) && again.watching === undefined, JSON.stringify(again).slice(0, 200));
  assert.ok(!again.clips.join(' ').includes('not analysed'));
}

// RS-1272 (2): a build whose clip analysis is still running answers `building` inside the tool's time, nothing reaches
// the draft, and the same call again builds; after two such answers it builds with what there is
{
  const { BUILD_WAIT } = await import('./directorTools');
  const before = { ...BUILD_WAIT };
  BUILD_WAIT.analysisMs = 30;
  const { ctx, batches } = editor('flow-wait');
  await directorOptions({}, ctx, { api } as never);
  const cache = new Map<string, Promise<null>>();
  let ms = 150;
  const slow = { ...(api as object), clipFeatures: (a: { id: string }) => { if (!cache.has(a.id)) cache.set(a.id, new Promise((r) => setTimeout(() => r(null), ms))); return cache.get(a.id)!; } } as never;
  const plan = { ratio: '9:16', sections: [{ move: 'zoom-punch', beats: 4, clips: ['#1', '#2'], params: { every: 1 } }, { move: 'velocity', beats: 4, clips: ['#2'] }, { move: 'hold', beats: 8, clips: ['#3'] }] };
  const waiting = await directorBuild({ plan }, ctx, { api: slow } as never) as Record<string, any>;
  assert.match(waiting.building, /the people in 3 of 3 clips/);
  assert.match(waiting.next, /reels_director_build again now with the same plan/);
  assert.equal(batches.length, 0, 'nothing reached the draft');
  await new Promise((r) => setTimeout(r, 200));
  const built = await directorBuild({ plan }, ctx, { api: slow } as never) as Record<string, any>;
  assert.equal(built.ok, true, JSON.stringify(built).slice(0, 300));
  // an analysis that never ends: two answers, then the build goes ahead
  const { ctx: ctx2 } = editor('flow-wait2');
  await directorOptions({}, ctx2, { api } as never);
  cache.clear(); ms = 60_000;
  const never = { ...(api as object), clipFeatures: (a: { id: string }) => { if (!cache.has(a.id)) cache.set(a.id, new Promise((r) => setTimeout(() => r(null), ms).unref())); return cache.get(a.id)!; } } as never;
  assert.ok(((await directorBuild({ plan }, ctx2, { api: never } as never)) as any).building);
  assert.ok(((await directorBuild({ plan }, ctx2, { api: never } as never)) as any).building);
  Object.assign(BUILD_WAIT, before);
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
  // and why it failed comes back: swallowed, the agent called view_timeline_frames only to read the error
  assert.equal(flaky.error, 'x');
  const missing = await frameSheets(picks, 30, ctx, async () => ({ error: 'Export media preflight failed for 1 reference: missing_source: /media/uploads/a.depthv-1-2.png' }));
  assert.equal(missing.images.length, 0);
  assert.match(framesFailed(missing.error, 'frames unavailable'), /^frames did not render: Export media preflight failed.*a\.depthv-1-2\.png.*do not call view_timeline_frames/);
  assert.equal(framesFailed(undefined, 'frames unavailable'), 'frames unavailable');
}

assert.match(FINISH, /review_edit_session/);
assert.match(FINISH, /at most three short lines/);
assert.match(FINISH, /No list of sections/);
console.log('directorFlow.verify: ok');
