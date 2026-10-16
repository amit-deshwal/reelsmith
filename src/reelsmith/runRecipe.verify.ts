import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { historyReduce } from '../editor/reduce';
import type { MediaAsset, ProjectDoc } from '../editor/types';
import { runRecipe, withLocalTimezone, type AnalyzeApi } from './runRecipe';
import { defaultValues } from './setupForm';

const r = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
assert.ok(r.ok);
const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames });
const assets = [...Array.from({ length: 12 }, (_, i) => asset(`c${i}`, 'video')), asset('song', 'audio', 3600)];
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: (a.id.charCodeAt(1) % 16).toString(16).repeat(16), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0, speech: false }] }),
  musicGrid: async () => ({ durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};
const values = defaultValues(r.recipe);
values.media.clips = assets.filter((a) => a.kind === 'video').map((a) => ({ assetId: a.id, kind: 'video' as const }));
values.media.music = [{ assetId: 'song', kind: 'audio' }];
values.texts.place = 'Pune';

const out = await runRecipe(api, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3 });
assert.ok(out.action, out.messages.join('; '));
assert.equal(out.action!.actions[0]!.type, 'clear');
assert.equal(out.action!.actions[1]!.type, 'setCanvas');
const again = await runRecipe(api, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3 });
assert.equal(JSON.stringify(again.action), JSON.stringify(out.action), 'deterministic end to end');

// apply on a project with existing content: one undo restores it
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1920, height: 1080, selectedId: null, selectedIds: [], items: [
    { id: 'old', track: 'V1', kind: 'video', name: 'old', src: '/old', startFrame: 0, durationInFrames: 60 } as never,
  ] } as never],
};
const h1 = historyReduce({ past: [], present: doc, future: [] }, out.action!);
assert.equal(h1.past.length, 1);
const tl = h1.present.timelines[0]!;
assert.equal(tl.width, 1080); assert.equal(tl.height, 1920);
assert.ok(!tl.items.some((i) => i.id === 'old'), 'old content replaced');
assert.ok(tl.items.some((i) => i.kind === 'audio') && tl.items.some((i) => i.kind === 'text'));
const h2 = historyReduce(h1, { type: 'undo' });
assert.equal(h2.present.timelines[0]!.items[0]!.id, 'old');
assert.equal(h2.present.timelines[0]!.width, 1920, 'canvas restored too');

// a failing analyser does not block assembly
const flaky: AnalyzeApi = { clipFeatures: async () => { throw new Error('boom'); }, musicGrid: api.musicGrid };
const f = await runRecipe(flaky, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: false });
assert.ok(f.action);
assert.ok(f.messages.some((m) => /could not be analysed/.test(m)));
// no beat in the song => explained, nothing dispatched
const deaf: AnalyzeApi = { ...api, musicGrid: async () => null };
const d = await runRecipe(deaf, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: false });
assert.equal(d.action, null);
assert.ok(d.messages.some((m) => /steady beat/.test(m)));
console.log('runRecipe.verify: ok');

// captioned-story: transcripts on pool assets reach the assembler
{
  const cs = parseRecipe(readFileSync('recipes/captioned-story.recipe.json', 'utf8'));
  assert.ok(cs.ok);
  const words = Array.from({ length: 12 }, (_, i) => ({ text: `w${i}${i % 4 === 3 ? '.' : ''}`, start: 500 + i * 400, end: 800 + i * 400 }));
  const talk = { ...asset('t1', 'video', 900), transcript: words };
  const mute = asset('t2', 'video', 900);
  const vals = defaultValues(cs.recipe);
  vals.media.talking = [{ assetId: 't1', kind: 'video' }];
  const withT = await runRecipe(api, { recipe: cs.recipe, values: vals, assets: [talk], fps: 30, replaceTimeline: false });
  assert.ok(withT.action, withT.messages.join('; '));
  vals.media.talking = [{ assetId: 't2', kind: 'video' }];
  const without = await runRecipe(api, { recipe: cs.recipe, values: vals, assets: [mute], fps: 30, replaceTimeline: false });
  assert.equal(without.action, null);
  assert.ok(without.messages.some((m) => /transcribe/.test(m)));
}
console.log('runRecipe captioned-story: ok');

// Invalid/stale form selections must never reach expensive analysis or timeline assembly.
const noAnalysis: AnalyzeApi = {
  clipFeatures: async () => assert.fail('invalid input must not analyse clips'),
  musicGrid: async () => assert.fail('invalid input must not analyse music'),
};
await assert.rejects(runRecipe(noAnalysis, { recipe: r.recipe, values: defaultValues(r.recipe), assets, fps: 30, replaceTimeline: true }), /Trip clips.*at least 6/);
await assert.rejects(runRecipe(noAnalysis, { recipe: r.recipe, values, assets: assets.filter((a) => a.id !== 'song'), fps: 30, replaceTimeline: true }), /Song.*no longer in the project/);

// story-vlog labels default to the user's own timezone; an explicit param wins; other recipes are untouched.
{
  const ist = { getTimezoneOffset: () => -330 } as Date;
  assert.equal(withLocalTimezone({ assembler: { strategy: 'story-vlog@1' } }, { a: 1 }, ist).tzOffsetMin, 330);
  assert.equal(withLocalTimezone({ assembler: { strategy: 'story-vlog@1' } }, { tzOffsetMin: 0 }, ist).tzOffsetMin, 0);
  assert.equal('tzOffsetMin' in withLocalTimezone({ assembler: { strategy: 'beat-montage@1' } }, {}, ist), false);
  console.log('runRecipe timezone: ok');
}

// RS-109: tags from the api reach the assembler's clips, progress text is forwarded, a failing tag source is ignored
{
  const { prepareAssembly } = await import('./runRecipe');
  const seen: string[] = [];
  const top = (id: string) => (Number(id.slice(1)) % 2 ? 'people' : 'scenery') as 'people' | 'scenery';
  const tagged: AnalyzeApi = {
    ...api,
    shotTags: async (as, progress) => {
      progress?.('Reading what the shots show 1/12');
      return new Map(as.map((a) => [a.id, { top: top(a.id), confidence: 0.9, samples: 3, scores: { scenery: 0, people: 0, portrait: 0, action: 0, food: 0, detail: 0, city: 0, water: 0, night: 0, [top(a.id)]: 0.9 } as never }]));
    },
  };
  const prep = await prepareAssembly(tagged, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3, onProgress: (t) => seen.push(t) });
  assert.ok(prep.input.clips.every((c) => c.shot?.top === top(c.assetId)), 'every clip carries its tag');
  assert.ok(seen.includes('Reading what the shots show 1/12'));
  const broken = await prepareAssembly({ ...api, shotTags: async () => { throw new Error('model missing'); } }, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3 });
  assert.ok(broken.input.clips.length > 0 && broken.input.clips.every((c) => !c.shot), 'tag failure falls back to untagged clips');
}
console.log('runRecipe shot tags: ok');
