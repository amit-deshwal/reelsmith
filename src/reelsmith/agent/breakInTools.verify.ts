// RS-413: the agent sees the break-in transitions with their props and can add them with default props.
import assert from 'node:assert';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { makeDraft } from '../../editor/store';
import type { ProjectDoc, Timeline, TimelineItem } from '../../editor/types';
import { TEMPLATES } from '../../editor/initial';
import type { AgentContext } from '../../agent/context';
import { execEditItemTool } from '../../agent/tools/edit-item-tools';
import { execLibraryTool } from '../../agent/tools/library-tools';
import { REELS_EDIT_TOOL_NAMES } from './reelsToolSchemas';

const vid = (id: string, start: number, dur: number): TimelineItem => ({ id, track: 'V1', startFrame: start, durationInFrames: dur, name: id, kind: 'video', src: '/media/uploads/testsrc-tc.mp4' });
const tl: Timeline = {
  id: 'tl', name: 'test', order: 0, fps: 30, width: 1080, height: 1920,
  items: [vid('clip1', 0, 90), vid('clip2', 90, 90), vid('clip3', 180, 90)], selectedId: null, trackOrder: ['V1', 'A1'],
  tracks: { V1: { kind: 'video', name: 'V1' }, A1: { kind: 'audio', name: 'A1' } },
};
const base: ProjectDoc = { version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], timelines: [tl], activeTimelineId: 'tl' };
const ctxOf = (d: ReturnType<typeof makeDraft>): AgentContext => ({ commands: d.commands, getState: d.getState, getDoc: d.getDoc, getCreativeMode: () => null, templates: TEMPLATES.slice(0, 20), audio: [] });

// browse_library lists the three with their props
const ctx0 = ctxOf(makeDraft(base));
const list = await execLibraryTool('browse_library', { category: 'transitions', group: 'transitions' }, ctx0) as { results: { id: string; name: string; description: string }[] };
for (const [type, words] of [['bars', /6 vertical bars/], ['wide-bars', /3 wide bars/], ['window', /safe zone/]] as const) {
  const hit = list.results.find((r) => r.id === `builtin:tr-${type}`);
  assert.ok(hit, `${type} is listed`);
  assert.match(hit!.description, words);
  assert.match(hit!.description, /0\.35 s/);
}
const detail = await execLibraryTool('browse_library', { id: 'builtin:tr-bars' }, ctx0) as { item: { usage?: string } };
assert.ok(detail.item.usage?.includes('edit_item'));

// "add a bars transition between clip 2 and 3": no durationInFrames given -> default props, 0.35 s
for (const [type, expected] of [['bars', 'bars'], ['wide-bars', 'wide-bars'], ['window', 'window']] as const) {
  const d = makeDraft(base);
  const ctx = ctxOf(d);
  const r = await execEditItemTool('edit_item', { adds: [{ type: 'transition', assetId: `builtin:tr-${type}`, incomingItemId: 'clip3' }] }, ctx) as {
    ok: boolean; results: { transition?: { type: string; durationInFrames: number } | null }[];
  };
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const trs = ctx.getState().transitions ?? [];
  assert.strictEqual(trs.length, 1);
  assert.strictEqual(trs[0]!.type, expected);
  assert.strictEqual(trs[0]!.outgoingItemId, 'clip2');
  assert.strictEqual(trs[0]!.incomingItemId, 'clip3');
  assert.strictEqual(trs[0]!.durationInFrames, 11, 'default 0.35 s at 30 fps');
  assert.strictEqual(r.results[0]!.transition?.durationInFrames, 11);
}
// an explicit length still wins, and other transitions keep the editor's 1 s default
{
  const ctx = ctxOf(makeDraft(base));
  await execEditItemTool('edit_item', { adds: [{ type: 'transition', assetId: 'builtin:tr-bars', incomingItemId: 'clip2', durationInFrames: 20 }] }, ctx);
  await execEditItemTool('edit_item', { adds: [{ type: 'transition', assetId: 'builtin:tr-cross-dissolve', incomingItemId: 'clip3' }] }, ctx);
  const trs = ctx.getState().transitions ?? [];
  assert.strictEqual(trs.find((t) => t.type === 'bars')!.durationInFrames, 20);
  assert.strictEqual(trs.find((t) => t.type === 'cross-dissolve')!.durationInFrames, 30);
}
assert.ok(REELS_EDIT_TOOL_NAMES.includes('reels_strobe'));
console.log('breakInTools.verify ok');
