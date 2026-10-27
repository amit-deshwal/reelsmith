import assert from 'node:assert/strict';
import { makeDraft } from '../editor/store';
import { ExternalBridgeRuntime } from './external-bridge-runtime';
import { createExternalEditSession, ExternalEditSessionOutcomeError, rebaseUntouchedExternalEditSession, revisionOf } from './external-edit-session';
import { base, sessionStatus } from './external-edit-session-core.verify';

// Reelsmith: a session that has drafted nothing follows the live project instead of going stale (a project still being
// probed after an import changed under "Direct my reel" and killed its first tool call, 2026-10-28); one with edits
// still goes stale
const live = makeDraft(base);
const runtime = new ExternalBridgeRuntime('rebase-project', 'rebase-editor', () => ({
  commands: live.commands, getState: live.getState, getDoc: live.getDoc, getCreativeMode: () => null,
  templates: [], audio: [], getProjectId: () => 'rebase-project',
}), () => undefined);
const binding = () => ({ projectId: 'rebase-project', editorInstanceId: 'rebase-editor', baseRevision: revisionOf(live.getDoc()) });

const begun = await runtime.execute('begin_edit_session', {}, binding()) as { editSessionId: string };
live.commands.setAspect(1080, 1350, 'contain');
const first = await runtime.execute('set_aspect_ratio', { editSessionId: begun.editSessionId, ratio: '1:1' }, binding());
assert.ok(first && typeof first === 'object' && !('error' in first), JSON.stringify(first));
assert.equal(sessionStatus(await runtime.execute('get_edit_session', { editSessionId: begun.editSessionId }, binding())), 'drafting');

live.commands.setAspect(1920, 1080, 'contain');
await assert.rejects(
  runtime.execute('set_aspect_ratio', { editSessionId: begun.editSessionId, ratio: '9:16' }, binding()),
  (error: unknown) => error instanceof ExternalEditSessionOutcomeError && error.outcome === 'stale',
  'a session with a drafted edit keeps strict staleness',
);

const fresh = createExternalEditSession(base);
const moved = makeDraft(base);
moved.commands.setAspect(1080, 1350, 'contain');
const rebased = rebaseUntouchedExternalEditSession(fresh, moved.getDoc())!;
assert.equal(rebased.baseRevision, revisionOf(moved.getDoc()));
assert.equal(rebased.id, fresh.id);
assert.equal(rebaseUntouchedExternalEditSession({ ...fresh, operations: [{} as never] }, moved.getDoc()), null);
console.log('external-untouched-rebase.verify ok');
