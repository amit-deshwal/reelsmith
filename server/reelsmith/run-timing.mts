// Where a director run's time went, from the in-app agent's own session log (the claude CLI writes one per turn under
// ~/.claude/projects/-private-var-folders-*-occ-claude-code-*/<session>.jsonl). RS-1258 was found this way.
//   node --import tsx server/reelsmith/run-timing.mts            the newest session that used the director
//   node --import tsx server/reelsmith/run-timing.mts <file.jsonl> [--detail]
// Per user turn: wall time, model requests, tool time, output tokens; with --detail, per request its time to first
// token, streaming time, output tokens and the tools it called (seconds, result characters, images); and the director
// tool calls that were refused or went stale (each one cost a whole model round trip).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Line = Record<string, any>;
interface Tool { name: string; start: number; end?: number; chars: number; images: number; head: string }
interface Req { send?: number; first: number; last: number; out: number; tools: Tool[]; text: number }
interface Turn { prompt: string; t0: number; end: number; reqs: Map<string, Req>; order: string[]; tools: Tool[] }

const ts = (s?: string) => (s ? Date.parse(s) / 1000 : NaN);
const short = (n: string) => n.replace(/^mcp__openchatcut-builtin__/, '');

function newestDirectorSession(): string {
  const root = join(homedir(), '.claude', 'projects');
  const files = readdirSync(root).filter((d) => d.includes('occ-claude-code')).flatMap((d) => {
    try { return readdirSync(join(root, d)).filter((f) => f.endsWith('.jsonl')).map((f) => join(root, d, f)); } catch { return []; }
  });
  const director = files.map((f) => ({ f, m: statSync(f).mtimeMs })).sort((a, b) => b.m - a.m).find(({ f }) => readFileSync(f, 'utf8').includes('reels_director_build'));
  if (!director) throw new Error('no director session found');
  return director.f;
}

export function turnsOf(lines: Line[]): Turn[] {
  const turns: Turn[] = [];
  const pending = new Map<string, Tool>();
  let cur: Turn | undefined;
  let lastSend: number | undefined;
  for (const o of lines) {
    if (o.type === 'api-request') { lastSend = ts(o.timestamp); continue; }
    const content = o.message?.content;
    if (o.type === 'user') {
      const blocks = Array.isArray(content) ? content : [];
      const results = blocks.filter((b: any) => b?.type === 'tool_result');
      if (!results.length && !o.isMeta) {
        const prompt = typeof content === 'string' ? content : blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n');
        cur = { prompt, t0: ts(o.timestamp), end: ts(o.timestamp), reqs: new Map(), order: [], tools: [] };
        turns.push(cur);
        continue;
      }
      for (const b of results) {
        const t = pending.get(b.tool_use_id);
        if (!t) continue;
        pending.delete(b.tool_use_id);
        t.end = ts(o.timestamp);
        const parts = Array.isArray(b.content) ? b.content : [{ type: 'text', text: String(b.content ?? '') }];
        t.chars = parts.filter((p: any) => p.type === 'text').reduce((n: number, p: any) => n + String(p.text).length, 0);
        t.images = parts.filter((p: any) => p.type === 'image').length;
        t.head = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ').slice(0, 240);
      }
      if (cur) cur.end = Math.max(cur.end, ts(o.timestamp));
      continue;
    }
    if (o.type !== 'assistant' || !cur) continue;
    const id = o.requestId ?? o.message?.id;
    const now = ts(o.timestamp);
    let r = cur.reqs.get(id);
    if (!r) { r = { send: lastSend, first: now, last: now, out: 0, tools: [], text: 0 }; cur.reqs.set(id, r); cur.order.push(id); }
    r.last = now;
    r.out = o.message?.usage?.output_tokens ?? r.out;
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === 'text') r.text += String(b.text ?? '').length;
      if (b.type !== 'tool_use') continue;
      const t: Tool = { name: short(b.name), start: now, chars: 0, images: 0, head: '' };
      pending.set(b.id, t); r.tools.push(t); cur.tools.push(t);
    }
    cur.end = Math.max(cur.end, now);
  }
  return turns;
}

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '?');
const spent = (t: Tool) => (t.end ?? t.start) - t.start;

function report(file: string, detail: boolean) {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as Line]; } catch { return []; } });
  console.log(file);
  for (const [i, turn] of turnsOf(lines).entries()) {
    const reqs = turn.order.map((id) => turn.reqs.get(id)!);
    if (!reqs.length) continue;
    const wall = turn.end - turn.t0;
    const tools = turn.tools.reduce((n, t) => n + spent(t), 0);
    console.log(`\nturn ${i}: ${f1(wall)} s wall, ${reqs.length} model requests, ${turn.tools.length} tool calls (${f1(tools)} s), model ~${f1(wall - tools)} s, ${reqs.reduce((n, r) => n + r.out, 0)} output tokens`);
    console.log(`  "${turn.prompt.replace(/\s+/g, ' ').slice(0, 140)}"`);
    if (detail) for (const r of reqs) {
      const calls = r.tools.map((t) => `${t.name} ${f1(spent(t))}s ${t.chars}c${t.images ? ` ${t.images}img` : ''}`).join(', ');
      console.log(`  first token ${f1(r.send ? r.first - r.send : NaN)} s, streamed ${f1(r.last - r.first)} s, ${r.out} out${r.text ? `, ${r.text} chars of text` : ''}${calls ? ` | ${calls}` : ''}`);
    }
    const wasted = turn.tools.filter((t) => t.name.startsWith('reels_') && (/^\{"error"|"outcome":"(stale|rejected|cancelled)"/.test(t.head)));
    for (const t of wasted) console.log(`  refused: ${t.name}: ${t.head.slice(0, 200)}`);
    const searches = turn.tools.filter((t) => t.name === 'ToolSearch').length;
    if (searches) console.log(`  ToolSearch calls: ${searches}`);
  }
}

const args = process.argv.slice(2);
report(args.find((a) => !a.startsWith('--')) ?? newestDirectorSession(), args.includes('--detail'));
