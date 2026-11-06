// RS-1266: the QA report after export. The timeline side (seams, deleted words, caption and title boxes) is checked
// here on a hand-built reel; the click scan on real audio is server/reelsmith/qaScan.verify.ts.
import assert from 'node:assert/strict';
import {
  audioSeams, deletedWordProbes, keptWords, MAX_FIX_PASSES, QA_REPORT_MAX_BYTES, qaReportStore, qaReportTool, runQaReport, textBoxes,
  wordsCheck, type QaDeps,
} from './qaReport';
import { REELS_CAPTION_STYLES } from './captionStyles';
import { safeCheck } from './qaReport';

const FPS = 30;
const words = [
  { text: 'So', start: 0, end: 300 }, { text: 'um,', start: 400, end: 700 }, { text: 'we', start: 800, end: 1100 },
  { text: 'went', start: 1200, end: 1500 }, { text: 'up.', start: 1600, end: 1900 },
];
const item = (id: string, track: string, kind: string, start: number, dur: number, extra: Record<string, unknown> = {}) =>
  ({ id, track, kind, name: id, startFrame: start, durationInFrames: dur, src: `/media/uploads/${id}.mp4`, ...extra });

const state = {
  fps: FPS, width: 1080, height: 1920,
  trackOrder: ['C1', 'T1', 'V1', 'A1', 'A2'],
  tracks: {
    C1: { kind: 'caption', captions: { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'voice', layout: REELS_CAPTION_STYLES[0]!.layout } },
    A1: { kind: 'audio' }, A2: { kind: 'audio', muted: true }, V1: { kind: 'video' }, T1: { kind: 'video' },
  },
  items: [
    // "um" deleted: the voice plays "So" then "we went up" (the cut is at 0.3 s)
    item('voice', 'A1', 'audio', 0, 42, { transcript: words, deletedWordIdx: [1] }),
    // two pictures with sound butted at 2 s (a hard cut), then a transition into the third (a crossfade, not a seam)
    item('v1', 'V1', 'video', 0, 60), item('v2', 'V1', 'video', 60, 60), item('v3', 'V1', 'video', 120, 30),
    // butted clips on a muted track and a silenced clip make no seams
    item('m1', 'A2', 'audio', 0, 30), item('m2', 'A2', 'audio', 30, 30),
    item('quiet', 'V1', 'video', 150, 30, { volume: 0 }), item('quiet2', 'V1', 'video', 180, 30, { volume: 0 }),
    // a title pushed up into Instagram's header
    item('title', 'T1', 'text', 60, 60, { props: { text: 'SUMMIT DAY', fontSize: 120 }, transform: { y: -45 } }),
  ],
  transitions: [{ id: 't', type: 'crossfade', durationInFrames: 10, outgoingItemId: 'v2', incomingItemId: 'v3', trackId: 'V1' }],
  selectedId: null,
} as never;

// seams: the word cut inside the voice and the hard picture cut; not the transition, the muted track or silent clips
assert.deepEqual(audioSeams(state), [0.3, 2]);

// the deleted "um," would be heard at the cut, 0.3 s in
assert.deepEqual(deletedWordProbes(state), [{ word: 'um,', atSec: 0.3 }]);
assert.deepEqual(keptWords(state).map((w) => w.text), ['So', 'we', 'went', 'up.']);

// the re-transcription: "um" back near the cut fails; the same word kept nearby on the timeline does not count
const probes = deletedWordProbes(state);
const kept = keptWords(state);
const heard = (...xs: Array<[string, number]>) => xs.map(([text, startSec]) => ({ text, startSec }));
assert.equal(wordsCheck(probes, kept, heard(['so', 0], ['we', 0.3], ['went', 0.7], ['up', 1.1])).status, 'PASS');
const back = wordsCheck(probes, kept, heard(['so', 0], ['um', 0.4], ['we', 0.7], ['went', 1.1], ['up', 1.5]));
assert.equal(back.status, 'FAIL');
assert.match(back.detail, /"um," at 0\.3s/);
assert.equal(wordsCheck([{ word: 'we', atSec: 1 }], [{ text: 'we', start: 1100, end: 1300 }], heard(['we', 1.1])).status, 'PASS', 'a kept "we" explains the "we" heard');
assert.equal(wordsCheck(probes, kept, null, 'no local model').status, 'WARN');

// on-screen words: one caption page of the kept words (at the bottom) and the title
const boxes = textBoxes(state);
assert.deepEqual(boxes.map((b) => [b.kind, b.text]), [['caption', 'So we went up.'], ['title', 'SUMMIT DAY']]);
const cap = boxes[0]!.box;
assert.ok(cap.y > 1300 && cap.y + cap.h <= 1920 - 360, `the Reels caption layout clears Instagram's bottom band (${JSON.stringify(cap)})`);
// upstream's default place (8% above the bottom) is under Instagram's caption and audio line
const upstream = { ...(state as object), tracks: { ...(state as { tracks: object }).tracks, C1: { kind: 'caption', captions: { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'voice' } } } } as never;
assert.match(safeCheck(textBoxes(upstream).filter((b) => b.kind === 'caption'), { width: 1080, height: 1920 }).detail, /caption "So we went up\." at 0\.\d+s \(bottom\)/);

// ---- the fixture: a deleted word restored, a caption over a face and a hard click fail exactly those three ----
const faceOnCaption = { x: (cap.x + cap.w / 2 - 80) / 1080, y: (cap.y - 40) / 1920, w: 160 / 1080, h: 200 / 1920 };
const deps = (o: { click: boolean; um: boolean; face: boolean; sha: string }): QaDeps => ({
  scan: async (_src, seams) => ({ sha256: o.sha, seams: seams.map((atSec) => ({ atSec, ratio: o.click && atSec === 2 ? 48 : 1.3, click: o.click && atSec === 2 })) }),
  transcribe: async () => (o.um ? heard(['so', 0], ['um', 0.35], ['we', 0.7], ['went', 1.1], ['up', 1.5]) : heard(['so', 0], ['we', 0.3], ['went', 0.7], ['up', 1.1])),
  faces: async (_src, atSec) => (o.face && atSec < 1 ? [faceOnCaption] : [{ x: 0.05, y: 0.55, w: 0.08, h: 0.05 }]),
});
const v = [{ id: 'V1', status: 'PASS' as const, detail: 'mp4, faststart' }, { id: 'V10', status: 'PASS' as const, detail: 'no frozen picture' }];
// the title stays inside the safe area for the fixture
const clean = { ...(state as object), items: (state as { items: Array<Record<string, unknown>> }).items.map((i) => (i.id === 'title' ? { ...i, transform: { y: -20 } } : i)) } as never;

qaReportStore.set(null);
const bad = await runQaReport({ state: clean, src: '/media/uploads/r.mp4', seconds: 7, videoName: 'Trek.mp4', checks: v, deps: deps({ click: true, um: true, face: true, sha: 'a'.repeat(64) }) });
assert.deepEqual(bad.checks.filter((c) => c.status === 'FAIL').map((c) => c.id), ['click', 'words', 'faces']);
assert.equal(bad.checks.filter((c) => c.status === 'WARN').length, 0);
assert.equal(bad.pass, 0);
const tool1 = qaReportTool({}, clean) as Record<string, any>;
assert.equal(tool1.ok, false);
assert.equal(tool1.review, 'first review');
assert.equal(tool1.fail.length, 3);
assert.match(tool1.fail[0], /click at 2\.00s/);
assert.match(tool1.next, /fix pass 1 of 2/);
assert.ok(JSON.stringify(tool1).length < QA_REPORT_MAX_BYTES);

// a clean export passes, and resets the passes
const good = await runQaReport({ state: clean, src: '/media/uploads/r2.mp4', seconds: 7, videoName: 'Trek.mp4', checks: v, deps: deps({ click: false, um: false, face: false, sha: 'b'.repeat(64) }) });
assert.deepEqual(good.checks.filter((c) => c.status !== 'PASS'), []);
assert.equal(good.pass, 1, 'the export after a failing review is fix pass 1');
const tool2 = qaReportTool({ sha256: 'a'.repeat(64) }, clean) as Record<string, any>;
assert.equal(tool2.ok, true);
assert.match(tool2.sha256Changed, /newer file bbbb/);
assert.equal(tool2.passed, 'V1 V10 click words faces safe');

// the title in the header fails the safe area
const hdr = await runQaReport({ state, src: '/media/uploads/r3.mp4', seconds: 7, videoName: 'Trek.mp4', checks: v, deps: deps({ click: false, um: false, face: false, sha: 'c'.repeat(64) }) });
assert.deepEqual(hdr.checks.filter((c) => c.status === 'FAIL').map((c) => c.id), ['safe']);
assert.match(hdr.checks.find((c) => c.id === 'safe')!.detail, /title "SUMMIT DAY" at 3\.0s \(top\)/);
assert.equal(hdr.pass, 0, 'after a passing report the count starts again');

// two fix passes that still fail: ask the user
for (const [k, sha] of ['d', 'e'].entries()) {
  const r = await runQaReport({ state, src: `/media/uploads/f${k}.mp4`, seconds: 7, videoName: 'Trek.mp4', checks: v, deps: deps({ click: true, um: false, face: false, sha: sha.repeat(64) }) });
  assert.equal(r.pass, k + 1);
}
const done = qaReportTool({}, state) as Record<string, any>;
assert.equal(done.review, `fix pass ${MAX_FIX_PASSES} of ${MAX_FIX_PASSES}`);
assert.match(done.next, /ask the user/);
// the same file reported again is not another pass
await runQaReport({ state, src: '/media/uploads/f1.mp4', seconds: 7, videoName: 'Trek.mp4', checks: v, deps: deps({ click: true, um: false, face: false, sha: 'e'.repeat(64) }) });
assert.equal(qaReportStore.get()!.pass, 2);

// an edit after the export makes the report stale
const edited = { ...(state as object), items: [...(state as { items: unknown[] }).items, item('new', 'V1', 'video', 210, 30)] } as never;
const stale = qaReportTool({}, edited) as Record<string, any>;
assert.equal(stale.stale, true);
assert.match(stale.next, /export again/);

// no checks can run: warnings, not failures
const blind: QaDeps = { scan: async () => { throw new Error('down'); }, transcribe: async () => { throw new Error('no local model'); }, faces: async () => { throw new Error('no detector'); } };
qaReportStore.set(null);
const none = await runQaReport({ state: clean, src: '/media/uploads/x.mp4', seconds: 7, videoName: 'Trek.mp4', checks: v, deps: blind });
assert.deepEqual(none.checks.filter((c) => c.status === 'WARN').map((c) => c.id), ['click', 'words', 'faces']);
assert.match(none.checks.find((c) => c.id === 'words')!.detail, /no local model/);

// a long list of failures still fits in 2 KB
qaReportStore.set({ ...none, checks: Array.from({ length: 30 }, (_, i) => ({ id: `X${i}`, status: i % 2 ? 'FAIL' as const : 'WARN' as const, detail: 'x'.repeat(200) })) });
assert.ok(JSON.stringify(qaReportTool({}, clean)).length <= QA_REPORT_MAX_BYTES);

console.log('qaReport: ok');
