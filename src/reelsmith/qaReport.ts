// RS-1266: one QA call after export. While the rendered file is still on the server (next to the contact sheet of
// RS-1232) the app checks it four ways beyond the export checks (V1-V10): a click scan at each audio seam (RS-1265),
// a local re-transcription of the file against the words the timeline deleted (a deleted word that is still heard),
// the caption and title boxes against faces found in the exported frames, and those boxes against Instagram's covered
// bands. `reels_qa_report` returns it as under 2 KB of JSON with the file's SHA-256; the director gets one review and at
// most two fix passes (export again after each) before it asks the user.
import type { CaptionsData } from '../captions/types';
import { buildCaptionPages } from '../captions/captionPages';
import { effectivePreset } from '../captions/renderStyles';
import { captionOverlayVisible, captionTrackEntries, type TimelineItem, type TimelineState } from '../editor/types';
import { hasOperationalTranscript, msToFrame, type TranscriptWord } from '../transcript/types';
import { itemEditOpts, itemWindow, keptSegments, projectMediaWindowWords, projectRetimedWords } from '../transcript/edit';
import { DEFAULT_SAFE_ZONE, safeAreaFor, textBox, type Rect, type SafeZone } from './safeZone';

export type QaStatus = 'PASS' | 'WARN' | 'FAIL';
export interface QaCheck { id: string; status: QaStatus; detail: string }
interface Canvas { width: number; height: number }

type QaState = Pick<TimelineState, 'items' | 'fps' | 'width' | 'height' | 'tracks' | 'transitions' | 'captions' | 'captionsHidden' | 'trackOrder'>;

const sec = (frames: number, fps: number) => frames / fps;
const norm = (w: string) => w.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}']+/gu, '').replace(/^'+|'+$/g, '');

function audible(state: QaState, it: TimelineItem): boolean {
  if (it.kind !== 'audio' && it.kind !== 'video') return false;
  if ((it.volume ?? 1) <= 0) return false;
  const flags = state.tracks?.[it.track];
  return !flags?.muted && !flags?.hidden;
}

/**
 * Where two sounds meet with no crossfade, in reel seconds: two audible clips butted on one track (no transition
 * between them), and each cut a word deletion or a capped pause makes inside an audio clip.
 */
export function audioSeams(state: QaState): number[] {
  const fps = state.fps;
  const out = new Set<number>();
  const crossed = new Set((state.transitions ?? []).filter((t) => t.enabled !== false).map((t) => `${t.outgoingItemId}>${t.incomingItemId}`));
  const byTrack = new Map<string, TimelineItem[]>();
  for (const it of state.items) if (audible(state, it)) byTrack.set(String(it.track), [...(byTrack.get(String(it.track)) ?? []), it]);
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.startFrame - b.startFrame);
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1]!, b = list[k]!;
      if (a.startFrame + a.durationInFrames === b.startFrame && !crossed.has(`${a.id}>${b.id}`)) out.add(Number(sec(b.startFrame, fps).toFixed(3)));
    }
  }
  for (const it of state.items) {
    if (it.kind !== 'audio' || !audible(state, it) || !hasOperationalTranscript(it)) continue;
    const segs = keptSegments(it.transcript, new Set(it.deletedWordIdx ?? []), fps, it.startFrame, { ...itemEditOpts(it), window: itemWindow(it) });
    for (let k = 1; k < segs.length; k++) if (segs[k]!.srcStartFrame !== segs[k - 1]!.srcEndFrame) out.add(Number(sec(segs[k]!.fromFrame, fps).toFixed(3)));
  }
  return [...out].sort((a, b) => a - b);
}

/** The words the reel should say, in reel ms (what the captions follow): an audio clip's edited stream, a video clip's window. */
export function keptWords(state: QaState): TranscriptWord[] {
  return state.items.filter((it) => audible(state, it) && hasOperationalTranscript(it)).flatMap((it) => (it.kind === 'audio'
    ? projectRetimedWords(it.transcript!, new Set(it.deletedWordIdx ?? []), state.fps, it.startFrame, { ...itemEditOpts(it), window: itemWindow(it) }).words
    : projectMediaWindowWords(it.transcript!, state.fps, it).words)).sort((a, b) => a.start - b.start);
}

export interface DeletedProbe { word: string; atSec: number }

/** Each deleted word of an audio clip and the reel second where it was cut out (where it would be heard if it came back). */
export function deletedWordProbes(state: QaState): DeletedProbe[] {
  const fps = state.fps;
  const out: DeletedProbe[] = [];
  for (const it of state.items) {
    if (it.kind !== 'audio' || !audible(state, it) || !hasOperationalTranscript(it) || !it.deletedWordIdx?.length) continue;
    const segs = keptSegments(it.transcript, new Set(it.deletedWordIdx), fps, it.startFrame, { ...itemEditOpts(it), window: itemWindow(it) });
    if (!segs.length) continue;
    const lo = Math.min(...segs.map((s) => s.srcStartFrame)), hi = Math.max(...segs.map((s) => s.srcEndFrame));
    for (const i of it.deletedWordIdx) {
      const w = it.transcript[i];
      if (!w || !norm(w.text)) continue;
      const s = msToFrame(w.start, fps);
      if (s < lo || s >= hi) continue; // trimmed away with the clip's window, not deleted inside it
      const before = segs.filter((g) => g.srcEndFrame <= s).sort((a, b) => b.srcEndFrame - a.srcEndFrame)[0];
      out.push({ word: w.text.trim(), atSec: Number(sec(before ? before.fromFrame + before.durFrames : segs[0]!.fromFrame, fps).toFixed(2)) });
    }
  }
  return out;
}

export interface HeardWord { text: string; startSec: number }

/** a deleted word counts as heard when the export has more of it near the cut than the kept words there explain */
const NEAR_SEC = 0.7;

export function wordsCheck(probes: readonly DeletedProbe[], expected: readonly TranscriptWord[], heard: readonly HeardWord[] | null, why?: string): QaCheck {
  if (!probes.length && !expected.length) return { id: 'words', status: 'PASS', detail: 'no speech on the timeline' };
  if (!heard) return { id: 'words', status: 'WARN', detail: `not re-transcribed${why ? `: ${why}` : ''}` };
  const back = probes.filter((p) => {
    const w = norm(p.word);
    const near = (t: number) => Math.abs(t - p.atSec) <= NEAR_SEC;
    const inFile = heard.filter((h) => near(h.startSec) && norm(h.text) === w).length;
    const kept = expected.filter((e) => near(e.start / 1000) && norm(e.text) === w).length;
    return inFile > kept;
  });
  if (back.length) return { id: 'words', status: 'FAIL', detail: `deleted word${back.length > 1 ? 's' : ''} still heard: ${back.slice(0, 4).map((p) => `"${p.word}" at ${p.atSec.toFixed(1)}s`).join(', ')}` };
  // how much of what the reel should say the file says (in order); a song over the voice or a noisy room lowers it
  const a = expected.map((e) => norm(e.text)).filter(Boolean), b = heard.map((h) => norm(h.text)).filter(Boolean);
  const lcs = Array<number>(b.length + 1).fill(0);
  for (const x of a) { let prev = 0; for (let j = 1; j <= b.length; j++) { const cur = lcs[j]!; lcs[j] = x === b[j - 1] ? prev + 1 : Math.max(lcs[j]!, lcs[j - 1]!); prev = cur; } }
  const got = lcs[b.length]!;
  const low = a.length >= 8 && got / a.length < 0.6;
  return { id: 'words', status: low ? 'WARN' : 'PASS', detail: `${got} of ${a.length} kept words heard${probes.length ? `, none of the ${probes.length} deleted` : ''}${low ? ' (song over the voice, or the voice too quiet?)' : ''}` };
}

export interface TextBox { kind: 'caption' | 'title'; text: string; atSec: number; box: Rect }

/** Caption page box in canvas px, from the template's size and the block layout (as containerStyle places it). */
function captionBox(captions: CaptionsData, text: string, canvas: Canvas): Rect {
  const preset = effectivePreset(captions);
  const layout = captions.layout;
  const font = canvas.height * (preset.fontSize || 0.04) * (layout?.scale ?? 1);
  const maxW = canvas.width * 0.8;
  const natural = Math.max(1, text.length) * font * 0.55;
  const lines = Math.max(1, Math.ceil(natural / maxW));
  const w = Math.min(natural, maxW), h = lines * font * (preset.lineHeight ?? 1.25);
  const ox = (layout?.offsetXRatio ?? 0) * canvas.width, oy = (layout?.offsetYRatio ?? 0) * canvas.height;
  const anchor = layout?.anchor ?? 'bottom-center';
  const vertical = anchor.startsWith('top') ? 'top' : anchor.startsWith('middle') || anchor === 'center' ? 'middle' : 'bottom';
  const horizontal = anchor.endsWith('left') ? 'left' : anchor.endsWith('right') ? 'right' : 'center';
  const bottomPad = !layout && captions.template === 'netflix' ? 0.09 : 0.08;
  const y = vertical === 'top' ? canvas.height * 0.08 + oy
    : vertical === 'middle' ? canvas.height / 2 + oy - h / 2
      : canvas.height * (1 - bottomPad) - (layout ? oy : 0) - h;
  const x = horizontal === 'left' ? canvas.width * 0.1 + ox : horizontal === 'right' ? canvas.width * 0.9 + ox - w : canvas.width / 2 + ox - w / 2;
  return { x, y, w, h };
}

/** Most frames looked at for faces in one report. */
export const MAX_TEXT_SAMPLES = 14;

/** The on-screen words to check: each caption page and each title, at its middle, spread evenly when there are many. */
export function textBoxes(state: QaState): TextBox[] {
  if (!captionOverlayVisible(state as TimelineState)) return [];
  const canvas = { width: state.width, height: state.height };
  const out: TextBox[] = [];
  for (const { captions } of captionTrackEntries(state as TimelineState)) {
    if (!captions?.enabled) continue;
    for (const p of buildCaptionPages(captions, state.items, state.fps)) {
      const text = p.page.words.map((w) => w.text).join(' ').trim();
      if (text) out.push({ kind: 'caption', text, atSec: (p.page.start + p.page.end) / 2000, box: captionBox(captions, text, canvas) });
    }
  }
  for (const it of state.items) {
    if (it.kind !== 'text' || !String(it.props?.text ?? '').trim() || state.tracks?.[it.track]?.hidden) continue;
    out.push({ kind: 'title', text: String(it.props!.text).replace(/\s+/g, ' ').trim(), atSec: (it.startFrame + it.durationInFrames / 2) / state.fps, box: textBox(it, canvas) });
  }
  out.sort((a, b) => a.atSec - b.atSec);
  if (out.length <= MAX_TEXT_SAMPLES) return out;
  return Array.from({ length: MAX_TEXT_SAMPLES }, (_, k) => out[Math.floor((k * out.length) / MAX_TEXT_SAMPLES)]!);
}

const quote = (t: TextBox) => `${t.kind} "${t.text.length > 22 ? `${t.text.slice(0, 21)}…` : t.text}" at ${t.atSec.toFixed(1)}s`;

/** Faces are fractions of the frame. A box covering 30% of a face (or a face covering 30% of a small box) is over it. */
export function facesCheck(boxes: readonly TextBox[], faces: ReadonlyArray<Rect[] | null>, canvas: Canvas): QaCheck {
  if (!boxes.length) return { id: 'faces', status: 'PASS', detail: 'no captions or titles' };
  const looked = faces.filter((f) => f !== null).length;
  if (!looked) return { id: 'faces', status: 'WARN', detail: 'face detection unavailable; captions not checked against faces' };
  const over = boxes.filter((t, k) => (faces[k] ?? []).some((f) => {
    const fx = f.x * canvas.width, fy = f.y * canvas.height, fw = f.w * canvas.width, fh = f.h * canvas.height;
    const iw = Math.min(t.box.x + t.box.w, fx + fw) - Math.max(t.box.x, fx);
    const ih = Math.min(t.box.y + t.box.h, fy + fh) - Math.max(t.box.y, fy);
    return iw > 0 && ih > 0 && (iw * ih) / Math.min(fw * fh, t.box.w * t.box.h) > 0.3;
  }));
  return over.length
    ? { id: 'faces', status: 'FAIL', detail: `over a face: ${over.slice(0, 3).map(quote).join('; ')}` }
    : { id: 'faces', status: 'PASS', detail: `${looked} caption/title frame${looked > 1 ? 's' : ''} clear of faces` };
}

export function safeCheck(boxes: readonly TextBox[], canvas: Canvas, zone: SafeZone = DEFAULT_SAFE_ZONE): QaCheck {
  const area = safeAreaFor(canvas, zone);
  if (area.kind === 'none' || !boxes.length) return { id: 'safe', status: 'PASS', detail: area.kind === 'none' ? 'no Instagram overlay for this shape' : 'no captions or titles' };
  const s = area.safe;
  const out = boxes.flatMap((t) => {
    const sides = [t.box.y < s.y - 1 && 'top', t.box.y + t.box.h > s.y + s.h + 1 && 'bottom', t.box.x < s.x - 1 && 'left', t.box.x + t.box.w > s.x + s.w + 1 && 'right'].filter(Boolean);
    return sides.length ? [`${quote(t)} (${sides.join(', ')})`] : [];
  });
  return out.length
    ? { id: 'safe', status: 'FAIL', detail: `under ${area.kind === 'reel' ? "Instagram's buttons and caption" : 'the grid crop'}: ${out.slice(0, 3).join('; ')}` }
    : { id: 'safe', status: 'PASS', detail: 'captions and titles inside the safe area' };
}

export function clickCheck(seams: ReadonlyArray<{ atSec: number; ratio: number; click: boolean }> | null, count: number): QaCheck {
  if (!count) return { id: 'click', status: 'PASS', detail: 'no hard audio cuts' };
  if (!seams) return { id: 'click', status: 'WARN', detail: 'audio seams not scanned' };
  const bad = seams.filter((s) => s.click);
  return bad.length
    ? { id: 'click', status: 'FAIL', detail: `click at ${bad.slice(0, 5).map((s) => `${s.atSec.toFixed(2)}s (${Math.round(s.ratio)}x)`).join(', ')}` }
    : { id: 'click', status: 'PASS', detail: `${seams.length} audio cut${seams.length > 1 ? 's' : ''}, no clicks` };
}

// ---- the report, kept for the tool ----

export interface QaReport {
  file: string;
  sha256: string;
  seconds: number;
  checks: QaCheck[];
  /** fingerprint of the timeline that was exported (a later edit makes the report stale) */
  timeline: string;
  /** 0 = the first review of this reel; 1, 2 = fix passes */
  pass: number;
}

/** Fix passes the director may make after its review before it asks the user. */
export const MAX_FIX_PASSES = 2;

let last: QaReport | null = null;
export const qaReportStore = { get: () => last, set: (r: QaReport | null) => { last = r; } };

/** A cheap fingerprint of what the export renders from (items, tracks, captions), to tell a stale report. */
export function timelineFingerprint(state: Pick<TimelineState, 'items' | 'tracks' | 'captions' | 'transitions'>): string {
  const s = JSON.stringify([state.items, state.tracks ?? null, state.captions ?? null, state.transitions ?? null]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/** The pass number of a new report: one more than the last failing one of a different file, else 0. */
export function nextPass(prev: QaReport | null, sha256: string): number {
  if (!prev || prev.checks.every((c) => c.status !== 'FAIL')) return 0;
  return prev.sha256 === sha256 ? prev.pass : prev.pass + 1;
}

export interface QaDeps {
  scan: (src: string, seams: number[]) => Promise<{ sha256: string; seams: Array<{ atSec: number; ratio: number; click: boolean }> }>;
  /** the export re-transcribed on this machine; null with a reason when it cannot be */
  transcribe: (src: string) => Promise<HeardWord[]>;
  /** face boxes (fractions of the frame) in the exported frame at that second */
  faces: (src: string, atSec: number, canvas: Canvas) => Promise<Rect[]>;
}

/** Runs every check on the rendered file and keeps the report. Never throws: the video is already delivered. */
export async function runQaReport(opts: {
  state: QaState; src: string; seconds: number; videoName: string; checks: QaCheck[]; deps: QaDeps;
}): Promise<QaReport> {
  const { state, src, deps } = opts;
  const canvas = { width: state.width, height: state.height };
  const seams = audioSeams(state);
  const probes = deletedWordProbes(state);
  const expected = keptWords(state);
  const boxes = textBoxes(state);
  const scan = await deps.scan(src, seams).catch(() => null);
  let heard: HeardWord[] | null = null;
  let why: string | undefined;
  if (probes.length || expected.length) {
    heard = await deps.transcribe(src).catch((error: unknown) => { why = error instanceof Error ? error.message.slice(0, 80) : 'failed'; return null; });
  }
  const faces: Array<Rect[] | null> = [];
  for (const t of boxes) faces.push(await deps.faces(src, Math.min(t.atSec, Math.max(0, opts.seconds - 0.05)), canvas).catch(() => null));
  const checks = [
    ...opts.checks.map((c) => ({ id: c.id, status: c.status, detail: c.detail })),
    clickCheck(scan?.seams ?? null, seams.length),
    wordsCheck(probes, expected, heard, why),
    facesCheck(boxes, faces, canvas),
    safeCheck(boxes, canvas),
  ];
  const sha256 = scan?.sha256 ?? '';
  const report: QaReport = { file: opts.videoName, sha256, seconds: opts.seconds, checks, timeline: timelineFingerprint(state), pass: nextPass(qaReportStore.get(), sha256) };
  qaReportStore.set(report);
  return report;
}

/** Under this many bytes of JSON, so the report never reaches the agent as an artifact. */
export const QA_REPORT_MAX_BYTES = 2000;

/** reels_qa_report: the last export's QA as compact JSON. `sha256` = the hash of an earlier report, to check it is still the latest. */
export function qaReportTool(args: Record<string, unknown>, current: Pick<TimelineState, 'items' | 'tracks' | 'captions' | 'transitions'>): unknown {
  const r = qaReportStore.get();
  if (!r) return { error: 'No QA report yet: it is made when the reel is exported with Instagram-ready on (Export → Video). Ask the user to export, or export it, then call this again.' };
  const fail = r.checks.filter((c) => c.status === 'FAIL'), warn = r.checks.filter((c) => c.status === 'WARN');
  const stale = timelineFingerprint(current) !== r.timeline;
  const asked = typeof args.sha256 === 'string' && args.sha256.trim() ? args.sha256.trim().toLowerCase() : null;
  const fixesLeft = Math.max(0, MAX_FIX_PASSES - r.pass);
  const next = stale
    ? 'The timeline changed after this export, so this report is not about the current reel: export again, then call reels_qa_report.'
    : !fail.length
      ? 'The export passes. Tell the user it is ready (mention any warning in a few words).'
      : fixesLeft > 0
        ? `Fix the failures (a directed reel with reels_director_fix), export again and call reels_qa_report: fix pass ${r.pass + 1} of ${MAX_FIX_PASSES}. Only a report of the new file's sha256 counts.`
        : `${MAX_FIX_PASSES} fix passes made and it still fails: stop and ask the user, naming each failure with its second.`;
  const line = (c: QaCheck) => `${c.id}: ${c.detail}`.slice(0, 150);
  const out = {
    file: r.file, sha256: r.sha256, seconds: Number(r.seconds.toFixed(2)), ok: !fail.length,
    review: r.pass === 0 ? 'first review' : `fix pass ${r.pass} of ${MAX_FIX_PASSES}`,
    ...(stale ? { stale: true } : {}),
    ...(asked && asked !== r.sha256 ? { sha256Changed: `you asked about ${asked.slice(0, 12)}…; this report is for the newer file ${r.sha256.slice(0, 12)}…` } : {}),
    fail: fail.map(line), warn: warn.map(line),
    passed: r.checks.filter((c) => c.status === 'PASS').map((c) => c.id).join(' '),
    next,
  };
  // keep it small: drop the longest lines' tails until it fits
  while (JSON.stringify(out).length > QA_REPORT_MAX_BYTES && (out.warn.length || out.fail.length > 1)) {
    if (out.warn.length) out.warn.pop(); else out.fail.pop();
  }
  return out;
}

/** The app's own checks: the server scan, the on-device transcriber, the face finder (loaded only when used). */
export function appQaDeps(fetcher: typeof fetch = fetch): QaDeps {
  return {
    scan: async (src, seams) => {
      const res = await fetcher('/api/reelsmith/qa-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, seams }) });
      const body = await res.json().catch(() => null) as { sha256?: string; seams?: Array<{ atSec: number; ratio: number; click: boolean }>; error?: string } | null;
      if (!res.ok || !body?.sha256) throw new Error(body?.error ?? `qa scan failed (${res.status})`);
      return { sha256: body.sha256, seams: body.seams ?? [] };
    },
    transcribe: async (src) => {
      const { localTranscribePath } = await import('../transcript/local-asr');
      const r = await localTranscribePath(src);
      return r.words.map((w) => ({ text: w.text, startSec: w.start / 1000 }));
    },
    faces: async (src, atSec, canvas) => {
      const { findPeople } = await import('./peopleFinder');
      const people = await findPeople({ src, kind: 'video', sec: atSec, width: canvas.width, height: canvas.height });
      return people.flatMap((p) => (p.face ? [p.face] : []));
    },
  };
}
