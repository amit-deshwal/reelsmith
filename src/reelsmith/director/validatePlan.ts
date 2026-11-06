// RS-1267: the plan checked against the brief before anything touches the draft. The build used to find a wrong
// length, a cut off the beat or a line under Instagram's buttons only in the critique after a full build and a frame
// render, and spent a fix round on it. These rules are deterministic and need no clip analysis beyond the shot log:
// the brief's song window and length, cuts on whole beats, the shots the user asked for, no shot under 0.5 s outside
// a flash run, lines placed inside the safe area, and no shot shown twice (the same moment, or a near-identical clip).
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { RATIO_SIZES } from '../../../shared/reelsmith/ratios';
import { groupNearDuplicates, type ClipFeatures } from '../assembler/scoring';
import { safeAreaFor } from '../safeZone';
import { moveById } from './moves';

/** What the user's brief fixes, written by the agent in the treatment (or passed to reels_validate_plan). */
export interface PlanBrief {
  /** the reel's length the user asked for ("a 15 s reel"), within a beat or a second */
  seconds?: number;
  minSeconds?: number;
  /** "under 20 s" */
  maxSeconds?: number;
  /** the part of the song the user named ("from 0:45 to 1:05"), in the song's own seconds */
  songFrom?: number;
  songTo?: number;
  /** shots the user asked for ("#3", "#5@12" or an assetId) */
  mustUse?: string[];
}

export const PLAN_RULES = ['length', 'beats', 'must-use', 'short-shot', 'safe-zone', 'duplicate'] as const;
export type PlanRule = (typeof PLAN_RULES)[number];

export interface PlanViolation { rule: PlanRule; sections?: number[]; issue: string; fix: string }

export interface ValidateInput {
  plan: ReelPlan;
  brief?: PlanBrief;
  /** the song's tempo (no beat rules without one) */
  bpm?: number;
  /** the numbered clip list: n (the "#n"), its length and its features (for near-identical clips) */
  clips: ReadonlyArray<{ n: number; seconds: number; features?: ClipFeatures | null }>;
  /** "#n", "#n@t" or an assetId → its list number */
  clipNumber: (ref: string) => number | undefined;
}

/** Moves made of bursts: their half-beat shots are the point. */
export const FLASH_RUN_MOVES = new Set(['flash-cuts', 'zoom-punch', 'match-cut']);
/** Not a shot: a beat of black is a pause. */
const NOT_A_SHOT = new Set(['black']);
/** Shorter than this reads as a flicker, not a shot. */
export const MIN_SHOT_SEC = 0.5;
/** A cut further than this from a beat is heard as off the beat. */
export const BEAT_TOLERANCE_SEC = 0.06;
/** Starts closer than this (source seconds) are the same moment. */
const SAME_MOMENT_SEC = 1;
/** A clip this short has one moment: casting it twice without @ shows the same thing twice. */
const ONE_MOMENT_CLIP_SEC = 3;

const list = (ks: number[]) => (ks.length > 4 ? `${ks.slice(0, 4).join(', ')}...` : ks.join(', '));
const fmt = (s: number) => `${Math.round(s * 10) / 10} s`;

/** Each section's length in beats and seconds as the assembler times it (seconds-sections snap to a quarter beat). */
export function sectionTimes(plan: ReelPlan, beatSec: number): Array<{ beats: number; sec: number; endBeat: number }> {
  let pos = 0;
  let meant = 0;
  return plan.sections.map((s) => {
    const move = moveById(s.move);
    let len: number;
    if (s.seconds !== undefined) {
      meant += s.seconds;
      const end = Math.max(pos + 0.25, Math.round((meant / beatSec) * 4) / 4);
      len = end - pos;
    } else {
      const want = s.beats ?? move?.beats.default ?? 4;
      len = move ? Math.min(move.beats.max, Math.max(move.beats.min, want)) : want;
      meant = (pos + len) * beatSec;
    }
    pos += len;
    return { beats: len, sec: len * beatSec, endBeat: pos };
  });
}

/**
 * The section's beats per shot: its `every` param (or the move's default), when that param changes the whole frame
 * (a shot or a photo; not prints piling up, film-strip frames or a world swap's places behind one continuous person).
 */
function beatsPerShot(s: ReelPlan['sections'][number]): number | undefined {
  const p = moveById(s.move)?.params.find((x) => x.id === 'every' && /per (shot|photo)/i.test(x.label));
  if (!p) return undefined;
  const v = s.params?.every;
  return typeof v === 'number' && v > 0 ? v : typeof p.default === 'number' ? p.default : undefined;
}

export function validatePlan(input: ValidateInput): PlanViolation[] {
  const { plan, brief = {}, clips, clipNumber } = input;
  const out: PlanViolation[] = [];
  const timed = !!plan.music && !!input.bpm;
  const beatSec = input.bpm ? 60 / input.bpm : 0.5;
  const times = sectionTimes(plan, beatSec);
  const total = times.reduce((a, t) => a + t.sec, 0);
  const last = plan.sections.length - 1;

  // length: the brief's seconds and the song window it named
  {
    const issues: string[] = [];
    const fixes: string[] = [];
    const slack = Math.max(1, beatSec);
    if (brief.seconds !== undefined && Math.abs(total - brief.seconds) > slack) {
      issues.push(`the reel is ${fmt(total)}, the brief asks for ${fmt(brief.seconds)}`);
      fixes.push(`make the sections add up to about ${input.bpm ? `${Math.round(brief.seconds / beatSec)} beats` : fmt(brief.seconds)}`);
    }
    if (brief.maxSeconds !== undefined && total > brief.maxSeconds + 0.05) {
      issues.push(`the reel is ${fmt(total)}, over the brief's ${fmt(brief.maxSeconds)}`);
      fixes.push(`cut ${input.bpm ? `${Math.ceil((total - brief.maxSeconds) / beatSec)} beats` : fmt(total - brief.maxSeconds)}`);
    }
    if (brief.minSeconds !== undefined && total < brief.minSeconds - 0.05) {
      issues.push(`the reel is ${fmt(total)}, under the brief's ${fmt(brief.minSeconds)}`);
      fixes.push(`add ${input.bpm ? `${Math.ceil((brief.minSeconds - total) / beatSec)} beats` : fmt(brief.minSeconds - total)}`);
    }
    if (plan.music && brief.songFrom !== undefined && !(typeof plan.musicStart === 'number' && Math.abs(plan.musicStart - brief.songFrom) <= 0.25)) {
      issues.push(`the song starts at ${typeof plan.musicStart === 'number' ? fmt(plan.musicStart) : plan.musicStart ?? 'firstDownbeat'}, the brief names ${fmt(brief.songFrom)}`);
      fixes.push(`set musicStart to ${brief.songFrom}`);
    }
    if (plan.music && brief.songTo !== undefined) {
      const from = brief.songFrom ?? (typeof plan.musicStart === 'number' ? plan.musicStart : 0);
      const window = brief.songTo - from;
      if (window > 0 && Math.abs(total - window) > Math.max(0.5, beatSec)) {
        issues.push(`the reel is ${fmt(total)} but the song window ${fmt(from)}-${fmt(brief.songTo)} is ${fmt(window)}`);
        fixes.push(`make the sections add up to ${input.bpm ? `${Math.round(window / beatSec)} beats` : fmt(window)}`);
      }
    }
    if (issues.length) out.push({ rule: 'length', issue: issues.join('; '), fix: fixes.join('; ') });
  }

  // beats: every section boundary on a whole beat, and whole beats per shot inside a section (a flash run may halve them)
  if (timed && !plan.shotList) {
    const off: number[] = [];
    times.forEach((t, k) => {
      // the section whose own length is not whole beats (every boundary after it is off too, but the fix is there)
      if (k < last && Math.abs(t.beats - Math.round(t.beats)) * beatSec > BEAT_TOLERANCE_SEC) off.push(k);
      const every = beatsPerShot(plan.sections[k]!);
      if (every !== undefined && !FLASH_RUN_MOVES.has(plan.sections[k]!.move) && Math.abs(every - Math.round(every)) * beatSec > BEAT_TOLERANCE_SEC && !off.includes(k)) off.push(k);
    });
    if (off.length) out.push({ rule: 'beats', sections: off, issue: `section${off.length > 1 ? 's' : ''} ${list(off)} cut off the beat (a length in seconds or a fractional beats or every)`, fix: 'give those sections whole beats (beats, not seconds) and a whole every; half beats only inside flash-cuts or zoom-punch' });
  }

  // must-use: the shots the user asked for
  if (brief.mustUse?.length) {
    const cast = plan.sections.flatMap((s) => (s.clips ?? []).map((ref) => ({ n: clipNumber(ref), at: atOf(ref) })));
    const missing = brief.mustUse.filter((want) => {
      const n = clipNumber(want);
      if (n === undefined) return true;
      const at = atOf(want);
      return !cast.some((c) => c.n === n && (at === undefined || c.at === undefined || Math.abs(c.at - at) <= 2));
    });
    if (missing.length) out.push({ rule: 'must-use', issue: `the brief's shot${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not cast`, fix: 'cast each in a section\'s clips (sections left uncast may not pick it)' });
  }

  // short-shot: under 0.5 s only inside a flash run
  if (!plan.shotList) {
    const short: Array<{ k: number; sec: number }> = [];
    plan.sections.forEach((s, k) => {
      if (FLASH_RUN_MOVES.has(s.move) || NOT_A_SHOT.has(s.move)) return;
      const every = beatsPerShot(s);
      const shot = every !== undefined ? Math.min(times[k]!.sec, every * beatSec) : times[k]!.sec;
      if (shot < MIN_SHOT_SEC - 0.01) short.push({ k, sec: shot });
    });
    if (short.length) out.push({ rule: 'short-shot', sections: short.map((x) => x.k), issue: `shots under ${MIN_SHOT_SEC} s outside a flash run: ${short.slice(0, 4).map((x) => `section ${x.k} (${plan.sections[x.k]!.move}) ${x.sec.toFixed(2)} s`).join(', ')}`, fix: `give them more beats (at least ${Math.ceil(MIN_SHOT_SEC / beatSec - 0.01)} a shot), or make that run a flash-cuts or zoom-punch section` });
  }

  // safe-zone: a line placed by hand (x, y) inside the area Instagram's UI leaves clear
  {
    const size = RATIO_SIZES[plan.ratio] ?? RATIO_SIZES['9:16'];
    const area = safeAreaFor(size);
    if (area.kind !== 'none') {
      const s = area.safe;
      const bad: string[] = [];
      const ks: number[] = [];
      const check = (params: Record<string, unknown> | undefined, what: string, k?: number) => {
        const x = typeof params?.x === 'number' && params.x >= 0 ? params.x * size.width : undefined;
        const y = typeof params?.y === 'number' && params.y >= 0 ? params.y * size.height : undefined;
        const mx = size.width * 0.05, my = size.height * 0.03;
        const outX = x !== undefined && (x < s.x + mx || x > s.x + s.w - mx);
        const outY = y !== undefined && (y < s.y + my || y > s.y + s.h - my);
        if (outX || outY) { bad.push(what); if (k !== undefined && !ks.includes(k)) ks.push(k); }
      };
      plan.sections.forEach((sec, k) => { if (sec.text) check(sec.params, `section ${k} "${sec.text.slice(0, 24)}"`, k); });
      (plan.overlays ?? []).forEach((o) => check(o.params, `overlay "${o.text.slice(0, 24)}"`, o.from));
      (plan.graphics ?? []).forEach((g) => check(g.params, `graphic ${g.graphic}`, g.from));
      const band = (v: number) => Math.round((v / size.height) * 100) / 100;
      if (bad.length) out.push({ rule: 'safe-zone', sections: ks, issue: `${bad.slice(0, 4).join(', ')} placed under Instagram's UI`, fix: `keep x and y inside the safe area (y ${band(s.y + size.height * 0.03)}-${band(s.y + s.h - size.height * 0.03)}, x ${Math.round(((s.x / size.width) + 0.05) * 100) / 100}-${Math.round((((s.x + s.w) / size.width) - 0.05) * 100) / 100}), or leave them out for the style's own place` });
    }
  }

  // duplicate: the same moment twice, or two near-identical clips
  {
    const cast = plan.sections.flatMap((s, k) => (s.clips ?? []).map((ref) => ({ k, ref, n: clipNumber(ref), at: atOf(ref) })));
    const seconds = (n: number | undefined) => clips.find((c) => c.n === n)?.seconds ?? Infinity;
    const pairs: string[] = [];
    const ks: number[] = [];
    const add = (a: typeof cast[number], b: typeof cast[number], why: string) => {
      pairs.push(`${a.ref} (section ${a.k}) and ${b.ref} (section ${b.k})${why}`);
      for (const k of [a.k, b.k]) if (!ks.includes(k)) ks.push(k);
    };
    const features = clips.flatMap((c) => (c.features?.dHash ? [{ ...c.features, assetId: `#${c.n}` }] : []));
    const groups = groupNearDuplicates(features);
    for (let i = 0; i < cast.length; i++) {
      for (let j = i + 1; j < cast.length; j++) {
        const a = cast[i]!, b = cast[j]!;
        if (a.n === undefined || b.n === undefined) continue;
        if (a.n === b.n) {
          const same = a.at !== undefined && b.at !== undefined ? Math.abs(a.at - b.at) < SAME_MOMENT_SEC : a.at === undefined && b.at === undefined && seconds(a.n) < ONE_MOMENT_CLIP_SEC;
          if (same) add(a, b, '');
        } else {
          const ga = groups.get(`#${a.n}`);
          if (ga && ga === groups.get(`#${b.n}`)) add(a, b, ' look the same');
        }
      }
    }
    if (pairs.length) out.push({ rule: 'duplicate', sections: ks.sort((x, y) => x - y), issue: `the same shot twice: ${pairs.slice(0, 3).join('; ')}`, fix: 'cast another clip, or a moment at least 1 s away (@seconds); of two near-identical clips keep the better one' });
  }
  return out;
}

/** "#5@12" → 12; no @ → undefined. */
function atOf(ref: string): number | undefined {
  const m = /@([\d.]+)$/.exec(ref.trim());
  return m ? Number(m[1]) : undefined;
}

/** The brief from loose JSON (the treatment's or the tool's `brief`), or undefined when it sets nothing. */
export function parseBrief(raw: unknown): PlanBrief | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const brief: PlanBrief = {};
  for (const k of ['seconds', 'minSeconds', 'maxSeconds', 'songFrom', 'songTo'] as const) { const v = num(r[k]); if (v !== undefined) brief[k] = v; }
  const must = Array.isArray(r.mustUse) ? r.mustUse.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [];
  if (must.length) brief.mustUse = must;
  return Object.keys(brief).length ? brief : undefined;
}

/** One line per violation, for a refusal or a report. */
export const violationText = (v: PlanViolation) => `[${v.rule}] ${v.issue}: ${v.fix}`;
