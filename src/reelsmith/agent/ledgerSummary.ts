// RS-1273 (8): one line for the run ledger saying what a director tool did, so a run can be read back without the
// tool results (the ledger only kept `keys=defects,sections` and `success`).

const MAX = 600;

function clip(text: string, n = MAX): string {
  return text.length > n ? `${text.slice(0, n - 3)}...` : text;
}

function list(value: unknown): string | null {
  return Array.isArray(value) && value.length ? value.join(',') : null;
}

function defectLine(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;
  return value.slice(0, 4).map((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const where = [x.section !== undefined ? `s${String(x.section)}` : '', x.at !== undefined ? `@${String(x.at)}` : ''].join('');
    return `${where} ${String(x.evidence ?? x.fix ?? '').slice(0, 80)}`.trim();
  }).join('; ');
}

/** The ledger summary for a successful director tool call, or undefined for any other tool. */
export function directorLedgerSummary(toolName: string, args: Record<string, unknown> | undefined, result: unknown): string | undefined {
  if (!toolName.startsWith('reels_director_') || !result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof r.seconds === 'number') parts.push(`${r.seconds.toFixed(1)} s`);
  if (typeof r.sections === 'number') parts.push(`${r.sections} sections`);
  if (typeof r.clipsUsed === 'number') parts.push(`${r.clipsUsed} clips`);
  const unused = r.unusedClips as { count?: unknown } | undefined;
  if (unused && typeof unused.count === 'number' && unused.count > 0) parts.push(`${unused.count} not cast`);
  const rebuilt = list(r.rebuilt);
  if (rebuilt) parts.push(`rebuilt s${rebuilt}`);
  const plan = args?.plan && typeof args.plan === 'object' ? Object.keys(args.plan as object) : [];
  if (plan.length && toolName === 'reels_director_fix') parts.push(`plan: ${plan.join(',')}`);
  if (typeof args?.request === 'string' && args.request.trim()) parts.push(`request: "${clip(args.request.trim(), 160)}"`);
  const defects = defectLine(r.defects);
  if (defects) parts.push(`defects: ${defects}`);
  if (typeof r.building === 'string') parts.push(`waiting: ${r.building}`);
  return parts.length ? clip(parts.join(' | ')) : undefined;
}
