import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { historyReduce } from '../../editor/reduce';
import { timelineTrackIds, trackKind, type ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { bindTracks } from '../trackBinding';
import { beatClock, directorRecipe } from './assembleDirector';
import { MOVES, TEXT_STYLES } from './moves';

const fps = 30;
const clip = (id: string, sec: number, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5, ...extra,
});
const tag = (top: string) => ({ shot: { top: top as never, confidence: 0.9, scores: {} as never } });
const clips: AssemblyClip[] = [
  clip('walker', 10, { width: 1920, height: 1080, ...tag('people') }), clip('fort', 12, tag('scenery')), clip('ridge', 9, tag('scenery')),
  clip('group', 6, tag('people')), clip('food', 4, tag('food')), clip('sign', 3, tag('detail')), clip('trail', 8, tag('people')),
  clip('camp', 5, tag('night')), clip('climb', 7, tag('action')),
  { assetId: 'photo1', name: 'photo1', src: '/media/uploads/photo1.jpg', kind: 'image', width: 3000, height: 4000, durationInFrames: 150, score: 0.5 },
  { assetId: 'photo2', name: 'photo2', src: '/media/uploads/photo2.jpg', kind: 'image', width: 4000, height: 3000, durationInFrames: 150, score: 0.5 },
];
// 120 bpm, first beat at 0.2 s
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };

// every move and text style is used once
const raw = {
  ratio: '9:16', music: 'song',
  sections: [
    { move: 'strips-reveal', beats: 8, clips: ['walker', 'trail', 'group', 'climb', 'fort'] },
    { move: 'postcard-band', beats: 14 },
    { move: 'cut', beats: 8, params: { every: 2 }, text: 'we almost turned back here', textStyle: 'caption' },
    { move: 'flash-cuts', beats: 2 },
    { move: 'split', beats: 4, params: { layout: 'split3v' }, clips: ['group', 'food', 'sign'] },
    { move: 'break-in', beats: 12, params: { every: 4, kind: 'mix' } },
    { move: 'photo-drift', beats: 8, clips: ['photo1', 'photo2'], text: '2 days 6000 calories', textStyle: 'words-on-beat' },
    { move: 'hold', beats: 6, clips: ['ridge'] },
    { move: 'black', beats: 4, text: 'worth it', textStyle: 'big-title', params: { color: '#111111' } },
    { move: 'cards-finale', beats: 18 },
  ],
  overlays: [{ text: 'Harishchandragad', style: 'title-shuffle', from: 1, to: 2, params: { left: 'greetings', right: 'from' } }],
};
const parsed = parsePlan(raw);
assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
const plan = (parsed as { plan: ReelPlan }).plan;
const recipe = directorRecipe(plan);
assert.deepEqual([recipe.canvas.width, recipe.canvas.height], [1080, 1920]);
const res = assemble({ recipe, clips, music, texts: {}, params: {}, seed: 5, plan });
assert.ok(res.action, res.report.warnings.join('; '));
const acts = res.action!.actions as any[];
const adds = acts.filter((a) => a.type === 'add');

// sections back to back on the beat grid: total = 84 beats from the first beat
const clock = beatClock(music, 0.2);
assert.equal(res.report.totalFrames, Math.round(clock(84) * fps));
const firstOf = (n: number) => Math.min(...adds.filter((a) => a.item.props?.rsSection?.startsWith(`${n}-`)).map((a) => a.startFrame));
let beat = 0;
raw.sections.forEach((s, i) => { assert.equal(firstOf(i + 1), Math.round(clock(beat) * fps), `section ${i + 1} starts on beat ${beat}`); beat += s.beats; });

// no lane holds two items at once
for (const lane of new Set(adds.map((a) => a.item.track))) {
  const spans = adds.filter((a) => a.item.track === lane).map((a) => [a.startFrame, a.startFrame + a.item.durationInFrames]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < spans.length; i += 1) assert.ok(spans[i]![0] >= spans[i - 1]![1], `lane ${lane} overlaps at frame ${spans[i]![0]}`);
}
// the agent's picks are used as given, in order
const opener = adds.find((a) => a.item.props?.rsSection === '1-strips-reveal' && a.item.track === 'V2');
assert.equal(opener.item.sourceAssetId, 'walker');
const strips = adds.find((a) => a.item.kind === 'motion-graphic' && a.item.props?.rsSection === '1-strips-reveal');
assert.equal(Object.keys(strips.item.props.sources).length, 4, '9:16: four strips');
assert.equal(strips.item.props.sources.strip1.src, '/media/uploads/trail.mp4');
assert.deepEqual(adds.filter((a) => a.item.props?.rsSection === '5-split' && a.item.kind === 'video').map((a) => a.item.sourceAssetId), ['group', 'food', 'sign']);
// person cut-out with the white flash, bars, band, flashes, the break-in transitions, ken burns on photos
assert.deepEqual(adds.filter((a) => a.item.effects?.[0]?.assetId === 'builtin:fx-person-cutout').map((a) => a.item.effects[0].overrides.white), [0, 1]);
assert.equal(adds.filter((a) => /^Bar /.test(a.item.name)).length, 2);
assert.equal(adds.filter((a) => /^Band /.test(a.item.name)).length, 2);
assert.equal(adds.filter((a) => a.item.name === 'Flash').length, 4);
assert.equal(acts.filter((a) => a.type === 'addTransition').length, 2, '12 beats at 4 a shot: 3 shots, 2 break-ins');
assert.ok(acts.filter((a) => a.type === 'reframeKeyframe').length >= 4, 'photos drift');
assert.equal(adds.filter((a) => a.item.kind === 'motion-graphic').length, 2, 'strips and finale');
// texts: caption, words on the beat, big title, and the shuffling title over sections 2-3
const texts = adds.filter((a) => a.item.kind === 'text');
assert.ok(texts.some((t) => t.item.props.text === 'we almost turned back here'));
assert.deepEqual(texts.filter((t) => t.item.props.fontFamily === 'Libre Baskerville').map((t) => t.item.props.text), ['2', 'DAYS', '6000', 'CALORIES']);
assert.ok(texts.some((t) => t.item.props.text === 'worth it' && t.item.props.fontFamily === 'Anton'));
const place = texts.filter((t) => t.item.props.text === 'HARISHCHANDRAGAD' && t.item.durationInFrames > 1);
assert.equal(place.length, 1);
assert.equal(place[0].startFrame + place[0].item.durationInFrames, Math.round(clock(8 + 14 + 8) * fps), 'the overlay ends with section 3');
assert.ok(place[0].item.props.fontSize * 16 * 0.42 <= 1080 * 0.87, 'the title fits the width');
// song from the first downbeat, as long as the reel, faded
const song = adds.find((a) => a.item.kind === 'audio');
assert.equal(song.item.srcInFrame, 6);
assert.equal(song.item.durationInFrames, res.report.totalFrames);

const bad = (p: unknown) => { const r = parsePlan(p); return r.ok ? assemble({ recipe, clips, music, texts: {}, params: {}, seed: 5, plan: r.plan }).report.warnings.join('; ') : r.errors.join('; '); };
// a second plan: the newer moves, every other text style, section effects, a look, transitions
const engineStyles = ['cinematic-title', 'tracking-in', 'typewriter', 'location-tag', 'rise-lines', 'slam', 'count-up', 'wave', 'glitch', 'neon', 'split-reveal', 'highlight', 'draw-on', 'shine', 'pop-words'];
const raw2 = {
  ratio: '16:9', music: 'song',
  sections: [
    { move: 'hold', beats: 6, clips: ['fort'], text: 'Harishchandragad', textStyle: 'landscape-title', effects: [{ id: 'halation', params: { intensity: 1.4 } }, { id: 'soft-vignette' }] },
    { move: 'zoom-punch', beats: 4, transition: 'whip-blur', clips: ['trail', 'climb', 'group', 'camp'] },
    { move: 'speed-ramp', beats: 8, clips: ['climb@1'], text: 'FREEDOM', textStyle: 'behind-you' },
    { move: 'photo-stack', beats: 6, clips: ['photo1', 'photo2', 'food'], look: 'golden-hour' },
    { move: 'compare', beats: 6, clips: ['trail', 'ridge'] },
    { move: 'cut', beats: 8, params: { every: 2, transition: 'crossfade' }, clips: ['ridge', 'fort', 'group', 'trail'] },
    ...engineStyles.map((st) => ({ move: 'black', beats: 2, text: st === 'count-up' ? '6,000 calories' : st === 'rise-lines' ? 'two days / one fort' : 'Day 2 summit', textStyle: st, ...(st === 'location-tag' ? { params: { sub: '1,424 m' } } : {}) })),
  ],
};
const allMoves = new Set([...raw.sections, ...raw2.sections].map((x) => x.move));
assert.deepEqual([...MOVES.map((m) => m.id)].filter((m) => !allMoves.has(m)), [], 'the two plans use every move');
const allStyles = new Set([...raw.sections, ...raw2.sections].flatMap((x) => ('textStyle' in x && x.textStyle ? [x.textStyle] : [])).concat(raw.overlays.map((o) => o.style)));
assert.deepEqual(TEXT_STYLES.map((t) => t.id).filter((t) => !allStyles.has(t)), [], 'and every text style');
const parsed2 = parsePlan(raw2);
assert.ok(parsed2.ok, parsed2.ok ? '' : parsed2.errors.join('; '));
const plan2 = (parsed2 as { plan: ReelPlan }).plan;
const res2 = assemble({ recipe: directorRecipe(plan2), clips, music, texts: {}, params: {}, seed: 9, plan: plan2 });
assert.ok(res2.action, res2.report.warnings.join('; '));
const a2 = res2.action!.actions as any[];
const adds2 = a2.filter((a) => a.type === 'add');
const inSec = (n: number) => adds2.filter((a) => a.item.props?.rsSection?.startsWith(`${n}-`));
// landscape title rides on the hold clip as an effect with the text; effects stack after it
const holdClip = inSec(1).find((a) => a.item.kind === 'video');
assert.deepEqual(holdClip.item.effects.map((e: any) => e.assetId), ['builtin:fx-halation', 'builtin:fx-soft-vignette', 'builtin:fx-text-scenery']);
assert.equal(holdClip.item.props.rsFxText, 'Harishchandragad');
assert.equal(holdClip.item.effects[0].overrides.intensity, 1.4);
// punch-in cuts: a scale keyframe on every shot; the whip transition into section 2
assert.ok(inSec(2).every((a) => a.item.keyframes?.scale?.[0]?.value > 1));
assert.ok(a2.some((a) => a.type === 'addTransition' && a.transType === 'whip-blur' && a.incomingItemId === inSec(2)[0].item.id));
// speed ramp: three pieces at 1x, slow, fast, the source running forward, pinned at 1 s; text behind the person
const ramp = inSec(3).filter((a) => a.item.kind === 'video');
assert.deepEqual(ramp.map((a) => a.item.playbackRate ?? 1), [1, 0.35, 2.5]);
assert.equal(ramp[0].item.srcInFrame, 30);
assert.ok(ramp[1].item.srcInFrame > ramp[0].item.srcInFrame && ramp[2].item.srcInFrame > ramp[1].item.srcInFrame);
assert.ok(ramp.every((a) => a.item.props.rsFxText === 'FREEDOM' && a.item.effects.at(-1).assetId === 'builtin:fx-text-behind'));
// photo stack: a white print under each picture, same tilt; golden-hour look on the pictures
const prints = inSec(4).filter((a) => a.item.name === 'Print');
const pics = inSec(4).filter((a) => a.item.kind !== 'solid');
assert.equal(prints.length, 3);
prints.forEach((p, i) => assert.equal(p.item.transform.rotation, pics[i].item.transform.rotation));
assert.ok(pics.every((a) => a.item.effects?.some((e: any) => e.id.includes('look_'))), 'the section look is on its pictures');
// compare: one graphic with both clips and a white divider
const cmp = inSec(5).find((a) => a.item.kind === 'motion-graphic');
assert.deepEqual(Object.keys(cmp.item.props.sources), ['a', 'b']);
assert.ok(cmp.item.props.windows.some((w: any) => w.fill === '#ffffff'));
// crossfades between the cut's shots
assert.equal(a2.filter((a) => a.type === 'addTransition' && a.transType === 'cross-dissolve').length, 3);
// every engine style is a text graphic with its typeface named for the font loader
const graphics = adds2.filter((a) => a.item.kind === 'motion-graphic' && a.item.props?.preset);
assert.equal(graphics.length, engineStyles.length);
assert.ok(graphics.every((g) => typeof g.item.props.fontFamily === 'string' && g.item.props.fontSize >= 24));
const slamWords = graphics.find((g) => g.item.props.preset === 'slam');
assert.ok(!slamWords || Array.isArray(slamWords.item.props.beats));
assert.equal(graphics.find((g) => g.item.props.preset === 'location').item.props.sub, '1,424 M');
// bad effect, transition and look names are reported
assert.match(bad({ sections: [{ move: 'cut', effects: [{ id: 'sparkles' }] }] }), /unknown effect "sparkles"/);
assert.match(bad({ sections: [{ move: 'cut', effects: [{ id: 'halation', params: { warmth: 7 } }] }] }), /warmth must be 0 to 1/);
assert.match(bad({ sections: [{ move: 'cut' }, { move: 'cut', transition: 'teleport' }] }), /unknown transition/);
assert.match(bad({ sections: [{ move: 'cut', look: 'sunburn' }] }), /unknown look/);

// bad plans say what is wrong
assert.match(bad({ sections: [{ move: 'teleport' }] }), /unknown move "teleport"/);
assert.match(bad({ sections: [{ move: 'cut', params: { speed: 3 } }] }), /unknown param "speed"/);
assert.match(bad({ sections: [{ move: 'cut', params: { every: 99 } }] }), /every must be a number from 0.5 to 8/);
assert.match(bad({ sections: [{ move: 'cut', text: 'hi', textStyle: 'comic-sans' }] }), /unknown textStyle/);
assert.match(bad({ sections: [] }), /non-empty/);
assert.match(bad({ sections: [{ move: 'cut' }], overlays: [{ text: 'x', style: 'big-title', from: 0, to: 3 }] }), /section indexes/);
// a section with no clips casts the best unused ones; without a song a beat is half a second
const quiet = assemble({ recipe, clips, texts: {}, params: {}, seed: 5, plan: { version: 1, ratio: '16:9', sections: [{ move: 'cut', beats: 8 }] } });
assert.equal(quiet.report.totalFrames, 4 * fps);
assert.equal(new Set((quiet.action!.actions as any[]).filter((a) => a.item?.kind === 'video').map((a) => a.item.sourceAssetId)).size, 4);

// "assetId@seconds" starts the clip at that second of the source, every time it is used
const pinned = assemble({ recipe, clips, music, texts: {}, params: {}, seed: 5, plan: { version: 1, ratio: '9:16', sections: [{ move: 'hold', beats: 4, clips: ['fort@3'] }, { move: 'cut', beats: 4, params: { every: 2 }, clips: ['fort@3', 'ridge'] }] } });
const pinnedShots = (pinned.action!.actions as any[]).filter((a) => a.item?.sourceAssetId === 'fort');
assert.deepEqual(pinnedShots.map((a) => a.item.srcInFrame), [90, 90]);

// one undo step; tracks bind in order: the canvas at the bottom, section lanes above it, text lanes on top
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
let n = 0;
const h = historyReduce({ past: [], present: doc, future: [] }, bindTracks(res.action!, doc.timelines[0] as any, () => `track_${n++}`));
assert.equal(h.past.length, 1);
const tl = h.present.timelines[0]! as any;
assert.equal(tl.items.length, adds.length, 'nothing dropped or pushed');
assert.equal(Math.max(...tl.items.map((i: any) => i.startFrame + i.durationInFrames)), res.report.totalFrames);
const visual = timelineTrackIds(tl).filter((id: string) => trackKind(tl, id) === 'video');
const pos = (name: string) => visual.indexOf(tl.items.find((i: any) => i.name === name)!.track);
assert.ok(pos('Bar (top)') < pos('walker') && pos('walker') < pos('Black canvas'), 'bars above the opener above the canvas');
assert.ok(pos('HARISHCHANDRAGAD') < pos('Bands, cards, grid and panorama'), 'titles on top');
assert.equal(JSON.stringify(res), JSON.stringify(assemble({ recipe, clips, music, texts: {}, params: {}, seed: 5, plan })), 'deterministic');

console.log('assembleDirector.verify: ok');
