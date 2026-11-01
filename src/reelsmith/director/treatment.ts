// Director stage 2 (RS-1214): the treatment. Before any plan, the agent decides what the reel is: two concepts and the
// one it picks, the tone, the hero shots, the arc on the song (hook, build, drop, payoff, ending), one signature moment
// and a small kit (text styles, transitions, effects, graphics, look). Planning everything in one hidden pass gave
// plain reels ("this looks so basic", AMK run of 2026-10-21) and styles that fought the story (slam and sparkles on a
// feat the user wanted to feel royal). This checks the treatment against the footage, the song and the tone, and
// returns the full catalogue entries for the kit it chose.
import { catalogKind } from './catalogText';
import { motionAt, type ShotLogClip } from './shotLog';
import { PERSON } from './review';
import { missingThingQuestion, missingThings } from './storyThings';
import type { ReferenceProfile } from './reference';

import { TONES, type Tone } from '../../../shared/reelsmith/directorPlan';

export { TONES, type Tone };

export const ROLES = ['hook', 'build', 'journey', 'drop', 'peak', 'payoff', 'ending'] as const;

export interface TreatmentPart {
  role: string; beats: number; move: string; clips?: string[]; line?: string; idea?: string;
  /** RS-1218: why the part exists, what the viewer knows or feels after it that they did not before */
  purpose?: string;
}

/** RS-1217: what the agent learned from the reference reel; the build and critique hold the reel to it. */
export interface StyleGuide { pacing: string; palette: string; type?: string; motion: string; texture?: string; doNotCopy: string }

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
  styleGuide?: StyleGuide;
}

export interface TreatmentFinding { issue: string; fix: string; /** a question for the user: stop and ask it before planning */ ask?: string }

// What each tone wants and what breaks it. Words and effects carry a voice: a bouncing pop caption on a summit the
// user called "a big feat for us" read as childish, sparkles as cheap.
const PLAYFUL_TEXT = ['pop-words', 'wave', 'highlight', 'draw-on'];
const GLITCHY = ['glitch', 'neon', 'glitch-cut', 'chroma-glitch', 'pixelate', 'rgb-split', 'vhs', 'crt', 'prism-flash'];
const CARTOONY = ['cartoon', 'crayon', 'crayon-doodles', 'cut-paper', 'sticker', 'scrapbook-paper', 'halftone', 'posterize', 'riso', 'kaleidoscope', 'mirror', 'thermal', 'predator', 'bounce', 'sparkle'];
const PARTY = ['confetti', 'loading-bar'];
const BOUNCY = ['tile-pop', 'page-curl', 'slide-over', 'cube-turn'];

export const TONE_KIT: Record<Tone, { prefer: string[]; avoid: string[] }> = {
  royal: {
    prefer: ['cinematic-title', 'tracking-in', 'shine', 'rise-lines', 'landscape-title', 'big-title', 'light-dissolve', 'blur-focus', 'dipToBlack', 'zoom-through', 'light-leak', 'film-burn', 'light-rays', 'flare-sweep', 'anamorphic-flare', 'bloom', 'cinema-bars', 'soft-vignette', 'velocity', 'photo-3d', 'photo-parallax', 'hold', 'cards-finale'],
    avoid: [...PLAYFUL_TEXT, ...GLITCHY, ...CARTOONY, ...PARTY, ...BOUNCY, 'slam', 'words-on-beat', 'caption'],
  },
  epic: {
    prefer: ['punch-caps', 'cinematic-title', 'landscape-title', 'slam', 'rise-lines', 'tracking-in', 'split-reveal', 'zoom-through', 'whip-blur', 'impact-shake', 'radial-blur', 'flash', 'dipToBlack', 'zoom-blur', 'shake', 'light-rays', 'cinema-bars', 'anamorphic-flare', 'velocity', 'speed-ramp', 'strips-reveal', 'zoom-punch'],
    avoid: [...PLAYFUL_TEXT, ...CARTOONY, ...PARTY, ...BOUNCY, 'caption'],
  },
  hype: {
    prefer: ['punch-caps', 'rewind', 'slam', 'words-on-beat', 'glitch', 'title-shuffle', 'split-reveal', 'neon', 'glitch-cut', 'flash', 'spin-zoom', 'prism-flash', 'impact-shake', 'zoom-through', 'whip-blur', 'rgb-split', 'zoom-blur', 'shake', 'bounce', 'blackout', 'flash-cuts', 'zoom-punch', 'velocity'],
    avoid: ['crossfade', 'light-dissolve', 'pro-mist', 'typewriter', 'watercolor', 'pencil-sketch'],
  },
  playful: {
    prefer: ['punch-caps', 'rewind', 'pop-words', 'highlight', 'wave', 'follow-tag', 'draw-on', 'words-on-beat', 'sticker', 'annotate', 'chat-bubbles', 'notification', 'slide-over', 'tile-pop', 'whip-blur', 'zoomIn', 'bounce', 'subject-pop', 'freeze-intro', 'photo-stack'],
    avoid: ['cinema-bars', 'film-grain', 'moody-bleach', 'dipToBlack'],
  },
  funny: {
    prefer: ['punch-caps', 'rewind', 'pop-words', 'highlight', 'follow-tag', 'caption', 'slam', 'annotate', 'sticker', 'chat-bubbles', 'notification', 'loading-bar', 'freeze-intro', 'zoom-punch', 'whip-blur', 'impact-shake', 'bounce', 'subject-pop'],
    avoid: ['cinema-bars', 'light-dissolve', 'crossfade', 'pro-mist', 'moody-bleach'],
  },
  emotional: {
    prefer: ['typewriter', 'rise-lines', 'tracking-in', 'cinematic-title', 'crossfade', 'light-leak', 'blur-focus', 'light-dissolve', 'dipToWhite', 'pro-mist', 'halation', 'soft-vignette', 'fine-grain', 'hold', 'photo-drift', 'photo-parallax', 'photo-3d'],
    avoid: ['rewind', ...PLAYFUL_TEXT, ...GLITCHY, ...CARTOONY, ...PARTY, ...BOUNCY, 'slam', 'words-on-beat', 'flash-cuts', 'zoom-punch', 'shake'],
  },
  calm: {
    prefer: ['typewriter', 'rise-lines', 'tracking-in', 'cinematic-title', 'landscape-title', 'crossfade', 'light-dissolve', 'blur-focus', 'light-leak', 'soft-vignette', 'fine-grain', 'hold', 'photo-drift', 'photo-parallax'],
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
const SIGNATURE_MOVES = new Set(['velocity', 'photo-3d', 'freeze-intro', 'match-cut', 'strips-reveal', 'cards-finale', 'break-in', 'speed-ramp', 'rewind']);
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
    return {
      role: str(o.role), beats: Number(o.beats), move: str(o.move), ...(strs(o.clips).length ? { clips: strs(o.clips) } : {}),
      ...(str(o.line) ? { line: str(o.line) } : {}), ...(str(o.idea) ? { idea: str(o.idea) } : {}), ...(str(o.purpose) ? { purpose: str(o.purpose) } : {}),
    };
  });
  if (parts.length < 3) errors.push('parts: the arc as at least three parts ({ role, beats, move, clips, line?, idea })');
  parts.forEach((p, i) => {
    if (!p.move) errors.push(`parts[${i}].move is missing`);
    if (!(p.beats > 0)) errors.push(`parts[${i}].beats must be a positive number`);
  });
  if (!str(r.signature)) errors.push('signature: the one moment people will remember, and where it is');
  if (!str(r.story)) errors.push('story: the user\'s story, in their words');
  const sg = (r.styleGuide && typeof r.styleGuide === 'object' ? r.styleGuide : undefined) as Record<string, unknown> | undefined;
  const styleGuide: StyleGuide | undefined = sg ? {
    pacing: str(sg.pacing), palette: str(sg.palette), motion: str(sg.motion), doNotCopy: str(sg.doNotCopy),
    ...(str(sg.type) ? { type: str(sg.type) } : {}), ...(str(sg.texture) ? { texture: str(sg.texture) } : {}),
  } : undefined;
  if (styleGuide && (!styleGuide.pacing || !styleGuide.palette || !styleGuide.motion || !styleGuide.doNotCopy)) errors.push('styleGuide: pacing, palette, motion and doNotCopy, each in concrete words');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    treatment: {
      story: str(r.story), concepts, chosen, tone, heroes: strs(r.heroes), parts, signature: str(r.signature),
      textStyles: strs(r.textStyles), transitions: strs(r.transitions), effects: strs(r.effects), graphics: strs(r.graphics),
      ...(str(r.look) ? { look: str(r.look) } : {}), ...(r.ownWords === true ? { ownWords: true } : {}), ...(styleGuide ? { styleGuide } : {}),
    },
  };
}

/**
 * RS-1230: the treatment as the user reads it at the approval gate, before anything is built: the concept, the tone,
 * each part with its seconds on the song and why it is there, the hero shots and the signature. Written by code so the
 * card shows what was sent, not the agent's retelling of it.
 */
export function treatmentCard(t: Treatment, bpm?: number): string {
  const beatSec = bpm ? 60 / bpm : 0.5;
  const concept = t.concepts[t.chosen];
  let at = 0;
  const parts = t.parts.map((p, i) => {
    const from = at;
    at += p.beats * beatSec;
    const bits = [p.line ? `"${p.line}"` : '', p.purpose ?? p.idea ?? ''].filter(Boolean).join(': ');
    return `${i + 1}. ${from.toFixed(1)}-${at.toFixed(1)} s · ${p.role} · ${p.move}${bits ? ` · ${bits}` : ''}`;
  });
  const kit = [...t.textStyles, ...t.transitions, ...t.effects, ...t.graphics, ...(t.look ? [`look ${t.look}`] : [])];
  return [
    `**${concept?.name ?? 'Concept'}** (${t.tone}, about ${at.toFixed(0)} s): ${concept?.idea ?? ''}`,
    ...parts,
    `Signature: ${t.signature}`,
    ...(t.heroes.length ? [`Hero shots: ${t.heroes.join(', ')}`] : []),
    ...(kit.length ? [`Kit: ${kit.join(', ')}`] : []),
    `Other idea: ${t.concepts.filter((_, i) => i !== t.chosen).map((c) => `${c.name} (${c.idea})`).join('; ')}`,
  ].join('\n');
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
  reference?: ReferenceProfile;
  /** RS-1239: a promo reel's brand kit: its words count as the user's, and the reel ends asking for its one action */
  brand?: { name: string; words: string; action?: string };
  /** RS-1240: clock times the clips were filmed at ("#3 4:12 am"), for time labels that are true */
  clock?: boolean;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'it', 'is', 'in', 'on', 'we', 'they', 'that', 'this', 'their', 'our', 'viewer', 'viewers', 'see', 'sees', 'now', 'knows', 'know', 'feel', 'feels']);
/** Two purposes say the same thing when most of their words match. */
export function samePurpose(a: string, b: string): boolean {
  const wa = new Set(words(a).filter((w) => !STOP.has(w))), wb = new Set(words(b).filter((w) => !STOP.has(w)));
  if (!wa.size || !wb.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size) >= 0.7;
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
  // RS-1243: a promo reel tells a little story and ends on a held card: about 27 s (Kino's better cut ran 30 s, ours 17.5 s)
  const target = ctx.song?.beatsFor18s ? Math.round((ctx.song.beatsFor18s * (ctx.brand ? 1.5 : 1)) / 4) * 4 : 0;
  if (target && (total < target * (ctx.brand ? 0.8 : 0.6) || total > target * (ctx.brand ? 1.3 : 1.6))) {
    out.push({ issue: `the arc is ${total} beats (${seconds.toFixed(1)} s)`, fix: `aim near ${target} beats (about ${ctx.brand ? 27 : 18} s) unless the user asked for a length` });
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
  if (!hookWords && (t.story.trim() || ctx.brand)) out.push({ issue: 'the hook has no words', fix: 'most people scroll with the sound off: put 2-5 words on the first second (the sharpest part of their story, a question it raises, or the payoff it promises), big and centred' });
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
  // RS-1243: a promo reel is copywriting: lines of the director's own, but every number and claim from the page or the user
  if (ctx.brand) {
    const known = `${t.story} ${ctx.brand.words}`;
    const numbers = t.parts.flatMap((p) => (p.line ?? '').match(/\d[\d,.]*\+?%?/g) ?? []).filter((n) => !known.includes(n.replace(/[+%]$/, '')) && !(ctx.clock && /^\d{1,2}[:.]\d{2}$/.test(n)));
    if (numbers.length) out.push({ issue: `numbers the page and the user never gave: ${[...new Set(numbers)].join(', ')}`, fix: 'use only the brand kit\'s facts and the user\'s numbers; clock times only from the log\'s "filmed" times' });
    const bare = t.parts.map((p, i) => (p.line || p.role === 'ending' ? -1 : i)).filter((i) => i >= 0);
    if (bare.length) out.push({ issue: `part${bare.length > 1 ? 's' : ''} ${bare.join(', ')} carr${bare.length > 1 ? 'y' : 'ies'} no line`, fix: 'a promo reel has a short punch-caps line on every part (one beat of the story each: the problem, the alternative, the day, a joke, the payoff, the proof, the price, the ask); a part with nothing to say is cut' });
  }
  if (!t.ownWords && !ctx.brand) {
    // RS-1239/1240: a promo reel's page and the clips' own filming times are the user's words too
    const said = new Set([...words(t.story), ...(ctx.clock ? ['am', 'pm', 'day'] : [])]);
    const added = t.parts.flatMap((p) => (p.line ? words(p.line).filter((w) => !said.has(w)) : []));
    if (added.length) out.push({ issue: `words the user did not write: ${[...new Set(added)].join(', ')}`, fix: 'quote their phrases as written (trim, never reword); set ownWords only when they asked for lines of your own' });
  }
  // RS-1218: every part earns its place; a part that only repeats the one before is filler
  const aimless = t.parts.map((p, i) => (p.purpose ? -1 : i)).filter((i) => i >= 0);
  if (aimless.length) out.push({ issue: `part${aimless.length > 1 ? 's' : ''} ${aimless.join(', ')} ha${aimless.length > 1 ? 've' : 's'} no purpose`, fix: 'give each part a purpose: what the viewer knows or feels after it that they did not before ("they see the climb is brutal"); a part you cannot say that for does not belong in the reel' });
  t.parts.forEach((p, i) => {
    const prev = t.parts[i - 1];
    if (i > 0 && p.purpose && prev?.purpose && samePurpose(p.purpose, prev.purpose)) out.push({ issue: `parts ${i - 1} and ${i} have the same purpose ("${p.purpose}")`, fix: 'merge them into one part, or give the second something new to show (a turn, a payoff, a new place)' });
  });
  // RS-1221: what the story names and the footage does not show is a question, not a stand-in shot
  for (const m of missingThings(t.story, ctx.clips)) out.push({ issue: `the story names "${m.word}" and no clip seems to show it`, fix: 'ask the user before planning; never put that line over a shot of something else', ask: missingThingQuestion(m) });
  // RS-1217: a reference the agent was given is studied before it is followed
  if (ctx.reference && !t.styleGuide) out.push({ issue: `there is a reference reel (${ctx.reference.name}) and no styleGuide`, fix: 'write styleGuide from its measurements and sheet: pacing (seconds or beats a shot), palette (its colours in words), type, motion (snap, glide, hold), texture, and doNotCopy (its subjects, words and logos)' });
  // RS-1239: a promo reel asks for one thing at the end, and says who made it
  if (ctx.brand) {
    if (!t.graphics.includes('cta-card')) out.push({ issue: `a promo reel for ${ctx.brand.name} with no end card`, fix: `add cta-card to the graphics on the ending: "${ctx.brand.name} / ${ctx.brand.action ?? '<one action from the brand kit>'} / link in bio", 6-12 beats` });
    if (!t.graphics.includes('handle-tag') && t.parts.length >= 4) out.push({ issue: `nothing names ${ctx.brand.name} until the end`, fix: 'a handle-tag (the @handle or the name) from the part after the hook to the end card' });
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
  'Pace with the song\'s energy line: longer shots on quiet bars, faster as it builds, the fastest on loud bars; part changes on a bar line. One moment heard over the song (naturalSound under or solo) when the log has a shout, a splash or a line said; loop true when the last shot can hand back to the first.',
  'Then call reels_director_build with the plan.',
].join('\n');
