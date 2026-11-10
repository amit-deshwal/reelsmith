// RS-1269: a director run scored from the agent's own session log (the claude CLI writes one .jsonl per chat turn).
// Quality used to rest on runs looked at by hand; this reads what happened in each: how long it took and how much of
// that was the tools, plans refused and by which rule, fix rounds and what the critic named, frame calls the skill
// forbids, the length of the report, and which moves the plan used. Pure: the caller hands in the log's lines.

export interface RunScore {
  startedAt: string;
  model: string;
  /** first to last message of the session */
  seconds: number;
  /** of which waiting on tools */
  toolSeconds: number;
  stages: { options: number; treatment: number; build: number; fix: number; critique: number };
  /** the four stages ran: options, treatment and a build */
  full: boolean;
  /** builds and fixes the tools refused, by plan rule ("phrase", "plain") or "plan" for a malformed plan */
  refusals: string[];
  /** findings the treatment check returned, first words of each */
  treatmentFindings: string[];
  /** what the critic named in its fix rounds */
  defects: Array<{ section: number; evidence: string; kinds: DefectKind[] }>;
  /** view_timeline_frames / view_asset_frames / reels_lint calls after the first build (the skill says never) */
  extraChecks: number;
  /** tool results that reported frames that did not render */
  frameFailures: number;
  /** words in the agent's last message */
  reportWords: number;
  tone?: string;
  /** moves of the last plan that built */
  moves: string[];
}

export const DEFECT_KINDS = ['text on a person', 'text unreadable', 'text off frame', 'dark shot', 'line on the wrong picture', 'crop', 'effect smear', 'sound', 'pace'] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

const KIND_WORDS: Record<DefectKind, RegExp> = {
  'text on a person': /\b(head|face|hair|forehead|torso)s?\b|across the (crew|gang)|on the gang|runs into|covers/,
  'text unreadable': /blur|soft\b|tiny|barely reads|unreadable|disappears|low contrast|washed/,
  'text off frame': /\bedge\b|cut off|clipped|under instagram|wraps|runs off/,
  'dark shot': /\bblack\b|\bdark\b|blown|night/,
  'line on the wrong picture': /not the |unrelated|shows only|no (clear )?subject|sits on nobody|not climbing/,
  crop: /crop|slices|chin|hat brim/,
  'effect smear': /smear|ghost|double image/,
  sound: /sound|chime|mid-bar|\bdrop\b/,
  pace: /plain cuts|stall|metronome|quiet (bar|stretch)/,
};

/** What a defect's evidence is about (it may be several things). */
export function defectKinds(evidence: string): DefectKind[] {
  const s = evidence.toLowerCase();
  return DEFECT_KINDS.filter((k) => KIND_WORDS[k].test(s));
}

const PREFIX = /^mcp__[\w-]+__/;
type Block = { type?: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string; tool_use_id?: string; content?: unknown };

const textOf = (content: unknown): string => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((b: Block) => (b?.type === 'text' ? b.text ?? '' : '')).join(' ') : '');
const json = (s: string): Record<string, unknown> | null => { try { const v = JSON.parse(s) as unknown; return v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { return null; } };

/** The score of one session log, or null when it holds no director call. */
export function scoreRun(lines: readonly string[]): RunScore | null {
  const uses = new Map<string, { name: string; input: Record<string, unknown>; at: number }>();
  const calls: Array<{ name: string; input: Record<string, unknown>; ms: number; result: string }> = [];
  let model = '', first = 0, last = 0, startedAt = '', said = '';
  for (const line of lines) {
    const d = json(line);
    if (!d || (d.type !== 'user' && d.type !== 'assistant')) continue;
    const at = typeof d.timestamp === 'string' ? Date.parse(d.timestamp) : NaN;
    if (Number.isFinite(at)) { if (!first) { first = at; startedAt = d.timestamp as string; } last = at; }
    const message = (d.message ?? {}) as { model?: string; content?: unknown };
    const blocks: Block[] = Array.isArray(message.content) ? message.content as Block[] : [];
    if (d.type === 'assistant') {
      if (message.model && !message.model.startsWith('<')) model = message.model;
      for (const b of blocks) {
        if (b.type === 'tool_use' && b.id && b.name && !uses.has(b.id)) uses.set(b.id, { name: b.name.replace(PREFIX, ''), input: b.input ?? {}, at });
        else if (b.type === 'text' && b.text?.trim()) said = b.text;
      }
    } else {
      for (const b of blocks) {
        const use = b.type === 'tool_result' && b.tool_use_id ? uses.get(b.tool_use_id) : undefined;
        if (use) calls.push({ name: use.name, input: use.input, ms: Number.isFinite(at) && Number.isFinite(use.at) ? Math.max(0, at - use.at) : 0, result: textOf(b.content) });
      }
    }
  }
  const count = (name: string) => calls.filter((c) => c.name === name).length;
  const stages = { options: count('reels_director_options'), treatment: count('reels_director_treatment'), build: count('reels_director_build'), fix: count('reels_director_fix'), critique: count('reels_director_critique') };
  if (!Object.values(stages).some(Boolean)) return null;
  const refusals: string[] = [];
  const treatmentFindings: string[] = [];
  const defects: RunScore['defects'] = [];
  let moves: string[] = [];
  let tone: string | undefined;
  let built = false, extraChecks = 0, frameFailures = 0;
  for (const c of calls) {
    const result = json(c.result) ?? {};
    const error = typeof result.error === 'string' ? result.error : '';
    if (/frames did not render|preflight failed/i.test(c.result)) frameFailures += 1;
    if (c.name === 'reels_director_treatment') {
      if (typeof c.input.tone === 'string') tone = c.input.tone;
      for (const f of Array.isArray(result.findings) ? result.findings as Array<{ issue?: string }> : []) treatmentFindings.push(String(f.issue ?? '').slice(0, 60));
    } else if (c.name === 'reels_director_build' || c.name === 'reels_director_fix') {
      if (error) {
        const rules = [...error.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]!);
        refusals.push(...(rules.length ? rules : ['plan']));
        continue;
      }
      if (c.name === 'reels_director_build') {
        built = true;
        const sections = (c.input.plan as { sections?: Array<{ move?: unknown }> } | undefined)?.sections ?? [];
        moves = sections.map((s) => String(s?.move ?? ''));
      } else {
        for (const d of Array.isArray(c.input.defects) ? c.input.defects as Array<{ section?: unknown; evidence?: unknown }> : []) {
          const evidence = String(d?.evidence ?? '');
          defects.push({ section: Number(d?.section), evidence: evidence.slice(0, 160), kinds: defectKinds(evidence) });
        }
      }
    } else if (built && (c.name === 'view_timeline_frames' || c.name === 'view_asset_frames' || c.name === 'reels_lint')) extraChecks += 1;
  }
  return {
    startedAt, model, seconds: Math.round((last - first) / 1000), toolSeconds: Math.round(calls.reduce((s, c) => s + c.ms, 0) / 1000),
    stages, full: stages.options > 0 && stages.treatment > 0 && stages.build > 0, refusals, treatmentFindings, defects, extraChecks, frameFailures,
    reportWords: said.split(/\s+/).filter(Boolean).length, ...(tone ? { tone } : {}), moves,
  };
}

export interface RunSummary {
  runs: number;
  medianSeconds: number;
  /** runs whose first build was refused at least once */
  refusedRuns: number;
  refusalsByRule: Record<string, number>;
  fixRoundsPerRun: number;
  defectsByKind: Record<string, number>;
  extraCheckRuns: number;
  frameFailureRuns: number;
  medianReportWords: number;
  /** share of built sections that are cut, hold or black */
  plainShare: number;
  movesUsed: Record<string, number>;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const tally = (xs: string[]) => { const out: Record<string, number> = {}; for (const x of xs) out[x] = (out[x] ?? 0) + 1; return out; };

/** The scorecard over the full runs (options, treatment and a build) of a set of sessions. */
export function summariseRuns(scores: readonly RunScore[]): RunSummary {
  const full = scores.filter((s) => s.full);
  const moves = full.flatMap((s) => s.moves);
  return {
    runs: full.length,
    medianSeconds: median(full.map((s) => s.seconds)),
    refusedRuns: full.filter((s) => s.refusals.length).length,
    refusalsByRule: tally(full.flatMap((s) => s.refusals)),
    fixRoundsPerRun: full.length ? Math.round((full.reduce((n, s) => n + s.stages.fix, 0) / full.length) * 10) / 10 : 0,
    defectsByKind: tally(full.flatMap((s) => s.defects.flatMap((d) => (d.kinds.length ? d.kinds : ['other'])))),
    extraCheckRuns: full.filter((s) => s.extraChecks).length,
    frameFailureRuns: full.filter((s) => s.frameFailures).length,
    medianReportWords: median(full.map((s) => s.reportWords)),
    plainShare: moves.length ? Math.round((moves.filter((m) => m === 'cut' || m === 'hold' || m === 'black').length / moves.length) * 100) / 100 : 0,
    movesUsed: tally(moves),
  };
}
