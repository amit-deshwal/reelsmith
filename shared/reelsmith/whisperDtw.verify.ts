import assert from 'node:assert/strict';
import { dtwTokens, speechAfter, transcribeDtwWindows, type DtwJson } from './whisperDtw';
import { whisperTokensToChunks } from '../../desktop/native-asr-utils';

const RATE = 16000;
// 20 s clip: speech 0.5-6 s and 12-19 s, room tone elsewhere
const samples = new Float32Array(20 * RATE);
for (let i = 0; i < samples.length; i += 1) {
  const s = i / RATE;
  const speech = (s >= 0.5 && s < 6) || (s >= 12 && s < 19);
  samples[i] = (speech ? 0.2 : 0.001) * Math.sin(i / 7);
}
assert.ok(speechAfter(samples, RATE, 10_000), 'speech at 12 s counts');
assert.ok(!speechAfter(samples, RATE, 19_200), 'room tone after the last word does not');

// specials, untimed tokens and backwards times
const json: DtwJson = { transcription: [{ tokens: [
  { text: '[_BEG_]', t_dtw: 0 }, { text: 'Aaj', t_dtw: 62 }, { text: ' ka', t_dtw: 82 }, { text: ' din', t_dtw: -1 },
  { text: ' hai', t_dtw: 70 }, { text: '[_EOT_]', t_dtw: 99 },
] }] };
assert.deepEqual(dtwTokens(json, 0, 20_000), [{ text: 'Aaj', ms: 620 }, { text: ' ka', ms: 820 }, { text: ' hai', ms: 820 }]);
assert.deepEqual(dtwTokens(json, 700, 20_000).map((t) => t.text), [' ka', ' hai'], 'tokens before the pass offset are dropped');

// the model stops at 5.5 s (early EOT); the second pass covers the rest, then the silent tail is skipped
const passes: number[] = [];
const result = await transcribeDtwWindows(samples, RATE, async (offset) => {
  passes.push(offset);
  if (offset === 0) return { transcription: [{ tokens: [{ text: 'Aaj', t_dtw: 60 }, { text: ' din', t_dtw: 300 }, { text: '.', t_dtw: 550 }] }] };
  return { transcription: [{ tokens: [{ text: 'Phir', t_dtw: 1210 }, { text: ' chai', t_dtw: 1500 }, { text: ' pi', t_dtw: 1880 }] }] };
});
assert.deepEqual(passes, [0, 5500], 'second pass starts at the last timed token; no third pass over silence');
const { chunks } = whisperTokensToChunks(result.segments);
assert.deepEqual(chunks.map((c) => [c.text, c.start, c.end]), [
  ['Aaj', 600, 1000], ['din.', 3000, 5500], ['Phir', 12100, 12500], ['chai', 15000, 15400], ['pi', 18800, 19200],
], 'a new pass opens a word; a word lasts at most 400 ms per token and ends at its punctuation, so pauses stay gaps');
assert.equal(result.text, 'Aaj din. Phir chai pi');

// a window with no words at all moves on by a full window
const empty: number[] = [];
const long = new Float32Array(70 * RATE).fill(0.2);
await transcribeDtwWindows(long, RATE, async (offset) => { empty.push(offset); return {}; });
assert.deepEqual(empty, [0, 30_000, 60_000]);

console.log('whisperDtw checks passed');
