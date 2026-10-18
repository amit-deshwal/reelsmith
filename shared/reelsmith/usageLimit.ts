// RS-704: recognise "plan limit reached" errors from the claude/codex CLIs and explain them plainly.
// The app stays fully usable without the agent, so the message says so.

const PATTERNS: RegExp[] = [
  /usage limit reached/i,
  /\b(5-hour|five-hour|weekly|daily|opus|session) limit reached\b/i,
  /you['’]ve (hit|reached) your (\w+ )?(usage )?limit/i,
  /\blimit reached\b.*\bresets?\b/i,
  /rate[_ ]limit(_error|ed)?\b/i,
  /\bquota (exceeded|exhausted)\b/i,
  /\b429\b.*(too many requests|rate)/i,
  /usage_limit/i,
];

export function isUsageLimitError(message: string): boolean {
  return PATTERNS.some((p) => p.test(message));
}

/** "resets 3pm", "resets at 11:00", "resets Mon 9am", or a unix-seconds suffix "…|1760000000". */
export function resetHint(message: string, now = Date.now()): string | null {
  const unix = /\|(\d{10})\b/.exec(message);
  if (unix) {
    const at = new Date(Number(unix[1]) * 1000);
    if (at.getTime() > now) return `around ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const words = /\bresets?\s+(?:at\s+)?([^.\n,;]{2,40})/i.exec(message);
  if (!words) return null;
  let hint = words[1]!.trim();
  // "(resets 3pm)" wraps the hint in the sentence's own bracket; "7pm (Asia/Kolkata)" owns its bracket
  if (hint.endsWith(')') && (hint.match(/\(/g)?.length ?? 0) < (hint.match(/\)/g)?.length ?? 0)) hint = hint.slice(0, -1).trim();
  return hint;
}

export function friendlyAgentError(message: string, agent = 'Claude'): string {
  if (!isUsageLimitError(message)) return message;
  const when = resetHint(message);
  return [
    `Your ${agent} plan's usage limit is reached${when ? ` (it resets ${when})` : ''}.`,
    'Nothing was changed by this turn. You can keep editing by hand: recipes, Assemble, trimming, snapping to beats and export all work without the agent.',
    'Try the chat again after the reset.',
    `(${agent} said: ${message.trim().slice(0, 200)})`,
  ].join(' ');
}
