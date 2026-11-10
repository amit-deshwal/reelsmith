// RS-1269: the scorecard of director runs, read from the session logs the claude CLI keeps of the app's agent turns
// (~/.claude/projects/*occ-claude-code*/*.jsonl; nothing leaves the machine and nothing of the logs is printed but
// counts, rule names and the first words of a defect).
//   node --import tsx server/reelsmith/director-runs.mts [--since 2026-11-10] [--runs] [--briefs] [logs folder]
// --runs lists each run; --briefs prints the fixed briefs to direct after a change to the director, so the same five
// reels are compared before and after (by this scorecard and by eye).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { scoreRun, summariseRuns, type RunScore } from '../../src/reelsmith/director/runScore.ts';

/** One brief per kind of reel the director has to get right; the footage is the user's own test set for each. */
const BRIEFS = [
  ['trek, epic, a song', 'A weekend trek with the gang in the Sahyadris: early start, the climb, the view from the top. 18 s, song from 1:05.'],
  ['one clip, funny, the clip\'s own sound', 'bro said it would be an easy ride. One clip from the mela; keep its sound, make it funny.'],
  ['promo from a page', 'A promo reel for the trekking club (its website as brandUrl): who it is for, the proof, the ask.'],
  ['photos, calm', 'Ten photos of the monsoon weekend, slow and calm, to the song I imported.'],
  ['voiceover', 'My voiceover leads; put the clips under what I say.'],
] as const;

const args = process.argv.slice(2);
if (args.includes('--briefs')) {
  BRIEFS.forEach(([kind, brief], i) => console.log(`${i + 1}. ${kind}\n   ${brief}`));
  process.exit(0);
}
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] ?? '' : '';
const folder = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--since') ?? join(homedir(), '.claude', 'projects');

const scores: RunScore[] = [];
for (const dir of readdirSync(folder)) {
  const path = join(folder, dir);
  if (!dir.includes('occ-claude-code') || !statSync(path).isDirectory()) continue;
  for (const file of readdirSync(path)) {
    if (!file.endsWith('.jsonl')) continue;
    const score = scoreRun(readFileSync(join(path, file), 'utf8').split('\n'));
    if (score && (!since || score.startedAt.slice(0, 10) >= since)) scores.push(score);
  }
}
scores.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
if (args.includes('--runs')) {
  for (const s of scores.filter((x) => x.full)) {
    console.log(`${s.startedAt.slice(0, 16)} ${s.model.padEnd(16)} ${String(s.seconds).padStart(4)} s (tools ${String(s.toolSeconds).padStart(3)}) builds ${s.stages.build} fixes ${s.stages.fix}`
      + ` refused [${s.refusals.join(' ')}] extra checks ${s.extraChecks} report ${s.reportWords} w · ${s.tone ?? '-'} · ${s.moves.join(' ')}`);
    for (const d of s.defects) console.log(`    s${d.section} [${d.kinds.join(', ') || 'other'}] ${d.evidence.slice(0, 110)}`);
  }
}
const sum = summariseRuns(scores);
const rows = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
console.log(`${sum.runs} full runs${since ? ` since ${since}` : ''} (${scores.length} sessions with a director call)`);
console.log(`time: median ${sum.medianSeconds} s`);
console.log(`first build refused: ${sum.refusedRuns} of ${sum.runs} runs (${rows(sum.refusalsByRule)})`);
console.log(`fix rounds: ${sum.fixRoundsPerRun} a run; defects named: ${rows(sum.defectsByKind)}`);
console.log(`frame calls after the build: ${sum.extraCheckRuns} runs; frames that did not render: ${sum.frameFailureRuns} runs`);
console.log(`report: median ${sum.medianReportWords} words (the rule is under 60)`);
console.log(`plain sections (cut, hold, black): ${Math.round(sum.plainShare * 100)}% · moves: ${rows(sum.movesUsed)}`);
