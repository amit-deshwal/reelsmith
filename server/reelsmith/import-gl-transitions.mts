// Imports a curated set of GL Transitions (https://github.com/gl-transitions/gl-transitions, MIT) as Reels transitions.
//   npx tsx server/reelsmith/import-gl-transitions.mts <path to a gl-transitions checkout>
// Each shader is wrapped in our two-input contract (u_outgoing / u_incoming / u_progress / u_aspect), its tunable
// uniforms become constants at their default, and three generated files are written:
//   src/gl/shaders/glt/<id>.frag        the wrapped shader (run scripts/sync-shader-sources.mjs for the .frag.ts twin)
//   src/gl/shaders/glt/frags.ts         id → source
//   src/reelsmith/glTransitionsMeta.ts  ids, labels, lengths, director text and sound cues
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Cue = 'whoosh' | 'whoosh-soft' | 'whoosh-heavy' | 'glitch' | 'pop' | 'shutter' | 'hit' | null;
interface Entry { src: string; id: string; label: string; seconds: number; looks: string; use: string; cue: Cue }

const LIST: Entry[] = [
  { src: 'CrossZoom', id: 'cross-zoom', label: 'Cross zoom', seconds: 0.45, looks: 'Zoom blur streaks into the next shot.', use: 'Energy, drops, arrivals; the classic punchy cut.', cue: 'whoosh-heavy' },
  { src: 'Swirl', id: 'swirl', label: 'Swirl', seconds: 0.6, looks: 'Both shots twist around the centre while crossfading.', use: 'Dreams, dizzy fun, a magical jump.', cue: 'whoosh-soft' },
  { src: 'crosswarp', id: 'cross-warp', label: 'Cross warp', seconds: 0.55, looks: 'The shots melt into each other with a warped crossfade.', use: 'Smooth, trippy, a memory or time shift.', cue: null },
  { src: 'directionalwarp', id: 'warp-wipe', label: 'Warp wipe', seconds: 0.5, looks: 'A diagonal wipe with a smeared, warped edge.', use: 'Stylish sequence changes; fashion, travel.', cue: 'whoosh-soft' },
  { src: 'GlitchMemories', id: 'glitch-memories', label: 'Glitch memories', seconds: 0.45, looks: 'Blocky colour-split glitch tears one shot into the next.', use: 'Tech, night, flashbacks with an edge.', cue: 'glitch' },
  { src: 'StripDatamoshGlitch', id: 'datamosh', label: 'Datamosh strips', seconds: 0.45, looks: 'Horizontal strips smear and slip into the next shot like a corrupted file.', use: 'Hype beats, gaming, music-video cuts.', cue: 'glitch' },
  { src: 'Dreamy', id: 'dreamy-wave', label: 'Dreamy wave', seconds: 0.6, looks: 'The shot sways in soft waves and colour-fades into the next.', use: 'Soft, romantic, golden-hour passages.', cue: null },
  { src: 'DreamyZoom', id: 'dreamy-zoom', label: 'Dreamy zoom', seconds: 0.6, looks: 'A gentle rotating zoom with ghosting into the next shot.', use: 'Dreamy arrivals, memories, travel openings.', cue: 'whoosh-soft' },
  { src: 'hexagonalize', id: 'hexagonalize', label: 'Hexagons', seconds: 0.55, looks: 'The shot breaks into hexagon cells that swap to the next shot.', use: 'Tech, sci-fi, a clean digital cut.', cue: 'glitch' },
  { src: 'kaleidoscope', id: 'kaleido-spin', label: 'Kaleidoscope', seconds: 0.55, looks: 'The picture folds into a spinning kaleidoscope and unfolds as the next shot.', use: 'Psychedelic, festival, party, a big drop. Use once.', cue: 'whoosh' },
  { src: 'PolkaDotsCurtain', id: 'polka-dots', label: 'Polka dots', seconds: 0.55, looks: 'The next shot grows through a grid of round dots.', use: 'Playful, colourful, kids, food, summer.', cue: 'pop' },
  { src: 'Radial', id: 'radial-sweep', label: 'Radial sweep', seconds: 0.5, looks: 'A clock hand sweeps round and reveals the next shot.', use: 'Time passing, countdowns, day to night.', cue: 'whoosh-soft' },
  { src: 'WaterDrop', id: 'water-drop', label: 'Water drop', seconds: 0.6, looks: 'A drop hits the middle and rings spread out, revealing the next shot.', use: 'Water, calm, a clean reveal.', cue: null },
  { src: 'windowslice', id: 'window-slice', label: 'Window slice', seconds: 0.5, looks: 'Vertical slats slide away to show the next shot.', use: 'Architecture, clean modern edits.', cue: 'whoosh' },
  { src: 'squareswire', id: 'squares-wire', label: 'Squares wire', seconds: 0.5, looks: 'A grid of squares swaps to the next shot in a diagonal wave.', use: 'Tech, collage, playful beat cuts.', cue: 'pop' },
  { src: 'BookFlip', id: 'book-flip', label: 'Book flip', seconds: 0.6, looks: 'The shot flips like a book page to the next.', use: 'Diaries, storybooks, day 1 → day 2.', cue: 'whoosh-soft' },
  { src: 'doorway', id: 'doorway', label: 'Doorway', seconds: 0.6, looks: 'The shot opens like double doors onto the next.', use: 'Entering a place, a reveal, a new scene.', cue: 'whoosh-soft' },
  { src: 'Fold', id: 'fold', label: 'Fold', seconds: 0.5, looks: 'The shot folds away sideways like paper.', use: 'Clean, editorial changes.', cue: 'whoosh-soft' },
  { src: 'morph', id: 'morph', label: 'Colour morph', seconds: 0.55, looks: 'The colours of one shot pull the pixels into the next.', use: 'Smooth, organic mood shifts.', cue: null },
  { src: 'wind', id: 'wind', label: 'Wind streaks', seconds: 0.45, looks: 'Streaks of wind blow the first shot away.', use: 'Speed, nature, outdoor sport, travel.', cue: 'whoosh' },
  { src: 'TVStatic', id: 'tv-static', label: 'TV static', seconds: 0.4, looks: 'Noise snow takes over the screen and clears to the next shot.', use: 'Retro, horror, found footage, a jump scare.', cue: 'glitch' },
  { src: 'old_tv_lost_signal', id: 'lost-signal', label: 'Lost signal', seconds: 0.5, looks: 'An old TV loses signal: bars, rolling lines, then the next shot.', use: 'Retro, nostalgia, a 90s joke.', cue: 'glitch' },
  { src: 'burn', id: 'colour-burn', label: 'Colour burn', seconds: 0.55, looks: 'The shot burns away in a hot colour into the next.', use: 'Heat, intensity, a dramatic beat.', cue: 'whoosh-soft' },
  { src: 'undulatingBurnOut', id: 'burn-out', label: 'Burn out', seconds: 0.6, looks: 'A glowing wave burns the shot away from the centre.', use: 'Action, fire, a big reveal.', cue: 'whoosh-heavy' },
  { src: 'heart', id: 'heart-wipe', label: 'Heart wipe', seconds: 0.55, looks: 'The next shot opens inside a growing heart.', use: 'Love, weddings, couples, Valentine posts.', cue: 'pop' },
  { src: 'StarWipe', id: 'star-wipe', label: 'Star wipe', seconds: 0.55, looks: 'The next shot opens inside a growing star.', use: 'Celebration, kids, a retro joke.', cue: 'pop' },
  { src: 'LinearBlur', id: 'linear-blur', label: 'Linear blur', seconds: 0.4, looks: 'A fast blur smears the shot into the next.', use: 'Quick, soft cuts between similar shots.', cue: 'whoosh-soft' },
  { src: 'DoomScreenTransition', id: 'doom-melt', label: 'Screen melt', seconds: 0.7, looks: 'The shot melts down the screen in uneven columns, like the Doom wipe.', use: 'Gaming, a punchline, a joke.', cue: 'whoosh' },
  { src: 'circleopen', id: 'iris-open', label: 'Iris open', seconds: 0.5, looks: 'A soft-edged iris opens (or closes) onto the next shot.', use: 'Reveals; a focus on one place; film feel.', cue: 'whoosh-soft' },
  { src: 'flyeye', id: 'fly-eye', label: 'Fly eye', seconds: 0.55, looks: 'The shot splits into a bulging fly-eye lens grid.', use: 'Trippy, party, surreal.', cue: 'whoosh' },
  { src: 'perlin', id: 'noise-dissolve', label: 'Noise dissolve', seconds: 0.55, looks: 'The next shot appears through organic noise blobs.', use: 'Smooth, modern; works for any mood.', cue: null },
  { src: 'angular', id: 'angular-wipe', label: 'Angular wipe', seconds: 0.5, looks: 'A radial wipe from the edge sweeps round the frame.', use: 'Clean, graphic change of place.', cue: 'whoosh-soft' },
  { src: 'rotate_scale_fade', id: 'rotate-fade', label: 'Rotate fade', seconds: 0.55, looks: 'The shot rotates and scales while fading into the next.', use: 'Lively, playful and dreamy cuts.', cue: 'whoosh' },
  { src: 'Bounce', id: 'bounce-drop', label: 'Bounce drop', seconds: 0.7, looks: 'The shot drops and bounces off screen, with a shadow.', use: 'Comedy, a playful punchline.', cue: 'hit' },
  { src: 'pinwheel', id: 'pinwheel', label: 'Pinwheel', seconds: 0.5, looks: 'A pinwheel sweep turns the next shot in.', use: 'Playful, summer, a spin of fun.', cue: 'whoosh-soft' },
  { src: 'squeeze', id: 'squeeze', label: 'Squeeze', seconds: 0.5, looks: 'The shot is squeezed to a line and the next shot springs open.', use: 'Quick, bouncy beat cuts.', cue: 'whoosh' },
  { src: 'crosshatch', id: 'crosshatch', label: 'Crosshatch', seconds: 0.6, looks: 'The next shot is drawn in with crosshatch lines.', use: 'Art, sketchbooks, handmade stories.', cue: null },
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
    'void main() {',
    '  progress = u_progress;',
    '  ratio = u_aspect;',
    '  fragColor = vec4(transition(v_texCoord).rgb, 1.0);',
    '}',
    '',
  ].join('\n');
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
  '// GENERATED by server/reelsmith/import-gl-transitions.mts — do not edit. Transitions adapted from GL Transitions (MIT).',
  'export const GLT_TRANSITIONS = [',
  ...ok.map((e) => `  { id: ${q(e.id)}, label: ${q(e.label)}, seconds: ${e.seconds}, looks: ${q(e.looks)}, use: ${q(e.use)}, cue: ${q(e.cue)} },`),
  '] as const;',
  '',
  'export type GltTransitionId = (typeof GLT_TRANSITIONS)[number][\'id\'];',
  '',
].join('\n'));
console.log(`wrote ${ok.length} transitions`);
