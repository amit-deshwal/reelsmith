// RS-1243: the caption that made Kino's promo cut read as an Instagram reel (2026-11-01, the user: "Kino cut is so
// better than our reel"): huge condensed capitals popping in word by word, the one word that matters in a coloured box
// ("STOP WASTING YOUR [WEEKENDS] IN PUNE."), and a small label above in a white tag ("4:00 AM", "100% volunteer-run").
// Ours had two quiet sentence-case lines in 17 s. A line marks its key word with *stars*.
import type { AtomicAction } from '../../editor/reducerActions';
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';
import { graphicComponent } from './graphicsKit';
import type { TextContext, TextStyleDef } from './basicTextStyles';
import { slamStarts } from './textStyles';

const num = (v: PlanValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: PlanValue | undefined, d: string) => (typeof v === 'string' ? v : d);

export interface PunchWord { w: string; hi: boolean }

/** "STOP WASTING YOUR *WEEKENDS* IN PUNE." → words with the starred ones marked; "/" forces a line break. */
export function punchWords(text: string): PunchWord[][] {
  return text.split('/').map((line) => line.trim().split(/\s+/).filter(Boolean).map((raw) => {
    const hi = /^\*.*\*[.,!?:;]*$/.test(raw) || /^\*[^*]+\*/.test(raw);
    return { w: raw.replace(/\*/g, '').toUpperCase(), hi };
  })).filter((l) => l.length);
}

/** Anton capitals run about 0.55 em a letter; a space about 0.25 em. */
const lineEm = (line: PunchWord[]) => line.reduce((s, x) => s + [...x.w].length * 0.55 + (x.hi ? 0.36 : 0), 0) + Math.max(0, line.length - 1) * 0.25;

/** Greedy lines that fit `maxEm`, unless the writer broke them with "/". */
export function punchLines(text: string, maxEm: number): PunchWord[][] {
  const given = punchWords(text);
  if (text.includes('/')) return given;
  // the fewest lines that fit, then the break that reads best: after a sentence ends ("NO MARKUP. / NO PROFIT.", not
  // "NO MARKUP. NO / PROFIT."), with lines of similar width
  const ws = given.flat();
  const n = ws.length;
  const best: Array<{ lines: number; cost: number; from: number } | undefined> = [{ lines: 0, cost: 0, from: -1 }];
  for (let j = 1; j <= n; j += 1) {
    for (let i = 0; i < j; i += 1) {
      const prev = best[i];
      const em = lineEm(ws.slice(i, j));
      if (!prev || (em > maxEm && j - i > 1)) continue;
      const slack = Math.max(0, maxEm - em) / maxEm;
      const end = ws[j - 1]!.w;
      const breakCost = j === n ? 0 : /[.!?]$/.test(end) ? 0 : /[,:;]$/.test(end) ? 0.15 : 0.6;
      const cand = { lines: prev.lines + 1, cost: prev.cost + (j === n ? slack * slack * 0.5 : slack * slack) + breakCost, from: i };
      const cur = best[j];
      if (!cur || cand.lines < cur.lines || (cand.lines === cur.lines && cand.cost < cur.cost)) best[j] = cand;
    }
  }
  const out: PunchWord[][] = [];
  for (let j = n; j > 0; j = best[j]!.from) out.unshift(ws.slice(best[j]!.from, j));
  return out;
}

export const PUNCH_CAPS_CODE = graphicComponent('PunchCaps', String.raw`
  const lines = Array.isArray(P.lines) ? P.lines : [];
  const starts = Array.isArray(P.starts) ? P.starts : [];
  const fs = P.fontSize || S * 0.12;
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0.6; const n = parseInt(m[1], 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.04 ? v / 12.9 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const onAccent = lum(accent) > 0.3 ? '#111' : '#fff';
  let k = -1;
  const rows = lines.map((line, li) => h('div', { key: li, style: { display: 'flex', justifyContent: 'center', flexWrap: 'nowrap', gap: (fs * 0.22).toFixed(1) + 'px', lineHeight: 1.04 } },
    line.map((word, wi) => {
      k += 1;
      const since = t - (starts[k] ?? 0);
      const q = clamp(since / 0.2, 0, 1);
      const scale = since < 0 ? 0 : 1 + 0.35 * (1 - backOut(q));
      const style = {
        fontFamily: 'Anton', fontWeight: 400, fontSize: fs, color: word.hi ? onAccent : color, letterSpacing: (fs * 0.01).toFixed(2) + 'px',
        display: 'inline-block', transform: 'scale(' + scale.toFixed(3) + ')', opacity: since < 0 ? 0 : smooth(since / 0.08),
        textShadow: word.hi ? 'none' : '0 ' + (fs * 0.04).toFixed(1) + 'px ' + (fs * 0.12).toFixed(1) + 'px rgba(0,0,0,0.75)',
      };
      if (word.hi) Object.assign(style, { background: accent, padding: '0 ' + (fs * 0.12).toFixed(1) + 'px', borderRadius: (fs * 0.06).toFixed(1) + 'px', boxShadow: '0 ' + (fs * 0.04).toFixed(1) + 'px ' + (fs * 0.14).toFixed(1) + 'px rgba(0,0,0,0.35)' });
      return h('span', { key: wi, style }, word.w);
    })));
  const kick = P.kicker ? h('div', { key: 'k', style: { alignSelf: 'center', marginBottom: fs * 0.18, padding: (fs * 0.07).toFixed(1) + 'px ' + (fs * 0.16).toFixed(1) + 'px', borderRadius: fs * 0.08,
    background: '#ffffff', color: '#111', fontFamily: 'Inter', fontWeight: 800, fontSize: Math.max(18, fs * 0.24), letterSpacing: (fs * 0.01).toFixed(2) + 'px', opacity: smooth(t / 0.15),
    transform: 'translateY(' + ((1 - outCubic(t / 0.25)) * fs * 0.2).toFixed(1) + 'px)' } }, P.kicker) : null;
  const y = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.4 : 0.45);
  return h(AbsoluteFill, { style: { opacity: leave } },
    box({ left: W * 0.06, width: W * 0.88, top: y, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column' }, [kick].concat(rows)));`);

/** Size so the longest line fits 88% of the width. */
export function punchSize(lines: PunchWord[][], W: number, H: number, size: number): number {
  const want = Math.min(W, H) * 0.13 * size;
  const longest = Math.max(1, ...lines.map(lineEm));
  return Math.round(Math.max(36, Math.min(want, (W * 0.88) / longest)));
}

export const punchCaps: TextStyleDef = {
  id: 'punch-caps', name: 'Punch captions', maxChars: 60,
  looks: 'Huge condensed capitals pop in word by word with a snap; the key word (marked *like this*) sits in a coloured box; an optional small white tag above ("4:00 AM").',
  use: 'The Instagram hook and story lines of a hype, promo or trip reel: "STOP WASTING YOUR *WEEKENDS* IN PUNE.", "LEGS: DEAD. MOOD: *ELITE*." One line on every section, the same style all through; kicker for a time, a place or a fact.',
  params: [
    { id: 'kicker', type: 'text', label: 'Small tag above ("4:00 AM", a place, a fact)', default: '' },
    { id: 'accent', type: 'color', label: 'Key word box colour', default: '#ffb020' },
    { id: 'color', type: 'color', label: 'Text colour', default: '#ffffff' },
    { id: 'size', type: 'number', label: 'Size (1 = normal)', default: 1, min: 0.5, max: 1.6 },
    { id: 'every', type: 'number', label: 'Beats per word', default: 0.5, min: 0.25, max: 2 },
    { id: 'y', type: 'number', label: 'Down (0 top .. 1 bottom; -1 its own place)', default: -1, min: -1, max: 1 },
  ],
  build: (ctx: TextContext) => {
    const size = num(ctx.params.size, 1);
    const maxEm = (ctx.W * 0.88) / (Math.min(ctx.W, ctx.H) * 0.13 * size);
    const lines = punchLines(ctx.text, maxEm);
    const count = lines.flat().length;
    const total = (ctx.end - ctx.start) / ctx.fps;
    ctx.emit({
      type: 'add', startFrame: ctx.start,
      item: {
        id: ctx.id('text'), track: ctx.lane(0), kind: 'motion-graphic', name: ctx.text.replace(/\*/g, '').slice(0, 24), code: PUNCH_CAPS_CODE,
        durationInFrames: Math.max(1, ctx.end - ctx.start), width: ctx.W, height: ctx.H,
        props: {
          // what the lint and the title-clear pass read off every text item: the words, face and size
          text: lines.map((l) => l.map((x) => x.w).join(' ')).join('\n'), fontFamily: 'Anton',
          lines, starts: slamStarts(ctx, count, num(ctx.params.every, 0.5), 0.2), fontSize: punchSize(lines, ctx.W, ctx.H, size), total,
          kicker: str(ctx.params.kicker, '').trim().slice(0, 28), accent: str(ctx.params.accent, '#ffb020'), color: str(ctx.params.color, '#ffffff'),
          ...(num(ctx.params.y, -1) >= 0 ? { y: num(ctx.params.y, -1) } : {}),
        },
      } as never,
    } as AtomicAction);
  },
};
