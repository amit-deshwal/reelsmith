// Director catalogue (RS-1202): the clip effects and transitions the director may put on a section, each with what it
// looks like and when it fits, so the agent chooses by judgement rather than by name. Effects are the editor's own
// (src/gl/fx); this file only describes them for directing. Params are the effect's own (checked against its def).
import { ALL_FX } from '../../gl/fx/effects';
import { RECIPE_TRANSITIONS } from '../assembler/transitions';
import { GLT_TRANSITIONS } from '../glTransitionsMeta';

export type EffectGroup = 'grade' | 'texture' | 'lens' | 'motion' | 'stylise' | 'person' | 'retro' | 'frame';

export interface DirectorEffect { id: string; group: EffectGroup; looks: string; use: string; person?: boolean }

const fx = (id: string, group: EffectGroup, looks: string, use: string, person = false): DirectorEffect => ({ id: `builtin:fx-${id}`, group, looks, use, ...(person ? { person } : {}) });

export const DIRECTOR_EFFECTS: readonly DirectorEffect[] = [
  // grade and light
  fx('halation', 'grade', 'Warm red-orange glow around highlights, like cinema film.', 'Golden hour, sunsets, city lights; a filmic travel feel.'),
  fx('pro-mist', 'grade', 'Soft diffusion glow; highlights bloom, blacks lift.', 'Dreamy, nostalgic, romantic moments.'),
  fx('bloom', 'grade', 'Bright areas spill light.', 'Sun, water sparkle, night lights.'),
  fx('light-rays', 'grade', 'God rays streaming from bright areas.', 'Sun through trees, fog, a summit at sunrise.'),
  fx('anamorphic-flare', 'lens', 'Long horizontal blue streaks from lights.', 'Night city, car lights, a cinematic hero shot.'),
  fx('light-leak', 'grade', 'Drifting film light leak bands.', 'Warm memories, an intro or outro, between happy moments.'),
  fx('sky-recover', 'grade', 'A washed-out sky gets its blue and clouds back; the land is untouched.', 'Bright phone skies on treks, beaches, viewpoints.'),
  fx('sky-swap', 'grade', 'The sky becomes a sunset or deep blue with drifting clouds (params style 0/1).', 'A flat white sky on a hero view; only when the reel asks for it.'),
  fx('duotone', 'stylise', 'Shadows and highlights mapped to two colours.', 'A bold graphic section, title backgrounds, fashion.'),
  fx('sepia', 'retro', 'Brown vintage tint.', 'Flashbacks, old stories.'),
  fx('soft-vignette', 'grade', 'Gently darker corners.', 'Any shot that needs focus on the middle; safe everywhere.'),
  fx('vignette', 'grade', 'Strong darkened edges.', 'Moody, dramatic close-ups.'),
  fx('fine-grain', 'texture', 'Fine film grain.', 'Make clean phone footage feel filmic; subtle.'),
  fx('film-grain', 'texture', 'Animated heavier grain.', 'Gritty, raw, documentary.'),
  // lens and motion
  fx('zoom-blur', 'motion', 'Radial streaks of a fast push-in.', 'Impact on the drop, entering a new place, speed.'),
  fx('motion-blur', 'motion', 'Directional smear.', 'Speed: running, driving, riding.'),
  fx('shake', 'motion', 'Handheld camera shake and drift.', 'Energy, chaos, adrenaline (rides, crowds, climbs).'),
  fx('lens-distortion', 'lens', 'Barrel warp with colour fringe at the edges.', 'Action cams, skate, wide POV energy.'),
  fx('fisheye', 'lens', 'Strong fisheye bulge.', 'Skate, goofy friends, POV fun.'),
  fx('tilt-shift', 'lens', 'Miniature look: a sharp band, blurred top and bottom.', 'Towns, crowds, roads seen from above: "tiny world".'),
  fx('water-ripple', 'motion', 'Picture wobbles as through water or heat.', 'Dreams, heat, underwater, transitions into memory.'),
  fx('swirl', 'motion', 'Picture twists around a point.', 'Psychedelic or dizzy moments; short.'),
  fx('bounce', 'motion', 'The picture punches in with a little stretch and settles.', 'Give it timing "beat": the shot bounces on every beat (dance, hype, a drop).'),
  fx('blackout', 'motion', 'The picture drops to black and comes back.', 'Timing "beat" with every 1-2: black strobes on the beats; a dark, dramatic build.'),
  fx('sparkle', 'grade', 'Star glints twinkle on the brightest points.', 'Sun on water, jewellery, city lights, a "magical" moment.'),
  fx('flare-sweep', 'lens', 'A sun lens flare drifts across the top with a streak and ghosts.', 'Golden hour, beach, drone and wide outdoor shots; an intro.'),
  fx('cinema-bars', 'frame', 'Letterbox bars top and bottom.', 'A cinematic hero moment, the opening or ending.'),
  // stylise
  fx('glitch', 'stylise', 'Slice offsets and colour flashes.', 'Tech, night out, beat drops; short bursts.'),
  fx('rgb-split', 'stylise', 'Colour channel offset.', 'Hype, music beats, cyber looks.'),
  fx('kaleidoscope', 'stylise', 'Mirrored radial pattern.', 'Festivals, trippy music, lights.'),
  fx('mirror', 'stylise', 'Left-right or top-bottom mirror.', 'Symmetry shots, dance, surreal architecture.'),
  fx('edge-glow', 'stylise', 'Glowing coloured outlines.', 'Night, neon, dance, rave.'),
  fx('pixelate', 'stylise', 'Big pixel blocks.', 'Gaming, retro, a censor joke.'),
  fx('posterize', 'stylise', 'Fewer colour levels, poster look.', 'Graphic, pop-art sections.'),
  fx('halftone', 'stylise', 'Printed dot pattern.', 'Comic, zine, pop-art.'),
  fx('cartoon', 'stylise', 'Flat colours with ink outlines.', 'Funny moments, comic storytelling.'),
  fx('pencil-sketch', 'stylise', 'Pencil drawing on paper.', 'Memories, "how it started", plans and maps.'),
  fx('watercolor', 'stylise', 'Soft watercolour washes.', 'Gentle travel diaries, nature, calm.'),
  fx('crayon', 'stylise', 'Wax crayon on paper.', 'Kids, playful family moments.'),
  fx('cut-paper', 'stylise', 'Built from cut coloured paper.', 'Crafty, playful scrapbook stories.'),
  fx('riso', 'stylise', 'Two-ink risograph zine print.', 'Indie, art, cafe and street culture.'),
  fx('thermal', 'stylise', 'Heat-camera colours.', 'Hot places, workouts, a surprising drop.'),
  fx('frame-division', 'stylise', 'Frame cut into slabs, each its own crop.', 'Hype edits, fashion, energetic montage.'),
  fx('scrapbook-paper', 'frame', 'The clip as a taped tilted photo on paper.', 'Memories, photo-dump moments, holidays.'),
  fx('crayon-doodles', 'stylise', 'Crayon doodles scribbled over the picture.', 'Playful, kids, birthdays, friends.'),
  // retro
  fx('vhs', 'retro', 'Worn VHS tape: wobble, colour bleed, tracking noise.', 'Throwbacks, childhood, funny old-style moments.'),
  fx('film-damage', 'retro', 'Old projected film: dust, scratches, flicker.', 'Flashbacks, vintage travel, memories.'),
  fx('crt', 'retro', 'Old TV screen: scanlines, curvature.', 'Gaming, retro tech, "breaking news" jokes.'),
  // person (need a person clearly in the shot)
  fx('subject-pop', 'person', 'The person stays vivid with a glowing rim; the background goes dark and grey.', 'Introduce a person, the hero moment, "main character".', true),
  fx('echo-trails', 'person', 'The person leaves coloured afterimages as they move.', 'Dance, sport, jumps, any big movement.', true),
  fx('echo-copies', 'person', 'Tinted clones of the person step out on the beat.', 'Dance, confident walks, a squad intro.', true),
  fx('sticker', 'person', 'The person as a glossy die-cut sticker.', 'Playful intros, friends, kids.', true),
  fx('mixmedia-cutout', 'person', 'The person as a paper cut-out with crayon doodles behind.', 'Playful, artsy intros.', true),
  fx('double-exposure', 'person', 'The person\'s silhouette filled with the scene.', 'Reflective, poetic moments; an ending.', true),
  fx('glass-person', 'person', 'The person turns to refracting glass.', 'Surreal, dreamy, fashion.', true),
  fx('predator', 'person', 'The person glows hot on a cold dark scene.', 'Night, action, a dramatic reveal.', true),
  fx('silhouette', 'person', 'The person as a flat colour shape on colour.', 'Graphic poster moment, titles.', true),
  fx('light-trails', 'person', 'Light streaks stretch off the person.', 'Speed, dance, celebration.', true),
  fx('card-breakout', 'person', 'The video becomes a card and the person steps out of it.', 'An intro or reveal of the main person.', true),
  fx('orbital-screens', 'person', 'Small screens orbit the person.', 'Tech, creators, a futuristic intro.', true),
];

export const directorEffectById = (id: string) => DIRECTOR_EFFECTS.find((e) => e.id === id || e.id === `builtin:fx-${id}`);

/** The effect's own params as the director sees them (key, range, default). */
export function effectParams(id: string): Array<{ id: string; label: string; default: number | number[]; min?: number; max?: number }> {
  const def = ALL_FX[id];
  return (def?.props ?? []).filter((p) => p.key !== 'detect').map((p) => ({ id: p.key, label: p.label, default: p.default, ...('min' in p && typeof p.min === 'number' ? { min: p.min, max: p.max } : {}) }));
}

export interface DirectorTransition { id: string; looks: string; use: string }

export const DIRECTOR_TRANSITIONS: readonly DirectorTransition[] = [
  { id: 'crossfade', looks: 'Soft dissolve.', use: 'Calm passage of time, gentle stories.' },
  { id: 'dipToBlack', looks: 'Fades through black.', use: 'A new day, a chapter break, the ending.' },
  { id: 'dipToWhite', looks: 'Flashes through white.', use: 'A memory, a dreamy jump, a bright reveal.' },
  { id: 'flash', looks: 'Quick white flash on the cut.', use: 'Beat hits, camera-shutter feel, hype.' },
  { id: 'slideLeft', looks: 'Whip pan sideways.', use: 'Moving to the next place or person; energetic travel.' },
  { id: 'zoomIn', looks: 'Anticipation push into the next shot.', use: 'Building up to something; entering a place.' },
  { id: 'zoom-through', looks: 'Zooms through the frame into the next shot.', use: 'Drops, arrivals, high energy.' },
  { id: 'whip-blur', looks: 'Fast motion-blurred whip.', use: 'Quick travel cuts, action.' },
  { id: 'swipe-up', looks: 'The shot whips up out of frame with motion blur and the next comes up from below, like swiping the feed.', use: 'The native Reels cut: next place, next outfit, next day; a run of quick vertical swipes on the beat.' },
  { id: 'swipe-down', looks: 'The same whip, downward: the next shot drops in from above.', use: 'Going down (a descent, a jump, a waterfall); answering a swipe-up.' },
  { id: 'spin-zoom', looks: 'Spinning zoom.', use: 'Party, dizzy fun, a big drop. Use once.' },
  { id: 'bars', looks: 'Next shot breaks in through tall bars.', use: 'Rhythmic reveals on the beat.' },
  { id: 'wide-bars', looks: 'Next shot breaks in through wide bars.', use: 'Rhythmic reveals on the beat.' },
  { id: 'window', looks: 'Next shot grows from a window.', use: 'Reveal a view or a place.' },
  { id: 'light-leak', looks: 'Warm light leak wash.', use: 'Warm memories, golden hour, between happy moments.' },
  { id: 'chroma-glitch', looks: 'Colour-split glitch cut.', use: 'Tech, night, hype beats.' },
  { id: 'fluted-glass', looks: 'Through ribbed glass.', use: 'Stylish, fashion, dreamy.' },
  { id: 'ripple-dissolve', looks: 'Watery ripple dissolve.', use: 'Into a memory or a dream; water scenes.' },
  { id: 'tile-pop', looks: 'Next shot pops in as tiles.', use: 'Playful, collage feel.' },
  { id: 'cube-turn', looks: '3D cube turns to the next shot.', use: 'Switching places or people; playful.' },
  { id: 'slide-over', looks: 'Next shot slides over the last.', use: 'Clean, modern sequence of places.' },
  { id: 'pixelate', looks: 'Breaks into big pixels and swaps pixel by pixel.', use: 'Tech, gaming, a censored-joke or "loading" cut.' },
  { id: 'film-burn', looks: 'A warm film burn blooms from a corner; cut under it.', use: 'Vintage travel, memories, a new chapter; once or twice a reel.' },
  { id: 'flip-3d', looks: 'The shot spins away like a card in 3D; the next spins in.', use: 'Sports, fitness, energetic switches on a snare fill.' },
  { id: 'mirror-flip', looks: 'The frame flips like a flat coin on the beat.', use: 'Before/after, outfit or place swaps, the drop.' },
  { id: 'prism-flash', looks: 'A bright band of light with rainbow fringes sweeps across.', use: 'Fashion, nights out, a polished hero cut.' },
  { id: 'brush-wipe', looks: 'Next shot painted on in thick brush strokes.', use: 'Art, journals, handmade or scrapbook stories.' },
  { id: 'silhouette-portal', looks: "The next shot shows inside the person's outline, which grows to fill the frame.", use: 'Out of one clear person into where they went or dream of. Circle wipe if nobody is clear.' },
  ...GLT_TRANSITIONS.map(({ id, looks, use }) => ({ id, looks, use })),
  { id: 'blur-focus', looks: 'Shot blurs out of focus and the next blurs in.', use: 'Flashbacks, memories, a soft change of mood.' },
  { id: 'radial-blur', looks: 'Radial streaks burst from the middle.', use: 'Speed, arrivals, a punchy cut without a zoom.' },
  { id: 'page-curl', looks: 'The shot peels away like a page.', use: 'Diaries, day 1 → day 2, storybook trips.' },
  { id: 'circle-wipe', looks: 'Next shot opens in a growing circle.', use: 'Playful reveals, a focus on one place.' },
  { id: 'light-dissolve', looks: 'Dissolve through soft glowing light.', use: 'Dreamy, calm, sunset passages.' },
  { id: 'impact-shake', looks: 'Hard cut with a camera-jolt shake.', use: 'A hit on the drop, a punchline, an impact.' },
  { id: 'glitch-cut', looks: 'Short digital glitch on the cut.', use: 'Quick techy cut; lighter than chroma-glitch.' },
  { id: 'line-wipe', looks: 'A thin bright line wipes the next shot in.', use: 'Clean, minimal, modern edits.' },
  { id: 'luma-blend', looks: 'Brightest parts of the next shot appear first.', use: 'Night lights, silhouettes, sky to sky.' },
].filter((t) => t.id in RECIPE_TRANSITIONS);
export const directorTransitionById = (id: string) => DIRECTOR_TRANSITIONS.find((t) => t.id === id);
