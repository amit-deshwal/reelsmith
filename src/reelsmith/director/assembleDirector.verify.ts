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
    { move: 'photo-parallax', beats: 8, clips: ['photo1', 'photo2'], params: { move: 'orbit', strength: 1.4 } }, // RS-1238 (more in depthMoves.verify.ts)
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

// sections back to back on the beat grid: total = 92 beats from the first beat
const clock = beatClock(music, 0.2);
assert.equal(res.report.totalFrames, Math.round(clock(92) * fps));
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
assert.ok(texts.some((t) => t.item.props.text === 'WORTH IT' && t.item.props.fontFamily === 'Anton'));
const place = texts.filter((t) => t.item.props.text === 'HARISHCHANDRAGAD' && t.item.durationInFrames > 1);
assert.equal(place.length, 1);
assert.equal(place[0].startFrame + place[0].item.durationInFrames, Math.round(clock(8 + 14 + 8) * fps), 'the overlay ends with section 3');
assert.ok(place[0].item.props.fontSize * 16 * 0.42 <= 1080 * 0.87, 'the title fits the width');
// song from the first downbeat, as long as the reel, faded
const song = adds.find((a) => a.item.kind === 'audio' && a.item.track === 'A1');
assert.equal(song.item.srcInFrame, 6);
assert.equal(song.item.durationInFrames, res.report.totalFrames);
// RS-1204: sound effects on the break-in cuts, from the built-in library, on lanes under the song, never past the end
const sounds = adds.filter((a) => a.item.props?.rsSfx);
assert.ok(sounds.length >= 2, 'break-in cuts get a sound');
assert.ok(sounds.every((a) => /^\/sound-effects\/.+\.mp3$/.test(a.item.src) && /^A[2-9]$/.test(a.item.track) && a.item.volume > 0 && a.item.volume <= 2));
assert.ok(sounds.every((a) => a.startFrame >= 0 && a.startFrame + a.item.durationInFrames <= res.report.totalFrames));

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
    { move: 'compare', beats: 6, clips: ['trail', 'ridge'], text: 'me', textStyle: 'follow-tag' },
    { move: 'cut', beats: 8, params: { every: 2, transition: 'crossfade' }, clips: ['ridge', 'fort', 'group', 'trail'] },
    { move: 'velocity', beats: 8, clips: ['climb'], transition: 'film-burn', text: 'send it', textStyle: 'tracking-in' },
    { move: 'photo-3d', beats: 8, clips: ['photo1', 'photo2'], effects: [{ id: 'bounce', timing: 'beat' }], text: 'core memory', textStyle: 'wave' },
    { move: 'freeze-intro', beats: 4, clips: ['walker'], text: 'this is me', textStyle: 'location-tag' },
    { move: 'match-cut', beats: 4, clips: ['group', 'trail', 'walker'], params: { flash: true }, text: 'every fit', textStyle: 'glitch' },
    { move: 'talk-zoom', beats: 8, clips: ['group'], transition: 'prism-flash', effects: [{ id: 'sparkle' }, { id: 'flare-sweep' }, { id: 'blackout', timing: 'beat', every: 2 }] },
    ...engineStyles.filter((st) => !['tracking-in', 'wave', 'glitch'].includes(st)).map((st) => ({ move: 'black', beats: 2, text: st === 'count-up' ? '6,000 calories' : st === 'rise-lines' ? 'two days / one fort' : 'Day 2 summit', textStyle: st, ...(st === 'location-tag' ? { params: { sub: '1,424 m' } } : {}) })),
    { move: 'rewind', beats: 4, clips: ['climb'] }, // RS-1223 (checked in agent/reverseTool.verify.ts)
  ],
};
const allMoves = new Set([...raw.sections, ...raw2.sections].map((x) => x.move));
assert.deepEqual([...MOVES.map((m) => m.id)].filter((m) => !allMoves.has(m)), [], 'the two plans use every move');
const allStyles = new Set([...raw.sections, ...raw2.sections].flatMap((x) => ('textStyle' in x && x.textStyle ? [x.textStyle] : [])).concat(raw.overlays.map((o) => o.style), 'top-band', 'punch-caps')); // top-band and punch-caps have their own checks below
assert.deepEqual(TEXT_STYLES.map((t) => t.id).filter((t) => !allStyles.has(t)), [], 'and every text style');
const parsed2 = parsePlan(raw2);
assert.ok(parsed2.ok, parsed2.ok ? '' : parsed2.errors.join('; '));
const plan2 = (parsed2 as { plan: ReelPlan }).plan;
const res2 = assemble({ recipe: directorRecipe(plan2), clips, music, texts: {}, params: {}, seed: 9, plan: plan2 });
assert.ok(res2.action, res2.report.warnings.join('; '));
const a2 = res2.action!.actions as any[];
const adds2 = a2.filter((a) => a.type === 'add');
// RS-1238: photo-parallax puts each photo full frame with the depth effect, the move and strength asked for
const plx = (adds as any[]).filter((a) => String(a.item.props?.rsSection ?? '').endsWith('-photo-parallax') && a.item.kind === 'image');
assert.deepEqual(plx.map((a) => a.item.sourceAssetId), ['photo1', 'photo2']);
assert.ok(plx.every((a) => a.item.effects?.length === 1 && a.item.effects[0].assetId === 'builtin:fx-photo-parallax' && a.item.effects[0].overrides.move === 1 && a.item.effects[0].overrides.strength === 1.4));
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
// RS-1208 creator moves: a velocity edit ramps fast, slams to slow on the beat with a flash and a hit, blurs the fast parts
const vel = inSec(7).filter((a) => a.item.kind === 'video').sort((x, y) => x.startFrame - y.startFrame);
const rates = vel.map((a) => a.item.playbackRate ?? 1);
assert.ok(Math.max(...rates) > 2 && Math.min(...rates) < 0.5, `fast and slow: ${rates.join(',')}`);
assert.ok(vel.every((a, i) => i === 0 || a.startFrame === vel[i - 1].startFrame + vel[i - 1].item.durationInFrames), 'one continuous shot');
assert.ok(vel.every((a, i) => i === 0 || a.item.srcInFrame >= vel[i - 1].item.srcInFrame), 'the source runs forward');
assert.ok(vel.filter((a) => (a.item.playbackRate ?? 1) >= 1.6).every((a) => a.item.effects?.some((e: any) => e.assetId === 'builtin:fx-motion-blur')));
assert.ok(inSec(7).some((a) => a.item.name === 'Flash' && a.item.props.rsAccent === 'hit'));
assert.ok(adds2.some((a) => a.item.props?.rsSfx === 'hit'), 'the slam gets its hit');
// 3D zoom: per photo a background pulling back and a front copy pushing in, marked for the cut-out
const p3 = inSec(8).filter((a) => a.item.kind === 'image');
assert.equal(p3.length, 4);
const front = p3.filter((a) => a.item.props.rsFront);
assert.equal(front.length, 2);
assert.ok(front.every((a) => a.item.keyframes.scale.at(-1).value > a.item.keyframes.scale[0].value));
assert.ok(p3.filter((a) => !a.item.props.rsFront).every((a) => a.item.keyframes.scale.at(-1).value < a.item.keyframes.scale[0].value));
// freeze: plays, then holds nearly still with the subject pop and a shutter flash
const fz = inSec(9).filter((a) => a.item.kind === 'video').sort((x, y) => x.startFrame - y.startFrame);
assert.equal(fz.length, 2);
assert.ok(fz[1].item.playbackRate < 0.05 && fz[1].item.effects.some((e: any) => e.assetId === 'builtin:fx-subject-pop'));
// talking jump zooms keep the clip's sound and alternate the framing
const talk = inSec(11).filter((a) => a.item.kind === 'video');
assert.ok(talk.length >= 2 && talk.every((a) => a.item.volume === 1));
assert.ok(new Set(talk.map((a) => a.item.keyframes.scale[0].value)).size === 2);
assert.ok(a2.some((a) => a.type === 'addTransition' && a.transType === 'prism-flash'));
assert.ok(a2.some((a) => a.type === 'addTransition' && a.transType === 'film-burn'));
const cmp = inSec(5).find((a) => a.item.kind === 'motion-graphic');
assert.deepEqual(Object.keys(cmp.item.props.sources), ['a', 'b']);
assert.ok(cmp.item.props.windows.some((w: any) => w.fill === '#ffffff'));
// crossfades between the cut's shots
assert.equal(a2.filter((a) => a.type === 'addTransition' && a.transType === 'cross-dissolve').length, 3);
// every engine style is a text graphic with its typeface named for the font loader
const graphics = adds2.filter((a) => a.item.kind === 'motion-graphic' && a.item.props?.preset);
assert.equal(graphics.length, engineStyles.length + 1, "plus the freeze intro's location tag");
assert.ok(graphics.every((g) => typeof g.item.props.fontFamily === 'string' && g.item.props.fontSize >= 24));
const slamWords = graphics.find((g) => g.item.props.preset === 'slam');
assert.ok(!slamWords || Array.isArray(slamWords.item.props.beats));
assert.ok(graphics.some((g) => g.item.props.preset === 'location' && g.item.props.sub === '1,424 M'));
// a pinned start near the end of a clip is moved earlier so the shot plays to the end of its section instead of freezing
const near = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'hold', beats: 8, clips: ['fort@11'] }] });
assert.ok(near.ok);
const nearPlan = (near as { plan: ReelPlan }).plan;
const nearRun = assemble({ recipe: directorRecipe(nearPlan), clips, music, texts: {}, params: {}, seed: 5, plan: nearPlan });
const nearClip = (nearRun.action!.actions as any[]).find((a) => a.item?.kind === 'video');
assert.ok(nearClip.item.srcInFrame + nearClip.item.durationInFrames <= 12 * fps, 'the held shot does not run past the end of its clip');
assert.match(nearRun.report.warnings.join('; '), /so it does not freeze/);
// the title band: footage scaled under a black strip, the line centred in the strip for the whole span
const banded = parsePlan({ ratio: '16:9', music: 'song', sections: [{ move: 'cut', beats: 8 }, { move: 'hold', beats: 8, clips: ['fort'] }], overlays: [{ text: 'Pune traffic only chills after midnight', style: 'top-band', from: 0, to: 1 }] });
assert.ok(banded.ok, banded.ok ? '' : banded.errors.join('; '));
const bandPlan = (banded as { plan: ReelPlan }).plan;
const bandRun = assemble({ recipe: directorRecipe(bandPlan), clips, music, texts: {}, params: {}, seed: 5, plan: bandPlan });
const bandAdds = (bandRun.action!.actions as any[]).filter((a) => a.type === 'add');
const footage = bandAdds.filter((a) => a.item.kind === 'video');
assert.ok(footage.length > 0 && footage.every((a) => Math.abs(a.item.transform.scale - 0.8) < 1e-9 && Math.abs(a.item.transform.y - 10) < 1e-9), 'footage sits under the band');
const bandText = bandAdds.find((a) => a.item.kind === 'text');
assert.equal(bandText.item.props.text, 'Pune traffic only chills after midnight');
assert.equal(bandText.item.transform.y, -40);
assert.equal(bandText.startFrame, 0);
assert.equal(bandText.startFrame + bandText.item.durationInFrames, bandRun.report.totalFrames, 'the band stays for the whole reel');
// bad effect, transition and look names are reported
assert.match(bad({ sections: [{ move: 'cut', effects: [{ id: 'sparkles' }] }] }), /unknown effect "sparkles"/);
// RS-1258: a value out of range is clamped and reported, not refused (a refused plan cost the agent a whole re-plan)
assert.match(bad({ sections: [{ move: 'cut', effects: [{ id: 'halation', params: { warmth: 7 } }] }] }), /warmth 7 is outside 0-1; used 1/);
assert.match(bad({ sections: [{ move: 'cut' }, { move: 'cut', transition: 'teleport' }] }), /unknown transition/);
assert.match(bad({ sections: [{ move: 'cut', look: 'sunburn' }] }), /unknown look/);

// bad plans say what is wrong
assert.match(bad({ sections: [{ move: 'teleport' }] }), /unknown move "teleport"/);
// RS-1258: params the build can repair are repaired and named in the warnings; the reel is still built
assert.match(bad({ sections: [{ move: 'cut', params: { speed: 3 } }] }), /param "speed" is not used \(cut takes every, transition, punch\); left out/);
assert.match(bad({ sections: [{ move: 'cut', params: { every: 99 } }] }), /every 99 is outside 0.5-8; used 8/);
assert.match(bad({ sections: [{ move: 'cut', params: { every: '4' } }] }), /^(?!.*every).*$/, 'a number written as text is read as the number');
{
  // the measured refusal: cut every 4 beats under a punch-caps line (every is beats per word there, 0.25-2)
  const r = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'cut', beats: 8, clips: ['fort', 'ridge'], text: 'YOU ARE *WELCOME*', textStyle: 'punch-caps', params: { every: 4 } }] });
  assert.ok(r.ok);
  const run = assemble({ recipe: directorRecipe(r.plan), clips, music, texts: {}, params: {}, seed: 5, plan: r.plan });
  assert.ok(run.action, run.report.warnings.join('; '));
  assert.doesNotMatch(run.report.warnings.join('; '), /every/, 'every 4 is the cut\'s, not a problem');
  const shots = (run.action!.actions as any[]).filter((a) => a.item?.kind === 'video');
  assert.equal(shots.length, 2, 'two shots of 4 beats');
  // a value both can use goes to both: half-beat cuts and a word every half beat
  const both = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'cut', beats: 2, clips: ['fort', 'ridge', 'fort@4', 'ridge@3'], text: 'GO *NOW*', textStyle: 'punch-caps', params: { every: 0.5 } }] });
  assert.ok(both.ok);
  const bothRun = assemble({ recipe: directorRecipe(both.plan), clips, music, texts: {}, params: {}, seed: 5, plan: both.plan });
  assert.equal((bothRun.action!.actions as any[]).filter((a) => a.item?.kind === 'video').length, 4);
}
{
  // x/y on the plain styles (the agent put them on big-title and caption and was refused): placed there, and kept there
  const r = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['fort'], text: 'the top', textStyle: 'big-title', params: { y: 0.2, x: 0.5 } }, { move: 'hold', beats: 4, clips: ['ridge'], text: 'we made it', textStyle: 'caption' }] });
  assert.ok(r.ok);
  const run = assemble({ recipe: directorRecipe(r.plan), clips, music, texts: {}, params: {}, seed: 5, plan: r.plan });
  assert.doesNotMatch(run.report.warnings.join('; '), /param "(x|y)"/);
  const texts = (run.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.kind === 'text');
  const title = texts.find((a) => a.item.props.text === 'THE TOP');
  assert.ok(Math.abs(title.item.transform.y - -30) < 1e-9 && Math.abs(title.item.transform.x) < 1e-9, 'y 0.2 is 30% above the middle');
  assert.equal(title.item.props.rsFixedPosition, true, 'a line the agent placed stays where it put it');
  const line = texts.find((a) => a.item.props.text === 'we made it');
  assert.equal(line.item.transform.y, 22, 'no x/y: the caption keeps its own place');
  assert.equal(line.item.props.rsFixedPosition, undefined);
}
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

// with no song the clips keep their own sound (the song playing in the footage); under a song they are muted
const rawPlan = parsePlan({ ratio: '9:16', sections: [{ move: 'cut', beats: 8, clips: ['walker', 'trail'] }, { move: 'hold', beats: 4, clips: ['ridge'] }] });
assert.ok(rawPlan.ok);
const volumes = (m: AssemblyMusic | undefined) => ((assemble({ recipe: directorRecipe(rawPlan.plan), clips, ...(m ? { music: m } : {}), texts: {}, params: {}, seed: 5, plan: rawPlan.plan }).action?.actions ?? []) as any[])
  .filter((a) => a.item?.kind === 'video').map((a) => a.item.volume);
assert.ok(volumes(undefined).length && volumes(undefined).every((v) => v === 1), `no song: clips keep their sound (${volumes(undefined)})`);
assert.ok(volumes(music).every((v) => v === 0), 'under a song the clips are muted');

// a line over white flashes gets a dark outline; the same style over plain cuts does not
{
  const flashPlan = parsePlan({ ratio: '9:16', music: 'song', sections: [
    { move: 'flash-cuts', beats: 4, text: 'Alang Madan Kulang', textStyle: 'rise-lines' },
    { move: 'cut', beats: 4, text: 'hold on tight', textStyle: 'rise-lines' },
  ] });
  assert.ok(flashPlan.ok);
  const fp = (flashPlan as { plan: ReelPlan }).plan;
  const out = assemble({ recipe: directorRecipe(fp), clips, music, texts: {}, params: {}, seed: 3, plan: fp });
  const line = (t: string) => (out.action!.actions as any[]).find((a) => a.type === 'add' && a.item.props?.rsLineText === t).item.props;
  assert.equal(line('Alang Madan Kulang').stroke.color, 'rgba(0,0,0,0.85)');
  assert.ok(line('Alang Madan Kulang').stroke.width >= 2);
  assert.equal(line('hold on tight').stroke, undefined);
}
// RS-1243: punch captions go through the build as one motion graphic per line, timed inside its section, under a song
{
  const pp = parsePlan({ ratio: '9:16', music: 'song', sections: [
    { move: 'flash-cuts', beats: 4, text: 'STOP WASTING YOUR *WEEKENDS*', textStyle: 'punch-caps', params: { every: 0.5 } },
    { move: 'cut', beats: 4, text: 'DO *THIS* INSTEAD.', textStyle: 'punch-caps', params: { kicker: '5:48 AM' } },
  ] });
  assert.ok(pp.ok, pp.ok ? '' : pp.errors.join('; '));
  const plan = (pp as { plan: ReelPlan }).plan;
  const out = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
  const caps = (out.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.kind === 'motion-graphic' && Array.isArray(a.item.props?.lines));
  assert.equal(caps.length, 2);
  assert.deepEqual(caps.map((a) => a.item.props.lines.flat().filter((w: any) => w.hi).map((w: any) => w.w)), [['WEEKENDS'], ['THIS']]);
  assert.equal(caps[1].item.props.kicker, '5:48 AM');
}
// RS-1245: plain cuts in a hype reel land punched in and drift; a calm reel's cuts sit still; a plan's own punch wins
{
  const cutsOf = (tone: string | undefined, params?: Record<string, number>) => {
    const pp = parsePlan({ ratio: '9:16', music: 'song', ...(tone ? { tone } : {}), sections: [{ move: 'cut', beats: 8, clips: ['walker', 'trail', 'ridge'], ...(params ? { params } : {}) }] });
    assert.ok(pp.ok, pp.ok ? '' : pp.errors.join('; '));
    const plan = (pp as { plan: ReelPlan }).plan;
    const out = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
    return (out.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.kind === 'video');
  };
  const hype = cutsOf('hype');
  assert.ok(hype.length >= 3 && hype.every((a) => a.item.keyframes?.scale?.[0]?.value === 1.12 && a.item.keyframes.scale.at(-1).value === 1.06), JSON.stringify(hype.map((a) => a.item.keyframes)));
  assert.ok(cutsOf('calm').every((a) => !a.item.keyframes?.scale));
  assert.ok(cutsOf('hype', { punch: 0 }).every((a) => !a.item.keyframes?.scale));
}
// RS-1249: a shot list moves only as written: no tone punch on its cuts; its slow motion is half speed and silent
{
  const build = (extra: Record<string, unknown>) => {
    const pp = parsePlan({ ratio: '9:16', tone: 'hype', ...extra });
    assert.ok(pp.ok, pp.ok ? '' : pp.errors.join('; '));
    const plan = (pp as { plan: ReelPlan }).plan;
    const out = assemble({ recipe: directorRecipe(plan), clips, texts: {}, params: {}, seed: 3, plan });
    return (out.action!.actions as any[]).filter((a) => a.type === 'add');
  };
  const listed = build({ shotList: true, sections: [{ move: 'cut', seconds: 3, clips: ['walker'], speed: 0.5 }, { move: 'cut', seconds: 2, clips: ['trail'], text: '4:00 AM · Pune', textStyle: 'caption', params: { center: true } }] });
  const vids = listed.filter((a) => a.item.kind === 'video');
  assert.ok(vids.every((a) => !a.item.keyframes?.scale), 'no punch-in in a shot list');
  const slow = vids.find((a) => a.item.props?.rsSection?.startsWith('1-'))!;
  assert.equal(slow.item.playbackRate, 0.5);
  assert.equal(slow.item.volume, 0, 'slowed footage is silent');
  const real = vids.find((a) => a.item.props?.rsSection?.startsWith('2-'))!;
  assert.ok(real.item.playbackRate === undefined || real.item.playbackRate === 1);
  assert.equal(slow.item.durationInFrames, 3 * fps, 'their 3 s');
  const line = listed.find((a) => a.item.kind === 'text' && a.item.props?.text?.includes('4:00 AM'))!;
  assert.equal(line.item.transform.y, 0, 'centred');
  assert.equal(line.item.props.fontWeight, 800);
  assert.ok(!parsePlan({ ratio: '9:16', sections: [{ move: 'cut', speed: 0.1 }] }).ok, 'speed range');
}
console.log('assembleDirector.verify: ok');
