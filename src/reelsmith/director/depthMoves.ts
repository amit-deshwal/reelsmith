// RS-1238: photos that move. Each photo (or steady shot) gets a 3D camera move through its depth map (the photo-parallax
// effect, src/gl/fx/depthFx.ts): near things move more than far ones. Made for scenery with nobody in it, where
// photo-3d has no person to push out. The depth maps are attached after the build (depthMaps.ts), or by the preview.
import { PARALLAX_MOVES, PHOTO_PARALLAX_FX } from '../../gl/fx/depthFx';
import { clipAt, num, str, type MoveDef } from './moveKit';

/** The camera move of the i-th photo: the one asked for, or dolly, orbit, rise in turn. */
export function parallaxMoveAt(choice: string, i: number, seed = 0): number {
  const fixed = PARALLAX_MOVES.indexOf(choice as never);
  return fixed >= 0 ? fixed : (i + seed) % PARALLAX_MOVES.length;
}

export const photoParallax: MoveDef = {
  id: 'photo-parallax', name: 'Photos that move',
  looks: 'Each photo becomes a 3D camera move: the camera walks in, slides around or lifts, and near rocks, trees and people move more than the mountains behind them.',
  use: 'Landscape and scenery photos (or steady wide shots) with nobody in particular in them: views, valleys, trails, the coast, the camp. A calmer, more cinematic photo-drift. One photo per 2-4 beats.',
  clips: { min: 1, max: 12 }, beats: { min: 2, default: 12, max: 48 }, wants: ['scenery', 'water', 'city'],
  params: [
    { id: 'every', type: 'number', label: 'Beats per photo', default: 4, min: 2, max: 16 },
    { id: 'move', type: 'enum', label: 'Camera move', default: 'auto', options: ['auto', ...PARALLAX_MOVES] },
    { id: 'strength', type: 'number', label: 'Strength', default: 1, min: 0.3, max: 2 },
  ],
  clipCount: (beats, p) => Math.min(12, Math.ceil(beats / num(p.every, 4) - 1e-6)),
  build: (ctx) => {
    const n = ctx.clips.length;
    const per = ctx.beats / n;
    const strength = num(ctx.params.strength, 1);
    const move = str(ctx.params.move, 'auto');
    ctx.clips.forEach((clip, i) => {
      const from = ctx.beatFrame(i * per);
      const to = i === n - 1 ? ctx.end : ctx.beatFrame((i + 1) * per);
      if (to - from < 2) return;
      const overrides = { move: parallaxMoveAt(move, i, ctx.seed), strength };
      clipAt(ctx, 0, ['plx', i], clip, from, to, ctx.moment(clip, to - from).inFrame, {
        effects: [{ id: ctx.id('plx-fx', i), assetId: PHOTO_PARALLAX_FX, overrides }],
      });
    });
  },
};
