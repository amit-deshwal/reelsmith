// Director mode (RS-1201): the agent's plan for a reel. The user gives a story, media and a song; the agent splits the
// story into sections that follow the song, picks a move (an effect from the moves catalogue) for each section, chooses
// the clips, and writes the on-screen lines. The plan is data only; src/reelsmith/director compiles it to a timeline.
import { isRatioId, type RatioId } from './ratios';

export type PlanValue = string | number | boolean;

/** The reel's voice (the treatment's tone): it sets how things move (motionRules.ts) and which styles suit it. */
export const TONES = ['epic', 'royal', 'hype', 'playful', 'funny', 'emotional', 'calm', 'nostalgic', 'romantic', 'moody'] as const;
export type Tone = (typeof TONES)[number];

export interface PlanSection {
  /** move id from the catalogue (reels_director_options) */
  move: string;
  /** length in beats of the song (0.5 s per beat without a song); or give seconds */
  beats?: number;
  seconds?: number;
  /** asset ids in the order the move uses them; omitted = cast automatically from unused clips */
  clips?: string[];
  /** on-screen line for this section, drawn in textStyle */
  text?: string;
  textStyle?: string;
  params?: Record<string, PlanValue>;
  /** how this section comes in from the one before (a transition id); omitted = a hard cut */
  transition?: string;
  /** clip effects on this section's footage, with their own params and how they move (see PlanEffect) */
  effects?: PlanEffect[];
  /** a look for this section only (overrides the reel's look here) */
  look?: string;
  /** draw this section's line behind the person in the shot (a cut-out of them goes on top) */
  textBehind?: boolean;
  /** sound effects from the sound library placed by hand: beat counted from the section start (default 0) */
  sounds?: Array<{ id: string; beat?: number }>;
  /**
   * RS-1225: the clips' own sound plays here (a shout at the top, a splash, laughter): 'under' dips the song under it,
   * 'solo' stops the song for the section so it comes back on the next section's first beat. talk-zoom is 'under'.
   */
  naturalSound?: NaturalSound;
  /** RS-1249: playback speed of this section's footage (0.25-2; 0.5 = the user's "slow motion 50%"); slowed footage is silent */
  speed?: number;
}

export const NATURAL_SOUNDS = ['under', 'solo'] as const;
export type NaturalSound = (typeof NATURAL_SOUNDS)[number];

/** How a section effect plays: steady all through, fade in and out, punch on every `every` beats, hit once on the
 * section's first beat and fall away (the drop), or build up to the next section. */
export const EFFECT_TIMINGS = ['steady', 'fade', 'beat', 'drop', 'build'] as const;
export type EffectTiming = (typeof EFFECT_TIMINGS)[number];

export interface PlanEffect {
  id: string;
  params?: Record<string, number>;
  /** 0..1, default 1 */
  strength?: number;
  /** only on the person, or only behind them (default everywhere) */
  region?: 'all' | 'subject' | 'background';
  timing?: EffectTiming;
  /** beats between punches for timing 'beat' (default 1) */
  every?: number;
}

/** A line that stays on screen across several sections (a title over a montage). */
export interface PlanOverlay {
  text: string;
  style: string;
  /** section indexes, inclusive */
  from: number;
  to: number;
  params?: Record<string, PlanValue>;
  /** behind the person in the shots it crosses */
  behind?: boolean;
}

/**
 * A drawn graphic over the reel (RS-1213): a route map, chat bubbles, stickers, confetti... It starts `beat` beats into
 * section `from` and lasts `beats` beats, or to the end of section `to`.
 */
export interface PlanGraphic {
  /** graphic id from the catalogue, or custom:gfx-* from reels_custom_graphic */
  graphic: string;
  from: number;
  to: number;
  beat?: number;
  beats?: number;
  /** its words; items split with "/" */
  text?: string;
  params?: Record<string, PlanValue>;
}

export interface ReelPlan {
  version: 1;
  ratio: RatioId;
  /** song asset id; omitted = silent */
  music?: string;
  /** where the song starts: 'firstDownbeat' (default), 'fromStart', or a second of the song */
  musicStart?: 'firstDownbeat' | 'fromStart' | number;
  /** a reel look id applied to every shot (reels_apply_look ids) */
  look?: string;
  sections: PlanSection[];
  overlays?: PlanOverlay[];
  graphics?: PlanGraphic[];
  /** sound effects on cuts, drops and builds: 'auto' (default), 'subtle' (quieter) or 'off' */
  sfx?: 'auto' | 'subtle' | 'off';
  /** how things move (RS-1219); the build fills it from the treatment when the plan leaves it out */
  tone?: Tone;
  /** RS-1226: the reel is made to replay: the song does not fade out and the last shot hands back to the first */
  loop?: boolean;
  /**
   * RS-1249: the user gave a shot list (timed shots, their own lines): the build adds no motion of its own (no tone
   * punch-in on plain cuts, no tone push on holds) and the critique checks the build against the list, not taste.
   * The build fills it from the treatment.
   */
  shotList?: boolean;
  /**
   * Set by reels_director_fix, never parsed from the agent (RS-1216): sections to rebuild exactly as last time, with the
   * clips they were cast and the source frame each shot started at, in order. null = build that section afresh.
   */
  keep?: Array<{ clips: string[]; moments: number[] } | null>;
}

export const MAX_SECTIONS = 24;
export const MAX_TEXT = 140;

/** Shape check only (moves, params and clips are checked against the catalogue and the media by the compiler). */
export function parsePlan(raw: unknown): { ok: true; plan: ReelPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(raw)) return { ok: false, errors: ['plan must be an object'] };
  const ratio = raw.ratio ?? '9:16';
  if (!isRatioId(ratio)) errors.push(`ratio must be one of 9:16, 4:5, 1:1, 16:9 (got ${JSON.stringify(raw.ratio)})`);
  if (raw.music !== undefined && typeof raw.music !== 'string') errors.push('music must be a song assetId');
  const ms = raw.musicStart;
  if (ms !== undefined && ms !== 'firstDownbeat' && ms !== 'fromStart' && !(typeof ms === 'number' && ms >= 0)) errors.push('musicStart must be firstDownbeat, fromStart or a number of seconds');
  if (raw.look !== undefined && typeof raw.look !== 'string') errors.push('look must be a look id');
  if (raw.sfx !== undefined && raw.sfx !== 'auto' && raw.sfx !== 'subtle' && raw.sfx !== 'off') errors.push('sfx must be auto, subtle or off');
  if (raw.tone !== undefined && !(TONES as readonly unknown[]).includes(raw.tone)) errors.push(`tone must be one of ${TONES.join(', ')}`);
  if (raw.loop !== undefined && typeof raw.loop !== 'boolean') errors.push('loop must be true or false');
  if (raw.shotList !== undefined && typeof raw.shotList !== 'boolean') errors.push('shotList must be true or false');
  const params = (v: unknown, where: string) => {
    if (v === undefined) return undefined;
    if (!obj(v)) { errors.push(`${where}.params must be an object`); return undefined; }
    const out: Record<string, PlanValue> = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[k] = x;
      else errors.push(`${where}.params.${k} must be a string, number or boolean`);
    }
    return out;
  };
  const text = (v: unknown, where: string) => {
    if (v === undefined) return undefined;
    if (typeof v !== 'string') { errors.push(`${where} must be a string`); return undefined; }
    const t = v.replace(/[{}]/g, '').trim();
    if (t.length > MAX_TEXT) errors.push(`${where} is longer than ${MAX_TEXT} characters`);
    return t || undefined;
  };
  const sections: PlanSection[] = [];
  if (!Array.isArray(raw.sections) || !raw.sections.length) errors.push('sections must be a non-empty array');
  else if (raw.sections.length > MAX_SECTIONS) errors.push(`at most ${MAX_SECTIONS} sections`);
  else raw.sections.forEach((s, i) => {
    const w = `sections[${i}]`;
    if (!obj(s)) { errors.push(`${w} must be an object`); return; }
    if (typeof s.move !== 'string' || !s.move) { errors.push(`${w}.move is required`); return; }
    const num = (v: unknown, k: string) => (v === undefined ? undefined : typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 600 ? v : (errors.push(`${w}.${k} must be a positive number`), undefined));
    const clips = s.clips === undefined ? undefined
      : Array.isArray(s.clips) && s.clips.every((c) => typeof c === 'string') ? s.clips as string[] : (errors.push(`${w}.clips must be an array of assetIds`), undefined);
    const effects: PlanEffect[] = [];
    if (s.effects !== undefined) {
      if (!Array.isArray(s.effects)) errors.push(`${w}.effects must be an array`);
      else s.effects.forEach((e, k) => {
        if (!obj(e) || typeof e.id !== 'string') { errors.push(`${w}.effects[${k}] needs an id`); return; }
        const p: Record<string, number> = {};
        for (const [key, v] of Object.entries(obj(e.params) ? e.params : {})) {
          if (typeof v === 'number' && Number.isFinite(v)) p[key] = v; else errors.push(`${w}.effects[${k}].params.${key} must be a number`);
        }
        const fw = `${w}.effects[${k}]`;
        const strength = e.strength === undefined ? undefined : typeof e.strength === 'number' && e.strength >= 0 && e.strength <= 1 ? e.strength : (errors.push(`${fw}.strength must be 0 to 1`), undefined);
        const region = e.region === undefined ? undefined : e.region === 'all' || e.region === 'subject' || e.region === 'background' ? e.region : (errors.push(`${fw}.region must be all, subject or background`), undefined);
        const timing = e.timing === undefined ? undefined : (EFFECT_TIMINGS as readonly unknown[]).includes(e.timing) ? e.timing as EffectTiming : (errors.push(`${fw}.timing must be one of ${EFFECT_TIMINGS.join(', ')}`), undefined);
        const every = e.every === undefined ? undefined : typeof e.every === 'number' && e.every >= 0.25 && e.every <= 16 ? e.every : (errors.push(`${fw}.every must be 0.25 to 16 beats`), undefined);
        effects.push({
          id: e.id, ...(Object.keys(p).length ? { params: p } : {}), ...(strength !== undefined ? { strength } : {}),
          ...(region ? { region } : {}), ...(timing ? { timing } : {}), ...(every !== undefined ? { every } : {}),
        });
      });
      if (effects.length > 3) errors.push(`${w}: at most 3 effects on a section`);
    }
    const sounds: Array<{ id: string; beat?: number }> = [];
    if (s.sounds !== undefined) {
      if (!Array.isArray(s.sounds) || s.sounds.length > 8) errors.push(`${w}.sounds must be an array of at most 8 sounds`);
      else s.sounds.forEach((x, k) => {
        if (!obj(x) || typeof x.id !== 'string') { errors.push(`${w}.sounds[${k}] needs an id`); return; }
        if (x.beat !== undefined && !(typeof x.beat === 'number' && x.beat >= 0 && x.beat <= 600)) { errors.push(`${w}.sounds[${k}].beat must be a number of beats from the section start`); return; }
        sounds.push({ id: x.id, ...(typeof x.beat === 'number' ? { beat: x.beat } : {}) });
      });
    }
    const speed = s.speed === undefined ? undefined : typeof s.speed === 'number' && s.speed >= 0.25 && s.speed <= 2 ? s.speed : (errors.push(`${w}.speed must be 0.25 to 2 (0.5 = half speed)`), undefined);
    const natural = s.naturalSound === undefined || s.naturalSound === false ? undefined : s.naturalSound === true ? 'under'
      : (NATURAL_SOUNDS as readonly unknown[]).includes(s.naturalSound) ? s.naturalSound as NaturalSound : (errors.push(`${w}.naturalSound must be under or solo`), undefined);
    sections.push({
      move: s.move, beats: num(s.beats, 'beats'), seconds: num(s.seconds, 'seconds'), clips, text: text(s.text, `${w}.text`),
      textStyle: typeof s.textStyle === 'string' ? s.textStyle : undefined, params: params(s.params, w),
      ...(typeof s.transition === 'string' ? { transition: s.transition } : {}), ...(effects.length ? { effects } : {}),
      ...(typeof s.look === 'string' ? { look: s.look } : {}), ...(sounds.length ? { sounds } : {}), ...(s.textBehind === true ? { textBehind: true } : {}),
      ...(natural ? { naturalSound: natural } : {}), ...(speed !== undefined && speed !== 1 ? { speed } : {}),
    });
  });
  const overlays: PlanOverlay[] = [];
  if (raw.overlays !== undefined) {
    if (!Array.isArray(raw.overlays)) errors.push('overlays must be an array');
    else raw.overlays.forEach((o, i) => {
      const w = `overlays[${i}]`;
      if (!obj(o)) { errors.push(`${w} must be an object`); return; }
      const t = text(o.text, `${w}.text`);
      if (!t) { errors.push(`${w}.text is required`); return; }
      if (typeof o.style !== 'string') { errors.push(`${w}.style is required`); return; }
      const from = Number(o.from ?? 0);
      const to = Number(o.to ?? from);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= sections.length) { errors.push(`${w}: from/to must be section indexes, from <= to`); return; }
      overlays.push({ text: t, style: o.style, from, to, params: params(o.params, w), ...(o.behind === true ? { behind: true } : {}) });
    });
  }
  const graphics: PlanGraphic[] = [];
  if (raw.graphics !== undefined) {
    if (!Array.isArray(raw.graphics)) errors.push('graphics must be an array');
    else raw.graphics.forEach((g, i) => {
      const w = `graphics[${i}]`;
      if (!obj(g) || typeof g.graphic !== 'string' || !g.graphic) { errors.push(`${w} needs a graphic id`); return; }
      const from = Number(g.from ?? 0);
      const to = Number(g.to ?? from);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= sections.length) { errors.push(`${w}: from/to must be section indexes, from <= to`); return; }
      const beat = g.beat === undefined ? undefined : typeof g.beat === 'number' && g.beat >= 0 && g.beat <= 600 ? g.beat : (errors.push(`${w}.beat must be beats from the section start`), undefined);
      const beats = g.beats === undefined ? undefined : typeof g.beats === 'number' && g.beats > 0 && g.beats <= 600 ? g.beats : (errors.push(`${w}.beats must be a positive number of beats`), undefined);
      const t = text(g.text, `${w}.text`);
      graphics.push({ graphic: g.graphic, from, to, ...(beat !== undefined ? { beat } : {}), ...(beats !== undefined ? { beats } : {}), ...(t ? { text: t } : {}), ...(g.params !== undefined ? { params: params(g.params, w) } : {}) });
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      version: 1, ratio: ratio as RatioId, sections,
      ...(typeof raw.music === 'string' ? { music: raw.music } : {}), ...(ms !== undefined ? { musicStart: ms as ReelPlan['musicStart'] } : {}),
      ...(typeof raw.look === 'string' ? { look: raw.look } : {}), ...(overlays.length ? { overlays } : {}), ...(graphics.length ? { graphics } : {}),
      ...(raw.sfx === 'auto' || raw.sfx === 'subtle' || raw.sfx === 'off' ? { sfx: raw.sfx } : {}),
      ...((TONES as readonly unknown[]).includes(raw.tone) ? { tone: raw.tone as Tone } : {}),
      ...(raw.loop === true ? { loop: true } : {}),
      ...(raw.shotList === true ? { shotList: true } : {}),
    },
  };
}
