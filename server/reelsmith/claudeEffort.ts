// Reasoning effort for the Claude Code agent turn (`claude --effort <level>`).
// Measured on a 79-turn reel edit: ~87% of output tokens were hidden reasoning, so the level sets the run time.
export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number];

export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = 'medium';

/**
 * RS-1214: a directed reel is worth a few more minutes of thought (the user's words: "it's fine if it adds 1 or 2
 * minutes"); at medium the whole plan came out in ~15 s and looked basic. The Director box's request says "(director mode)".
 */
export const DIRECTOR_CLAUDE_EFFORT: ClaudeEffort = 'high';
const DIRECTOR_TURN = /\(director mode\)/;

/**
 * REELSMITH_CLAUDE_EFFORT: a level, or "default" to leave the CLI's own default; it wins over everything. Unset, a
 * director turn gets DIRECTOR_CLAUDE_EFFORT and any other turn ours. Unknown values fall back to ours.
 */
export function resolveClaudeEffort(env: NodeJS.ProcessEnv = process.env, prompt = ''): ClaudeEffort | null {
  const raw = env.REELSMITH_CLAUDE_EFFORT?.trim().toLowerCase();
  if (!raw) return DIRECTOR_TURN.test(prompt) ? DIRECTOR_CLAUDE_EFFORT : DEFAULT_CLAUDE_EFFORT;
  if (raw === 'default') return null;
  return (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(raw) ? (raw as ClaudeEffort) : DEFAULT_CLAUDE_EFFORT;
}
