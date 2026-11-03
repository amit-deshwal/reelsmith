// RS-1258: the director's tools reach the claude CLI marked to load up front. Run: node --import tsx server/reelsmith/alwaysLoadTools.verify.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALWAYS_LOAD_META_KEY, ALWAYS_LOAD_TOOL_NAMES, withAlwaysLoad } from './alwaysLoadTools.ts';
import { MCP_CONTROL_TOOLS } from '../external-agent/mcp-controls.ts';
import { fullMcpTools } from '../external-agent/mcp-tool-catalog.ts';

// the key Claude Code reads (verified against claude 2.1.317: a marked tool is called without a ToolSearch turn)
assert.equal(ALWAYS_LOAD_META_KEY, 'anthropic/alwaysLoad');

// marked tools keep their own _meta; others pass through untouched (same object)
const marked = withAlwaysLoad({ name: 'reels_director_build', _meta: { other: 1 } });
assert.deepEqual(marked._meta, { other: 1, 'anthropic/alwaysLoad': true });
const plain = { name: 'edit_captions' };
assert.equal(withAlwaysLoad(plain), plain);

// every name is a real tool: an editor tool in the agent catalogue or an MCP control tool (a typo would load nothing)
const catalog = JSON.parse(readFileSync(new URL('../../assets/agent/openchatcut-tool-schemas.json', import.meta.url), 'utf8')) as { edit: Array<{ name: string }> | Record<string, { name: string }> };
const editNames = new Set((Array.isArray(catalog.edit) ? catalog.edit : Object.values(catalog.edit)).map((t) => t.name));
const sessionTools = ['begin_edit_session', 'review_edit_session', 'discard_edit_session'];
for (const name of ALWAYS_LOAD_TOOL_NAMES) {
  assert.ok(editNames.has(name) || MCP_CONTROL_TOOLS.some((t) => t.name === name) || sessionTools.includes(name), `${name} is not a tool`);
}

// the MCP tool list carries the marker on exactly those tools
const listed = fullMcpTools();
const flagged = listed.filter((t) => (t._meta as Record<string, unknown> | undefined)?.[ALWAYS_LOAD_META_KEY] === true).map((t) => t.name);
assert.ok(flagged.includes('target_project'), 'the control tool is marked');
assert.ok(flagged.every((n) => ALWAYS_LOAD_TOOL_NAMES.has(n)));
for (const n of flagged) assert.ok(listed.find((t) => t.name === n)!.inputSchema, `${n} keeps its schema`);
// small enough to keep in every prompt (the whole catalogue is ~210k characters)
const size = JSON.stringify(listed.filter((t) => ALWAYS_LOAD_TOOL_NAMES.has(t.name))).length;
assert.ok(size < 45_000, `the always-loaded tools are ${size} characters`);

console.log(`alwaysLoadTools.verify: ok (${flagged.length} tools marked, ${size} characters)`);
