import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { prepareTemplate } from '../../template-host';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { beatClock, directorRecipe, resolvePlanSections } from './assembleDirector';
import { coverFocus, GRAPHICS } from './graphics';
import { __clearCustomGraphics, adoptCustomGraphics, getCustomGraphic } from './customGraphics';
import { __resetCustomGraphicCount, customGraphicTool } from '../agent/customGraphicTool';

// every graphic compiles in the template sandbox (a component named like a blocked global, e.g. Notification, does not)
for (const g of GRAPHICS) await prepareTemplate(g.code).catch((e) => assert.fail(`${g.id}: ${e.message}`));
assert.equal(new Set(GRAPHICS.map((g) => g.id)).size, GRAPHICS.length);

const fps = 30;
const clip = (id: string, sec: number, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5, ...extra,
});
// a face in the upper middle of the "me" clip
const face = { sourceAnalysis: { windows: [{ startFrame: 0, endFrame: 300, focusRect: { x: 0.4, y: 0.2, w: 0.2, h: 0.1 } }] } } as unknown as Partial<AssemblyClip>;
const clips = [clip('me', 10, face), clip('view', 10), clip('road', 10), clip('top', 10)];
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const check = (raw: unknown) => {
  const p = parsePlan(raw);
  if (!p.ok) return p.errors;
  const errors: string[] = [];
  resolvePlanSections(p.plan, [], errors);
  return errors;
};
const sections = [
  { move: 'hold', beats: 8, clips: ['view'] },
  { move: 'hold', beats: 8, clips: ['me'] },
  { move: 'cut', beats: 8, clips: ['road', 'top'] },
  { move: 'hold', beats: 8, clips: ['top'] },
];
const raw = {
  ratio: '9:16', music: 'song', sections,
  graphics: [
    { graphic: 'route-map', from: 0, text: 'Mumbai / Lonavala / Harishchandragad', params: { icon: 'car' } },
    { graphic: 'annotate', from: 1, beats: 6, text: "that's me", params: { shape: 'arrow' } },
    { graphic: 'notification', from: 2, beat: 2, beats: 6, text: 'Mom / where are you / Mom / pick up' },
    { graphic: 'confetti', from: 3, beats: 4 },
    { graphic: 'chapter-bar', from: 0, to: 3, text: 'Day 1 / Day 2 / Day 3 / Top' },
  ],
};
assert.deepEqual(check(raw), []);
const plan = (parsePlan(raw) as { plan: ReelPlan }).plan;
const res = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
assert.ok(res.action, res.report.warnings.join('; '));
const adds = (res.action!.actions as any[]).filter((a) => a.type === 'add');
const gfx = adds.filter((a) => a.item.props?.rsGraphic);
assert.deepEqual(gfx.map((a) => a.item.props.rsGraphic).sort(), ['annotate', 'chapter-bar', 'confetti', 'notification', 'route-map']);
const by = (id: string) => gfx.find((a) => a.item.props.rsGraphic === id);
const clock = beatClock(music, 0.2);

// placed by section on the beat clock: route map over section 0, notification 2 beats into section 2 for 6 beats
assert.equal(by('route-map').startFrame, 0);
assert.equal(by('route-map').item.durationInFrames, Math.round(clock(8) * fps));
assert.equal(by('notification').startFrame, Math.round(clock(18) * fps));
assert.equal(by('notification').item.durationInFrames, Math.round(clock(24) * fps) - Math.round(clock(18) * fps));
assert.deepEqual(by('route-map').item.props.items, ['Mumbai', 'Lonavala', 'Harishchandragad']);
assert.equal(by('route-map').item.props.icon, 'car');
assert.ok(!('x' in by('route-map').item.props) && !('y' in by('route-map').item.props), '-1 placement left to the graphic');
// beats are seconds from the graphic's start; chapter bars know where each section starts
assert.deepEqual(by('notification').item.props.beats.slice(0, 3), [0, 0.5, 1]);
assert.deepEqual(by('chapter-bar').item.props.sections, [0, 4, 8, 12]);
// lanes above every text lane, and two graphics at once never share a lane
for (const a of gfx) assert.match(a.item.track, /^T3\d$/);
assert.notEqual(by('chapter-bar').item.track, by('route-map').item.track);
// the marker arrow points at the face found in the shot (cover fit of a 9:16 clip on a 9:16 frame keeps it in place)
assert.deepEqual([by('annotate').item.props.tx, by('annotate').item.props.ty], [0.5, 0.25]);
// graphics bring their sounds: pings for the banners, a chime for the confetti burst, a pop and whoosh for the map
const sfx = adds.filter((a) => a.item.props?.rsSfx).map((a) => a.item.props.rsSfx);
for (const cue of ['ping', 'chime', 'whoosh-soft']) assert.ok(sfx.includes(cue), `sound ${cue}`);
// and none with sfx off
const quiet = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan: { ...plan, sfx: 'off' } });
assert.equal((quiet.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.props?.rsSfx).length, 0);

// no face under it: points at the middle, with a note
const blind = { ...plan, graphics: [{ graphic: 'annotate', from: 0, to: 0, text: 'here' }] };
const r2 = assemble({ recipe: directorRecipe(blind), clips, music, texts: {}, params: {}, seed: 3, plan: blind });
assert.ok(r2.report.warnings.some((w) => /no face found/.test(w)));

// plan problems come back with the fix
const errs = (g: unknown) => check({ ...raw, graphics: [g] }).join('; ');
assert.match(errs({ graphic: 'fireworks', from: 0 }), /unknown graphic "fireworks"/);
assert.match(errs({ graphic: 'route-map', from: 0 }), /needs text: the stops/);
assert.match(errs({ graphic: 'route-map', from: 0, text: 'Goa' }), /takes 2-6 items/);
assert.match(errs({ graphic: 'boarding-pass', from: 0, text: 'a / b', params: { gate: 'B2' } }), /unknown param "gate"/);
assert.match(errs({ graphic: 'sticker', from: 9, text: '🔥' }), /from\/to must be section indexes/);
assert.match(check({ ...raw, graphics: Array.from({ length: 9 }, () => ({ graphic: 'sticker', from: 0, text: '🔥' })) }).join(';'), /at most 8 graphics/);

// cover fit: a landscape clip on a 9:16 frame is cropped at the sides, so a face at the source's left third moves out
assert.equal(coverFocus({ x: 0.1, y: 0.4, w: 0.1, h: 0.2 }, { width: 1920, height: 1080 }, 1080, 1920), undefined);
assert.deepEqual(coverFocus({ x: 0.45, y: 0.4, w: 0.1, h: 0.2 }, { width: 1920, height: 1080 }, 1080, 1920), { x: 0.5, y: 0.5, r: 0.178 });

// the agent's own graphic: checked in the sandbox, compiled, registered, then placed like a catalogue one
__clearCustomGraphics();
__resetCustomGraphicCount();
const code = `const Sun = ({ item }) => { const f = useCurrentFrame(); const P = item.props;
  return React.createElement(AbsoluteFill, null, React.createElement('div', { style: { position: 'absolute', left: item.width / 2, top: item.height * (0.7 - Math.min(1, f / 30) * 0.3), width: P.size, height: P.size, borderRadius: '50%', background: P.tint } }, P.items[0])); };`;
const bad = await customGraphicTool({ name: 'sun', code: code.replace('useCurrentFrame()', 'window.innerWidth') }) as any;
assert.match(bad.error, /sandbox|useCurrentFrame/);
assert.match((await customGraphicTool({ name: 'sun', code: 'const x = 1;' }) as any).error, /one component/);
assert.match((await customGraphicTool({ name: 'sun', code: code + ' const = ;' }) as any).error, /does not compile/);
assert.match((await customGraphicTool({ name: 'sun', code, params: [{ key: 'items', default: 1 }] }) as any).error, /given to every graphic/);
const ok = await customGraphicTool({ name: 'Rising sun', looks: 'A sun rises', code, params: [{ key: 'size', default: 200, min: 50, max: 600 }, { key: 'tint', default: '#ffb000' }] }) as any;
assert.equal(ok.graphicId, 'custom:gfx-rising-sun');
const withCustom = { ...raw, graphics: [{ graphic: ok.graphicId, from: 3, text: 'sunrise', params: { size: 300 } }] };
assert.deepEqual(check(withCustom), []);
assert.match(check({ ...withCustom, graphics: [{ graphic: ok.graphicId, from: 3, params: { size: 900 } }] }).join(';'), /size must be a number from 50 to 600/);
const p3 = (parsePlan(withCustom) as { plan: ReelPlan }).plan;
const r3 = assemble({ recipe: directorRecipe(p3), clips, music, texts: {}, params: {}, seed: 3, plan: p3 });
const item = (r3.action!.actions as any[]).find((a) => a.type === 'add' && a.item.props?.rsGraphic === ok.graphicId).item;
assert.equal(item.code, code);
assert.deepEqual([item.props.size, item.props.tint, item.props.items[0]], [300, '#ffb000', 'sunrise']);
// a later session finds it on the timeline again
__clearCustomGraphics();
assert.equal(getCustomGraphic(ok.graphicId), undefined);
adoptCustomGraphics([item]);
assert.equal(getCustomGraphic(ok.graphicId)?.code, code);
assert.deepEqual(check(withCustom), []);
console.log('graphics.verify: ok');
