#!/usr/bin/env node
// Reelsmith crash-consistency trials. Runs a stream of real CLI edits against a
// disposable library, SIGKILLs the in-flight CLI process at a random moment, then
// reopens the project and checks: the document parses, SQLite passes
// integrity_check, and every edit the CLI acknowledged (exit 0) is still there.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const trials = Number(process.argv[2] ?? 20);
const maxEditsPerTrial = 60;
const results = [];

function startCli(dataDir, cliArgs) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'cli/main.ts', '--data-dir', dataDir, ...cliArgs], {
    cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OPENCHATCUT_DISABLE_UPDATE_CHECK: '1' },
  });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8');
  const done = new Promise((resolveDone) => {
    child.once('close', (code, signal) => resolveDone({ code, signal, stdout: stdout.trim() }));
  });
  return { child, done };
}

async function cliJson(dataDir, cliArgs) {
  const { done } = startCli(dataDir, [...cliArgs, '--json']);
  const r = await done;
  if (r.code !== 0) throw new Error(`occ ${cliArgs.join(' ')} exited ${r.code ?? r.signal}`);
  return JSON.parse(r.stdout);
}

async function runTrial(index) {
  const dataDir = await mkdtemp(join(tmpdir(), 'reelsmith-crash-'));
  try {
    const project = await cliJson(dataDir, ['project', 'new', `Crash ${index}`, '--size', '320x568', '--fps', '15']);
    const acknowledged = [];
    let killed = false;
    let killedEdit = null;
    // A random kill time in the middle of the stream; SIGKILL hits whichever CLI process is running.
    const killAfterMs = 200 + Math.random() * 2500;
    const killTimer = setTimeout(() => { killed = true; }, killAfterMs);
    for (let n = 1; n <= maxEditsPerTrial && !killed; n += 1) {
      const ops = JSON.stringify([{ tool: 'edit_item', args: { adds: [{ type: 'solid', color: '#27364b', name: `k-${n}`, fromFrame: 0, durationInFrames: 15 }] } }]);
      const { child, done } = startCli(dataDir, ['edit', '--project', project.id, '--ops', ops, '--apply', '--json']);
      const onKill = setInterval(() => { if (killed && child.exitCode === null && !child.killed) child.kill('SIGKILL'); }, 5);
      const r = await done;
      clearInterval(onKill);
      if (r.code === 0) acknowledged.push(n);
      else if (r.signal === 'SIGKILL') { killedEdit = n; break; }
      else throw new Error(`edit ${n} failed (${r.code ?? r.signal})`);
    }
    clearTimeout(killTimer);

    // Reopen: the document must parse and contain every acknowledged edit.
    const doc = await cliJson(dataDir, ['project', 'show', project.id, '--doc']);
    const text = JSON.stringify(doc);
    const missing = acknowledged.filter((n) => !text.includes(`"k-${n}"`));
    const db = new DatabaseSync(join(dataDir, 'project-store-v1.sqlite3'), { readOnly: true });
    const integrity = db.prepare('PRAGMA integrity_check').get();
    db.close();
    const ok = missing.length === 0 && Object.values(integrity)[0] === 'ok';
    return { trial: index, acknowledged: acknowledged.length, killedDuringEdit: killedEdit, missing, integrity: Object.values(integrity)[0], ok };
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

for (let i = 1; i <= trials; i += 1) {
  const result = await runTrial(i);
  results.push(result);
  console.log(`trial ${i}: acked=${result.acknowledged} killedAt=${result.killedDuringEdit ?? 'between edits'} integrity=${result.integrity} missing=${result.missing.length} ${result.ok ? 'PASS' : 'FAIL'}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${trials - failed}/${trials} trials passed`);
process.exitCode = failed ? 1 : 0;
