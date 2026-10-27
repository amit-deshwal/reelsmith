// RS-1235: word-start accuracy of the desktop (whisper.cpp) paths on a word-timed fixture (see asr-timing.mjs for the
// fixtures). Compares the app's default path (whisper-server words) with DTW token times (whisper-cli --dtw), each
// turned into words by the worker's own helpers.
//   node --import tsx server/reelsmith/asr-timing-native.mts <ggml file> <dtw preset> <lang> <clip.wav> <truth.json>
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { whisperTokensToChunks, whisperWordsToChunks } from '../../desktop/native-asr-utils.ts';
import { transcribeDtwWindows, DTW_WINDOW_MS, type DtwJson } from '../../shared/reelsmith/whisperDtw.ts';

const [ggml, preset, lang, wav, truthFile] = process.argv.slice(2) as [string, string, string, string, string];
const bin = join(process.cwd(), 'public/whisper-cli', `${process.platform}-${process.arch}`);
const truth = JSON.parse(readFileSync(truthFile, 'utf8')) as Array<{ word: string; start: number }>;
const pcm = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', wav, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 28 });
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);

function score(name: string, ms: number, chunks: ReadonlyArray<{ text: string; start: number }>) {
  const words = chunks.map((c) => ({ text: c.text.trim(), start: c.start / 1000 })).filter((w) => w.text && !/^[\p{P}\s]+$/u.test(w.text));
  const n = Math.min(words.length, truth.length);
  const errs = Array.from({ length: n }, (_, i) => (words[i]!.start - truth[i]!.start) * 1000);
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  console.log(JSON.stringify({
    path: name, ms, heard: words.length, truth: truth.length,
    medianMs: Math.round(abs[Math.floor(abs.length / 2)] ?? NaN), p90Ms: Math.round(abs[Math.floor(abs.length * 0.9)] ?? NaN), maxMs: Math.round(abs.at(-1) ?? NaN),
    meanSignedMs: Math.round(errs.reduce((a, b) => a + b, 0) / Math.max(1, n)),
  }));
  console.log('   ', words.map((w, i) => `${w.text}:${truth[i] ? Math.round((w.start - truth[i]!.start) * 1000) : '-'}`).join(' '));
}

// 1. the app's default: whisper-server, verbose_json words
const port = 18000 + Math.floor(Math.random() * 1000);
const server = spawn(join(bin, 'whisper-server'), ['-m', ggml, '--host', '127.0.0.1', '--port', String(port), '-t', '8'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const form = new FormData();
  form.append('file', new Blob([readFileSync(wav)], { type: 'audio/wav' }), 'input.wav');
  form.append('response_format', 'verbose_json');
  form.append('language', lang);
  const t0 = Date.now();
  const json = await (await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form })).json() as { segments?: Array<{ words?: Array<{ word?: string; start?: number; end?: number }> }> };
  score('server-words', Date.now() - t0, whisperWordsToChunks(json.segments?.flatMap((s) => s.words ?? [])));
} finally {
  server.kill();
}

// 2. DTW token times, as the Hinglish model gets them
const dir = mkdtempSync(join(tmpdir(), 'rs-dtw-'));
const t1 = Date.now();
const out = await transcribeDtwWindows(samples, 16000, async (offsetMs) => {
  const of = join(dir, `w${offsetMs}`);
  execFileSync(join(bin, 'whisper-cli'), ['-m', ggml, '-f', wav, '-t', '8', '-l', lang, '-nfa', '--dtw', preset, '-ot', String(offsetMs), '-d', String(DTW_WINDOW_MS), '-ojf', '-nt', '-of', of], { stdio: 'ignore' });
  return JSON.parse(readFileSync(`${of}.json`, 'utf8')) as DtwJson;
});
score('cli-dtw', Date.now() - t1, whisperTokensToChunks(out.segments as never).chunks);
