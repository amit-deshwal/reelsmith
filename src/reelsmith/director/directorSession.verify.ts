import assert from 'node:assert/strict';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { DIRECTOR_PROP, builtOnTimeline, directorSession, findSavedDirector, restoreDirectorSession, savedDirector, updateDirectorSession } from './directorSession';
import type { Treatment } from './treatment';

// RS-1222: the director's run is saved on the reel's canvas and comes back after a reload or in a new chat
const plan: ReelPlan = { version: 1, ratio: '9:16', music: 'song', tone: 'royal', sections: [{ move: 'hold', beats: 8, clips: ['a'], text: 'AMK', textStyle: 'landscape-title' }, { move: 'cut', beats: 8 }] };
const treatment = {
  story: 'bro lied to me', concepts: [{ name: 'Earned', idea: 'royal' }, { name: 'Betrayal', idea: 'comic' }], chosen: 0, tone: 'royal', heroes: ['#1@2'],
  parts: [{ role: 'hook', beats: 8, move: 'hold', purpose: 'the setup' }], signature: 'AMK over the sky', textStyles: ['landscape-title'], transitions: [], effects: [], graphics: [],
} as unknown as Treatment;
updateDirectorSession('p1', {
  fps: 30, clips: [{ n: 1, kind: 'video', seconds: 10 }], treatment, song: { assetId: 'song', bpm: 120 },
  lastBuild: { plan: { ...plan, keep: [null, { clips: ['b'], moments: [30] }] }, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], builds: 2, clips: [['a'], ['b']], moments: [[60], [30]], fixes: 1, defects: [{ section: 0, at: 1, evidence: 'image 1', fix: 'lower' }] },
});
const saved = savedDirector(directorSession('p1')!);
assert.equal(saved.build?.plan.keep, undefined, 'the replay is not saved, only the plan as written');
assert.deepEqual(saved.build?.clips, [['a'], ['b']], 'the cast is saved, so a later fix keeps the other sections');
assert.ok(!('clips' in saved && Array.isArray((saved as { clips?: unknown }).clips)), 'the shot log is not saved');
assert.ok(JSON.stringify(saved).length < 8000, 'small enough to ride on one item');

// a new chat: nothing in memory, the canvas carries it
const items = [{ props: { rsSection: 'canvas', [DIRECTOR_PROP]: JSON.parse(JSON.stringify(saved)) } }, { props: { rsSection: '1-hold' } }];
assert.ok(findSavedDirector(items));
assert.equal(directorSession('p2'), undefined);
const back = restoreDirectorSession('p2', items)!;
assert.equal(back.treatment?.tone, 'royal');
assert.deepEqual(back.lastBuild?.plan.sections, plan.sections);
assert.deepEqual(back.lastBuild?.moments, [[60], [30]]);
assert.equal(back.lastBuild?.defects?.length, 1, 'open defects come back too');
// a timeline with no director canvas has nothing to restore; a live session wins over the saved one
assert.equal(restoreDirectorSession('p3', [{ props: { rsSection: 'x' } }]), undefined);
updateDirectorSession('p2', { treatment: { ...treatment, tone: 'hype' } as Treatment });
assert.equal(restoreDirectorSession('p2', items)!.treatment?.tone, 'hype');

// the fix tool's read path (no changes): the saved treatment and plan for a later chat edit
const { directorFix } = await import('../agent/directorRepairTools');
const ctx = (id: string, its: unknown[]) => ({ getProjectId: () => id, getState: () => ({ fps: 30, items: its }), getDoc: () => ({ assets: [] }) }) as never;
const read = await directorFix({}, ctx('p4', items), {} as never) as Record<string, any>;
assert.deepEqual(read.plan.sections, plan.sections);
assert.equal(read.treatment.tone, 'royal');
assert.equal(read.treatment.parts[0].purpose, 'the setup');
assert.match(read.next, /sections/);
const none = await directorFix({}, ctx('p5', []), {} as never) as Record<string, any>;
assert.match(none.error, /no director reel/);
// a change needs a reason, and section indexes must exist
const why = await directorFix({ sections: { 0: { move: 'hold', beats: 8 } } }, ctx('p4', items), {} as never) as Record<string, any>;
assert.match(why.error, /defects.*or `request`/);
const where = await directorFix({ request: 'slower ending', sections: { 7: { move: 'hold', beats: 8 } } }, ctx('p4', items), {} as never) as Record<string, any>;
assert.match(where.error, /not a section index \(0-1\)/);

// RS-1221: the build refuses a line about something no clip shows; leaving it out is fine
const { directorBuild } = await import('../agent/directorTools');
const scenery = { top: 'scenery', confidence: 0.6, samples: 4, scores: { scenery: 0.5, food: 0.01 } } as never;
updateDirectorSession('p6', { fps: 30, clips: [1, 2].map((n) => ({ n, kind: 'video' as const, seconds: 10, tags: scenery })), treatment: { ...treatment, story: 'climbed at dawn, cooked on the cliff', quoteUser: true } as Treatment });
const media = { getProjectId: () => 'p6', getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets: [{ id: 'v1', name: 'v1.mov', kind: 'video', src: '/x', durationInFrames: 300 }, { id: 'v2', name: 'v2.mov', kind: 'video', src: '/y', durationInFrames: 300 }] }), audio: [] } as never;
const faked = await directorBuild({ plan: { ratio: '9:16', sections: [{ move: 'hold', beats: 8, clips: ['#1'], text: 'cooked on the cliff', textStyle: 'rise-lines' }] } }, media, {} as never) as Record<string, any>;
assert.match(faked.error, /no clip shows what "cooked on the cliff" names/);

// RS-1271 (1): a new treatment after a built reel puts that reel's moves in the project's history, which is saved with
// the next reel and reaches the plan check (the last reel's moves again are refused once)
{
  const { directorTreatment } = await import('../agent/directorTools');
  updateDirectorSession('p7', { fps: 30, clips: [], lastBuild: { plan: { version: 1, ratio: '9:16', sections: [{ move: 'zoom-punch' }, { move: 'velocity' }, { move: 'break-in' }] } as never, spans: [], builds: 1 } });
  const t7 = { ...treatment, concepts: [{ name: 'A', idea: 'a' }, { name: 'B', idea: 'b' }], parts: [{ role: 'hook', beats: 4, move: 'zoom-punch', purpose: 'x' }, { role: 'drop', beats: 4, move: 'velocity', purpose: 'y' }, { role: 'ending', beats: 4, move: 'break-in', purpose: 'z' }] };
  const ctx7 = { getProjectId: () => 'p7', getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets: [] }) } as never;
  const r7 = directorTreatment(t7 as never, ctx7) as { findings: Array<{ issue: string }> };
  assert.deepEqual(directorSession('p7')!.history, [['zoom-punch', 'velocity', 'break-in']]);
  assert.ok(r7.findings.some((f) => /same moves as the last reel/.test(f.issue)), r7.findings.map((f) => f.issue).join(' | '));
  // a revised treatment before any build adds nothing
  directorTreatment(t7 as never, ctx7);
  assert.equal(directorSession('p7')!.history!.length, 1);
  assert.deepEqual(savedDirector(directorSession('p7')!).history, [['zoom-punch', 'velocity', 'break-in']]);
  const back7 = restoreDirectorSession('p8', [{ props: { [DIRECTOR_PROP]: JSON.parse(JSON.stringify(savedDirector(directorSession('p7')!))) } }]);
  assert.deepEqual(back7?.history, [['zoom-punch', 'velocity', 'break-in']]);
}

// RS-1272 (3): a build that timed out for the agent but finished on the server is in the session, not on the timeline:
// the critique and the fix's read path say "not built" instead of judging the reel before it
{
  const { directorCritique } = await import('../agent/directorRepairTools');
  const old = { ...JSON.parse(JSON.stringify(saved)), build: { ...saved.build, buildId: 'old' } };
  const timeline = [{ props: { rsSection: 'canvas', [DIRECTOR_PROP]: old } }];
  updateDirectorSession('p9', { fps: 30, clips: [], treatment, lastBuild: { plan, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], builds: 1, buildId: 'new' } });
  assert.ok(!builtOnTimeline(directorSession('p9')!, timeline));
  const c9 = await directorCritique(ctx('p9', timeline)) as Record<string, any>;
  assert.match(c9.error, /^not built/);
  const f9 = await directorFix({}, ctx('p9', timeline), {} as never) as Record<string, any>;
  assert.equal(f9.built, false);
  assert.match(f9.next, /build it with reels_director_build/);
  // the same build on the timeline is trusted
  const same = [{ props: { [DIRECTOR_PROP]: { ...old, build: { ...old.build, buildId: 'new' } } } }];
  assert.ok(builtOnTimeline(directorSession('p9')!, same));
  assert.equal(((await directorFix({}, ctx('p9', same), {} as never)) as Record<string, any>).built, undefined);
}
console.log('directorSession.verify ok');
