// Director text engine (RS-1202): one motion graphic that animates text a letter, word or line at a time. Each preset is
// a small rule for how a unit enters (and how the whole line leaves). The director's text styles (textStyles.ts) pick a
// preset and a typeface; this code only draws. Props: see TextGraphicProps.

export type TextPreset =
  | 'blur-in' | 'tracking-in' | 'typewriter' | 'rise' | 'slam' | 'count-up' | 'wave' | 'glitch' | 'neon'
  | 'split' | 'highlight' | 'draw-on' | 'shine' | 'location' | 'pop-words';

export interface TextGraphicProps {
  text: string;
  /** a smaller second line (location details, a label under a number) */
  sub?: string;
  preset: TextPreset;
  fontFamily: string;
  subFontFamily?: string;
  fontWeight: number;
  /** px at the canvas size */
  fontSize: number;
  color: string;
  accent: string;
  /** letter spacing in em */
  spacing: number;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  /** where the block sits, 0..1 of the frame (its anchor point follows align) */
  x: number;
  y: number;
  /** max width as a share of the frame; the size shrinks to fit */
  maxWidth: number;
  /** seconds: how long the entrance takes, the gap between units, when to start leaving (from the end) */
  enter: number;
  stagger: number;
  exit: number;
  /** item length in seconds */
  total: number;
  /** unit start times (seconds from the item start), for presets that land on beats */
  beats?: number[];
  stroke?: { width: number; color: string };
  shadow?: boolean;
  opacity?: number;
}

export const TEXT_GRAPHIC_CODE = String.raw`const DirectorText = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = item.props || {};
  const W = item.width;
  const H = item.height;
  const t = frame / fps;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (q) => { q = clamp(q, 0, 1); return q * q * (3 - 2 * q); };
  const outCubic = (q) => { q = clamp(q, 0, 1); return 1 - Math.pow(1 - q, 3); };
  const backOut = (q) => { q = clamp(q, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(q - 1, 3) + c * Math.pow(q - 1, 2); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const preset = P.preset || 'blur-in';
  const raw = String(P.text || '');
  const text = P.uppercase ? raw.toUpperCase() : raw;
  const enter = Math.max(0.05, P.enter || 0.6);
  const total = P.total || 3;
  const exitAt = total - (P.exit || 0);
  const fade = P.exit ? 1 - smooth((t - exitAt) / P.exit) : 1;
  const size = P.fontSize || 96;
  const lines = text.split('\n');

  // units: letters, words or lines, each with its start time
  const unitKind = { typewriter: 'letter', 'blur-in': 'letter', 'tracking-in': 'letter', wave: 'letter', glitch: 'letter', neon: 'letter', 'draw-on': 'letter', location: 'letter', slam: 'word', highlight: 'word', 'pop-words': 'word', rise: 'line', split: 'line', shine: 'line', 'count-up': 'line' }[preset] || 'letter';
  const units = [];
  lines.forEach((line, li) => {
    if (unitKind === 'line') { units.push({ s: line, line: li }); return; }
    if (unitKind === 'word') { line.split(/(\s+)/).forEach((w) => { if (w) units.push({ s: w, line: li, space: /^\s+$/.test(w) }); }); return; }
    Array.from(line).forEach((ch) => units.push({ s: ch, line: li, space: ch === ' ' }));
  });
  let k = 0;
  units.forEach((u) => { u.k = u.space ? Math.max(0, k - 1) : k++; });
  const count = Math.max(1, k);
  const stagger = P.stagger != null ? P.stagger : Math.min(0.08, (enter * 0.7) / count);
  const startOf = (u) => (P.beats && P.beats[u.k] != null ? P.beats[u.k] : u.k * stagger);

  const fontBase = {
    fontFamily: P.fontFamily, fontWeight: P.fontWeight || 700, fontSize: size, lineHeight: 1.08, color: P.color || '#fff',
    letterSpacing: (P.spacing || 0) + 'em', whiteSpace: 'pre',
    ...(P.stroke ? { WebkitTextStroke: P.stroke.width + 'px ' + P.stroke.color } : {}),
    ...(P.shadow ? { textShadow: '0 ' + Math.round(size * 0.04) + 'px ' + Math.round(size * 0.18) + 'px rgba(0,0,0,0.55)' } : {}),
  };

  // per-unit style for the entrance; q = 0..1 progress of this unit
  const unitStyle = (u, i) => {
    const q = (t - startOf(u)) / enter;
    const p = clamp(q, 0, 1);
    const s = {};
    if (preset === 'blur-in' || preset === 'tracking-in') {
      s.opacity = smooth(p); s.filter = 'blur(' + ((1 - outCubic(p)) * size * 0.14).toFixed(1) + 'px)';
    } else if (preset === 'typewriter' || preset === 'location') {
      s.opacity = q >= 0 ? 1 : 0;
    } else if (preset === 'wave') {
      s.opacity = smooth(p * 2);
      s.display = 'inline-block';
      s.transform = 'translateY(' + (Math.sin(t * 5.5 - i * 0.55) * size * 0.07 + (1 - outCubic(p)) * size * 0.5).toFixed(1) + 'px)';
    } else if (preset === 'glitch') {
      const live = q < 1.2 && q > 0;
      const j = live ? (hash(i * 7.3 + Math.floor(t * 24)) - 0.5) * size * 0.35 * (1.2 - p) : 0;
      s.opacity = q < 0 ? 0 : (live && hash(i + Math.floor(t * 30)) < 0.18 ? 0.25 : 1);
      s.display = 'inline-block'; s.transform = 'translate(' + j.toFixed(1) + 'px,' + (j * 0.3).toFixed(1) + 'px)';
      if (live) s.textShadow = (size * 0.06 * (1.2 - p)).toFixed(1) + 'px 0 rgba(255,0,60,0.85), ' + (-size * 0.06 * (1.2 - p)).toFixed(1) + 'px 0 rgba(0,230,255,0.85)';
    } else if (preset === 'neon') {
      const on = q < 0 ? 0 : q > 1 ? 1 : (hash(i * 3.1 + Math.floor(t * 18)) < 0.35 + p * 0.6 ? 1 : 0.15);
      const hum = 0.92 + 0.08 * Math.sin(t * 40 + i);
      s.opacity = on * (q > 1 ? hum : 1);
      s.color = '#fff';
      s.textShadow = '0 0 ' + (size * 0.05) + 'px #fff, 0 0 ' + (size * 0.14) + 'px ' + P.accent + ', 0 0 ' + (size * 0.32) + 'px ' + P.accent + ', 0 0 ' + (size * 0.6) + 'px ' + P.accent;
    } else if (preset === 'slam' || preset === 'pop-words') {
      const big = preset === 'slam' ? 2.4 : 0.55;
      s.display = 'inline-block';
      s.opacity = q < 0 ? 0 : 1;
      const sc = preset === 'slam' ? big + (1 - big) * backOut(p) : big + (1 - big) * backOut(p);
      const shake = preset === 'slam' && q > 0 && q < 0.6 ? (hash(i + Math.floor(t * 40)) - 0.5) * size * 0.08 * (1 - q / 0.6) : 0;
      s.transform = 'translate(' + shake.toFixed(1) + 'px,' + (shake * 0.6).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
      if (preset === 'pop-words') {
        const next = units.find((x) => !x.space && x.k === u.k + 1);
        const current = q >= 0 && (!next || t < startOf(next));
        if (current) s.color = P.accent;
      }
    } else if (preset === 'draw-on') {
      s.opacity = q < 0 ? 0 : 1;
    } else if (preset === 'highlight') {
      s.opacity = 1;
    }
    return s;
  };

  const lineBox = (children, li) => React.createElement('div', { key: 'l' + li, style: { textAlign: P.align || 'center', position: 'relative' } }, children);
  let body;

  if (preset === 'rise' || preset === 'split' || preset === 'shine' || preset === 'count-up') {
    body = lines.map((line, li) => {
      const u = units.find((x) => x.line === li);
      const q = (t - startOf(u)) / enter;
      const p = clamp(q, 0, 1);
      let content = line;
      if (preset === 'count-up') {
        const e = outCubic(p);
        content = line.replace(/\d[\d,.]*/g, (m) => {
          const target = Number(m.replace(/,/g, ''));
          const dec = (m.split('.')[1] || '').length;
          const v = target * e;
          const str = v.toFixed(dec);
          return m.indexOf(',') >= 0 ? Number(str).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : str;
        });
      }
      if (preset === 'rise') {
        return lineBox(React.createElement('div', { style: { overflow: 'hidden', paddingBottom: size * 0.08 } },
          React.createElement('div', { style: { ...fontBase, transform: 'translateY(' + ((1 - outCubic(p)) * 115).toFixed(1) + '%)' } }, content)), li);
      }
      if (preset === 'split') {
        const off = (1 - outCubic(p)) * W * 0.6;
        const half = (top) => React.createElement('div', { key: top ? 'a' : 'b', style: { ...fontBase, position: top ? 'relative' : 'absolute', left: 0, right: 0, top: 0, clipPath: top ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)', transform: 'translateX(' + ((top ? -1 : 1) * off).toFixed(1) + 'px)', textAlign: P.align || 'center' } }, content);
        return lineBox([half(true), half(false)], li);
      }
      if (preset === 'shine') {
        const band = -30 + ((t - startOf(u)) / Math.max(0.3, enter * 1.6)) % 1.6 * 100;
        return lineBox(React.createElement('div', { style: { ...fontBase, opacity: smooth(p * 1.5), color: 'transparent',
          backgroundImage: 'linear-gradient(100deg, ' + P.color + ' 0%, ' + P.color + ' ' + (band - 12) + '%, #ffffff ' + band + '%, ' + P.color + ' ' + (band + 12) + '%, ' + P.color + ' 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text' } }, content), li);
      }
      return lineBox(React.createElement('div', { style: { ...fontBase, opacity: smooth(p * 3) } }, content), li);
    });
  } else if (preset === 'draw-on') {
    const lh = size * 1.15;
    body = React.createElement('svg', { width: W * (P.maxWidth || 0.86), height: lh * lines.length + size * 0.2, style: { overflow: 'visible', display: 'block', margin: P.align === 'left' ? '0' : P.align === 'right' ? '0 0 0 auto' : '0 auto' } },
      lines.map((line, li) => {
        const u = units.filter((x) => x.line === li && !x.space);
        const first = u.length ? startOf(u[0]) : 0;
        const p = clamp((t - first) / (enter + stagger * u.length), 0, 1);
        const dash = size * 3;
        return React.createElement('text', { key: li, x: P.align === 'left' ? 0 : P.align === 'right' ? '100%' : '50%', y: lh * (li + 0.85), textAnchor: P.align === 'left' ? 'start' : P.align === 'right' ? 'end' : 'middle',
          style: { fontFamily: P.fontFamily, fontWeight: P.fontWeight || 700, fontSize: size, letterSpacing: (P.spacing || 0) + 'em' },
          fill: P.color, fillOpacity: smooth((p - 0.7) / 0.3), stroke: P.accent, strokeWidth: Math.max(1.5, size * 0.025),
          strokeDasharray: dash, strokeDashoffset: (1 - smooth(p / 0.75)) * dash }, line);
      }));
  } else {
    // letters or words as spans, line by line
    body = lines.map((line, li) => {
      const own = units.filter((u) => u.line === li);
      const spans = own.map((u, i) => {
        const st = unitStyle(u, units.indexOf(u));
        if (preset === 'highlight' && !u.space) {
          const q = clamp((t - startOf(u)) / enter, 0, 1);
          return React.createElement('span', { key: i, style: { position: 'relative', display: 'inline-block' } },
            React.createElement('span', { style: { position: 'absolute', left: '-0.08em', right: '-0.08em', top: '18%', bottom: '8%', background: P.accent, transformOrigin: 'left center', transform: 'scaleX(' + outCubic(q).toFixed(3) + ')', zIndex: 0, borderRadius: size * 0.06 } }),
            React.createElement('span', { style: { position: 'relative', zIndex: 1 } }, u.s));
        }
        return React.createElement('span', { key: i, style: st }, u.s);
      });
      // a blinking cursor after the last typed letter
      if ((preset === 'typewriter' || preset === 'location') && li === lines.length - 1) {
        const typed = units.filter((u) => startOf(u) <= t).length;
        const done = typed >= units.length;
        const blink = Math.floor(t * 2.2) % 2 === 0;
        if (!done || (blink && t < total - 0.6)) spans.push(React.createElement('span', { key: 'cursor', style: { opacity: blink || !done ? 1 : 0, color: P.accent, fontWeight: 400 } }, '|'));
      }
      return React.createElement('div', { key: 'l' + li, style: { ...fontBase, textAlign: P.align || 'center' } }, spans);
    });
  }

  // the whole block: tracking-in closes the letter spacing; location gets a pin and a sub line
  const tq = clamp(t / Math.max(0.2, enter + stagger * count), 0, 1);
  const blockSpacing = preset === 'tracking-in' ? { letterSpacing: ((P.spacing || 0) + (1 - outCubic(tq)) * 0.6) + 'em' } : {};
  const pin = preset === 'location' ? React.createElement('svg', { key: 'pin', width: size * 0.7, height: size * 0.95, viewBox: '0 0 24 32', style: { marginRight: size * 0.25, transform: 'translateY(' + ((1 - backOut(clamp(t / 0.35, 0, 1))) * -size * 0.8).toFixed(1) + 'px)', opacity: clamp(t / 0.15, 0, 1), flexShrink: 0 } },
    React.createElement('path', { d: 'M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.6 0 12 0z', fill: P.accent }),
    React.createElement('circle', { cx: 12, cy: 11.5, r: 4.6, fill: '#fff' })) : null;
  const sub = P.sub ? React.createElement('div', { key: 'sub', style: { fontFamily: P.subFontFamily || P.fontFamily, fontWeight: 500, fontSize: size * 0.36, letterSpacing: '0.18em', color: P.color, opacity: smooth((t - (preset === 'location' ? units.length * stagger + 0.2 : enter * 0.8)) / 0.5), marginTop: size * 0.18, textAlign: P.align || 'center', whiteSpace: 'pre' } }, P.sub) : null;
  const ax = P.align === 'left' ? '0%' : P.align === 'right' ? '-100%' : '-50%';
  const block = React.createElement('div', { style: { position: 'absolute', left: (P.x != null ? P.x : 0.5) * W, top: (P.y != null ? P.y : 0.5) * H, transform: 'translate(' + ax + ', -50%)', maxWidth: W * (P.maxWidth || 0.86), opacity: fade * (P.opacity != null ? P.opacity : 1), ...blockSpacing } },
    pin ? React.createElement('div', { style: { display: 'flex', alignItems: 'center' } }, pin, React.createElement('div', null, body)) : body, sub);
  return React.createElement(AbsoluteFill, { style: { overflow: 'hidden' } }, block);
};`;
