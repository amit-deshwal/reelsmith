import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import type { ProjectDoc } from '../editor/types';
import { clearDirectorStart, directorProjectDoc, pendingDirectorStart, startDirectorProject } from './directorStart';

const empty: ProjectDoc = { version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't1', timelines: [{
  id: 't1', name: 'Sequence 1', order: 0, fps: 24, width: 1920, height: 1080,
  items: [], selectedId: null, trackOrder: ['v1'], tracks: { v1: { kind: 'video' } },
}] };
const before = JSON.stringify(empty);

// "Direct a reel": an empty project on the chosen shape, handed to the Director tab
const wide = directorProjectDoc(empty, '4:5');
assert.deepEqual([wide.timelines[0].width, wide.timelines[0].height, wide.timelines[0].fps], [1080, 1350, 30]);
assert.equal(JSON.stringify(empty), before, 'does not mutate the supplied empty document');

const calls: string[] = [];
await startDirectorProject('1:1', {
  create: async (name, ratio) => { calls.push('create'); assert.equal(name, 'New reel'); assert.equal(ratio, '1:1'); return { id: 'new-directed-project' }; },
  refresh: async () => { calls.push('refresh'); },
  open: (id) => {
    calls.push('open');
    assert.equal(pendingDirectorStart(id)?.ratio, '1:1', 'the shape travels with the handoff, before navigation');
  },
});
assert.deepEqual(calls, ['create', 'refresh', 'open']);
assert.equal(pendingDirectorStart('different-project'), undefined, 'does not affect existing projects');
clearDirectorStart('new-directed-project');
assert.equal(pendingDirectorStart('new-directed-project'), undefined, 'handoff is cleared after mounting');

// a failed creation neither refreshes nor navigates
await assert.rejects(startDirectorProject('9:16', {
  create: async () => { throw new Error('Disk full'); },
  refresh: async () => assert.fail('must not refresh after failed creation'),
  open: () => assert.fail('must not navigate after failed creation'),
}), /Disk full/);
console.log('directorStart.verify: ok');
