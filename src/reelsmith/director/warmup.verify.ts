// RS-1258: the Director tab watches the clips while the story is written. Run: node --import tsx src/reelsmith/director/warmup.verify.ts
import assert from 'node:assert/strict';
import type { MediaAsset } from '../../editor/types';
import { warmDirectorAnalysis, warmupFps, warmupVisuals } from './warmup';

const video = (id: string, src = `/media/uploads/${id}.mov`): MediaAsset => ({ id, name: `${id}.MOV`, kind: 'video', src, durationInFrames: 300, width: 1080, height: 1920 } as MediaAsset);
const assets: MediaAsset[] = [
  video('a'), video('b'), video('ref'), video('uploading', 'blob:http://x/1'),
  { id: 'p', name: 'p.jpg', kind: 'image', src: '/media/uploads/p.jpg', durationInFrames: 150 } as MediaAsset,
  { id: 's', name: 'song.mp3', kind: 'audio', src: '/media/uploads/s.mp3', durationInFrames: 900 } as MediaAsset,
  video('c'), video('d'),
];

// the clips stage 1 watches: pictures in order, not the reference, not a file still uploading
assert.deepEqual(warmupVisuals(assets, 'ref').map((a) => a.id), ['a', 'b', 'p', 'c', 'd']);

// the rate stage 1 analyses at: the footage's 60 fps only for an empty timeline
const sixty = async (srcs: string[]) => srcs.map(() => 60);
assert.equal(await warmupFps({ assets, fps: 30, timelineHasItems: false }, sixty), 60);
assert.equal(await warmupFps({ assets, fps: 30, timelineHasItems: true }, sixty), 30, 'a placed timeline keeps its rate');
assert.equal(await warmupFps({ assets, fps: 30, timelineHasItems: false }, async (s) => s.map(() => 30)), 30);
assert.equal(await warmupFps({ assets, fps: 30, timelineHasItems: false }), 30, 'no rate reader: unchanged');

// three at a time, each video once at that rate, the shot tags once; warming the same media again starts nothing
{
  const calls: string[] = [];
  let inFlight = 0, most = 0;
  let tagRuns = 0;
  const deps = {
    clipFeatures: async (a: MediaAsset, fps: number) => {
      calls.push(`${a.id}@${fps}`); inFlight += 1; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5)); inFlight -= 1;
      if (a.id === 'c') throw new Error('unreadable');
    },
    mediaFps: sixty,
    shotTags: async (_id: string, list: MediaAsset[]) => { tagRuns += 1; assert.deepEqual(list.map((x) => x.id), ['a', 'b', 'p', 'c', 'd']); },
  };
  const input = { projectId: 'proj', assets, fps: 30, timelineHasItems: false, referenceId: 'ref' };
  await warmDirectorAnalysis(input, deps);
  assert.deepEqual(calls.sort(), ['a@60', 'b@60', 'c@60', 'd@60']);
  assert.ok(most <= 3, `at most three at once (${most})`);
  assert.equal(tagRuns, 1);
  await warmDirectorAnalysis(input, deps);
  assert.equal(calls.length, 4, 'the same media is not warmed twice');
  // a new clip lands: warmed again (the server and browser caches make the old ones instant)
  await warmDirectorAnalysis({ ...input, assets: [...assets, video('e')] }, deps);
  assert.ok(calls.includes('e@60'));
}

// nothing to watch, or no project: nothing happens and nothing throws
await warmDirectorAnalysis({ projectId: 'proj', assets: [assets[5]!], fps: 30, timelineHasItems: false }, { clipFeatures: async () => { throw new Error('never'); } });
await warmDirectorAnalysis({ projectId: '', assets, fps: 30, timelineHasItems: false }, { clipFeatures: async () => { throw new Error('never'); } });

// stage 1 asks for exactly what was warmed: the same clips at the same rate (so it waits on the cached work)
{
  const { directorOptions } = await import('../agent/directorTools');
  const warmed: string[] = [], asked: string[] = [];
  const list = [video('v1'), video('v2')];
  await warmDirectorAnalysis({ projectId: 'current', assets: list, fps: 30, timelineHasItems: false }, { clipFeatures: async (a, fps) => { warmed.push(`${a.id}@${fps}`); }, mediaFps: sixty });
  const ctx: any = { getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets: list, timelines: [] }), audio: [], commands: {} };
  await directorOptions({}, ctx, { api: { musicGrid: async () => null, mediaFps: sixty, clipFeatures: async (a: MediaAsset, fps: number) => { asked.push(`${a.id}@${fps}`); return null; } } } as any);
  assert.deepEqual(asked.sort(), warmed.sort());
}

console.log('warmup.verify: ok');
