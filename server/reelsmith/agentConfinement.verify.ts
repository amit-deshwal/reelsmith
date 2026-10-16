// RS-705: static guard that the Claude and Codex agent runs stay editor-tool-only.
// This does not replace the live filesystem audit (see README RS-705 note).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODEX_DISABLED_FEATURES } from '../codex/app-server.ts';

for (const f of ['shell_tool', 'unified_exec', 'code_mode', 'multi_agent', 'computer_use', 'plugins', 'hooks', 'memories']) {
  assert.ok((CODEX_DISABLED_FEATURES as readonly string[]).includes(f), `codex feature ${f} must be disabled`);
}
const codexTurn = readFileSync('server/codex/turn-manager.ts', 'utf8');
assert.match(codexTurn, /approvalPolicy: 'never'/);
assert.match(codexTurn, /sandbox: 'read-only'/);
assert.match(codexTurn, /view_image: false/);
assert.match(codexTurn, /web_search: 'disabled'/);
const codexSrv = readFileSync('server/codex/app-server.ts', 'utf8');
assert.match(codexSrv, /cwd: runtimeCwd/, 'codex runs in a throwaway cwd');
assert.doesNotMatch(codexSrv, /dangerously-bypass|danger-full-access/);

const claude = readFileSync('server/claude-code/turn-runner.ts', 'utf8');
for (const flag of ["'--strict-mcp-config'", "'--restricted'", "'--disallowedTools'", "'--permission-prompts', 'none'"]) {
  assert.ok(claude.includes(flag), `claude turn must pass ${flag}`);
}
const denied = /const DENIED_TOOLS = \[([\s\S]*?)\]\.join/.exec(claude)?.[1] ?? '';
for (const t of ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task']) {
  assert.ok(denied.includes(`'${t}'`), `claude must deny ${t}`);
}
assert.match(claude, /--allowedTools', ALLOWED_TOOLS/);
assert.doesNotMatch(claude, /'--permission-mode'|'--dangerously-skip-permissions'/);
console.log('agentConfinement.verify ok');
