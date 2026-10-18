// One-shot, tool-less `claude -p` call that returns structured JSON (Ideas panel). The user's own CLI and login;
// no tools, no MCP servers, no session saved, run in a throwaway directory so no CLAUDE.md is picked up.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeCodeCommand } from '../claude-code/command.ts';
import { inspectClaudeCodeInstallation, type ClaudeCodeInstallation } from '../claude-code/installation.ts';

const ENV_NAMES = [
  'PATH', 'Path', 'PATHEXT', 'HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'USERNAME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'SystemRoot', 'WINDIR', 'COMSPEC', 'ComSpec', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
] as const;
const DENIED_TOOLS = [
  'Bash', 'BashOutput', 'KillShell', 'Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
  'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'Agent',
].join(' ');

export class ClaudeUnavailableError extends Error {}

let installation: Promise<ClaudeCodeInstallation> | null = null;

/** The CLI flags for a tool-less structured-output call (exported for agentConfinement.verify.ts). */
export function claudeOnceArgs(schema: object, options: { model?: string; effort?: string }): string[] {
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--tools', '',
    '--disallowedTools', DENIED_TOOLS,
    '--strict-mcp-config',
    '--restricted',
    '--permission-prompts', 'none',
    '--no-session-persistence',
  ];
  if (options.model) args.push('--model', options.model);
  if (options.effort) args.push('--effort', options.effort);
  return args;
}

/** Runs the prompt (sent on stdin, so a long catalog never hits the command-line limit) and returns structured_output. */
export async function claudeOnce(prompt: string, schema: object, options: { model?: string; effort?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<unknown> {
  installation ??= inspectClaudeCodeInstallation();
  const found = await installation;
  if (!found.installed || !found.path) { installation = null; throw new ClaudeUnavailableError('Claude Code CLI not found. Install it and sign in, or use the offline matches.'); }
  if (!found.supported) throw new ClaudeUnavailableError(`Claude Code ${found.version ?? '(unknown version)'} is too old for Ideas. Update it with "claude update".`);
  const cwd = await mkdtemp(join(tmpdir(), 'reelsmith-ideas-'));
  try {
    const env: NodeJS.ProcessEnv = {};
    for (const name of ENV_NAMES) if (process.env[name] !== undefined) env[name] = process.env[name];
    const command = claudeCodeCommand(found.path, claudeOnceArgs(schema, options));
    const child = spawn(command.executable, command.args, {
      cwd, env, windowsHide: true, windowsVerbatimArguments: command.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
    const kill = () => child.kill();
    const timer = setTimeout(kill, options.timeoutMs ?? 90_000);
    options.signal?.addEventListener('abort', kill, { once: true });
    child.stdin.end(prompt);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    }).finally(() => { clearTimeout(timer); options.signal?.removeEventListener('abort', kill); });
    let result: { is_error?: boolean; structured_output?: unknown; result?: unknown } | null = null;
    try { result = JSON.parse(stdout); } catch { /* reported below */ }
    if (!result || result.is_error || result.structured_output === undefined) {
      const detail = typeof result?.result === 'string' ? result.result : stderr.trim() || (code === null ? 'timed out' : `exit code ${code}`);
      throw new Error(`Claude did not return suggestions: ${detail.slice(0, 300)}`);
    }
    return result.structured_output;
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}
