import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip } from './index';
import { buildCaptionPages } from '../../captions/captionPages';

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
assert.deepEqual([...new Set(talks.map((x) => x.item.sourceAssetId))], ['t1', 't2'], 'chronological');
talks.forEach((x, i) => assert.equal(x.startFrame, i === 0 ? 0 : talks[i - 1].startFrame + talks[i - 1].item.durationInFrames, 'pieces butt together'));
assert.equal(talks.at(-1).startFrame + talks.at(-1).item.durationInFrames, bal.report.totalFrames);
// the pauses are real cuts: each clip is several pieces of its source, in order, none starting or ending inside a word
const t1 = talks.filter((x) => x.item.sourceAssetId === 't1');
assert.ok(t1.length > 1, 'the long pauses cut the clip');
assert.ok(t1.every((x, i) => i === 0 || x.item.srcInFrame >= t1[i - 1].item.srcInFrame + t1[i - 1].item.durationInFrames), 'source runs forward');
const inWord = (f: number) => mkWords().some((w) => Math.round((w.start / 1000) * 30) < f && f < Math.round((w.end / 1000) * 30));
assert.ok(t1.every((x) => !inWord(x.item.srcInFrame) && !inWord(x.item.srcInFrame + x.item.durationInFrames)), 'never cut mid-word');
assert.ok(t1.every((x) => x.item.transcript?.length === 24 && x.item.silenceFrames === undefined), 'each piece carries the transcript for the captions');
const cap = a.find((x) => x.type === 'setCaptions');
assert.equal(cap.captions.template, 'black-bar');
assert.equal(cap.captions.sourceMode, 'timeline');
assert.equal(a.find((x) => x.item?.kind === 'text').item.props.text, 'Wait for it');
const rolls = a.filter((x) => x.item?.track === 'V2');
assert.ok(rolls.length >= 2, 'b-roll appears');
assert.ok(rolls.every((x) => x.startFrame >= 90), 'not during the 3 s hook');
assert.ok(rolls.every((x, i) => i === 0 || x.startFrame - rolls[i - 1].startFrame >= 90), 'spaced by brollEvery');
assert.ok(rolls.every((x) => x.item.volume < 0.01), 'b-roll is silent');

// the editor takes the whole build as one step, and the captions show every kept word once and nothing that was cut
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
const captionWords = (built: typeof bal) => {
  const h = historyReduce({ past: [], present: doc, future: [] }, built.action!);
  assert.equal(h.past.length, 1);
  const tl = h.present.timelines[0]!;
  const captions = { ...(built.action!.actions as any[]).find((x) => x.type === 'setCaptions').captions };
  return buildCaptionPages(captions, tl.items, 30).flatMap((p) => p.page.words.map((w) => w.text));
};
assert.equal(captionWords(bal).length, 48, 'all 24 words of both clips, once each');

// RS-204 acceptance: a talking clip with 3 fillers and one restarted sentence loses exactly those words
const messy = 'So um I think uh we should we should go now. Um that is it.'.split(' ').map((text, i) => ({ text, start: 400 + i * 450, end: 400 + i * 450 + 300 }));
const cleaned = assemble({ ...base, clips: [{ ...talk('m', 1), transcript: messy, durationInFrames: 300 }], broll: [], params: { ...base.params, tighten: 'balanced' } });
assert.equal(captionWords(cleaned).join(' '), 'So I think we should go now. that is it.');
assert.ok(cleaned.report.warnings.some((w) => /3 filler words/.test(w) && /2 words of restarted/.test(w)), cleaned.report.warnings.join('; '));
assert.ok(cleaned.report.totalFrames < Math.round((messy.at(-1)!.end / 1000) * 30) - 30, 'shorter by what was cut');
// off keeps every word and the pauses
const kept = assemble({ ...base, clips: [{ ...talk('m', 1), transcript: messy, durationInFrames: 300 }], broll: [], params: { ...base.params, tighten: 'off' } });
assert.equal(captionWords(kept).length, messy.length);
assert.equal(kept.report.totalFrames, 300);

// missing transcripts are reported, not guessed
const noTr = assemble({ ...base, clips: [{ ...talk('x', 1), transcript: undefined }] });
assert.equal(noTr.action, null);
assert.ok(noTr.report.warnings.some((w) => /transcri/.test(w)));
console.log('captionedStory.verify: ok');
