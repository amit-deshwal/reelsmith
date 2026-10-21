import assert from 'node:assert/strict';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { DIRECTOR_PROP, directorSession, findSavedDirector, restoreDirectorSession, savedDirector, updateDirectorSession } from './directorSession';
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
console.log('directorSession.verify ok');
