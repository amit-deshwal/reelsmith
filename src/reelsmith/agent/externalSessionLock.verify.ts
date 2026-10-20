// A discarded edit session releases the edit lock even when its run ledger can't record the end
// (a refresh in another tab takes the run's lease, and finalize throws).
import assert from 'node:assert/strict';
import { makeDraft } from '../../editor/store';
import { ExternalBridgeRuntime } from '../../agent/external-bridge-runtime';
import { revisionOf } from '../../agent/external-edit-session';
import { base } from '../../agent/external-edit-session-core.verify';

const live = makeDraft(base);
const runtime = new ExternalBridgeRuntime(
  'lock-project',
  'lock-editor',
  () => ({
    commands: live.commands,
    getState: live.getState,
    getDoc: live.getDoc,
    getCreativeMode: () => null,
    templates: [],
    audio: [],
    getProjectId: () => 'lock-project',
  }),
  () => undefined,
);
const binding = { projectId: 'lock-project', editorInstanceId: 'lock-editor', baseRevision: revisionOf(base) };

const first = await runtime.execute('begin_edit_session', {}, binding) as { editSessionId: string };
const runs = (runtime as unknown as { runs: Map<string, { finalize: () => Promise<void> }> }).runs;
runs.get(first.editSessionId)!.finalize = async () => {
  throw new Error('Browser durable storage could not persist server run progress.');
};

await assert.rejects(
  runtime.execute('discard_edit_session', { editSessionId: first.editSessionId }, binding),
  /could not persist/,
);
const listed = await runtime.execute('list_edit_sessions', {}, binding) as { editSessionId: string; status: string }[];
assert.equal(listed.find((s) => s.editSessionId === first.editSessionId)?.status, 'cancelled', 'the session ends anyway');

const second = await runtime.execute('begin_edit_session', {}, binding) as { editSessionId: string };
assert.notEqual(second.editSessionId, first.editSessionId, 'a fresh session can start after the failed discard');
console.log('externalSessionLock verify ok');
