// RS-1211: the director's own review of a built reel, returned with the build so the agent needs no extra turns to
// check it. Deterministic and local: it reads the plan, the beat clock and the song analysis, and names concrete
// problems with a concrete fix ("the drop at 11.2 s lands in section 4, a plain cut: time an effect to it"). The agent
// still sees one frame per section; this catches what a frame cannot show (pacing, timing, the song, reading speed).
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { paceFindings, type SongMap } from './songMap';

export interface ReviewFinding { section?: number; issue: string; fix: string }

export interface ReviewInput {
  plan: ReelPlan;
  /** section start and end in reel seconds */
  spans: Array<{ from: number; to: number }>;
  /** where the song starts in its own seconds, and its analysis */
  musicStartSec?: number;
  song?: { seconds: number; dropSec?: number; loudestSec?: number; bpm?: number; suggest?: { musicStart: number } };
  /** RS-1224: the song's loudness bar by bar from the reel start */
  songMap?: SongMap;
  /** RS-1228: how far the subject jumps across the frame at each fast cut (0 = same place, 1 = the frame's width) */
  eyeJumps?: ReadonlyArray<{ section: number; at: number; jump: number }>;
  /** RS-1225: shots where someone talks while their sound is off under the song */
  voices?: ReadonlyArray<{ section: number; at: number; seconds: number }>;
}

/** Moves and settings that give a section a peak: what a drop should land on. */
const PEAK_MOVES = new Set(['flash-cuts', 'zoom-punch', 'velocity', 'speed-ramp', 'match-cut', 'break-in']);
const PEAK_TRANSITIONS = new Set(['zoom-through', 'whip-blur', 'spin-zoom', 'flash', 'chroma-glitch', 'flip-3d', 'mirror-flip', 'prism-flash', 'impact-shake', 'radial-blur', 'glitch-cut']);
const SIGNATURE_MOVES = new Set(['velocity', 'photo-3d', 'freeze-intro', 'match-cut', 'strips-reveal', 'cards-finale', 'break-in', 'speed-ramp', 'rewind']);

const hasPeak = (s: ReelPlan['sections'][number]) => PEAK_MOVES.has(s.move) || s.textStyle === 'slam'
  || (s.transition !== undefined && PEAK_TRANSITIONS.has(s.transition))
  || (s.effects ?? []).some((e) => e.timing === 'drop' || e.timing === 'beat');

export function reviewDirectorPlan(r: ReviewInput): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const { plan, spans } = r;
  const total = spans.at(-1)?.to ?? 0;
  const start = r.musicStartSec ?? 0;
  // the song: a long song started in its intro misses its energy; the drop should meet a peak
  // (judged against the same suggestion the options gave, so the review never contradicts it)
  const suggested = r.song?.suggest?.musicStart;
  if (r.song && r.song.seconds > 40 && suggested !== undefined && start + 4 < suggested) {
    out.push({ issue: `the song plays from ${start.toFixed(1)} s, before where it lifts`, fix: `set musicStart to ${suggested} (the song's suggest) unless the story wants the quiet intro` });
  }
  if (r.song?.dropSec !== undefined) {
    const at = r.song.dropSec - start;
    if (at > 0.5 && at < total - 0.5) {
      // a drop up to a third of a second before a section starts belongs to that section (beat rounding)
      const k = spans.findIndex((s) => at >= s.from - 0.35 && at < s.to - 0.35);
      const sec = k >= 0 ? plan.sections[k] : undefined;
      if (sec && !hasPeak(sec) && !(spans[k]!.from - at < 0.3 && plan.sections[k]?.transition)) {
        out.push({ section: k, issue: `the song's drop is at ${at.toFixed(1)} s of the reel, inside section ${k} (${sec.move}), which has no peak`, fix: `start a section on the drop with flash-cuts, zoom-punch or velocity, or give section ${k} an effect with timing "drop" (zoom-blur, light-rays) or a punchy transition` });
      }
    }
  }
  // one signature moment makes a reel feel directed; most reels over 10 s should have one
  if (total > 10 && !plan.sections.some((s) => SIGNATURE_MOVES.has(s.move)) && !plan.sections.some((s) => (s.effects ?? []).some((e) => e.timing && e.timing !== 'steady'))) {
    out.push(plan.voiceover && !plan.music
      ? { issue: 'no signature moment: every section is a plain cut, hold or burst', fix: 'add one on the voiceover\'s key line: velocity on the best action shot, photo-3d on a portrait, a freeze-intro for a person, or one effect with timing "drop" on that section' }
      : { issue: 'no signature moment: every section is a plain cut, hold or burst and no effect moves with the music', fix: 'add one: velocity on the best action shot, photo-3d on a portrait, a freeze-intro for a person, or one effect timed to the drop' });
  }
  // pacing: long holds on a fast song read as dead air
  const beatSec = r.song?.bpm ? 60 / r.song.bpm : 0.5;
  plan.sections.forEach((s, k) => {
    const len = (spans[k]?.to ?? 0) - (spans[k]?.from ?? 0);
    // a cut changes shot every `every` beats (default 2): only one shot running long is a hold
    const every = typeof s.params?.every === 'number' ? s.params.every : 2;
    const longest = s.move === 'hold' ? len : s.move === 'cut' ? Math.min(len, beatSec * every) : 0;
    const words = s.text ? s.text.split(/\s+/).filter(Boolean).length : 0;
    // a held shot under a line is a quiet moment: it may last as long as the line takes to read calmly and look at
    if (longest > Math.max(4, beatSec * 8, words / 2 + 2) && k !== plan.sections.length - 1) {
      const floor = words ? ` (no shorter than ${(words / 3.2).toFixed(1)} s: its line needs that long to read)` : '';
      out.push({ section: k, issue: `section ${k} (${s.move}) shows one shot for ${longest.toFixed(1)} s`, fix: `cut it every 2 beats, shorten it${floor}, or give it a slow move (photo-3d, a fade-timed effect)` });
    }
    // reading speed: about 3 words a second is the most people read on a moving picture
    if (s.text) {
      if (words / Math.max(0.5, len) > 3.2) out.push({ section: k, issue: `"${s.text}" is ${words} words in ${len.toFixed(1)} s, too fast to read`, fix: 'shorten the line (keep the user\'s words, drop some) or give the section more beats' });
    }
  });
  // a line meant to go behind a person needs a style big enough to be seen around them
  plan.sections.forEach((s, k) => {
    if (s.textBehind && s.textStyle && ['caption', 'pop-words', 'typewriter', 'location-tag', 'highlight'].includes(s.textStyle)) {
      out.push({ section: k, issue: `textBehind with ${s.textStyle}: small text hides behind the person and barely shows`, fix: 'use big-title, cinematic-title, slam or rise-lines for a line behind the person' });
    }
  });
  // neighbouring sections showing the same moment of a clip ("#1@3" and "#1@7" are different shots, not a repeat;
  // flagging them sent every one-clip reel into a rebuild that could not clear the finding)
  plan.sections.forEach((s, k) => {
    if (k === 0) return;
    const prev = (plan.sections[k - 1]!.clips ?? []).map(clipMoment);
    const same = (s.clips ?? []).map(clipMoment).filter((c) => prev.some((p) => p.id === c.id && Math.abs(p.at - c.at) < SAME_MOMENT_SEC));
    if (same.length && s.clips!.length <= 2) out.push({ section: k, issue: `section ${k} repeats a clip from section ${k - 1}`, fix: 'use another clip, or a clearly different moment (@seconds)' });
  });
  reviewGraphics(plan, spans, beatSec, out);
  // RS-1224: the pace against the song's quiet and loud bars, and transitions on an odd beat
  if (r.songMap) {
    const beatOf = (sec: number) => Math.round((sec / beatSec) * 2) / 2;
    out.push(...paceFindings(plan, spans.map((x) => ({ b0: beatOf(x.from), b1: beatOf(x.to) })), r.songMap));
  }
  // RS-1228: on fast cuts the eye stays where the last subject was; a subject on the far side of the frame is lost
  const bySection = new Map<number, number[]>();
  for (const j of r.eyeJumps ?? []) bySection.set(j.section, [...(bySection.get(j.section) ?? []), j.jump]);
  for (const [k, jumps] of bySection) {
    const sorted = [...jumps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (jumps.length >= 2 && median > EYE_JUMP) {
      out.push({ section: k, issue: `in section ${k} (${plan.sections[k]?.move}) the subject jumps across the frame at each fast cut (${Math.round(median * 100)}% of the frame on the median cut): the eye cannot follow`, fix: 'order its clips so each subject sits near where the last one was (left after left, centre after centre), or cut every 2 beats there' });
    }
  }
  // RS-1225: someone talks for most of a shot with their voice off: a muted mouth reads as a mistake. Phone footage
  // talks a lot (half the trek clips did), so only the longest such shot is named, and only when nothing is heard yet
  const muted = (r.voices ?? []).filter((v) => !plan.sections[v.section]?.naturalSound).sort((a, b) => b.seconds - a.seconds)[0];
  // RS-1251: under the user's voiceover the clips stay silent on purpose
  if (muted && !plan.voiceover && !plan.sections.some((x) => x.naturalSound)) {
    out.push({ section: muted.section, issue: `someone talks through the ${muted.seconds} s shot at ${muted.at} s (section ${muted.section}) with their sound off under the song`, fix: 'if what they say matters, set naturalSound "under" on that section (the song dips and they are heard); otherwise cast a moment where nobody talks' });
  }
  // RS-1226: a loop replays from the first frame; the ending must hand straight back to it
  if (plan.loop) {
    const lastK = plan.sections.length - 1;
    const end = plan.sections[lastK];
    if (end && (end.move === 'black' || end.move === 'cards-finale')) out.push({ section: lastK, issue: `a loop that ends on ${end.move} goes to black before it replays`, fix: 'end on footage that leads into the first shot (a hold or a cut), or set loop false' });
    if (end?.transition && ['dipToBlack', 'dipToWhite', 'crossfade'].includes(end.transition)) out.push({ section: lastK, issue: `a loop with ${end.transition} into its last section reads as an ending`, fix: 'a hard cut or a moving transition; the replay is the ending' });
    const beats = Math.round(total / beatSec);
    if (r.song && beats % 4 !== 0) out.push({ issue: `the loop is ${beats} beats: the song restarts mid-bar`, fix: `make the beats add up to ${Math.floor(beats / 4) * 4} or ${Math.ceil(beats / 4) * 4}` });
  }
  return out;
}

/** A median jump past this share of the frame on fast cuts loses the viewer's eye. */
const EYE_JUMP = 0.35;

/** Words for a person in the user's story: a line that names one should show who it is. */
export const PERSON = /\b(bro|bhai|bhaiya|dude|buddy|homie|my (?:friend|friends|best friend|brother|sister|bf|gf|boyfriend|girlfriend|wife|husband|mom|dad|boss|partner|cousin)|mom|mum|mummy|maa|dad|papa|boss)\b/i;
/** What points a person out: a marker on them, a tag riding on them, or a freeze that introduces them. */
const showsPerson = (plan: ReelPlan) => (plan.graphics ?? []).some((g) => g.graphic === 'annotate')
  || plan.sections.some((s) => s.textStyle === 'follow-tag' || s.move === 'freeze-intro') || (plan.overlays ?? []).some((o) => o.style === 'follow-tag');

/** Graphics that frame the whole reel and may sit under another one. */
const FRAME_GRAPHICS = new Set(['chapter-bar', 'camcorder']);
/** Graphics people read: they need a calm shot, not a burst of cuts. */
const READ_GRAPHICS = new Set(['route-map', 'boarding-pass', 'chat-bubbles', 'notification', 'hud-stats', 'loading-bar']);
const FAST_MOVES = new Set(['flash-cuts', 'zoom-punch', 'postcard-band', 'break-in', 'match-cut']);
/** A marker on a person needs them still in frame: a velocity or speed ramp whips them past (seen in the AMK run). */
const AIMED_GRAPHICS = new Set(['annotate']);
const WHIP_MOVES = new Set(['velocity', 'speed-ramp']);

/** RS-1213: two graphics fighting for the same seconds, and a graphic to read over cuts too fast to read it on. */
function reviewGraphics(plan: ReelPlan, spans: ReviewInput['spans'], beatSec: number, out: ReviewFinding[]): void {
  // the story names someone ("bro lied to me") and nothing shows who: the first real run left "bro" unseen
  const named = [...plan.sections.map((s, k) => ({ text: s.text, k })), ...(plan.overlays ?? []).map((o) => ({ text: o.text, k: o.from }))]
    .map((x) => ({ ...x, who: x.text ? PERSON.exec(x.text)?.[1] : undefined })).find((x) => x.who);
  if (named && !showsPerson(plan)) {
    out.push({ section: named.k, issue: `the story names "${named.who}" but nothing shows who that is`, fix: `add an annotate graphic (arrow, text "${(named.who ?? '').toLowerCase()}") on the hold or slow cut where that person is clearest, or a follow-tag line; leave it out only if no shot shows one person clearly` });
  }
  const when = (plan.graphics ?? []).map((g) => {
    const from = (spans[g.from]?.from ?? 0) + (g.beat ?? 0) * beatSec;
    return { g, from, to: g.beats !== undefined ? from + g.beats * beatSec : spans[g.to]?.to ?? from };
  });
  when.forEach((a, i) => {
    for (const b of when.slice(i + 1)) {
      if (FRAME_GRAPHICS.has(a.g.graphic) || FRAME_GRAPHICS.has(b.g.graphic)) continue;
      const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
      if (overlap > 0.3) out.push({ section: b.g.from, issue: `graphics ${a.g.graphic} and ${b.g.graphic} are on screen together for ${overlap.toFixed(1)} s`, fix: `end ${a.g.graphic} before ${b.g.graphic} starts (its beats or to), or drop one` });
    }
    if (READ_GRAPHICS.has(a.g.graphic) || AIMED_GRAPHICS.has(a.g.graphic)) {
      const aimed = AIMED_GRAPHICS.has(a.g.graphic);
      const fast = plan.sections.slice(a.g.from, a.g.to + 1).find((s) => FAST_MOVES.has(s.move) || (aimed && WHIP_MOVES.has(s.move)) || (s.move === 'cut' && typeof s.params?.every === 'number' && s.params.every < 2));
      if (fast) out.push({ section: a.g.from, issue: aimed ? `the ${a.g.graphic} mark needs its person still in frame, but runs over ${fast.move}, which whips past them` : `${a.g.graphic} has to be read, but runs over ${fast.move} cuts`, fix: aimed ? 'put it on a hold (or a cut of 2+ beats) of their clearest shot; a hold of the same clip right after the move works' : 'put it over a hold or a cut of 2+ beats a shot' });
    }
  });
}

/** Starts closer than this (in source seconds) show the same moment. */
const SAME_MOMENT_SEC = 1;
const clipMoment = (ref: string) => { const [id, at] = ref.split('@'); return { id: id!, at: Number(at) || 0 }; };
