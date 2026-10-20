import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline, type TimelineItem } from '../../editor/types';
import { parsePlan } from '../../../shared/reelsmith/directorPlan';
import { directorRecipe } from '../director/assembleDirector';
import { runRecipe } from '../runRecipe';
import { defaultValues } from '../setupForm';
import { bindTracks } from '../trackBinding';
import { parseRestyleArgs, planRestyle } from './restyleTextTool';

// a director reel without a song (0.5 s beats): a captioned hold, a cut with words on the beat, a landscape title
const assets = ['a', 'b', 'c'].map((id) => ({ id, name: `${id}.mov`, kind: 'video' as const, src: `/media/uploads/${id}.mov`, durationInFrames: 600, width: 1080, height: 1920 }));
const parsed = parsePlan({ ratio: '9:16', sfx: 'off', sections: [
  { move: 'hold', beats: 6, clips: ['a@1'], text: 'priorities sorted', textStyle: 'caption' },
  { move: 'cut', beats: 8, clips: ['b@1', 'c@1'], text: 'two days one fort', textStyle: 'words-on-beat' },
  { move: 'hold', beats: 6, clips: ['c@8'], text: 'rajmachi', textStyle: 'landscape-title' },
] });
assert.ok(parsed.ok);
const recipe = directorRecipe(parsed.plan);
const values = defaultValues(recipe);
values.media.clips = assets.map((a) => ({ assetId: a.id, kind: 'video' as const }));
const built = await runRecipe({ clipFeatures: async () => null, musicGrid: async () => null }, { recipe, values, assets, fps: 30, replaceTimeline: true, plan: parsed.plan });
assert.ok(built.action, built.messages.join('; '));
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
for (const asset of assets) h = historyReduce(h, { type: 'addAsset', asset } as never);
h = historyReduce(h, bindTracks(built.action!, activeTimeline(h.present)));
const reel = () => activeTimeline(h.present);
let n = 0;
const ids = () => `x${++n}`;
const restyle = (raw: Record<string, unknown>) => {
  const a = parseRestyleArgs(raw);
  assert.ok(!('error' in a), JSON.stringify(a));
  return planRestyle(reel(), a as Exclude<typeof a, { error: string }>, ids);
};
const apply = (plan: ReturnType<typeof restyle>) => {
  assert.ok(!('error' in plan), JSON.stringify(plan));
  h = historyReduce(h, bindTracks({ type: 'batch', label: 'restyle', actions: plan.actions } as never, reel()));
  return plan;
};
const lineItems = (style: string) => reel().items.filter((i: TimelineItem) => i.props?.rsTextStyle === style);

// the director tags every item of a line
assert.ok(lineItems('caption').length >= 1 && lineItems('caption').every((i) => i.props?.rsLine === 's1' && i.props?.rsLineText === 'priorities sorted'));
const words = lineItems('words-on-beat');
assert.ok(words.length > 1, 'words-on-beat is several items');
const span = [Math.min(...words.map((i) => i.startFrame)), Math.max(...words.map((i) => i.startFrame + i.durationInFrames))];

// the caption becomes a marker highlight over the same span, found by its words in any case
const before = lineItems('caption');
const p1 = apply(restyle({ text: 'PRIORITIES Sorted', style: 'highlight' }));
assert.equal(lineItems('caption').length, 0, 'the old caption is gone');
const hl = lineItems('highlight');
assert.ok(hl.length >= 1);
assert.equal(Math.min(...hl.map((i) => i.startFrame)), Math.min(...before.map((i) => i.startFrame)), 'same start');
assert.ok(hl.every((i) => i.props?.rsLine === 's1' && i.props?.rsLineText === 'priorities sorted'), 'still the same line, so it can be restyled again');
assert.equal(p1.removed, before.length);

// every word item of a multi-item line goes, and the new style gets the whole span, even when only one item is named
apply(restyle({ itemIds: [words[1]!.id], style: 'slam' }));
assert.equal(lineItems('words-on-beat').length, 0, 'no word of the old line is left behind');
const slam = lineItems('slam');
assert.deepEqual([Math.min(...slam.map((i) => i.startFrame)), Math.max(...slam.map((i) => i.startFrame + i.durationInFrames))], span);

// new words with the restyle; a style's own params are checked like in a plan
apply(restyle({ text: 'priorities sorted', style: 'caption', newText: 'priorities: sorted' }));
assert.ok(lineItems('caption').every((i) => i.props?.rsLineText === 'priorities: sorted'));
const bad = restyle({ text: 'priorities', style: 'big-title', params: { size: 2 } });
assert.ok('error' in bad && /unknown param "size"/.test(bad.error), 'big-title takes only color');
const long = restyle({ text: 'priorities', style: 'behind-you' });
assert.ok('error' in long && /14 at most/.test(long.error));

// an in-picture title (an effect on the clip) becomes a plain title item, and the clip loses the effect
const withTitle = () => reel().items.filter((i) => i.props?.rsFxText === 'rajmachi');
assert.ok(withTitle().length >= 1);
apply(restyle({ text: 'rajmachi', style: 'cinematic-title' }));
assert.equal(withTitle().length, 0);
assert.ok(!reel().items.some((i) => (i.effects ?? []).some((e) => /landscape|title/.test(e.assetId) && i.kind === 'video')), 'no title effect left on the clip');
assert.equal(lineItems('cinematic-title').length >= 1, true);

// a line that is not there lists the lines that are
const missing = restyle({ text: 'summit', style: 'slam' });
assert.ok('error' in missing && /lines: /.test(missing.error) && /priorities: sorted/.test(missing.error));
assert.ok('error' in parseRestyleArgs({ text: 'x', style: 'comic-sans' }));
console.log('restyleTextTool: ok');
