// RS-501: word starts snapped back from DTW times (inside the word) to where each word's sound begins.
import assert from 'node:assert/strict';
import { estimateLagMs, onsetCurve, snapWordStarts, type TimedWord } from './wordOnsets';

const SR = 16000;

/** Joined "speech": each word a voiced burst with its own pitch and brightness, a short dip between words, no silence. */
function speech(durs: number[], { gapMs = 25, bed = 0 }: { gapMs?: number; bed?: number } = {}) {
  const starts: number[] = [];
  let t = 500;
  for (const d of durs) {
    starts.push(t);
    t += d + gapMs;
  }
  const n = Math.round(((t + 500) / 1000) * SR);
  const y = new Float32Array(n);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  durs.forEach((d, w) => {
    const f0 = 110 + ((w * 37) % 90);
    const a = Math.round((starts[w]! / 1000) * SR);
    const len = Math.round((d / 1000) * SR);
    for (let i = 0; i < len; i += 1) {
      const env = Math.min(1, i / (0.015 * SR)) * Math.min(1, (len - i) / (0.03 * SR));
      let v = 0;
      for (let h = 1; h <= 12; h += 1) v += Math.sin((2 * Math.PI * f0 * h * i) / SR) / h ** (w % 2 ? 0.8 : 1.4);
      y[a + i] = 0.2 * env * v + 0.02 * env * rand();
    }
  });
  if (bed) for (let i = 0; i < n; i += 1) y[i]! += bed * (Math.sin((2 * Math.PI * 220 * i) / SR) * 0.5 + rand() * 0.5);
  return { y, starts };
}

const durs = [180, 320, 140, 420, 260, 200, 380, 150, 300, 240, 460, 170, 280, 220];
const median = (a: number[]) => [...a].map(Math.abs).sort((x, y) => x - y)[a.length >> 1]!;

// DTW-like times: late by a fixed part plus a share of the word, as turbo is in English
{
  const { y, starts } = speech(durs);
  const late: TimedWord[] = starts.map((s, i) => ({ text: `w${i}`, start: s + 180 + durs[i]! * 0.25, end: s + durs[i]! + 25 }));
  for (let i = 0; i + 1 < late.length; i += 1) (late[i] as { end: number }).end = late[i + 1]!.start;
  const curve = onsetCurve(y, SR);
  const lag = estimateLagMs(late, curve);
  assert.ok(lag >= 150 && lag <= 330, `lag ${lag}`);
  const before = late.map((w, i) => w.start - starts[i]!);
  const snapped = snapWordStarts(late, curve);
  const after = snapped.map((w, i) => w.start - starts[i]!);
  assert.ok(median(before) > 200, `before ${median(before)}`);
  assert.ok(median(after) <= 40, `after ${median(after)} (${after.join(' ')})`);
  assert.ok(after.filter((e) => Math.abs(e) <= 100).length >= durs.length - 1, after.join(' '));
  // times only move back, stay in order, and no word overlaps the next
  snapped.forEach((w, i) => {
    assert.ok(w.start <= late[i]!.start + 40, `w${i} moved later`);
    assert.ok(w.start <= w.end, `w${i} start past end`);
    if (i) assert.ok(w.start > snapped[i - 1]!.start, `w${i} out of order`);
    if (i + 1 < snapped.length) assert.ok(w.end <= snapped[i + 1]!.start, `w${i} overlaps`);
  });
  assert.equal(snapped[3]!.text, 'w3');
}

// words already on time (turbo in Hindi): no lag measured, nothing moves far
{
  const { y, starts } = speech(durs);
  const onTime: TimedWord[] = starts.map((s, i) => ({ text: `w${i}`, start: s + 20, end: s + durs[i]! }));
  const curve = onsetCurve(y, SR);
  assert.ok(estimateLagMs(onTime, curve) <= 40, `lag ${estimateLagMs(onTime, curve)}`);
  const after = snapWordStarts(onTime, curve).map((w, i) => w.start - starts[i]!);
  assert.ok(median(after) <= 30, after.join(' '));
  assert.ok(Math.min(...after) >= -120, after.join(' '));
}

// a bed under the voice (a song, wind) still snaps most words
{
  const { y, starts } = speech(durs, { bed: 0.05 });
  const late: TimedWord[] = starts.map((s, i) => ({ text: `w${i}`, start: s + 240, end: s + durs[i]! + 260 }));
  const after = snapWordStarts(late, onsetCurve(y, SR)).map((w, i) => w.start - starts[i]!);
  assert.ok(median(after) <= 60, after.join(' '));
}

// too few words to measure a lag, silence, and an empty list leave times alone
{
  const { y, starts } = speech([300, 300, 300]);
  const few: TimedWord[] = starts.map((s, i) => ({ text: `w${i}`, start: s + 250, end: s + 400 }));
  assert.equal(estimateLagMs(few, onsetCurve(y, SR)), 0);
  const silent = onsetCurve(new Float32Array(SR * 3), SR);
  const words: TimedWord[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ text: `w${i}`, start: 300 + i * 300, end: 500 + i * 300 }));
  assert.deepEqual(snapWordStarts(words, silent).map((w) => w.start), words.map((w) => w.start));
  assert.deepEqual(snapWordStarts([], silent), []);
}

console.log('wordOnsets.verify ok');
