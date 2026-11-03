// RS-1261: effects kept to the land or the sky. The envelope accepts the regions, the mix shader reads the sky map,
// Cinematic travel keeps its grade and halation off the sky, clips with sky effects ask for the depth map (which carries the
// sky map beside it), and the director can name the sky effects and the regions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePlan } from '../../shared/reelsmith/directorPlan';
import { ALL_FX } from '../gl/fx/effects';
import { fxPasses } from '../gl/fx/uniforms';
import { SKY_RECOVER_FX, SKY_SWAP_FX } from '../gl/fx/skyFx';
import type { TimelineItem } from '../editor/types';
import { isPersonRegion, isSkyRegion, mixUniformsAt, parseEffectMix, REGION_CODE } from './effectMix';
import { lookById, lookEffects } from './looks';
import { parseSkyModel, skyModelSrcFor, skyModelUniforms, skySrcFor, wantsDepth, wantsDepthTrack, wantsSky, wantsStillDepth, withDepthMap, withDepthMaps } from './depthMaps';
import { directorEffectById } from './director/catalog';

assert.deepEqual([REGION_CODE.land, REGION_CODE.sky], [3, 4]);
assert.ok(parseEffectMix({ region: 'land' }).ok && parseEffectMix({ region: 'sky' }).ok);
assert.ok(!parseEffectMix({ region: 'water' }).ok);
assert.ok(isSkyRegion('land') && isSkyRegion('sky') && !isSkyRegion('subject') && !isSkyRegion(undefined));
assert.ok(isPersonRegion('background') && !isPersonRegion('land'));
assert.deepEqual(mixUniformsAt({ region: 'land' }, 0, 1), { amount: 1, region: 3 });

// the mix shader reads the sky map for regions 3 and 4 and is told whether there is one
const mixFrag = readFileSync(new URL('../gl/fx/reel-mix.frag', import.meta.url), 'utf8');
assert.match(mixFrag, /uniform sampler2D u_sky;/);
assert.match(mixFrag, /uniform float u_hasSky;/);
const passes = fxPasses([{ def: ALL_FX['builtin:fx-halation']!, mix: { amount: 1, region: 3, hasSky: 1 } }], 0);
assert.equal(passes.at(-1)!.uniforms!.u_region, 3);
assert.equal(passes.at(-1)!.uniforms!.u_hasSky, 1, 'a regional effect is blended by the sky map');

// Cinematic travel: the teal/orange grade and the halation keep to the land; the rest of the stack is everywhere
const travel = lookEffects(lookById('cinematic-travel')!);
assert.deepEqual(travel.filter((e) => e.mix?.region === 'land').map((e) => e.assetId), ['builtin:look-teal-orange', 'builtin:fx-halation']);
assert.ok(travel.filter((e) => e.assetId !== 'builtin:look-teal-orange' && e.assetId !== 'builtin:fx-halation').every((e) => !e.mix));

// clips: a land-only look or a sky effect asks for the depth map; the sky map sits beside it
const clip = (effects: TimelineItem['effects']): TimelineItem => ({ id: 'c', track: 'V1', kind: 'video', name: 'c', src: '/media/uploads/a.mov', startFrame: 0, durationInFrames: 90, srcInFrame: 30, effects } as TimelineItem);
assert.ok(wantsSky(clip(travel)) && !wantsDepth(clip(travel)));
assert.ok(wantsSky(clip([{ id: 's', assetId: SKY_RECOVER_FX }])));
assert.ok(!wantsSky(clip([{ id: 'h', assetId: 'builtin:fx-halation' }])));
assert.equal(skySrcFor('/media/uploads/a.depth-1000.png'), '/media/uploads/a.depth-1000.sky.png');
// a video's sky comes with its depth track (the sky of every frame, RS-1261 per frame); a photo's with its still map
const asked: string[] = [];
const fetched = await withDepthMap(clip(travel), 30, async (url, init) => { asked.push(`${url} ${String(init.body)}`); return { ok: true, json: async () => ({ available: true, src: '/media/uploads/a.depthv-1000-3967.png' }) }; });
assert.equal(fetched.props?.rsDepthTrackSrc, '/media/uploads/a.depthv-1000-3967.png', 'an export carries the track for a land-only look');
assert.equal(fetched.props?.rsDepthSrc, undefined, 'and no still map');
assert.deepEqual(asked, ['/api/reelsmith/depth-track {"src":"/media/uploads/a.mov","fromSec":1,"toSec":3.967}']);
assert.ok(wantsDepthTrack(clip(travel)) && !wantsStillDepth(clip(travel)));
const photo = { ...clip(travel), kind: 'image', src: '/media/uploads/p.jpg' } as TimelineItem;
assert.ok(!wantsDepthTrack(photo) && wantsStillDepth(photo));
const photoFilled = await withDepthMap(photo, 30, async () => ({ ok: true, json: async () => ({ available: true, src: '/media/uploads/p.depth.png' }) }));
assert.equal(photoFilled.props?.rsDepthSrc, '/media/uploads/p.depth.png');
// an export sends the project, and the render reads the timeline from it: the project's clips carry the track too
const project = { version: 1, timelines: [{ id: 't', fps: 30, items: [clip(travel)] }] };
const filled = await withDepthMaps(project, async () => ({ ok: true, json: async () => ({ available: true, src: '/media/uploads/a.depthv-1000-3967.png' }) }));
assert.equal((filled as typeof project).timelines[0]!.items[0]!.props?.rsDepthTrackSrc, '/media/uploads/a.depthv-1000-3967.png');

// the sky effects read the sky map and the director can use them, and plans can keep effects to the land or the sky
for (const id of [SKY_RECOVER_FX, SKY_SWAP_FX]) {
  assert.ok(ALL_FX[id]?.needsSky, `${id} reads the sky map`);
  assert.ok(directorEffectById(id), `${id} is on the director's menu`);
  assert.match(ALL_FX[id]!.frag, /uniform sampler2D u_sky;/);
}
const plan = parsePlan({ ratio: '9:16', sections: [{ move: 'hold', beats: 4, effects: [{ id: 'halation', region: 'land' }, { id: 'sky-recover', region: 'sky' }] }] });
assert.ok(plan.ok, plan.ok ? '' : plan.errors.join('; '));
assert.ok(!parsePlan({ ratio: '9:16', sections: [{ move: 'hold', beats: 4, effects: [{ id: 'halation', region: 'water' }] }] }).ok);
// the per-frame sky finding is the same text in the three shaders that read the sky map
const inc = readFileSync(new URL('../gl/fx/skyAt.glsl.txt', import.meta.url), 'utf8').trim();
for (const f of ['reel-mix', 'sky-recover', 'sky-swap']) assert.ok(readFileSync(new URL(`../gl/fx/${f}.frag`, import.meta.url), 'utf8').includes(inc), `${f}.frag has the current skyAt (copy src/gl/fx/skyAt.glsl.txt in)`);
// the model's uniforms, and the map alone without one
assert.equal(skyModelUniforms(null).u_hasSkyModel, 0);
const model = parseSkyModel({ chroma: [0.28, 0.32], spread: [0.015, 0.012], limit: 3, lumaFloor: 0.4, paleFloor: 0.7 });
assert.deepEqual(skyModelUniforms(model), { u_hasSkyModel: 1, u_skyChroma: [0.28, 0.32], u_skySpread: [0.015, 0.012], u_skyLimit: 3, u_skyLuma: [0.4, 0.7] });
assert.equal(parseSkyModel(null), null);
assert.equal(parseSkyModel({ chroma: [0.3] }), null);
assert.equal(skyModelSrcFor('/media/uploads/a.depth-0.png'), '/media/uploads/a.depth-0.sky.json');
console.log('skyRegion: ok');
