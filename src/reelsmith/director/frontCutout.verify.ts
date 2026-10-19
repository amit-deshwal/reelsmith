import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { directorRecipe } from './assembleDirector';
import { FRONT_CUTOUT, withFrontCutouts } from './frontCutout';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { historyReduce } from '../../editor/reduce';
import { timelineTrackIds, trackKind, type ProjectDoc } from '../../editor/types';
import { bindTracks } from '../trackBinding';

const clip = (id: string, top = 'people'): AssemblyClip => ({ assetId: id, name: id, src: `/media/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: 300, score: 0.5, shot: { top: top as never, confidence: 0.9, scores: {} as never } });
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const build = (raw: unknown) => {
  const parsed = parsePlan(raw);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const plan = (parsed as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips: [clip('me'), clip('view', 'scenery'), clip('pal')], music, texts: {}, params: {}, seed: 3, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  return { acts: withFrontCutouts(res.action!.actions) as any[], warnings: res.report.warnings };
};

// a section line behind the person: one cut-out copy of the shot, same moment and push, on the lane above the text
const { acts } = build({ music: 'song', sections: [
  { move: 'cut', beats: 4, clips: ['view'] },
  { move: 'hold', beats: 8, clips: ['me'], transition: 'whip-blur', text: 'made it', textStyle: 'big-title', textBehind: true, effects: [{ id: 'halation' }] },
] });
const base = acts.find((a) => a.type === 'add' && a.item.props?.rsSection === '2-hold' && a.item.track === 'V2');
const front = acts.filter((a) => a.type === 'add' && a.item.props?.rsFront);
assert.equal(front.length, 1);
const f = front[0];
assert.equal(f.item.track, 'P1');
assert.deepEqual([f.startFrame, f.item.durationInFrames, f.item.srcInFrame, f.item.src], [base.startFrame, base.item.durationInFrames, base.item.srcInFrame, base.item.src]);
assert.deepEqual(f.item.keyframes, base.item.keyframes, 'the same push in');
assert.equal(f.item.effects.at(-1).assetId, FRONT_CUTOUT, 'cut out last');
assert.deepEqual(f.item.effects.slice(0, -1).map((e: { assetId: string }) => e.assetId), base.item.effects.map((e: { assetId: string }) => e.assetId), 'same look as the shot');
assert.ok(f.item.fadeInFrames > 0, 'appears as the transition in finishes');
assert.ok(acts.some((a) => a.type === 'add' && a.item.kind === 'text' && /^T/.test(a.item.track)));
// after binding, the person is the top layer: above the line, which is above the shot
const doc: ProjectDoc = { version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't', timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any] };
let n = 0;
const tl = historyReduce({ past: [], present: doc, future: [] }, bindTracks({ type: 'batch', actions: acts, label: 'x' } as any, doc.timelines[0] as any, () => `track_${n++}`)).present.timelines[0] as any;
const visual = timelineTrackIds(tl).filter((id: string) => trackKind(tl, id) === 'video');
const pos = (pred: (i: any) => boolean) => visual.indexOf(tl.items.find(pred)!.track);
assert.ok(pos((i) => i.props?.rsFront) < pos((i) => i.kind === 'text') && pos((i) => i.kind === 'text') < pos((i) => i.id === base.item.id), 'person over line over shot');
// an overlay behind across two sections, one with a shot of nobody: copies for each shot, a note about the empty one
const two = build({ music: 'song', sections: [{ move: 'cut', beats: 4, clips: ['me', 'view'], params: { every: 2 } }, { move: 'hold', beats: 4, clips: ['pal'] }], overlays: [{ text: 'weekend', style: 'big-title', from: 0, to: 1, behind: true }] });
assert.equal(two.acts.filter((a) => a.type === 'add' && a.item.props?.rsFront).length, 3);
assert.match(two.warnings.join(' '), /"view" may have nobody/);
// an in-picture style ignores behind
const inPic = build({ sections: [{ move: 'hold', beats: 4, clips: ['me'], text: 'calm', textStyle: 'behind-you', textBehind: true }] });
assert.equal(inPic.acts.filter((a) => a.type === 'add' && a.item.props?.rsFront).length, 0);
assert.match(inPic.warnings.join(' '), /already drawn in the picture/);
// the line itself is laid across the person (head and shoulders) instead of being moved off their face
Promise.all([import('../titleClear'), import('../runRecipe')]).then(([{ withTitleClear }, { withCropFocus }]) => {
  const person = { ...clip('me'), sourceAnalysis: { minShotFrames: 15, shotBoundariesFrame: [], windows: [{ startFrame: 0, endFrame: 300, score: 1, focusRect: { x: 0.3, y: 0.55, w: 0.4, h: 0.35 } }] } };
  const parsed2 = parsePlan({ sections: [{ move: 'hold', beats: 8, clips: ['me'], text: 'made it', textStyle: 'big-title', textBehind: true }] });
  const plan2 = (parsed2 as { plan: ReelPlan }).plan;
  const res2 = assemble({ recipe: directorRecipe(plan2), clips: [person], texts: {}, params: {}, seed: 1, plan: plan2 });
  const placed = withTitleClear(withCropFocus(res2.action!.actions, [person], { width: 1080, height: 1920 }), [person], { width: 1080, height: 1920 }) as any[];
  const line = placed.find((a) => a.type === 'add' && (a.item.kind === 'text' || a.item.kind === 'motion-graphic') && a.item.props?.rsBehind);
  assert.ok(line, 'the line is marked as behind');
  const centre = line.item.kind === 'motion-graphic' ? line.item.props.y : 0.5 + (line.item.transform?.y ?? 0) / 100;
  assert.ok(Math.abs(centre - (0.55 + 0.35 * 0.4)) < 0.01, `the line crosses the person's upper body (centre ${centre})`);
  console.log('frontCutout: ok');
});
