// Imports a curated set of GL Transitions (https://github.com/gl-transitions/gl-transitions, MIT) as Reels transitions.
//   npx tsx server/reelsmith/import-gl-transitions.mts <path to a gl-transitions checkout>
// Each shader is wrapped in our two-input contract (u_outgoing / u_incoming / u_progress / u_aspect), its tunable
// uniforms become constants at their default, and three generated files are written:
//   src/gl/shaders/glt/<id>.frag        the wrapped shader (run scripts/sync-shader-sources.mjs for the .frag.ts twin)
//   src/gl/shaders/glt/frags.ts         id → source
//   src/reelsmith/glTransitionsMeta.ts  ids, labels, lengths, director text and sound cues
// GL Transitions run on linear progress with sharp, unblurred motion, which reads as a slideshow. `polish` re-times one
// on an ease-in-out and averages it over nearby moments in proportion to its speed (motion blur), weighting the samples
// per channel for a colour fringe along the motion; both vanish at the ends, so 0 and 100 % stay the plain clips.
// OWN lists the hand-written ports of GTKottman/remotion-transitions (MIT): their .frag lives in shaders/glt and is not
// generated, only registered.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Cue = 'whoosh' | 'whoosh-soft' | 'whoosh-heavy' | 'glitch' | 'pop' | 'shutter' | 'hit' | null;
/** blur: progress spread sampled at full speed (0 = ease only). split: 0..0.9 colour fringe from the same samples. */
interface Polish { blur: number; split: number }
interface Entry { src: string; id: string; label: string; seconds: number; looks: string; use: string; cue: Cue; polish?: Polish }

const LIST: Entry[] = [
  { src: 'CrossZoom', id: 'cross-zoom', label: 'Cross zoom', seconds: 0.45, looks: 'Zoom blur streaks into the next shot.', use: 'Energy, drops, arrivals; the classic punchy cut.', cue: 'whoosh-heavy' },
  { src: 'Swirl', id: 'swirl', label: 'Swirl', seconds: 0.6, looks: 'Both shots twist around the centre while crossfading.', use: 'Dreams, dizzy fun, a magical jump.', cue: 'whoosh-soft', polish: { blur: 0.2, split: 0.6 } },
  { src: 'crosswarp', id: 'cross-warp', label: 'Cross warp', seconds: 0.55, looks: 'The shots melt into each other with a warped crossfade.', use: 'Smooth, trippy, a memory or time shift.', cue: null, polish: { blur: 0.15, split: 0 } },
  { src: 'directionalwarp', id: 'warp-wipe', label: 'Warp wipe', seconds: 0.5, looks: 'A diagonal wipe with a smeared, warped edge.', use: 'Stylish sequence changes; fashion, travel.', cue: 'whoosh-soft', polish: { blur: 0.25, split: 0.7 } },
  { src: 'GlitchMemories', id: 'glitch-memories', label: 'Glitch memories', seconds: 0.45, looks: 'Blocky colour-split glitch tears one shot into the next.', use: 'Tech, night, flashbacks with an edge.', cue: 'glitch', polish: { blur: 0, split: 0 } },
  { src: 'StripDatamoshGlitch', id: 'datamosh', label: 'Datamosh strips', seconds: 0.45, looks: 'Horizontal strips smear and slip into the next shot like a corrupted file.', use: 'Hype beats, gaming, music-video cuts.', cue: 'glitch', polish: { blur: 0, split: 0 } },
  { src: 'Dreamy', id: 'dreamy-wave', label: 'Dreamy wave', seconds: 0.6, looks: 'The shot sways in soft waves and colour-fades into the next.', use: 'Soft, romantic, golden-hour passages.', cue: null, polish: { blur: 0.1, split: 0 } },
  { src: 'DreamyZoom', id: 'dreamy-zoom', label: 'Dreamy zoom', seconds: 0.6, looks: 'A gentle rotating zoom with ghosting into the next shot.', use: 'Dreamy arrivals, memories, travel openings.', cue: 'whoosh-soft', polish: { blur: 0.2, split: 0.4 } },
  { src: 'hexagonalize', id: 'hexagonalize', label: 'Hexagons', seconds: 0.55, looks: 'The shot breaks into hexagon cells that swap to the next shot.', use: 'Tech, sci-fi, a clean digital cut.', cue: 'glitch', polish: { blur: 0, split: 0 } },
  { src: 'kaleidoscope', id: 'kaleido-spin', label: 'Kaleidoscope', seconds: 0.55, looks: 'The picture folds into a spinning kaleidoscope and unfolds as the next shot.', use: 'Psychedelic, festival, party, a big drop. Use once.', cue: 'whoosh', polish: { blur: 0.06, split: 0.3 } },
  { src: 'WaterDrop', id: 'water-drop', label: 'Water drop', seconds: 0.6, looks: 'A drop hits the middle and rings spread out, revealing the next shot.', use: 'Water, calm, a clean reveal.', cue: null, polish: { blur: 0.15, split: 0.3 } },
  { src: 'windowslice', id: 'window-slice', label: 'Window slice', seconds: 0.5, looks: 'Vertical slats slide away to show the next shot.', use: 'Architecture, clean modern edits.', cue: 'whoosh', polish: { blur: 0.3, split: 0.7 } },
  { src: 'morph', id: 'morph', label: 'Colour morph', seconds: 0.55, looks: 'The colours of one shot pull the pixels into the next.', use: 'Smooth, organic mood shifts.', cue: null, polish: { blur: 0.1, split: 0 } },
  { src: 'wind', id: 'wind', label: 'Wind streaks', seconds: 0.45, looks: 'Streaks of wind blow the first shot away.', use: 'Speed, nature, outdoor sport, travel.', cue: 'whoosh', polish: { blur: 0.2, split: 0.4 } },
  { src: 'TVStatic', id: 'tv-static', label: 'TV static', seconds: 0.4, looks: 'Noise snow takes over the screen and clears to the next shot.', use: 'Retro, horror, found footage, a jump scare.', cue: 'glitch' },
  { src: 'old_tv_lost_signal', id: 'lost-signal', label: 'Lost signal', seconds: 0.5, looks: 'An old TV loses signal: bars, rolling lines, then the next shot.', use: 'Retro, nostalgia, a 90s joke.', cue: 'glitch' },
  { src: 'burn', id: 'colour-burn', label: 'Colour burn', seconds: 0.55, looks: 'The shot burns away in a hot colour into the next.', use: 'Heat, intensity, a dramatic beat.', cue: 'whoosh-soft', polish: { blur: 0, split: 0 } },
  { src: 'undulatingBurnOut', id: 'burn-out', label: 'Burn out', seconds: 0.6, looks: 'A glowing wave burns the shot away from the centre.', use: 'Action, fire, a big reveal.', cue: 'whoosh-heavy', polish: { blur: 0.15, split: 0.3 } },
  { src: 'LinearBlur', id: 'linear-blur', label: 'Linear blur', seconds: 0.4, looks: 'A fast blur smears the shot into the next.', use: 'Quick, soft cuts between similar shots.', cue: 'whoosh-soft', polish: { blur: 0, split: 0 } },
  { src: 'DoomScreenTransition', id: 'doom-melt', label: 'Screen melt', seconds: 0.7, looks: 'The shot melts down the screen in uneven columns, like the Doom wipe.', use: 'Gaming, a punchline, a joke.', cue: 'whoosh', polish: { blur: 0.2, split: 0.4 } },
  { src: 'circleopen', id: 'iris-open', label: 'Iris open', seconds: 0.5, looks: 'A soft-edged iris opens (or closes) onto the next shot.', use: 'Reveals; a focus on one place; film feel.', cue: 'whoosh-soft', polish: { blur: 0.2, split: 0.5 } },
  { src: 'flyeye', id: 'fly-eye', label: 'Fly eye', seconds: 0.55, looks: 'The shot splits into a bulging fly-eye lens grid.', use: 'Trippy, party, surreal.', cue: 'whoosh', polish: { blur: 0.15, split: 0.4 } },
  { src: 'perlin', id: 'noise-dissolve', label: 'Noise dissolve', seconds: 0.55, looks: 'The next shot appears through organic noise blobs.', use: 'Smooth, modern; works for any mood.', cue: null, polish: { blur: 0.15, split: 0 } },
  { src: 'rotate_scale_fade', id: 'rotate-fade', label: 'Rotate fade', seconds: 0.55, looks: 'The shot rotates and scales while fading into the next.', use: 'Lively, playful and dreamy cuts.', cue: 'whoosh', polish: { blur: 0.3, split: 0.7 } },
  { src: 'squeeze', id: 'squeeze', label: 'Squeeze', seconds: 0.5, looks: 'The shot is squeezed to a line and the next shot springs open.', use: 'Quick, bouncy beat cuts.', cue: 'whoosh', polish: { blur: 0.3, split: 0.7 } },
];

// Hand-written ports (src = the transition's id in GTKottman/remotion-transitions). The colour covers use fixed colours
// (the orange of dip-to-colour, blue-black ink): a colour taken from the moving next shot drifted visibly during the hold.
const OWN: Entry[] = [
  { src: 'film-burn', id: 'burn-holes', label: 'Burn holes', seconds: 0.8, looks: 'Holes burn through the shot with white-hot cores and glowing orange rims, hold white, then burn open onto the next shot.', use: 'Vintage, film, a dramatic chapter change. Once a reel.', cue: 'whoosh-heavy' },
  { src: 'flare-sweep', id: 'flare-sweep', label: 'Flare sweep', seconds: 0.5, looks: 'A blue anamorphic lens flare streaks across and blooms to white; the cut hides in the bloom.', use: 'Night, city lights, cinematic travel, a hero arrival.', cue: 'whoosh' },
  { src: 'paper-tear', id: 'paper-tear', label: 'Paper tear', seconds: 0.6, looks: 'The shot tears down a ragged line with white paper edges and the halves pull apart onto the next shot.', use: 'Scrapbook, journals, a before/after split, a playful reveal.', cue: 'whoosh' },
  { src: 'liquid-warp', id: 'liquid-warp', label: 'Liquid warp', seconds: 0.6, looks: 'The picture ripples like liquid, with a colour fringe, and settles as the next shot.', use: 'Dreamy, trippy, water, a memory or a heat haze.', cue: 'whoosh-soft' },
  { src: 'split-slices', id: 'split-slices', label: 'Split slices', seconds: 0.5, looks: 'The shot is cut into horizontal strips that slide off left and right in turn, motion-blurred, over the next shot.', use: 'Hype beats, fashion, a fast list of places.', cue: 'whoosh' },
  { src: 'ink-bleed', id: 'ink-bleed', label: 'Ink bleed', seconds: 1, looks: 'Drops of blue-black ink land and spread with fibrous edges until the screen is covered, then the next shot bleeds back through.', use: 'A section break, art, handmade or luxe stories. Once a reel.', cue: 'whoosh-soft' },
  { src: 'paint-drip', id: 'paint-drip', label: 'Paint drip', seconds: 0.9, looks: 'Orange paint pours down from the top with dripping runs, then slides off the bottom onto the next shot.', use: 'A section break; colourful, playful, creative stories. Once a reel.', cue: 'whoosh' },
  { src: 'liquid-fill', id: 'liquid-fill', label: 'Liquid fill', seconds: 1.1, looks: 'Orange liquid cells bloom and merge until the screen is flooded, then open in cells onto the next shot.', use: 'A section break; bold, modern, music-video energy. Once a reel.', cue: 'whoosh-soft' },
  { src: 'swoosh-lines', id: 'swoosh-lines', label: 'Swoosh lines', seconds: 0.8, looks: 'Diagonal rounded ribbons in near-black and orange swoosh across and cover, then swoosh off onto the next shot.', use: 'A section break, sport, energetic intros. Once a reel.', cue: 'whoosh-heavy' },
  { src: 'portal-zoom', id: 'portal-zoom', label: 'Portal zoom', seconds: 0.7, looks: 'A round portal pops open showing the next shot and the camera flies through it.', use: 'Entering a place, a reveal, travel arrivals.', cue: 'whoosh-heavy' },
  { src: 'strobe-cut', id: 'strobe-cut', label: 'Strobe cut', seconds: 0.4, looks: 'The two shots flicker back and forth faster and faster with a flash on each swap, landing on the next.', use: 'Build-ups, a drop, hype, nights out.', cue: 'shutter' },
];

const root = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: import-gl-transitions.mts <gl-transitions checkout>');
const outDir = resolve(import.meta.dirname, '../../src/gl/shaders/glt');
mkdirSync(outDir, { recursive: true });

function wrap(entry: Entry): string {
  const raw = readFileSync(join(root, 'transitions', `${entry.src}.glsl`), 'utf8').replace(/\r\n?/g, '\n');
  if (/sampler2D|sampler3D/.test(raw.replace(/\/\/.*$/gm, '').replace(/getFromColor|getToColor/g, ''))) throw new Error(`${entry.src} needs a texture`);
  const lines = raw.split('\n').map((line) => {
    const u = line.match(/^\s*uniform\s+(\w+)\s+(\w+)\s*(?:;\s*\/\/\s*=\s*(.+?)|\s*\/\*\s*=\s*(.+?)\s*\*\/\s*;)\s*$/);
    if (u) {
      // GL Transitions write float defaults as ints ("// = 8"); GLSL ES will not convert them
      const value = (u[3] ?? u[4])!;
      return `const ${u[1]} ${u[2]} = ${u[1] === 'float' && /^-?\d+$/.test(value) ? `${value}.0` : value};`;
    }
    if (/^\s*uniform\s/.test(line)) throw new Error(`${entry.src}: uniform without a default: ${line.trim()}`);
    return line.replace(/\btexture2D\b/g, 'texture');
  });
  return [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    '',
    `// ${entry.label} (Reels). ${entry.looks} ${entry.use}`,
    `// Adapted from GL Transitions "${entry.src}" (MIT, gl-transitions contributors): wrapped in the two-input contract,`,
    '// tunable uniforms fixed at their defaults. Regenerate with server/reelsmith/import-gl-transitions.mts.',
    'uniform sampler2D u_outgoing;',
    'uniform sampler2D u_incoming;',
    'uniform float u_progress;',
    'uniform float u_aspect;',
    '',
    'in vec2 v_texCoord;',
    'out vec4 fragColor;',
    '',
    'float progress;',
    'float ratio;',
    'vec4 getFromColor(vec2 uv) { return texture(u_outgoing, uv); }',
    'vec4 getToColor(vec2 uv) { return texture(u_incoming, uv); }',
    '',
    '// ---- GL Transitions source ----',
    ...lines,
    '// ---- end ----',
    '',
    ...(entry.polish ? polished(entry.polish) : [
      'void main() {',
      '  progress = u_progress;',
      '  ratio = u_aspect;',
      '  fragColor = vec4(transition(v_texCoord).rgb, 1.0);',
      '}',
    ]),
    '',
  ].join('\n');
}

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);
function polished({ blur, split }: Polish): string[] {
  return [
    '// ---- Reelsmith polish: ease-in-out timing, motion blur over nearby moments, colour fringe along the motion ----',
    `const float RS_BLUR = ${f(blur)};`,
    `const float RS_SPLIT = ${f(split)};`,
    'const int RS_TAPS = 7;',
    'float rs_ease(float p) { return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; }',
    'float rs_speed(float p) { float q = min(p, 1.0 - p); return 4.0 * q * q; }   // the ease\'s slope, 1 at the middle',
    'vec3 rs_at(float t) { progress = t; return transition(v_texCoord).rgb; }',
    '',
    'void main() {',
    '  ratio = u_aspect;',
    '  float e = rs_ease(u_progress);',
    '  float spread = RS_BLUR * rs_speed(u_progress);',
    '  if (spread <= 0.0) { fragColor = vec4(rs_at(e), 1.0); return; }',
    '  vec3 acc = vec3(0.0), wsum = vec3(0.0);',
    '  for (int i = 0; i < RS_TAPS; i++) {',
    '    float k = float(i) / float(RS_TAPS - 1) - 0.5;',
    '    vec3 w = vec3(1.0 + RS_SPLIT * 2.0 * k, 1.0, 1.0 - RS_SPLIT * 2.0 * k);   // red leans ahead, blue behind',
    '    acc += rs_at(clamp(e + k * spread, 0.0, 1.0)) * w;',
    '    wsum += w;',
    '  }',
    '  fragColor = vec4(acc / wsum, 1.0);',
    '}',
  ];
}

const ok: Entry[] = [];
for (const entry of LIST) {
  try {
    writeFileSync(join(outDir, `${entry.id}.frag`), wrap(entry));
    ok.push(entry);
  } catch (e) {
    console.warn(`skipped ${entry.src}: ${(e as Error).message}`);
  }
}

for (const entry of OWN) {
  const src = join(outDir, `${entry.id}.frag`);
  if (!existsSync(src) || !readFileSync(src, 'utf8').includes(`remotion-transitions "${entry.src}"`)) throw new Error(`${entry.id}: hand-written port missing or uncredited`);
  ok.push(entry);
}

const camel = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
writeFileSync(join(outDir, 'frags.ts'), [
  '// GENERATED by server/reelsmith/import-gl-transitions.mts — do not edit.',
  ...ok.map((e) => `import ${camel(e.id)} from './${e.id}.frag.ts';`),
  '',
  'export const GLT_FRAGS = {',
  ...ok.map((e) => `  '${e.id}': ${camel(e.id)},`),
  '} as const;',
  '',
].join('\n'));

const q = (s: string) => JSON.stringify(s);
writeFileSync(resolve(import.meta.dirname, '../../src/reelsmith/glTransitionsMeta.ts'), [
  '// GENERATED by server/reelsmith/import-gl-transitions.mts — do not edit. Transitions adapted from GL Transitions (MIT)',
  '// and ported from GTKottman/remotion-transitions (MIT).',
  'export const GLT_TRANSITIONS = [',
  ...ok.map((e) => `  { id: ${q(e.id)}, label: ${q(e.label)}, seconds: ${e.seconds}, looks: ${q(e.looks)}, use: ${q(e.use)}, cue: ${q(e.cue)} },`),
  '] as const;',
  '',
  'export type GltTransitionId = (typeof GLT_TRANSITIONS)[number][\'id\'];',
  '',
].join('\n'));
console.log(`wrote ${ok.length} transitions`);
