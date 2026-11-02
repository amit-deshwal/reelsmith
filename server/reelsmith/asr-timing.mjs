// RS-501: word-start accuracy of the local Whisper models. Transcribes a wav offline with the model files the app downloaded
// (~/.reelsmith/asr-models, no network) and compares each word's start with a known-start list.
//   node server/reelsmith/asr-timing.mjs <modelId> <lang> <clip.wav> <truth.json> [dtype]
//   e.g. node server/reelsmith/asr-timing.mjs onnx-community/whisper-base_timestamped hi hi.wav hi.truth.json
// truth.json: [{ "word": "...", "start": seconds }, ...]. Fixtures used so far: one word at a time from macOS `say` (Lekha for
// Hindi, Rishi for English), joined with 0.28 s gaps, so each true start is exact; real speech is harder.
import { pipeline, env } from '@huggingface/transformers';
import { execFileSync } from 'node:child_process';
import { ffmpegBin } from '../media-binaries.ts';
import { readFileSync } from 'node:fs';
const [,, modelId, lang, wav, truthFile, dtype = 'q8'] = process.argv;
env.localModelPath = `${process.env.HOME}/.reelsmith/asr-models/`;
env.allowRemoteModels = false; env.allowLocalModels = true;
const pcm = execFileSync(ffmpegBin(), ['-nostdin', '-v', 'error', '-i', wav, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 28 });
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
const t0 = Date.now();
const asr = await pipeline('automatic-speech-recognition', modelId, { dtype, device: 'cpu' });
const loadMs = Date.now() - t0;
const t1 = Date.now();
const out = await asr(samples, { return_timestamps: 'word', language: lang, task: 'transcribe', chunk_length_s: 30 });
const runMs = Date.now() - t1;
const truth = JSON.parse(readFileSync(truthFile, 'utf8'));
const got = (out.chunks ?? []).map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] }));
console.log(JSON.stringify({ lang, modelId, loadMs, runMs, text: out.text, heard: got.length, truth: truth.length }));
console.log('got  :', got.map((g) => `${g.text}@${g.start?.toFixed(2)}`).join(' | '));
console.log('truth:', truth.map((g) => `${g.word}@${g.start.toFixed(2)}`).join(' | '));
// pair words in order (the fixtures are one word at a time, so order is reliable); report only paired words
const n = Math.min(got.length, truth.length);
const errs = []; for (let i = 0; i < n; i += 1) if (got[i].start != null) errs.push(Math.abs(got[i].start - truth[i].start) * 1000);
errs.sort((a, b) => a - b);
const med = errs.length ? errs[Math.floor(errs.length / 2)] : null;
console.log(JSON.stringify({ paired: errs.length, medianStartErrorMs: med && Math.round(med), p90Ms: errs.length ? Math.round(errs[Math.floor(errs.length * 0.9)]) : null, maxMs: errs.length ? Math.round(errs[errs.length - 1]) : null }));
