import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { formatMoment, parsePlaces } from './storyVlog';

const r = parseRecipe(readFileSync('recipes/mini-vlog.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;
assert.equal(formatMoment(Date.UTC(2026, 5, 1, 7, 40), 0), '7:40 am');
assert.equal(formatMoment(Date.UTC(2026, 5, 1, 0, 5), 0), '12:05 am');
assert.equal(formatMoment(Date.UTC(2026, 5, 1, 13, 0), 330), '6:30 pm', 'timezone offset applies');

const T0 = Date.UTC(2026, 5, 1, 7, 0);
// shuffled input order, 3 hours of footage
const clips: AssemblyClip[] = Array.from({ length: 24 }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video' as const, durationInFrames: 300, score: 0.5,
  captureTimeMs: T0 + i * 8 * 60_000, place: i === 0 ? 'Pune' : undefined,
})).reverse();
const params = { labels: 'timeAndPlace', splitEvery: 5, shotLen: 1.6, tzOffsetMin: 0 };
const base = { recipe, clips, texts: {}, params, seed: 1 };

const a = assemble(base);
assert.ok(a.action);
assert.equal(JSON.stringify(a), JSON.stringify(assemble(base)), 'deterministic');
const v1 = a.action!.actions.filter((x: any) => x.item?.track === 'V1') as any[];
const order = v1.map((x) => Number(x.item.sourceAssetId.slice(1)));
assert.deepEqual(order, [...order].sort((p, q) => p - q), 'capture-time order');

const labels = a.action!.actions.filter((x: any) => x.item?.kind === 'text') as any[];
assert.ok(labels.length >= 2 && labels.length <= 4, 'one label per hour group');
assert.ok(labels[0].item.props.text.startsWith('7:00 am'), labels[0].item.props.text);
assert.ok(labels[0].item.props.text.includes('Pune'));

const splits = v1.filter((x) => a.action!.actions.some((y: any) => y.item?.track === 'V2' && y.startFrame === x.startFrame && y.item.kind === 'video'));
assert.ok(splits.length >= 1, 'a split-screen slot appears');
const none = assemble({ ...base, params: { ...params, splitEvery: 0, labels: 'none' } });
assert.equal(none.action!.actions.filter((x: any) => x.item?.track === 'V2' || x.item?.kind === 'text').length, 0);

// with a song: cuts on bars, clip audio ducked, fade out at the end
const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 90,
  beatTimesSec: Array.from({ length: 180 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const m = assemble({ ...base, music });
const mv = m.action!.actions.filter((x: any) => x.item?.track === 'V1') as any[];
assert.ok(mv.every((x) => x.startFrame % 60 === 0 && x.item.durationInFrames % 60 === 0), 'cuts on bars');
assert.ok(mv.every((x) => x.item.volume < 0.2), 'clip audio is lowered under the music');
const song = m.action!.actions.find((x: any) => x.item?.kind === 'audio') as any;
assert.ok(song.item.fadeOutFrames > 0);

// typed places are assigned to successive moments; clip metadata wins; labels:'time' ignores them
assert.deepEqual(parsePlaces('Home, Cafe;\n {{inputs.x}}Beach ,'), ['Home', 'Cafe', 'inputs.xBeach']);
const pl = assemble({ ...base, texts: { places: 'Home, Cafe, Beach' } });
const pt = (pl.action!.actions.filter((x: any) => x.item?.kind === 'text') as any[]).map((x) => x.item.props.text as string);
assert.ok(pt[0].includes('Pune'), 'clip place wins');
assert.ok(pt[1].endsWith('· Cafe'), pt[1]);
assert.ok(pt[2].endsWith('· Beach'), pt[2]);
const pn = assemble({ ...base, texts: { places: 'Home' }, params: { ...params, labels: 'time' } });
assert.ok((pn.action!.actions.filter((x: any) => x.item?.kind === 'text') as any[]).every((x) => !x.item.props.text.includes('·')));
console.log('storyVlog.verify: ok');
