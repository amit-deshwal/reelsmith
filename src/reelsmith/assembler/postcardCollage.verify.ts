import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce } from '../../editor/reduce';
import { timelineTrackIds, trackKind, type ProjectDoc } from '../../editor/types';
import { validateTemplate } from '../../template-host';
import { FINALE_ROLES, finaleWindows, POSTCARD_GRAPHIC_CODE } from '../postcardGraphics';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { bindTracks } from '../trackBinding';
import { bandCover, castPostcards, L, PC, postcardCuts, postcardOrder, scrambleStates } from './postcardCollage';

const r = parseRecipe(readFileSync('recipes/postcard-collage.recipe.json', 'utf8'));
assert.ok(r.ok, r.ok ? '' : r.errors.join('; '));
const recipe = r.recipe;
const fps = 30;
const clip = (id: string, sec: number, score: number, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1920, height: 1080, durationInFrames: Math.round(sec * fps), score, ...extra,
});
const tagged = (top: string) => ({ shot: { top: top as never, confidence: 0.9, scores: {} as never } });
const clips: AssemblyClip[] = [
  clip('walker', 10, 0.6, tagged('people')),
  clip('fjord', 12, 0.9, tagged('scenery')),
  clip('harbour', 9, 0.8, tagged('water')),
  clip('town', 8, 0.7, tagged('city')),
  clip('tower', 6, 0.5, { width: 1080, height: 1920 }),
  clip('tree', 7, 0.5, { width: 1080, height: 1920 }),
  clip('door', 5, 0.4, { width: 1080, height: 1920 }),
  { assetId: 'cake', name: 'cake', src: '/media/uploads/cake.jpg', kind: 'image', width: 3000, height: 4000, durationInFrames: 1, score: 0.4, ...tagged('food') },
  clip('market', 4, 0.45, tagged('detail')),
  clip('sign', 3, 0.3, tagged('detail')),
  clip('boat', 6, 0.55, tagged('water')),
  clip('street', 8, 0.5, { width: 1080, height: 1920 }),
  clip('hills', 11, 0.65, tagged('scenery')),
  clip('cafe', 5, 0.35, tagged('food')),
];
const music: AssemblyMusic = {
  assetId: 'song', name: 'song', src: '/song.m4a', durationSec: 40,
  beatTimesSec: Array.from({ length: 80 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const texts = { place: 'Norway' };
const res = assemble({ recipe, clips, music, texts, params: { person: true }, seed: 3 });
assert.ok(res.action, res.report.warnings.join('; '));
assert.equal(res.report.totalFrames, Math.round(22.1 * fps));
const acts = res.action!.actions as any[];
const on = (track: string) => acts.filter((a) => a.type === 'add' && a.item.track === track);

// a lane never holds two items at once (the editor would push the later one back)
const adds = acts.filter((a) => a.type === 'add');
for (const lane of new Set(adds.map((a) => a.item.track))) {
  const spans = adds.filter((a) => a.item.track === lane).map((a) => [a.startFrame, a.startFrame + a.item.durationInFrames]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i]![0] >= spans[i - 1]![1], `lane ${lane} overlaps at frame ${spans[i]![0]}`);
}

// cast: the walker opens (people), the best wide shot closes, strips prefer portrait clips, no strip is the opener
const cast = castPostcards(clips, fps);
assert.equal(cast.opener.assetId, 'walker');
assert.equal(cast.finale.closer.assetId, 'fjord');
assert.ok(cast.strips.every((c) => c !== cast.opener), 'no strip is the opener');
for (let i = 1; i < 6; i += 1) assert.notEqual(cast.strips[i], cast.strips[i - 1], `strips ${i - 1}/${i} differ`);
assert.ok(cast.strips.slice(0, 4).every((c) => c.kind === 'image' || (c.height ?? 0) > (c.width ?? 0)), 'portrait clips and photos first in the strips');
assert.equal(new Set([cast.opener, ...cast.strips, ...Object.values(cast.finale)].map((c) => c.assetId)).size, 13, '14 clips: 13 slots, all different');

// opener, person (cut out, then white for the flash), strips graphic
const [opener] = on(L.opener);
assert.equal(opener.startFrame, 0);
assert.equal(opener.item.durationInFrames, Math.round(3.6 * fps));
const person = on(L.person);
assert.equal(person.length, 2);
assert.ok(person.every((p) => p.item.sourceAssetId === 'walker' && p.item.effects[0].assetId === 'builtin:fx-person-cutout'));
assert.deepEqual(person.map((p) => p.item.effects[0].overrides.white), [0, 1]);
assert.equal(person[1].item.srcInFrame, opener.item.srcInFrame + person[1].startFrame, 'the person stays in sync with the opener');
assert.equal(person[1].startFrame + person[1].item.durationInFrames, Math.round(PC.flash[1] * fps));
const [strips] = on(L.strips);
assert.equal(strips.item.kind, 'motion-graphic');
assert.equal(Object.keys(strips.item.props.sources).length, 6);
assert.deepEqual(strips.item.props.windows.map((w: any) => w.from), [...PC.stripsAt]);
assert.ok(strips.item.props.windows.every((w: any) => w.cover === 'window' && w.keys[0].win[3] === 1080));
assert.equal(strips.item.props.windows.reduce((sum: number, w: any) => sum + w.keys[0].win[2], 0), 1920, 'six columns span the width');

// closing bars: two solids that end covering half the frame each
const bars = [...on(L.barTop), ...on(L.barBottom)];
assert.equal(bars.length, 2);
assert.deepEqual(bars.map((b) => b.item.keyframes.y.at(-1).value), [-50, 50]);

// postcards: 59 back-to-back cuts from 5.9 to 13.3 s, never one clip twice running, the last not the finale's opener
const cards = on(L.cards);
assert.equal(cards.length, 59);
assert.equal(cards[0].startFrame, Math.round(5.9 * fps));
for (let i = 1; i < cards.length; i += 1) {
  assert.equal(cards[i].startFrame, cards[i - 1].startFrame + cards[i - 1].item.durationInFrames, `card ${i} follows`);
  assert.notEqual(cards[i].item.sourceAssetId, cards[i - 1].item.sourceAssetId, `cards ${i - 1}/${i} differ`);
}
assert.equal(cards.at(-1).startFrame + cards.at(-1).item.durationInFrames, Math.round(13.3 * fps));
assert.notEqual(cards.at(-1).item.sourceAssetId, cast.finale.middle.assetId);
assert.equal(new Set(cards.map((c) => c.item.sourceAssetId)).size, clips.length, 'every clip is a postcard');
for (const c of cards.filter((x) => x.item.kind === 'video')) {
  const len = clips.find((x) => x.assetId === c.item.sourceAssetId)!.durationInFrames;
  assert.ok(c.item.srcInFrame >= 0 && c.item.srcInFrame + c.item.durationInFrames <= len, `${c.item.name} inside its clip`);
}
assert.deepEqual(postcardCuts(30).slice(0, 4).map(([a, b]) => b - a), [6, 3, 3, 3]);
const two = postcardOrder(clips.slice(0, 2), 10, clips[0]);
assert.ok(two.every((c, i) => i === 0 || c !== two[i - 1]) && two.at(-1) !== clips[0]);

// band: opens from almost closed to almost open over the postcards, and the finale continues from where it is
const band = [...on(L.bandTop), ...on(L.bandBottom)];
assert.deepEqual(band.map((b) => b.item.keyframes.y.map((k: any) => Math.round(k.value))), [[-50, -97], [50, 97]]);
assert.ok(bandCover(13.4) > 0 && bandCover(13.4) < 0.03);

// finale: one graphic to the end, all six roles, windows inside the frame
const [finale] = on(L.finale);
assert.equal(finale.startFrame, Math.round(13.3 * fps));
assert.equal(finale.startFrame + finale.item.durationInFrames, res.report.totalFrames);
assert.deepEqual(Object.keys(finale.item.props.sources).sort(), [...FINALE_ROLES].sort());
for (const w of finaleWindows(1920, 1080, 13.3, bandCover)) {
  for (const k of w.keys) assert.ok(k.win[0] >= -0.01 && k.win[1] >= -0.01 && k.win[0] + k.win[2] <= 1920.01 && k.win[1] + k.win[3] <= 1080.01, `window inside the frame (${w.s} @${k.t})`);
  assert.ok(w.keys.every((k, i) => i === 0 || k.t >= w.keys[i - 1]!.t), 'keys in time order');
}
const grid = finale.item.props.sources.grid1;
assert.equal(grid.fromSec, 3.2, 'grid clips start playing when the grid appears');

// title: words at 4.1 s, one shuffle state per frame from 4.5 s, the place from 5.4 s; all fade at the end
const words = [...on(L.wordLeft), ...on(L.wordRight)];
assert.deepEqual(words.map((w) => w.item.props.text), ['greetings', 'from']);
const place = on(L.place);
const shuffles = place.slice(0, -1);
assert.equal(shuffles.length, Math.round(5.4 * fps) - Math.round(4.5 * fps));
assert.equal(place.at(-1).item.props.text, 'NORWAY');
assert.equal(place.at(-1).item.props.fontFamily, 'Bebas Neue');
assert.ok([...words, place.at(-1)].every((t) => t.item.fadeOutFrames > 0 && t.startFrame + t.item.durationInFrames === res.report.totalFrames));
assert.ok([...words, ...place].every((t) => t.item.props.rsFixedPosition === true));
const states = scrambleStates('NORWAY', 27, 1);
assert.equal(states.at(-1), 'NORWAY');
assert.ok(states.every((s) => s.length === 6 && [...s].every((ch) => 'NORWAY'.includes(ch))), 'shuffled letters come from the place');
assert.notEqual(states[0], 'NORWAY');
assert.equal(scrambleStates('SÃO PAULO', 10, 1).at(-1), 'SÃO PAULO');

// the graphic passes the template sandbox
validateTemplate(POSTCARD_GRAPHIC_CODE);

// the user's chosen opening clip opens the film
const picked = assemble({ recipe, clips, music, texts, params: { person: true }, seed: 3, openerAssetId: 'harbour' });
assert.equal((picked.action!.actions as any[]).find((a) => a.item?.track === L.opener).item.sourceAssetId, 'harbour');
// a close-up opener gets no cut-out (it would cover the strips), with a note
const close = clips.map((c) => c.assetId === 'walker' ? { ...c, sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [], windows: [{ startFrame: 0, endFrame: 300, score: 1, focusRect: { x: 0.2, y: 0.1, w: 0.5, h: 0.8 } }] } } : c);
const closeRes = assemble({ recipe, clips: close, music, texts, params: { person: true }, seed: 3 });
assert.ok(closeRes.report.warnings.some((w) => w.includes('close-up')));
assert.equal((closeRes.action!.actions as any[]).filter((a) => a.item?.track === L.person).length, 0);
// a person standing small in a wide view keeps the cut-out
const wideRes = assemble({ recipe, clips: close.map((c) => c.assetId === 'walker' ? { ...c, sourceAnalysis: { ...c.sourceAnalysis!, windows: [{ startFrame: 0, endFrame: 300, score: 1, focusRect: { x: 0.45, y: 0.2, w: 0.1, h: 0.6 } }] } } : c), music, texts, params: { person: true }, seed: 3 });
assert.equal((wideRes.action!.actions as any[]).filter((a) => a.item?.track === L.person).length, 2);
// no person: no cut-out layer; too few clips or no place: an explanation, not a timeline
assert.equal((assemble({ recipe, clips, music, texts, params: { person: false }, seed: 3 }).action!.actions as any[]).filter((a) => a.item?.track === L.person).length, 0);
assert.equal(assemble({ recipe, clips: clips.slice(0, 2), music, texts, params: {}, seed: 3 }).action, null);
assert.equal(assemble({ recipe, clips, music, texts: { place: ' ' }, params: {}, seed: 3 }).action, null);
// few clips: still assembles, reusing clips at different moments
const few = assemble({ recipe, clips: clips.slice(0, 6), music, texts, params: {}, seed: 3 });
assert.ok(few.action && few.report.warnings.some((w) => w.includes('used twice')));

// the batch applies as one undo step, and the run is deterministic
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1920, height: 1080, selectedId: null, selectedIds: [], items: [] } as any],
};
const h = historyReduce({ past: [], present: doc, future: [] }, res.action!);
assert.equal(h.past.length, 1);
const tl0 = h.present.timelines[0]! as any;
assert.equal(tl0.items.length, adds.length);
// bound to real tracks as the app does: the layers stack in lane order, bottom to top, nothing pushed out of place
let n = 0;
const bound = historyReduce({ past: [], present: doc, future: [] }, bindTracks(res.action!, doc.timelines[0] as any, () => `track_${n++}`));
const tl = bound.present.timelines[0]! as any;
const layer = (name: string) => tl.items.find((i: any) => i.name === name)!.track;
const visual = timelineTrackIds(tl).filter((id: string) => trackKind(tl, id) === 'video');
const pos = (name: string) => visual.indexOf(layer(name));
const bottomToTop = ['Black canvas', 'walker', 'Six strips', 'Person in front', 'Bar (top)', 'Bar (bottom)', 'Band (top)', 'Band (bottom)', 'Bands, cards, grid and panorama', 'greetings', 'from', 'NORWAY'];
for (let i = 1; i < bottomToTop.length; i += 1) assert.ok(pos(bottomToTop[i]!) < pos(bottomToTop[i - 1]!), `${bottomToTop[i]} above ${bottomToTop[i - 1]}`);
assert.equal(Math.max(...tl.items.map((i: any) => i.startFrame + i.durationInFrames)), res.report.totalFrames, 'nothing pushed past the end');
assert.equal(JSON.stringify(res), JSON.stringify(assemble({ recipe, clips, music, texts, params: { person: true }, seed: 3 })), 'deterministic');

console.log('postcardCollage.verify: ok');
