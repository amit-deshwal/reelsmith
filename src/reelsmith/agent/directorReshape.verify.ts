import assert from 'node:assert/strict';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { DIRECTOR_PROP, directorSession, restoreDirectorSession, savedDirector, updateDirectorSession } from '../director/directorSession';
import { directorReshape } from './directorReshapeTool';

// RS-1233: the directed reel in another shape is a new timeline built from the saved plan with every shot kept
const plan: ReelPlan = { version: 1, ratio: '9:16', sections: [{ move: 'hold', beats: 8, clips: ['v1'] }, { move: 'cut', beats: 8 }] };
updateDirectorSession('r1', { fps: 30, clips: [], lastBuild: { plan, spans: [{ from: 0, to: 4 }, { from: 4, to: 8 }], builds: 1, clips: [['v1'], ['v2']], moments: [[30], [60]] } });
const made: unknown[] = [];
const items: unknown[] = [{ props: { [DIRECTOR_PROP]: savedDirector(directorSession('r1')!) } }];
let open = 'main';
const ctx = (id: string) => ({
  getProjectId: () => id, audio: [], onToolProgress: () => {},
  getState: () => ({ fps: 30, items: open === 'main' ? items : [] }),
  getDoc: () => ({ activeTimelineId: open, timelines: [{ id: 'main', name: 'Trek' }], assets: [{ id: 'v1', name: 'v1.mov', kind: 'video', src: '/x', durationInFrames: 300 }, { id: 'v2', name: 'v2.mov', kind: 'video', src: '/y', durationInFrames: 300 }] }),
  commands: { createTimeline: (o: unknown) => { made.push(o); open = 'copy'; return 'copy'; } },
}) as never;

assert.match((await directorReshape({ ratio: '5:4' }, ctx('r1'), {} as never) as { error: string }).error, /one of/);
assert.match((await directorReshape({ ratio: '9:16' }, ctx('r1'), {} as never) as { error: string }).error, /already 9:16/);
open = 'blank';
assert.match((await directorReshape({ ratio: '4:5' }, ctx('nobody'), {} as never) as { error: string }).error, /no director reel/);
open = 'main';
assert.deepEqual(made, []);
// the build runs on the new timeline (its media api is absent here, so it stops inside the build, after the copy)
const out = await directorReshape({ ratio: '4:5' }, ctx('r1'), {} as never).catch((e: Error) => ({ error: e.message })) as { error?: string };
assert.deepEqual(made, [{ name: 'Trek 4:5', width: 1080, height: 1350, activate: true }]);
assert.ok(out.error && !/already|no director reel|ratio must/.test(out.error), out.error);

// switching between the shapes: the open timeline's saved run wins over the other shape in memory
updateDirectorSession('r2', { fps: 30, clips: [], lastBuild: { plan: { ...plan, ratio: '4:5' }, spans: [], builds: 1 } });
assert.equal(restoreDirectorSession('r2', items as never)!.lastBuild!.plan.ratio, '9:16');
updateDirectorSession('r3', { fps: 30, clips: [], lastBuild: { plan: { ...plan, sections: [plan.sections[0]!] }, spans: [], builds: 2 } });
assert.equal(restoreDirectorSession('r3', items as never)!.lastBuild!.plan.sections.length, 1, 'the same shape: the live run wins');
console.log('directorReshape.verify ok');
