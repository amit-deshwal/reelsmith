import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip } from './index';

const r = parseRecipe(readFileSync('recipes/captioned-story.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;

// a talking clip: words of 300 ms with 1.5 s pauses after every 4th word, 20 s long
const mkWords = () => {
  const words = []; let t = 500;
  for (let i = 0; i < 24; i += 1) {
    words.push({ text: `w${i}${i % 4 === 3 ? '.' : ''}`, start: t, end: t + 300 });
    t += 300 + (i % 4 === 3 ? 1500 : 80);
  }
  return words;
};
const talk = (id: string, t: number): AssemblyClip => ({
  assetId: id, name: id, src: `/${id}.mp4`, kind: 'video', durationInFrames: 900, score: 1, captureTimeMs: t, transcript: mkWords(),
});
const broll: AssemblyClip[] = Array.from({ length: 6 }, (_, i) => ({
  assetId: `b${i}`, name: `b${i}`, src: `/b${i}.mp4`, kind: 'video', durationInFrames: 300, score: 1 - i / 10,
}));
const base = { recipe, clips: [talk('t2', 2), talk('t1', 1)], broll, texts: { hook: 'Wait for it' }, params: { captionStyle: 'boxed', tighten: 'balanced', brollEvery: 3 }, seed: 1 };

const bal = assemble(base);
const off = assemble({ ...base, params: { ...base.params, tighten: 'off' } });
const tight = assemble({ ...base, params: { ...base.params, tighten: 'tight' } });
assert.ok(bal.action && off.action && tight.action);
assert.ok(tight.report.totalFrames < bal.report.totalFrames && bal.report.totalFrames < off.report.totalFrames, 'tighter = shorter');
assert.equal(JSON.stringify(bal), JSON.stringify(assemble(base)), 'deterministic');

const a = bal.action!.actions as any[];
const talks = a.filter((x) => x.item?.track === 'V1');
assert.deepEqual(talks.map((x) => x.item.sourceAssetId), ['t1', 't2'], 'chronological');
assert.equal(talks[1].startFrame, talks[0].item.durationInFrames, 'clips butt together');
// never cut mid-word: the clip's edit parameters only cap gaps between words
assert.equal(talks[0].item.silenceFrames, 18, '600 ms at 30 fps');
const cap = a.find((x) => x.type === 'setCaptions');
assert.equal(cap.captions.template, 'black-bar');
assert.equal(cap.captions.sourceMode, 'timeline');
assert.equal(a.find((x) => x.item?.kind === 'text').item.props.text, 'Wait for it');
const rolls = a.filter((x) => x.item?.track === 'V2');
assert.ok(rolls.length >= 2, 'b-roll appears');
assert.ok(rolls.every((x) => x.startFrame >= 90), 'not during the 3 s hook');
assert.ok(rolls.every((x, i) => i === 0 || x.startFrame - rolls[i - 1].startFrame >= 90), 'spaced by brollEvery');
assert.ok(rolls.every((x) => x.item.volume < 0.01), 'b-roll is silent');

// the editor's own duration math agrees with ours
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
let h = historyReduce({ past: [], present: doc, future: [] }, bal.action!);
assert.equal(h.past.length, 1);
const id0 = talks[0].item.id;
h = historyReduce(h, { type: 'cleanScript', id: id0, silenceFrames: 18, cutPadFrames: 4, removeFillers: false });
const placed = h.present.timelines[0]!.items.find((i) => i.id === id0)!;
assert.equal(placed.durationInFrames, talks[0].item.durationInFrames, 'cleanScript yields the same length');
assert.equal(historyReduce(h, { type: 'undo' }).present.timelines[0]!.items.find((i) => i.id === id0)?.durationInFrames, talks[0].item.durationInFrames);

// missing transcripts are reported, not guessed
const noTr = assemble({ ...base, clips: [{ ...talk('x', 1), transcript: undefined }] });
assert.equal(noTr.action, null);
assert.ok(noTr.report.warnings.some((w) => /transcri/.test(w)));
console.log('captionedStory.verify: ok');
