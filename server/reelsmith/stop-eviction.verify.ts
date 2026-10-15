// RS-005: Stop kills the `claude` process, which never closes its MCP session. Each turn is tagged with a run key
// so the server can evict that turn's session (releasing the edit-session owner) when the process ends.
import assert from 'node:assert/strict';
import { claudeCodeMcpConfig } from '../claude-code/turn-runner.ts';
import { evictMcpSessionsForRun } from '../external-agent/mcp.ts';

const withKey = claudeCodeMcpConfig('http://x/mcp', 't', 'auto', 'run-12345678') as any;
assert.equal(withKey.mcpServers.openchatcut?.headers?.['x-reelsmith-run'] ?? Object.values(withKey.mcpServers as any)[0].headers['x-reelsmith-run'], 'run-12345678');
const legacy = claudeCodeMcpConfig('http://x/mcp', 't') as any;
assert.equal('x-reelsmith-run' in (Object.values(legacy.mcpServers as any)[0] as any).headers, false, 'no key => header absent');
assert.equal(evictMcpSessionsForRun('run-nonexistent'), 0);
console.log('stop-eviction.verify: ok');
