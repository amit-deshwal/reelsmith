#!/usr/bin/env node
// Reelsmith project-library soak. Runs real CLI project create/open/edit/render
// operations against a disposable data directory, then removes the fixture.
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const count = positiveInt(args.projects ?? '30', '--projects');
const hours = positiveNumber(args.hours ?? '72', '--hours');
const rounds = args.rounds === undefined ? Infinity : positiveInt(args.rounds, '--rounds');
const limitPercent = positiveNumber(args['rss-growth-percent'] ?? '10', '--rss-growth-percent');
const outputPath = resolve(args.report ?? `reelsmith-soak-${new Date().toISOString().replaceAll(':', '-')}.json`);
const root = await mkdtemp(join(tmpdir(), 'reelsmith-soak-'));
const dataDir = join(root, 'library');
const exportsDir = join(root, 'exports');
const deadline = Date.now() + hours * 60 * 60 * 1000;
const cycles = [];
let baselineRss = null; // peak child RSS of the first round; later rounds are compared to it
let peakRss = 0; // highest child RSS seen in any command
let childPeakRss = 0; // highest child RSS seen since the current cycle started
let completed = 0;
let stoppedBySignal = false;

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stoppedBySignal = true; });

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'help') { parsed.help = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
  }
  if (parsed.help) {
    console.log('Usage: node scripts/reelsmith-soak.mjs [--projects 30] [--hours 72] [--rounds N] [--rss-growth-percent 10] [--report path]');
    process.exit(0);
  }
  return parsed;
}

function positiveNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${flag} must be a positive number`);
  return number;
}

function positiveInt(value, flag) {
  const number = positiveNumber(value, flag);
  if (!Number.isInteger(number)) throw new Error(`${flag} must be an integer`);
  return number;
}

// The runner itself only spawns `occ` commands, so its own RSS says nothing about the app.
// Each command is a fresh process; sampling its RSS while it runs gives the app's footprint.
function sampleChildRss(pid) {
  return new Promise((resolveSample) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], (error, stdout) => {
      const kb = Number(String(stdout).trim());
      if (!error && kb > 0) childPeakRss = Math.max(childPeakRss, kb * 1024);
      resolveSample();
    });
  });
}

function runCli(cliArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'cli/main.ts', '--data-dir', dataDir, ...cliArgs], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OPENCHATCUT_DISABLE_UPDATE_CHECK: '1' },
    });
    let stdout = '';
    let stderr = '';
    const sampler = setInterval(() => { void sampleChildRss(child.pid); }, 50);
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { clearInterval(sampler); reject(error); });
    child.once('close', (code, signal) => {
      clearInterval(sampler);
      if (code !== 0) reject(new Error(`occ ${cliArgs.join(' ')} failed (${signal ?? code}): ${stderr.trim() || stdout.trim()}`));
      else resolvePromise(stdout.trim());
    });
  });
}

async function jsonCommand(...cliArgs) {
  const output = await runCli([...cliArgs, '--json']);
  try { return JSON.parse(output); }
  catch { throw new Error(`Expected JSON from occ ${cliArgs.join(' ')}; received: ${output.slice(0, 400)}`); }
}

async function prepareProjects() {
  await mkdir(exportsDir, { recursive: true });
  const projects = [];
  for (let index = 0; index < count; index += 1) {
    const project = await jsonCommand('project', 'new', `Soak ${String(index + 1).padStart(2, '0')}`, '--size', '320x568', '--fps', '15');
    projects.push(project);
  }
  return projects;
}

async function cycle(project, index, round) {
  childPeakRss = 0;
  // Opening by reading the persisted document ensures each iteration starts at
  // the storage boundary rather than retaining a project in the driver.
  const opened = await jsonCommand('project', 'show', project.id, '--doc');
  if (!opened?.timelines?.length) throw new Error(`Project ${project.id} reopened without a timeline`);
  const ratio = round % 2 === 0 ? '9:16' : '1:1';
  await jsonCommand('edit', '--project', project.id, '--ops', JSON.stringify([
    { tool: 'edit_item', args: { adds: [{ type: 'solid', color: '#27364b', name: `Soak round ${round + 1}`, fromFrame: 0, durationInFrames: 15 }] } },
    { tool: 'set_aspect_ratio', args: { ratio } },
  ]), '--apply');
  const output = join(exportsDir, `round-${round + 1}-project-${index + 1}.mp4`);
  await runCli(['render', '--project', project.id, '--out', output, '--to', '1s', '--resolution', '480p', '--quiet']);
  await rm(output, { force: true });
  completed += 1;
  const rss = childPeakRss;
  peakRss = Math.max(peakRss, rss);
  return { projectId: project.id, peakChildRssBytes: rss, ratio };
}

async function writeReport(status, failure) {
  const lastSample = cycles.at(-1)?.samples.at(-1)?.peakChildRssBytes ?? null;
  const referenceRss = baselineRss ?? lastSample ?? 0;
  const growthPercent = referenceRss > 0 ? ((peakRss - referenceRss) / referenceRss) * 100 : 0;
  const report = {
    version: 1,
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationHours: hours,
    projectCount: count,
    completedProjectCycles: completed,
    rounds: cycles.length,
    rss: { scope: 'occ child processes (peak RSS per command, sampled every 50 ms)', baselineBytes: baselineRss, peakBytes: peakRss, finalBytes: lastSample, peakGrowthPercent: Number(growthPercent.toFixed(2)), limitPercent },
    rssLimitPassed: baselineRss === null ? null : growthPercent <= limitPercent,
    cycles,
    ...(failure ? { error: failure } : {}),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const startedAt = Date.now();
let failure;
let status = 'completed';
try {
  const projects = await prepareProjects();
  let round = 0;
  do {
    const roundStartedAt = Date.now();
    const samples = [];
    for (let index = 0; index < projects.length; index += 1) {
      if (stoppedBySignal || (round >= rounds && Date.now() >= deadline)) break;
      samples.push(await cycle(projects[index], index, round));
    }
    if (samples.length) {
      cycles.push({ round: round + 1, startedAt: new Date(roundStartedAt).toISOString(), durationMs: Date.now() - roundStartedAt, samples });
      const roundPeak = Math.max(...samples.map((sample) => sample.peakChildRssBytes));
      if (baselineRss === null) baselineRss = roundPeak;
      console.log(`round ${round + 1}: ${samples.length}/${count} projects opened, edited and exported; peak child RSS ${(roundPeak / 1024 / 1024).toFixed(1)} MiB`);
    }
    round += 1;
  } while (!stoppedBySignal && round < rounds && Date.now() < deadline);
  if (stoppedBySignal) status = 'interrupted';
  if (baselineRss !== null) {
    const growth = ((peakRss - baselineRss) / baselineRss) * 100;
    if (growth > limitPercent) status = 'rss-limit-exceeded';
  }
} catch (error) {
  status = 'failed';
  failure = error instanceof Error ? error.message : String(error);
} finally {
  const report = await writeReport(status, failure);
  console.log(`report: ${outputPath}`);
  console.log(`result: ${report.status}; ${report.completedProjectCycles} project cycles; peak RSS growth ${report.rss.peakGrowthPercent}%`);
  await rm(root, { recursive: true, force: true });
}

if (status === 'failed' || status === 'rss-limit-exceeded') process.exitCode = 1;
