// RS-412: transitions named per section, "auto" rotation, the strobe hook/closer sections and the sixth recipe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe, type Recipe } from '../../../shared/reelsmith/recipe';
import { historyReduce, type History } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { loadCatalog } from '../catalog';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { pickTransitions } from './transitions';

const load = (file: string): Recipe => {
  const r = parseRecipe(readFileSync(file, 'utf8'));
  assert.ok(r.ok, r.ok ? '' : r.errors.join('; '));
  return r.recipe;
};
const recipe = load('recipes/place-stats-reel.recipe.json');
assert.equal(JSON.stringify(recipe), JSON.stringify(load('reelsmith-docs/plan/examples/recipes/place-stats-reel.recipe.json')), 'example and shipped copies match');
assert.ok(parseRecipe(JSON.stringify({ ...recipe, structure: [{ section: 'a', transition: 'sparkle' }] })).ok === false, 'unknown transition names are rejected');
assert.ok(parseRecipe(JSON.stringify({ ...recipe, structure: [{ section: 'a', fill: 'clips', transition: 'wide-bars' }] })).ok, 'new names validate');
assert.ok(recipe.structure.some((s) => s.strobe));

// the app's catalog loads it alongside the other five
const files = ['beat-cut', 'captioned-story', 'collage-grid', 'mini-vlog', 'travel-beat-montage', 'place-stats-reel'];
const catalog = loadCatalog(Object.fromEntries(files.map((f) => [`/recipes/${f}.recipe.json`, readFileSync(`recipes/${f}.recipe.json`, 'utf8')])));
assert.equal(catalog.recipes.length, 6);

// 120 bpm, 4/4, 0.25 s offset like the other fixtures
const music: AssemblyMusic = {
  assetId: 'song', name: 'song.mp3', src: '/media/song.mp3', durationSec: 60,
  beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const clips: AssemblyClip[] = Array.from({ length: 30 }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}.mov`, src: `/media/c${i}.mov`, kind: 'video' as const, durationInFrames: 300, score: ((i * 37) % 11) / 11,
}));
const base = { recipe, clips, music, texts: { place: 'Kalsubai', stat: '6 km · 3 h' }, params: {} as Record<string, string | number | boolean>, seed: 5 };

const t0 = performance.now();
const a = assemble(base);
assert.ok(performance.now() - t0 < 10_000, 'assembles in under 10 s');
assert.ok(a.action, a.report.warnings.join('; '));
const acts = a.action!.actions as any[];
const v1 = acts.filter((x) => x.type === 'add' && x.item.track === 'V1').sort((p, q) => p.startFrame - q.startFrame);
const sec = (name: string) => v1.filter((x) => x.item.props?.rsSection === name);

// hook and closer: 3 flashes of 0.5 s (15 frames) = 1.5 s, on beats, flash transitions inside
for (const name of ['hook', 'closer']) {
  const s = sec(name);
  assert.equal(s.length, 3, `${name}: 3 flashes`);
  assert.ok(s.every((x) => x.item.durationInFrames === 15), `${name}: 0.5 s flashes`);
}
assert.equal(sec('hook')[0].startFrame, 0, 'the hook opens the reel');
assert.equal(v1[v1.length - 1].item.props.rsSection, 'closer');
const byId = new Map(v1.map((x) => [x.item.id, x]));
const trs = acts.filter((x) => x.type === 'addTransition');
const typeInto = (id: string) => trs.find((t) => t.incomingItemId === id)?.transType;
assert.deepEqual(sec('hook').slice(1).map((x) => typeInto(x.item.id)), ['flash', 'flash'], 'flash between the hook shots');
assert.deepEqual(sec('closer').slice(1).map((x) => typeInto(x.item.id)), ['flash', 'flash']);
// body: "auto" rotates through the break-ins, never the same one twice in a row
const body = sec('body');
assert.ok(body.length >= 6, `body has ${body.length} shots`);
const bodyTypes = body.map((x) => typeInto(x.item.id));
assert.ok(bodyTypes.every((t) => ['bars', 'wide-bars', 'window', 'flash'].includes(t)), bodyTypes.join());
for (let i = 1; i < bodyTypes.length; i += 1) assert.notEqual(bodyTypes[i], bodyTypes[i - 1], 'no style twice in a row');
assert.ok(new Set(bodyTypes).size >= 3, 'the rotation uses several styles');
// every transition joins neighbouring clips and fits both
for (const t of trs) {
  const inc = byId.get(t.incomingItemId)!;
  const idx = v1.indexOf(inc);
  assert.ok(idx > 0 && t.durationInFrames <= Math.min(inc.item.durationInFrames, v1[idx - 1].item.durationInFrames));
}
// title and stat line
const texts = acts.filter((x) => x.item?.kind === 'text').map((x) => x.item.props.text);
assert.deepEqual(texts.sort(), ['6 km · 3 h', 'KALSUBAI']);
assert.equal(JSON.stringify(a), JSON.stringify(assemble(base)), 'deterministic');
assert.equal(new Set(a.report.usedAssetIds).size, a.report.usedAssetIds.length, 'no repeated clips');

// the setup param overrides auto: one style for the whole reel, or hard cuts
const only = (breakIn: string) => (assemble({ ...base, params: { breakIn } }).action!.actions as any[]).filter((x) => x.type === 'addTransition');
assert.ok(only('window').filter((t) => t.transType === 'window').length >= 6, 'window everywhere in the body');
assert.ok(only('window').every((t) => ['window', 'flash'].includes(t.transType)), 'hook/closer keep their flashes');
assert.equal(only('cut').filter((t) => t.transType !== 'flash').length, 0, 'cut: no break-ins');
// param flash/hook lengths: 0.3 s flashes, 2 s hook at 120 bpm (beat 0.5 s: a flash is still one beat)
const longHook = assemble({ ...base, params: { hookSec: 3, flashSec: 0.5 } });
assert.equal((longHook.action!.actions as any[]).filter((x) => x.type === 'add' && x.item.props?.rsSection === 'hook').length, 6, '3 s hook = 6 flashes');

// one undo reverts the whole run, transitions included
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
let h: History = { past: [], present: doc, future: [] };
h = historyReduce(h, a.action!);
assert.equal(h.past.length, 1);
assert.ok((h.present.timelines[0] as any).transitions.length >= trs.length - 2, 'transitions were created');
h = historyReduce(h, { type: 'undo' } as never);
assert.equal((h.present.timelines[0] as any).items.length, 0);
assert.equal(((h.present.timelines[0] as any).transitions ?? []).length, 0, 'undo removes the transitions too');

// rotation helper on its own: legacy flash accent recipes keep solid flashes, "cut" sections stay hard cuts
const shots = Array.from({ length: 5 }, (_, i) => ({ section: 's', startBeat: i, lengthBeats: 1, startFrame: i * 15, durationInFrames: 15, transition: i === 3 ? 'cut' : 'auto' }));
const picks = pickTransitions(shots, { options: {}, params: {}, seed: 0, fps: 30, legacyFlash: false });
assert.deepEqual(picks, [null, 'bars', 'wide-bars', null, 'window']);
assert.deepEqual(pickTransitions([{ ...shots[0]!, transition: 'flash' }, { ...shots[1]!, transition: 'flash' }], { params: {}, seed: 0, fps: 30, legacyFlash: true }), [null, null]);
console.log('placeStats.verify ok');
