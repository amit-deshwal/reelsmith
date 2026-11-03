import assert from 'node:assert/strict';
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import { execReelsTool, REELS_TOOL_NAMES, type ReelsDeps } from './reelsTools';

assert.ok(REELS_TOOL_NAMES.has('reels_find_shots'));
const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({ id, name: `${id}.mov`, kind, src: `/media/uploads/${id}`, durationInFrames: 300 });
const assets = [asset('lake'), asset('group'), asset('dinner'), asset('song', 'audio')];
const ctx = { getDoc: () => ({ assets }), getProjectId: () => 'p-find', getState: () => ({ fps: 30, items: [] }) } as unknown as AgentContext;
// a toy space: axis 0 = water, 1 = people, 2 = food
const frames = [
  { assetId: 'lake', sampleTime: 1, vector: [1, 0, 0] }, { assetId: 'lake', sampleTime: 8, vector: [0.7, 0.2, 0] },
  { assetId: 'group', sampleTime: 2, vector: [0.1, 1, 0] }, { assetId: 'dinner', sampleTime: 3, vector: [0, 0.1, 1] },
];
// the query 'a tank of tigers' points almost nowhere the frames do
const vectorOf: Record<string, number[]> = { 'a calm lake': [1, 0, 0], 'friends laughing': [0, 1, 0], 'a tank of tigers': [0.3, 0.3, 0.3, 1] };
const deps: ReelsDeps = {
  api: {} as never,
  semantic: async (_id, visual, texts) => {
    assert.deepEqual(visual.map((a) => a.id), ['lake', 'group', 'dinner'], 'only the pictures, in the director\'s order');
    return { frames, queries: texts.map((t) => vectorOf[t] ?? [0.3, 0.3, 0.3]) };
  },
};
const call = (args: Record<string, unknown>, d: ReelsDeps = deps) => execReelsTool('reels_find_shots', args, ctx, d) as Promise<any>;

const out = await call({ queries: ['a calm lake', 'friends laughing'] });
assert.equal(out.results.length, 2);
assert.equal(out.results[0].shots[0].ref, '#1@1', 'the lake is clip #1, at its water frame');
assert.equal(out.results[0].shots[0].shows, 'sure', 'a frame that is exactly the phrase');
assert.equal(out.results[1].shots[0].ref, '#2@2', 'the group is clip #2');
assert.ok(out.results[0].shots.every((s: { ref: string }, i: number, all: Array<{ ref: string }>) => all.findIndex((x) => x.ref.split('@')[0] === s.ref.split('@')[0]) === i), 'one shot per clip');
assert.match(out.note, /shows: sure/);

// a phrase nothing in the footage matches says so
const weak = await call({ queries: ['a tank of tigers'] });
assert.ok(weak.results[0].shots.length > 0);
assert.equal(weak.results[0].shots[0].shows, 'weak');
assert.match(weak.results[0].none, /nothing in the footage shows this/);
assert.equal(out.results[0].none, undefined, 'a phrase that is in the footage has no warning');

// limit is clamped; more than eight phrases are cut
const many = await call({ queries: Array.from({ length: 12 }, () => 'a calm lake'), limit: 99 });
assert.equal(many.results.length, 8);
assert.ok(many.results[0].shots.length <= 3, 'three clips, so at most three different shots');

// no phrases, no model, no clips
assert.match((await call({}) as { error: string }).error, /queries is required/);
assert.match((await call({ queries: ['x'] }, { api: {} as never }) as { error: string }).error, /not available/);
assert.match((await call({ queries: ['x'] }, { api: {} as never, semantic: async () => null }) as { error: string }).error, /not installed/);
const empty = { getDoc: () => ({ assets: [asset('song', 'audio')] }), getProjectId: () => 'p-empty', getState: () => ({ fps: 30, items: [] }) } as unknown as AgentContext;
assert.match((await execReelsTool('reels_find_shots', { queries: ['x'] }, empty, deps) as { error: string }).error, /No clips/);
console.log('directorSearchTool.verify: ok');
