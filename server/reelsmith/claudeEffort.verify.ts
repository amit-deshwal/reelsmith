import assert from 'node:assert/strict';
import { DEFAULT_CLAUDE_EFFORT, resolveClaudeEffort } from './claudeEffort.ts';

assert.equal(resolveClaudeEffort({}), DEFAULT_CLAUDE_EFFORT, 'unset uses our default');
assert.equal(resolveClaudeEffort({ REELSMITH_CLAUDE_EFFORT: ' LOW ' }), 'low', 'trimmed and case-insensitive');
assert.equal(resolveClaudeEffort({ REELSMITH_CLAUDE_EFFORT: 'max' }), 'max');
assert.equal(resolveClaudeEffort({ REELSMITH_CLAUDE_EFFORT: 'default' }), null, '"default" leaves the CLI default');
assert.equal(resolveClaudeEffort({ REELSMITH_CLAUDE_EFFORT: 'turbo' }), DEFAULT_CLAUDE_EFFORT, 'unknown falls back');
console.log('claudeEffort.verify ok');
