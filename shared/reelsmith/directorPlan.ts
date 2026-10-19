// Director mode (RS-1201): the agent's plan for a reel. The user gives a story, media and a song; the agent splits the
// story into sections that follow the song, picks a move (an effect from the moves catalogue) for each section, chooses
// the clips, and writes the on-screen lines. The plan is data only; src/reelsmith/director compiles it to a timeline.
import { isRatioId, type RatioId } from './ratios';

export type PlanValue = string | number | boolean;

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
}

/** A line that stays on screen across several sections (a title over a montage). */
export interface PlanOverlay {
  text: string;
  style: string;
  /** section indexes, inclusive */
  from: number;
  to: number;
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
    sections.push({
      move: s.move, beats: num(s.beats, 'beats'), seconds: num(s.seconds, 'seconds'), clips, text: text(s.text, `${w}.text`),
      textStyle: typeof s.textStyle === 'string' ? s.textStyle : undefined, params: params(s.params, w),
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
      overlays.push({ text: t, style: o.style, from, to, params: params(o.params, w) });
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      version: 1, ratio: ratio as RatioId, sections,
      ...(typeof raw.music === 'string' ? { music: raw.music } : {}), ...(ms !== undefined ? { musicStart: ms as ReelPlan['musicStart'] } : {}),
      ...(typeof raw.look === 'string' ? { look: raw.look } : {}), ...(overlays.length ? { overlays } : {}),
    },
  };
}
