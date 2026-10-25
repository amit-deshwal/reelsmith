import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { directorRecipe } from './assembleDirector';
import { criticBrief, critiqueFrames, parseDefects } from './critique';
import { MOTION_RULES, applyMotionRules, motionRuleText } from './motionRules';
import { TONES } from './treatment';

// RS-1216: the critic names defects with section, time, evidence and fix; a fix rebuilds only the sections it names
const fps = 30;
const clip = (id: string, sec: number): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5 });
const clips = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => clip(id, 8 + i));
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const raw = {
  ratio: '9:16', music: 'song',
  sections: [
    { move: 'cut', beats: 8, params: { every: 2 }, text: 'bro lied to me', textStyle: 'rise-lines' },
    { move: 'flash-cuts', beats: 4, transition: 'zoom-through' },
    { move: 'hold', beats: 6, text: 'AMK', textStyle: 'slam' },
    { move: 'cut', beats: 8, params: { every: 1 }, transition: 'light-dissolve' },
  ],
  graphics: [{ graphic: 'sticker', from: 3, beat: 1, beats: 3, text: 'wow' }],
};
const build = (p: ReelPlan) => {
  const out = assemble({ recipe: directorRecipe(p), clips, music, texts: {}, params: {}, seed: 7, plan: p });
  assert.ok(out.action, out.report.warnings.join('; '));
  return out;
};
const parse = (r: unknown) => { const x = parsePlan(r); assert.ok(x.ok, x.ok ? '' : x.errors.join('; ')); return (x as { plan: ReelPlan }).plan; };
const first = build(parse(raw));
assert.equal(first.report.sectionClips?.length, 4, 'every section reports its cast');
assert.ok(first.report.sectionMoments!.every((m, k) => m.length >= first.report.sectionClips![k]!.length), 'a moment for every shot');
// shots of a section: source, source in, start, length
const shots = (actions: unknown[], k: number) => (actions as any[]).filter((a) => a.type === 'add' && (a.item.kind === 'video' || a.item.kind === 'image') && a.item.props?.rsSection?.startsWith(`${k + 1}-`))
  .map((a) => `${a.item.sourceAssetId}@${a.item.srcInFrame}+${a.startFrame}/${a.item.durationInFrames}`).sort();

// fix section 1 (flash-cuts → zoom-punch), keep the rest: the kept sections come back shot for shot
const fixed = parse({ ...raw, sections: raw.sections.map((s, k) => (k === 1 ? { move: 'zoom-punch', beats: 4, transition: 'zoom-through' } : s)) });
fixed.keep = fixed.sections.map((_, k) => (k === 1 ? null : { clips: first.report.sectionClips![k]!, moments: first.report.sectionMoments![k]! }));
const second = build(fixed);
for (const k of [0, 2, 3]) assert.deepEqual(shots(second.action!.actions, k), shots(first.action!.actions, k), `section ${k} is unchanged`);
assert.notDeepEqual(shots(second.action!.actions, 1), shots(first.action!.actions, 1), 'section 1 is rebuilt');
// without keep, the auto-cast sections after the change are free to move (the reason keep exists)
const loose = build(parse({ ...raw, sections: raw.sections.map((s, k) => (k === 1 ? { move: 'zoom-punch', beats: 4, transition: 'zoom-through' } : s)) }));
assert.ok(loose.action);
// a fix that lengthens a section moves the ones after it but keeps their shots
const longer = parse({ ...raw, sections: raw.sections.map((s, k) => (k === 1 ? { ...s, beats: 8 } : s)) });
longer.keep = longer.sections.map((_, k) => (k === 1 ? null : { clips: first.report.sectionClips![k]!, moments: first.report.sectionMoments![k]! }));
const third = build(longer);
const srcOf = (actions: unknown[], k: number) => shots(actions, k).map((x) => x.split('+')[0]);
assert.deepEqual(srcOf(third.action!.actions, 3), srcOf(first.action!.actions, 3), 'a moved section keeps its sources and moments');

// RS-1217: the pace check measures cuts, not items: a velocity shot split into rate segments is one shot, a hold is one
const paced = build(parse({ ratio: '9:16', music: 'song', sections: [{ move: 'velocity', beats: 8, clips: ['c'] }, { move: 'hold', beats: 6, clips: ['d'] }, { move: 'cut', beats: 4, params: { every: 1 } }] }));
const shotSec = paced.report.shotSec!;
assert.equal(shotSec.length, 6, `1 velocity shot + 1 hold + 4 one-beat cuts: ${shotSec.map((x) => x.toFixed(2)).join(' ')}`);
assert.ok(Math.abs(shotSec[0]! - 4) < 0.05 && Math.abs(shotSec[1]! - 3) < 0.05 && shotSec.slice(2).every((x) => Math.abs(x - 0.5) < 0.05));

// defects: section, time inside it, evidence and fix; three at most
const spans = [{ from: 0, to: 4 }, { from: 4, to: 6 }, { from: 6, to: 9 }, { from: 9, to: 13 }];
const ok = parseDefects([{ section: 0, at: 0.4, evidence: 'image 1 [1]: the line runs off the right edge', fix: 'two lines at x 0.08' }], 4, spans);
assert.ok(ok.ok);
const bad = parseDefects([{ section: 5, at: 1, evidence: 'x', fix: 'y' }, { section: 1, at: 12, evidence: '', fix: 'y' }], 4, spans);
assert.ok(!bad.ok && bad.errors.some((e) => /section index 0-3/.test(e)) && bad.errors.some((e) => /outside section 1/.test(e)) && bad.errors.some((e) => /evidence/.test(e)));
assert.ok(!parseDefects([], 4, spans).ok, 'a fix round names its defects');
assert.ok(!(parseDefects(Array.from({ length: 4 }, () => ({ section: 0, at: 1, evidence: 'e', fix: 'f' })), 4, spans) as { ok: boolean }).ok, 'three at most');
assert.match(criticBrief(), /THREE LARGEST defects/);
assert.match(criticBrief(), /Judge only the rendered frames/);
// RS-1227: the critic sees the first frame (mid-scroll, sound off) and, for a loop, the seam; both survive thinning
const many: any = { version: 1, ratio: '9:16', sections: Array.from({ length: 12 }, () => ({ move: 'cut', text: 'a line' })) };
const manySpans = Array.from({ length: 12 }, (_, k) => ({ from: k * 2, to: k * 2 + 2 }));
const plainFrames = critiqueFrames(many, manySpans, 30, 20);
assert.equal(plainFrames[0]!.frame, 0);
assert.match(plainFrames[0]!.label, /first frame/);
assert.ok(!plainFrames.some((x) => /loop seam/.test(x.label)));
const loopFrames = critiqueFrames({ ...many, loop: true }, manySpans, 30, 20);
assert.ok(loopFrames.some((x) => /loop seam/.test(x.label) && x.frame === 24 * 30 - 1));
assert.match(criticBrief(), /emotion first/);
assert.match(criticBrief(), /naturalSound/);

// RS-1219: the same plan in two tones moves differently
for (const tone of TONES) assert.ok(MOTION_RULES[tone] && motionRuleText(tone).startsWith(tone));
const toned = (tone: 'royal' | 'hype') => build({ ...parse(raw), tone }).action!.actions as any[];
const royal = toned('royal'), hype = toned('hype'), plain = first.action!.actions as any[];
const textOf = (acts: any[], line: string) => acts.find((a) => a.type === 'add' && a.item.props?.rsLine === line && a.item.props?.preset);
assert.ok(textOf(royal, 's1').item.props.enter > textOf(plain, 's1').item.props.enter, 'royal lines glide in slower');
assert.ok(textOf(hype, 's1').item.props.enter < textOf(plain, 's1').item.props.enter, 'hype lines snap in faster');
assert.equal(textOf(royal, 's3').item.props.overshoot, MOTION_RULES.royal.textOvershoot, 'the slam lands without its bounce in a royal reel');
assert.equal(textOf(plain, 's3').item.props.overshoot, undefined, 'no tone, no change');
// transitions between two long holds (a short shot on either side caps a transition at half its length)
const holds = (tone: 'royal' | 'hype') => build(parse({ ratio: '9:16', music: 'song', tone, sections: [{ move: 'hold', beats: 8, clips: ['a'] }, { move: 'hold', beats: 8, clips: ['b'], transition: 'light-dissolve' }] })).action!.actions as any[];
const trLen = (acts: any[]) => acts.find((a) => a.type === 'addTransition').durationInFrames;
assert.ok(trLen(holds('royal')) > trLen(holds('hype')), `royal transitions run longer than hype ones (${trLen(holds('royal'))} / ${trLen(holds('hype'))})`);
const push = (acts: any[]) => acts.find((a) => a.type === 'add' && a.item.props?.rsSection?.startsWith('3-hold') && a.item.keyframes?.scale)?.item.keyframes.scale.at(-1).value;
assert.ok(push(royal) < push(plain) && push(hype) > push(plain), `held shots push as the tone moves (${push(royal)} / ${push(plain)} / ${push(hype)})`);
const gfx = (acts: any[]) => acts.find((a) => a.type === 'add' && a.item.props?.rsGraphic === 'sticker').item.props.overshoot;
assert.equal(gfx(royal), MOTION_RULES.royal.graphicOvershoot);
assert.equal(gfx(hype), MOTION_RULES.hype.graphicOvershoot);
// a plan's own push wins over the rule
const own = build({ ...parse({ ...raw, sections: raw.sections.map((s, k) => (k === 2 ? { ...s, params: { push: 0.2 } } : s)) }), tone: 'royal' }).action!.actions as any[];
assert.ok(Math.abs(push(own) - 1.2) < 1e-9, 'a hold that sets its push keeps it');
// entrances never stretch past 40% of a line's time on screen
const short = applyMotionRules([{ type: 'add', startFrame: 0, item: { id: 't', kind: 'motion-graphic', track: 'T1', durationInFrames: 30, props: { preset: 'rise', enter: 0.3 } } } as never], 'calm', fps)[0] as any;
assert.ok(short.item.props.enter <= 0.4 + 1e-9 && short.item.props.enter > 0.3);
// the text engine and the graphics read the overshoot
const { TEXT_GRAPHIC_CODE } = await import('./textGraphic');
const { GRAPHIC_PRELUDE } = await import('./graphicsKit');
assert.match(TEXT_GRAPHIC_CODE, /P\.overshoot/);
assert.match(GRAPHIC_PRELUDE, /P\.overshoot/);
console.log('critique.verify ok');
