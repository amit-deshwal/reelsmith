import assert from 'node:assert/strict';
import { friendlyAgentError, isUsageLimitError, resetHint } from './usageLimit.ts';

for (const m of [
  'Claude AI usage limit reached|1999999999',
  '5-hour limit reached ∙ resets 3pm',
  "You've hit your limit · resets 11pm (Asia/Kolkata)",
  'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"..."}}',
  'Weekly limit reached, resets Mon 9am',
]) assert.ok(isUsageLimitError(m), m);
for (const m of ['Claude Code CLI exited with code 1.', 'tool failed: no such clip', 'MCP server not reachable']) {
  assert.equal(isUsageLimitError(m), false, m);
  assert.equal(friendlyAgentError(m), m, 'other errors pass through unchanged');
}
assert.equal(resetHint('5-hour limit reached ∙ resets 3pm'), '3pm');
assert.ok(resetHint('Claude AI usage limit reached|1999999999', 0)?.startsWith('around'));
const msg = friendlyAgentError("You've hit your limit · resets 11pm");
assert.match(msg, /usage limit is reached \(it resets 11pm\)/);
assert.match(msg, /keep editing by hand/);
console.log('usageLimit.verify ok');
