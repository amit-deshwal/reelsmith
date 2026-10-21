// Director stage 2 (RS-1214): the treatment. Before any plan, the agent decides what the reel is: two concepts and the
// one it picks, the tone, the hero shots, the arc on the song (hook, build, drop, payoff, ending), one signature moment
// and a small kit (text styles, transitions, effects, graphics, look). Planning everything in one hidden pass gave
// plain reels ("this looks so basic", AMK run of 2026-10-21) and styles that fought the story (slam and sparkles on a
// feat the user wanted to feel royal). This checks the treatment against the footage, the song and the tone, and
// returns the full catalogue entries for the kit it chose.
import { catalogKind } from './catalogText';
import { motionAt, type ShotLogClip } from './shotLog';
import { PERSON } from './review';

export const TONES = ['epic', 'royal', 'hype', 'playful', 'funny', 'emotional', 'calm', 'nostalgic', 'romantic', 'moody'] as const;
export type Tone = (typeof TONES)[number];

export const ROLES = ['hook', 'build', 'journey', 'drop', 'peak', 'payoff', 'ending'] as const;

export interface TreatmentPart { role: string; beats: number; move: string; clips?: string[]; line?: string; idea?: string }

export interface Treatment {
  story: string;
  concepts: Array<{ name: string; idea: string }>;
  chosen: number;
  tone: Tone;
  heroes: string[];
  parts: TreatmentPart[];
  signature: string;
  textStyles: string[];
  transitions: string[];
  effects: string[];
  graphics: string[];
  look?: string;
  /** the user asked for lines of the agent's own (a joke, a meme caption) */
  ownWords?: boolean;
}

export interface TreatmentFinding { issue: string; fix: string }

// What each tone wants and what breaks it. Words and effects carry a voice: a bouncing pop caption on a summit the
// user called "a big feat for us" read as childish, sparkles as cheap.
const PLAYFUL_TEXT = ['pop-words', 'wave', 'highlight', 'draw-on'];
const GLITCHY = ['glitch', 'neon', 'glitch-cut', 'chroma-glitch', 'pixelate', 'rgb-split', 'vhs', 'crt', 'prism-flash'];
const CARTOONY = ['cartoon', 'crayon', 'crayon-doodles', 'cut-paper', 'sticker', 'scrapbook-paper', 'halftone', 'posterize', 'riso', 'kaleidoscope', 'mirror', 'thermal', 'predator', 'bounce', 'sparkle'];
const PARTY = ['confetti', 'loading-bar'];
const BOUNCY = ['tile-pop', 'page-curl', 'slide-over', 'cube-turn'];

export const TONE_KIT: Record<Tone, { prefer: string[]; avoid: string[] }> = {
  royal: {
    prefer: ['cinematic-title', 'tracking-in', 'shine', 'rise-lines', 'landscape-title', 'big-title', 'light-dissolve', 'blur-focus', 'dipToBlack', 'zoom-through', 'light-leak', 'film-burn', 'light-rays', 'flare-sweep', 'anamorphic-flare', 'bloom', 'cinema-bars', 'soft-vignette', 'velocity', 'photo-3d', 'hold', 'cards-finale'],
    avoid: [...PLAYFUL_TEXT, ...GLITCHY, ...CARTOONY, ...PARTY, ...BOUNCY, 'slam', 'words-on-beat', 'caption'],
  },
  epic: {
    prefer: ['cinematic-title', 'landscape-title', 'slam', 'rise-lines', 'tracking-in', 'split-reveal', 'zoom-through', 'whip-blur', 'impact-shake', 'radial-blur', 'flash', 'dipToBlack', 'zoom-blur', 'shake', 'light-rays', 'cinema-bars', 'anamorphic-flare', 'velocity', 'speed-ramp', 'strips-reveal', 'zoom-punch'],
    avoid: [...PLAYFUL_TEXT, ...CARTOONY, ...PARTY, ...BOUNCY, 'caption'],
  },
  hype: {
    prefer: ['slam', 'words-on-beat', 'glitch', 'title-shuffle', 'split-reveal', 'neon', 'glitch-cut', 'flash', 'spin-zoom', 'prism-flash', 'impact-shake', 'zoom-through', 'whip-blur', 'rgb-split', 'zoom-blur', 'shake', 'bounce', 'blackout', 'flash-cuts', 'zoom-punch', 'velocity'],
    avoid: ['crossfade', 'light-dissolve', 'pro-mist', 'typewriter', 'watercolor', 'pencil-sketch'],
  },
  playful: {
    prefer: ['pop-words', 'highlight', 'wave', 'follow-tag', 'draw-on', 'words-on-beat', 'sticker', 'annotate', 'chat-bubbles', 'notification', 'slide-over', 'tile-pop', 'whip-blur', 'zoomIn', 'bounce', 'subject-pop', 'freeze-intro', 'photo-stack'],
    avoid: ['cinema-bars', 'film-grain', 'moody-bleach', 'dipToBlack'],
  },
  funny: {
    prefer: ['pop-words', 'highlight', 'follow-tag', 'caption', 'slam', 'annotate', 'sticker', 'chat-bubbles', 'notification', 'loading-bar', 'freeze-intro', 'zoom-punch', 'whip-blur', 'impact-shake', 'bounce', 'subject-pop'],
    avoid: ['cinema-bars', 'light-dissolve', 'crossfade', 'pro-mist', 'moody-bleach'],
  },
  emotional: {
    prefer: ['typewriter', 'rise-lines', 'tracking-in', 'cinematic-title', 'crossfade', 'light-leak', 'blur-focus', 'light-dissolve', 'dipToWhite', 'pro-mist', 'halation', 'soft-vignette', 'fine-grain', 'hold', 'photo-drift', 'photo-3d'],
    avoid: [...PLAYFUL_TEXT, ...GLITCHY, ...CARTOONY, ...PARTY, ...BOUNCY, 'slam', 'words-on-beat', 'flash-cuts', 'zoom-punch', 'shake'],
  },
  calm: {
    prefer: ['typewriter', 'rise-lines', 'tracking-in', 'cinematic-title', 'landscape-title', 'crossfade', 'light-dissolve', 'blur-focus', 'light-leak', 'soft-vignette', 'fine-grain', 'hold', 'photo-drift'],
    avoid: [...PLAYFUL_TEXT, ...GLITCHY, ...CARTOONY, ...PARTY, ...BOUNCY, 'slam', 'words-on-beat', 'flash-cuts', 'zoom-punch', 'shake', 'impact-shake'],
  },
  nostalgic: {
    prefer: ['typewriter', 'draw-on', 'rise-lines', 'camcorder', 'film-burn', 'light-leak', 'dipToWhite', 'blur-focus', 'film-grain', 'sepia', 'vhs', 'film-damage', 'pro-mist', 'photo-stack', 'photo-drift'],
    avoid: ['glitch', 'neon', 'glitch-cut', 'prism-flash', 'chroma-glitch', ...CARTOONY, ...PARTY, 'slam'],
  },
  romantic: {
    prefer: ['typewriter', 'rise-lines', 'tracking-in', 'shine', 'cinematic-title', 'light-leak', 'crossfade', 'blur-focus', 'light-dissolve', 'pro-mist', 'halation', 'bloom', 'photo-3d', 'hold'],
    avoid: [...GLITCHY, ...CARTOONY, 'loading-bar', ...BOUNCY, 'slam', 'flash-cuts', 'shake'],
  },
  moody: {
    prefer: ['cinematic-title', 'tracking-in', 'typewriter', 'dipToBlack', 'luma-blend', 'blur-focus', 'film-burn', 'film-grain', 'vignette', 'cinema-bars', 'duotone', 'silhouette'],
    avoid: [...PLAYFUL_TEXT, ...CARTOONY, ...PARTY, ...BOUNCY],
  },
};

/** Moves that carry a drop. */
const PEAK_MOVES = new Set(['flash-cuts', 'zoom-punch', 'velocity', 'speed-ramp', 'match-cut', 'break-in', 'strips-reveal']);
/** Moves that make a reel memorable (one is the signature). */
const SIGNATURE_MOVES = new Set(['velocity', 'photo-3d', 'freeze-intro', 'match-cut', 'strips-reveal', 'cards-finale', 'break-in', 'speed-ramp']);
/** The plain moves: a reel made only of these looks like every other phone edit. */
export const PLAIN_MOVES = new Set(['cut', 'hold', 'black']);

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export function parseTreatment(raw: unknown): { ok: true; treatment: Treatment } | { ok: false; errors: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const concepts = (Array.isArray(r.concepts) ? r.concepts : []).map((c) => ({ name: str((c as Record<string, unknown>)?.name), idea: str((c as Record<string, unknown>)?.idea) })).filter((c) => c.name && c.idea);
  if (concepts.length < 2) errors.push('concepts: give at least two different concepts ({ name, idea }) before choosing one');
  const chosen = typeof r.chosen === 'number' ? Math.round(r.chosen) : 0;
  if (chosen < 0 || chosen >= Math.max(1, concepts.length)) errors.push(`chosen: an index into concepts (0-${concepts.length - 1})`);
  const tone = str(r.tone) as Tone;
  if (!TONES.includes(tone)) errors.push(`tone: one of ${TONES.join(', ')}`);
  const parts = (Array.isArray(r.parts) ? r.parts : []).map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { role: str(o.role), beats: Number(o.beats), move: str(o.move), ...(strs(o.clips).length ? { clips: strs(o.clips) } : {}), ...(str(o.line) ? { line: str(o.line) } : {}), ...(str(o.idea) ? { idea: str(o.idea) } : {}) };
  });
  if (parts.length < 3) errors.push('parts: the arc as at least three parts ({ role, beats, move, clips, line?, idea })');
  parts.forEach((p, i) => {
    if (!p.move) errors.push(`parts[${i}].move is missing`);
    if (!(p.beats > 0)) errors.push(`parts[${i}].beats must be a positive number`);
  });
  if (!str(r.signature)) errors.push('signature: the one moment people will remember, and where it is');
  if (!str(r.story)) errors.push('story: the user\'s story, in their words');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    treatment: {
      story: str(r.story), concepts, chosen, tone, heroes: strs(r.heroes), parts, signature: str(r.signature),
      textStyles: strs(r.textStyles), transitions: strs(r.transitions), effects: strs(r.effects), graphics: strs(r.graphics),
      ...(str(r.look) ? { look: str(r.look) } : {}), ...(r.ownWords === true ? { ownWords: true } : {}),
    },
  };
}

/** Every catalogue id the treatment names (its parts' moves and its kit). */
export function treatmentIds(t: Treatment): string[] {
  return [...new Set([...t.parts.map((p) => p.move), ...t.textStyles, ...t.transitions, ...t.effects, ...t.graphics, ...(t.look ? [t.look] : [])])];
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}']+/u).filter(Boolean);

/** Kit items whose voice fights the tone, as "id" list. */
export function toneClashes(tone: Tone, ids: readonly string[]): string[] {
  const avoid = new Set(TONE_KIT[tone].avoid);
  return ids.filter((id) => avoid.has(id));
}

export interface TreatmentContext {
  clips: readonly ShotLogClip[];
  fps: number;
  song?: { bpm?: number; beatsFor18s?: number; dropAtBeat?: number };
}

const clipOf = (ref: string, clips: readonly ShotLogClip[]) => {
  const m = /^#(\d+)(?:@([\d.]+))?$/.exec(ref.trim());
  const clip = m ? clips.find((c) => c.n === Number(m[1])) : undefined;
  return clip ? { clip, at: Number(m![2] ?? 0) } : undefined;
};

export function checkTreatment(t: Treatment, ctx: TreatmentContext): TreatmentFinding[] {
  const out: TreatmentFinding[] = [];
  const beatSec = ctx.song?.bpm ? 60 / ctx.song.bpm : 0.5;
  const unknown = treatmentIds(t).filter((id) => !catalogKind(id));
  if (unknown.length) out.push({ issue: `not in the catalogue: ${unknown.join(', ')}`, fix: 'use ids from the menu in the skill (or a custom id you made with reels_custom_shader / reels_custom_graphic)' });
  const kinds = (k: string) => treatmentIds(t).filter((id) => catalogKind(id) === k);
  // the voice
  const clashes = toneClashes(t.tone, [...t.parts.map((p) => p.move), ...t.textStyles, ...t.transitions, ...t.effects, ...t.graphics]);
  if (clashes.length) {
    const prefer = TONE_KIT[t.tone].prefer.filter((id) => catalogKind(id) !== 'move').slice(0, 10);
    out.push({ issue: `${clashes.join(', ')} fight the ${t.tone} tone (they read as ${t.tone === 'royal' || t.tone === 'emotional' || t.tone === 'calm' ? 'cheap or childish' : 'off-key'} here)`, fix: `swap them for what suits ${t.tone}: ${prefer.join(', ')}` });
  }
  if (new Set(kinds('style')).size > 3 || t.textStyles.length > 3) out.push({ issue: `${t.textStyles.length} text styles`, fix: 'two typefaces, three at most: one for the voice, one for the title or punchline' });
  if (!t.textStyles.length && t.parts.some((p) => p.line)) out.push({ issue: 'lines with no text styles chosen', fix: 'pick one or two styles that fit the tone' });
  // the arc
  const total = t.parts.reduce((s, p) => s + p.beats, 0);
  const seconds = total * beatSec;
  if (ctx.song?.beatsFor18s && (total < ctx.song.beatsFor18s * 0.6 || total > ctx.song.beatsFor18s * 1.6)) {
    out.push({ issue: `the arc is ${total} beats (${seconds.toFixed(1)} s)`, fix: `aim near ${ctx.song.beatsFor18s} beats (about 18 s) unless the user asked for a length` });
  }
  const plain = t.parts.filter((p) => PLAIN_MOVES.has(p.move)).length;
  const distinct = new Set(t.parts.map((p) => p.move)).size;
  if (t.parts.length >= 4 && (plain > t.parts.length / 2 || distinct < 3)) {
    out.push({ issue: `${plain} of ${t.parts.length} parts are plain cuts or holds (${distinct} different moves): it will look like every phone edit`, fix: 'give the build, the drop and the ending their own moves (break-in, zoom-punch, velocity, strips-reveal, cards-finale, photo-3d, split...) and keep plain cuts for the journey' });
  }
  const twice = t.parts.findIndex((p, i) => i > 0 && p.move === t.parts[i - 1]!.move);
  if (twice > 0) out.push({ issue: `parts ${twice - 1} and ${twice} are both ${t.parts[twice]!.move}`, fix: 'never the same move twice in a row: merge them into one, or give one its own move (zoom-punch, photo-3d, break-in, a cut of 1-2 beats)' });
  if (!t.transitions.length && t.parts.length >= 4) out.push({ issue: 'no transitions in the kit', fix: `choose one family of 1-3 that suits ${t.tone} (they mark the hook, the drop and the change of place, not every cut)` });
  if (!t.parts.some((p) => SIGNATURE_MOVES.has(p.move)) && !t.effects.length) out.push({ issue: `no signature move or effect in the arc ("${t.signature}" is not built from anything)`, fix: 'make the signature a move (velocity, photo-3d, freeze-intro, strips-reveal, match-cut) or one effect timed to the drop' });
  // the hook: the first second decides if people stay
  const hook = t.parts[0]!;
  const hookSec = hook.beats * beatSec;
  const hookWords = hook.line ? words(hook.line).length : 0;
  if (hookSec > 3.5 && PLAIN_MOVES.has(hook.move)) out.push({ issue: `the hook is ${hookSec.toFixed(1)} s of one ${hook.move}`, fix: 'open in under 2-3 s with movement or a reveal (strips-reveal, flash-cuts, a moving hero shot), and put the setup line on that' });
  if (hookWords > 7) out.push({ issue: `the hook line is ${hookWords} words`, fix: 'open on 2-5 words (the sharpest part of their sentence); put the rest of it in the next part' });
  const first = hook.clips?.[0] ? clipOf(hook.clips[0], ctx.clips) : undefined;
  if (first && hook.move === 'hold' && motionAt(first.clip, first.at, ctx.fps, ctx.clips) === 'still') {
    const moving = ctx.clips.filter((c) => c.kind === 'video' && c.features && motionAt(c, c.seconds / 2, ctx.fps, ctx.clips) === 'moving').slice(0, 4).map((c) => `#${c.n}`);
    out.push({ issue: `the hook holds a still moment (${hook.clips![0]})`, fix: `open on movement${moving.length ? ` (${moving.join(', ')} move)` : ''}, or keep this shot under 1.5 s` });
  }
  // the drop
  if (ctx.song?.dropAtBeat !== undefined) {
    let at = 0;
    const k = t.parts.findIndex((p) => { const hit = ctx.song!.dropAtBeat! >= at && ctx.song!.dropAtBeat! < at + p.beats; at += p.beats; return hit; });
    const part = t.parts[k];
    let start = 0; for (let i = 0; i < k; i += 1) start += t.parts[i]!.beats;
    if (part && (!PEAK_MOVES.has(part.move) || Math.abs(start - ctx.song.dropAtBeat) > 1)) {
      out.push({ issue: `the drop is beat ${ctx.song.dropAtBeat}; it lands ${start === ctx.song.dropAtBeat ? 'on' : 'inside'} part ${k} (${part.move})`, fix: `make a part start on beat ${ctx.song.dropAtBeat} with a peak move (velocity, zoom-punch, flash-cuts, speed-ramp, strips-reveal) and a drop-timed effect` });
    }
  }
  // reading speed
  t.parts.forEach((p, i) => {
    const n = p.line ? words(p.line).length : 0;
    if (n && n / (p.beats * beatSec) > 3) out.push({ issue: `part ${i}: "${p.line}" is ${n} words in ${(p.beats * beatSec).toFixed(1)} s`, fix: 'fewer words or more beats (about 3 words a second at most)' });
  });
  // the user's words
  if (!t.ownWords) {
    const said = new Set(words(t.story));
    const added = t.parts.flatMap((p) => (p.line ? words(p.line).filter((w) => !said.has(w)) : []));
    if (added.length) out.push({ issue: `words the user did not write: ${[...new Set(added)].join(', ')}`, fix: 'quote their phrases as written (trim, never reword); set ownWords only when they asked for lines of your own' });
  }
  // who the story names
  if (PERSON.test(t.story) && !t.graphics.includes('annotate') && !t.textStyles.includes('follow-tag') && !t.parts.some((p) => p.move === 'freeze-intro')) {
    out.push({ issue: `the story names "${PERSON.exec(t.story)![1]}" and nothing shows who that is`, fix: 'an annotate arrow labelled with their word on a calm shot of them, a follow-tag, or a freeze-intro' });
  }
  return out;
}

/** What the agent needs to turn a treatment into a plan: the catalogue slice and how to cast and write. */
export const PLAN_BRIEF = [
  'Stage 3: the plan. Turn each part into one or two sections ({ move, beats, clips, text, textStyle, params, transition, effects }); keep the beats of the arc.',
  'Casting: name clips by number in the order the move uses them; start each at its best moment from the shot log ("#5@12"); the hook and the drop get the moving, sharp moments, the ending the most beautiful one; never the same moment in neighbouring sections; leave a shot\'s length after its start.',
  'Words: the user\'s phrases, trimmed, never reworded; one line per section at most, 3 words a second at most; repeat your chosen styles; style params go in the section\'s params.',
  'The drop gets everything at once: the peak move, a drop-timed effect and its hit; the section before it may build. Transitions from your kit only where something changes (the hook, the drop, a new place, the ending).',
  'Effects move with the song: timing beat/drop/build/fade at strength 0.5-0.8, region background to keep a person natural.',
  'Graphics from the treatment on calm shots: annotate on a hold or slow cut where the person is clear (who: front/back/left/right/middle as seen on the sheet).',
  'Then call reels_director_build with the plan.',
].join('\n');
