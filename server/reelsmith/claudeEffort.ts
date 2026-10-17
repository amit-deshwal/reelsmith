// Reasoning effort for the Claude Code agent turn (`claude --effort <level>`).
// Measured on a 79-turn reel edit: ~87% of output tokens were hidden reasoning, so the level sets the run time.
export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORT_LEVELS)[number];

export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = 'medium';

/** REELSMITH_CLAUDE_EFFORT: a level, or "default" to leave the CLI's own default. Unknown values fall back to ours. */
export function resolveClaudeEffort(env: NodeJS.ProcessEnv = process.env): ClaudeEffort | null {
  const raw = env.REELSMITH_CLAUDE_EFFORT?.trim().toLowerCase();
  if (!raw) return DEFAULT_CLAUDE_EFFORT;
  if (raw === 'default') return null;
  return (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(raw) ? (raw as ClaudeEffort) : DEFAULT_CLAUDE_EFFORT;
}
