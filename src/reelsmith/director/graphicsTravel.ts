// RS-1213: director graphics for places and facts, drawn in code: a route map, a boarding pass, HUD readouts, story
// chapter bars, a loading bar and a camcorder viewfinder. Each is one sandboxed motion-graphic component (see
// graphicsKit.ts for the props every graphic gets); graphics.ts says when each fits and what it takes.
import { graphicComponent } from './graphicsKit';

/** The pin used by the route map (the location-tag style's pin). */
const PIN = String.raw`
  const pin = (x, y, size, q, fill) => h('svg', { key: 'pin' + x + y, width: size * 0.75, height: size, viewBox: '0 0 24 32',
    style: { position: 'absolute', left: x - size * 0.375, top: y - size, overflow: 'visible', transformOrigin: '50% 100%', transform: 'scale(' + backOut(q).toFixed(3) + ')', opacity: clamp(q * 4, 0, 1), filter: 'drop-shadow(0 ' + (size * 0.06).toFixed(1) + 'px ' + (size * 0.12).toFixed(1) + 'px rgba(0,0,0,0.45))' } },
    h('path', { d: 'M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.6 0 12 0z', fill }),
    h('circle', { cx: 12, cy: 11.5, r: 4.6, fill: '#fff' }));`;

/** Vehicles drawn pointing right (+x) in a 24 x 24 box. */
const VEHICLES = String.raw`
  const PLANE = 'M21.5 12c0-.9-.8-1.4-1.6-1.4H14.2L9.6 2.6H7.4l2.4 8H4.9L3.3 8.3H1.6l1.1 3.7-1.1 3.7h1.7l1.6-2.3h4.9l-2.4 8h2.2l4.6-8h5.7c.8 0 1.6-.5 1.6-1.4z';
  const vehicle = (kind, x, y, angle, size, fill) => {
    const flip = kind === 'car' && Math.abs(angle) > Math.PI / 2 ? ' scale(1,-1)' : '';
    const body = kind === 'plane' ? [h('path', { key: 'p', d: PLANE, fill })]
      : kind === 'car' ? [h('rect', { key: 'b', x: 1, y: 9, width: 22, height: 8, rx: 2.5, fill }), h('path', { key: 'r', d: 'M6 9.5 8.5 5h7l3 4.5z', fill }), h('circle', { key: 'w1', cx: 6.5, cy: 17.5, r: 2.6, fill: '#111' }), h('circle', { key: 'w2', cx: 17.5, cy: 17.5, r: 2.6, fill: '#111' })]
      : [h('circle', { key: 'r', cx: 12, cy: 12, r: 6 + 3 * Math.abs(Math.sin(t * 5)), fill: 'none', stroke: fill, strokeWidth: 1.5, opacity: 0.6 }), h('circle', { key: 'd', cx: 12, cy: 12, r: 5, fill, stroke: '#fff', strokeWidth: 1.8 })];
    return h('svg', { key: 'vehicle', width: size, height: size, viewBox: '0 0 24 24', style: { position: 'absolute', left: x - size / 2, top: y - size / 2, overflow: 'visible', transform: 'rotate(' + (kind === 'dot' ? 0 : angle * 180 / Math.PI).toFixed(1) + 'deg)' + flip, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' } }, body);
  };`;

export const ROUTE_MAP_CODE = graphicComponent('RouteMap', String.raw`${PIN}${VEHICLES}
  const paper = P.look === 'paper';
  const full = !!P.full;
  const stops = items.length >= 2 ? items.slice(0, 6) : ['A', 'B'];
  const n = stops.length;
  const cw = full ? W : tall ? W * 0.86 : W * 0.5;
  const ch = full ? H : cw * (tall ? 0.72 : 0.62);
  const cx = W * 0.5;
  const cy = full ? H * 0.5 : H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.6 : 0.55);
  const ink = paper ? '#2b2620' : '#ffffff';
  const lineColor = paper ? (P.accent || '#d6402f') : accent;
  // stops across the card (down it when the card is taller than wide), zigzagging so the route curves
  const vertical = ch > cw * 1.1;
  const pts = stops.map((_, i) => {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const wob = (i % 2 ? 1 : -1) * (0.16 + 0.08 * hash(i + 3)) * (n > 2 ? 1 : 0.8);
    return vertical ? [cw * (0.5 + wob * 1.3), ch * mix(0.2, 0.8, u)] : [cw * mix(0.14, 0.86, u), ch * (0.52 + wob)];
  });
  const route = curve(pts, 36);
  const L = lengths(route);
  const len = L[L.length - 1];
  const stopAt = pts.map((_, i) => L[Math.min(route.length - 1, i * 36)]);
  const drawFrom = 0.45, drawTo = Math.max(drawFrom + 0.6, total - exitLen - 0.55);
  const p = inOut((t - drawFrom) / (drawTo - drawFrom));
  const d = p * len;
  const enter = backOut(t / 0.45);
  const dash = (S * 0.02).toFixed(1) + ' ' + (S * 0.014).toFixed(1);
  // contour lines of made-up hills, so the card reads as a map
  const hills = [0, 1, 2, 3, 4].map((k) => {
    const hx = cw * hash(k * 5 + 1), hy = ch * hash(k * 7 + 2), R = S * (0.08 + 0.1 * hash(k + 9));
    return [1, 0.72, 0.46].map((s, j) => {
      const ring = [];
      for (let a = 0; a <= 64; a += 1) {
        const th = (a / 64) * Math.PI * 2;
        const r = R * s * (1 + 0.18 * Math.sin(3 * th + k) + 0.1 * Math.sin(5 * th + k * 2));
        ring.push([hx + Math.cos(th) * r, hy + Math.sin(th) * r * 0.75]);
      }
      return h('path', { key: 'h' + k + j, d: pathOf(ring) + 'Z', fill: 'none', stroke: paper ? '#cbb994' : '#ffffff', strokeOpacity: paper ? 0.7 : 0.09, strokeWidth: S * 0.0022 });
    });
  });
  const grid = [];
  for (let gx = 0; gx < cw; gx += S * 0.06) grid.push(h('line', { key: 'gx' + gx, x1: gx, y1: 0, x2: gx, y2: ch, stroke: ink, strokeOpacity: paper ? 0.05 : 0.05, strokeWidth: 1 }));
  for (let gy = 0; gy < ch; gy += S * 0.06) grid.push(h('line', { key: 'gy' + gy, x1: 0, y1: gy, x2: cw, y2: gy, stroke: ink, strokeOpacity: paper ? 0.05 : 0.05, strokeWidth: 1 }));
  const svg = h('svg', { width: cw, height: ch, style: { position: 'absolute', left: 0, top: 0 } },
    grid, hills,
    h('path', { d: pathOf(route), fill: 'none', stroke: ink, strokeOpacity: 0.22, strokeWidth: S * 0.008, strokeDasharray: dash, strokeLinecap: 'round' }),
    p > 0 ? h('path', { d: pathOf(partOf(route, L, d)), fill: 'none', stroke: lineColor, strokeWidth: S * 0.01, strokeDasharray: dash, strokeLinecap: 'round' }) : null);
  // when the drawn route reaches a stop (inverse of the ease, by bisection)
  const reachedAt = (frac) => { let lo = 0, hi = 1; for (let k = 0; k < 20; k += 1) { const mid = (lo + hi) / 2; if (inOut(mid) < frac) lo = mid; else hi = mid; } return drawFrom + (drawTo - drawFrom) * hi; };
  const labels = stops.map((name, i) => {
    const q = clamp((t - (i === 0 ? 0.25 : reachedAt(stopAt[i] / len))) / 0.35, 0, 1);
    if (q <= 0) return null;
    const [x, y] = pts[i];
    const below = vertical ? false : (i % 2 === 0) === (pts[i][1] < ch * 0.52);
    const fs = S * (tall ? 0.034 : 0.03);
    return h('div', { key: 'stop' + i }, pin(x, y, S * 0.06, q, lineColor),
      box({ left: clamp(x, name.length * fs * 0.36 + fs, cw - name.length * fs * 0.36 - fs), top: below ? y + fs * 0.5 : y - S * 0.06 - fs * 2.1, transform: 'translate(-50%, 0) scale(' + (0.6 + 0.4 * backOut(q)).toFixed(3) + ')', opacity: clamp(q * 3, 0, 1), whiteSpace: 'nowrap',
        fontFamily: 'Montserrat', fontWeight: 800, fontSize: fs, letterSpacing: '0.04em', color: paper ? '#2b2620' : '#111', background: paper ? 'rgba(255,255,255,0.85)' : '#ffffff', padding: (fs * 0.22).toFixed(1) + 'px ' + (fs * 0.5).toFixed(1) + 'px', borderRadius: fs * 0.4, boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }, name));
  });
  const tip = pointAt(route, L, Math.max(0.01, d));
  const icon = P.icon || 'plane';
  const card = h('div', { style: { position: 'absolute', left: cx - cw / 2, top: cy - ch / 2, width: cw, height: ch, overflow: 'hidden', borderRadius: full ? 0 : S * 0.045,
    background: paper ? '#f2e8d2' : 'rgba(14,16,22,0.84)', boxShadow: full ? 'none' : '0 ' + S * 0.02 + 'px ' + S * 0.06 + 'px rgba(0,0,0,0.5)', border: full || paper ? 'none' : '1px solid rgba(255,255,255,0.12)',
    transform: 'scale(' + (full ? 1 : 0.88 + 0.12 * enter).toFixed(3) + ')', opacity: clamp(t / 0.25, 0, 1) * leave } },
    svg, labels, t > drawFrom - 0.1 && t < total ? vehicle(icon, tip.x, tip.y, tip.angle, S * (icon === 'dot' ? 0.05 : 0.075), icon === 'plane' ? (paper ? '#2b2620' : '#ffffff') : lineColor) : null,
    P.sub ? box({ left: S * 0.04, bottom: S * 0.03, fontFamily: 'Space Mono', fontWeight: 700, fontSize: S * 0.026, letterSpacing: '0.12em', color: ink, opacity: 0.8 * smooth((t - drawTo + 0.3) / 0.4) }, String(P.sub).toUpperCase()) : null);
  return h(AbsoluteFill, { style: { overflow: 'hidden' } }, card);`);

export const BOARDING_PASS_CODE = graphicComponent('BoardingPass', String.raw`${VEHICLES}
  const from = items[0] || 'HERE';
  const to = items[1] || 'THERE';
  const cw = tall ? W * 0.88 : W * 0.5;
  const ch = cw * 0.44;
  const stub = cw * 0.27;
  const cy = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.62 : 0.6);
  const q = backOut((t - 0.05) / 0.55);
  const tilt = mix(-9, -2.5, outCubic((t - 0.05) / 0.6));
  const ink = '#16181d';
  const main = cw - stub;
  const big = (s) => Math.min(ch * 0.3, (main * 0.36) / Math.max(2, s.length * 0.5));
  const codes = [from, to].map((s, i) => box({ left: i ? main * 0.64 : main * 0.06, width: main * 0.3, top: ch * 0.3, textAlign: i ? 'right' : 'left' }, [
    h('div', { key: 'c', style: { fontFamily: 'Bebas Neue', fontSize: big(s.toUpperCase()), lineHeight: 1, color: ink, whiteSpace: 'nowrap' } }, s.toUpperCase()),
    h('div', { key: 'l', style: { fontFamily: 'Inter', fontWeight: 700, fontSize: ch * 0.06, letterSpacing: '0.18em', color: '#8a8f99', marginTop: ch * 0.03 } }, i ? 'TO' : 'FROM')]));
  // the plane flies the dotted arc between the two names
  const arc = curve([[main * 0.4, ch * 0.48], [main * 0.5, ch * 0.36], [main * 0.6, ch * 0.48]], 24);
  const L = lengths(arc);
  const fly = inOut((t - 0.5) / Math.max(0.6, Math.min(1.6, total * 0.45)));
  const tip = pointAt(arc, L, Math.max(0.01, fly * L[L.length - 1]));
  const bars = [];
  for (let i = 0, x = main + stub * 0.16; x < main + stub * 0.84; i += 1) { const w = stub * (0.012 + 0.03 * hash(i + 1)); bars.push(h('rect', { key: i, x, y: ch * 0.3, width: w, height: ch * 0.5, fill: ink })); x += w + stub * (0.012 + 0.02 * hash(i + 7)); }
  const notch = ch * 0.07;
  const stampAt = total * 0.55;
  const sq = (t - stampAt) / 0.22;
  const ticket = h('div', { style: { position: 'absolute', left: W * 0.5 - cw / 2, top: cy - ch / 2, width: cw, height: ch, transformOrigin: '50% 50%',
    transform: 'translateY(' + ((1 - q) * H * 0.5).toFixed(1) + 'px) rotate(' + tilt.toFixed(2) + 'deg)', opacity: leave, filter: 'drop-shadow(0 ' + S * 0.02 + 'px ' + S * 0.04 + 'px rgba(0,0,0,0.5))' } },
    h('svg', { width: cw, height: ch, style: { position: 'absolute', left: 0, top: 0 } },
      h('defs', null, h('mask', { id: 'bp-cut' }, h('rect', { width: cw, height: ch, fill: '#fff', rx: ch * 0.08 }),
        h('circle', { cx: main, cy: 0, r: notch, fill: '#000' }), h('circle', { cx: main, cy: ch, r: notch, fill: '#000' }))),
      h('g', { mask: 'url(#bp-cut)' },
        h('rect', { width: cw, height: ch, fill: '#fbfaf6' }),
        h('rect', { width: cw, height: ch * 0.18, fill: accent }),
        h('line', { x1: main, y1: notch * 1.4, x2: main, y2: ch - notch * 1.4, stroke: '#c9c5bb', strokeWidth: 2, strokeDasharray: '6 6' }),
        bars,
        h('path', { d: pathOf(arc), fill: 'none', stroke: '#b9bcc4', strokeWidth: ch * 0.012, strokeDasharray: (ch * 0.025) + ' ' + (ch * 0.025) }))),
    box({ left: main * 0.06, top: ch * 0.045, fontFamily: 'Inter', fontWeight: 800, fontSize: ch * 0.07, letterSpacing: '0.3em', color: '#fff' }, P.title || 'BOARDING PASS'),
    box({ left: main + stub * 0.12, top: ch * 0.045, fontFamily: 'Inter', fontWeight: 800, fontSize: ch * 0.07, letterSpacing: '0.2em', color: '#fff' }, '✈'),
    codes,
    vehicle('plane', tip.x, tip.y, tip.angle, ch * 0.16, accent),
    P.sub ? box({ left: main * 0.06, top: ch * 0.8, fontFamily: 'Space Mono', fontWeight: 700, fontSize: ch * 0.065, letterSpacing: '0.08em', color: ink, whiteSpace: 'nowrap' }, String(P.sub).toUpperCase()) : null,
    P.stamp && sq > 0 ? box({ left: main * 0.5, top: ch * 0.72, transform: 'translate(-50%,-50%) rotate(-14deg) scale(' + mix(1.8, 1, outCubic(sq)).toFixed(3) + ')', opacity: clamp(sq * 2, 0, 0.9),
      border: (ch * 0.022) + 'px solid #d6283b', borderRadius: ch * 0.05, padding: (ch * 0.02) + 'px ' + (ch * 0.06) + 'px', fontFamily: 'Archivo Black', fontSize: ch * 0.1, color: '#d6283b', letterSpacing: '0.06em', whiteSpace: 'nowrap', mixBlendMode: 'multiply' }, String(P.stamp).toUpperCase()) : null);
  return h(AbsoluteFill, { style: { overflow: 'hidden' } }, ticket);`);

export const HUD_STATS_CODE = graphicComponent('HudStats', String.raw`
  const lines = (items.length ? items : ['READY']).slice(0, 5);
  const every = P.every || 1;
  const x0 = W * (P.x != null && P.x >= 0 ? P.x : 0.08);
  const y0 = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.56 : 0.5);
  const fs = S * (tall ? 0.042 : 0.032);
  const rowH = fs * 3.1;
  const hud = P.color && P.color !== '#ffffff' ? P.color : accent;
  const rows = lines.map((line, i) => {
    const start = 0.15 + beatAt(i * every);
    const q = (t - start) / 0.45;
    if (q <= 0) return null;
    const m = /^(\S+)\s+(.+)$/.exec(line);
    const label = m && /\d/.test(m[2]) ? m[1] : '';
    const value = m && /\d/.test(m[2]) ? m[2] : line;
    const y = y0 + i * rowH;
    const scan = clamp(q, 0, 1);
    return h('div', { key: i, style: { position: 'absolute', left: x0, top: y, opacity: leave } },
      box({ left: 0, top: 0, width: fs * 0.22, height: rowH * 0.82, borderLeft: '2px solid ' + hud, borderTop: '2px solid ' + hud, borderBottom: '2px solid ' + hud, opacity: 0.9 }),
      box({ left: -fs * 0.4, top: -rowH * 0.08, width: W * 0.4, height: rowH * 0.98, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))', opacity: smooth(q * 2) }),
      box({ left: fs * 0.6, top: rowH * 0.06, fontFamily: 'Space Mono', fontWeight: 700, fontSize: fs * 0.7, letterSpacing: '0.24em', color: hud, opacity: smooth(q * 3), textShadow: shadow, whiteSpace: 'nowrap' }, label ? label.toUpperCase() : '> ' + String(i + 1).padStart(2, '0')),
      box({ left: fs * 0.6, top: rowH * 0.28, fontFamily: 'Inter Tight', fontWeight: 800, fontSize: fs * 1.45, color: '#ffffff', whiteSpace: 'nowrap', textShadow: shadow,
        clipPath: 'inset(0 ' + ((1 - outCubic(q * 1.6)) * 100).toFixed(1) + '% 0 0)' }, countUp(value, q / 1.4)),
      box({ left: fs * 0.6, top: rowH * 0.86, width: W * 0.32 * scan, height: 2, background: 'linear-gradient(90deg, ' + hud + ', rgba(255,255,255,0))' }));
  });
  // a small reticle that turns slowly beside the readout
  const rr = fs * 1.6;
  const ticks = [];
  for (let k = 0; k < 24; k += 1) { const a = (k / 24) * Math.PI * 2; const r1 = rr * (k % 6 === 0 ? 0.72 : 0.84); ticks.push(h('line', { key: k, x1: rr + Math.cos(a) * r1, y1: rr + Math.sin(a) * r1, x2: rr + Math.cos(a) * rr * 0.95, y2: rr + Math.sin(a) * rr * 0.95, stroke: hud, strokeWidth: 1.5 })); }
  const ret = h('svg', { width: rr * 2, height: rr * 2, style: { position: 'absolute', left: x0 + W * 0.36, top: y0 - rr * 0.6, opacity: smooth(t / 0.4) * leave * 0.85, transform: 'rotate(' + (t * 40).toFixed(1) + 'deg)' } },
    h('circle', { cx: rr, cy: rr, r: rr * 0.95, fill: 'none', stroke: hud, strokeWidth: 1.5, strokeDasharray: (rr * 0.6) + ' ' + (rr * 0.25) }), ticks,
    h('circle', { cx: rr, cy: rr, r: rr * 0.12, fill: hud }));
  return h(AbsoluteFill, { style: { overflow: 'hidden' } }, ret, rows);`);

export const CHAPTER_BAR_CODE = graphicComponent('ChapterBar', String.raw`
  const starts = Array.isArray(P.sections) && P.sections.length ? P.sections : [0];
  const n = starts.length;
  const ends = starts.map((s, i) => (i + 1 < n ? starts[i + 1] : total));
  const y = H * (tall ? 0.115 : 0.06);
  const x0 = W * 0.05, x1 = W * 0.95, gap = W * 0.01;
  const segW = (x1 - x0 - gap * (n - 1)) / n;
  const bh = Math.max(4, S * 0.006);
  const now = starts.reduce((k, s, i) => (t >= s ? i : k), 0);
  const fade = smooth(t / 0.3) * leave;
  const bars = starts.map((s, i) => {
    const fill = clamp((t - s) / Math.max(0.05, ends[i] - s), 0, 1);
    return h('div', { key: i, style: { position: 'absolute', left: x0 + i * (segW + gap), top: y, width: segW, height: bh, borderRadius: bh, background: 'rgba(255,255,255,0.35)', overflow: 'hidden' } },
      h('div', { style: { width: (fill * 100).toFixed(2) + '%', height: '100%', background: color, borderRadius: bh } }));
  });
  const label = items[now];
  const since = t - starts[now];
  const fs = S * (tall ? 0.044 : 0.034);
  const lab = label ? box({ left: x0, top: y + bh + fs * 0.6, fontFamily: 'Inter', fontWeight: 800, fontSize: fs, color, textShadow: shadow, whiteSpace: 'nowrap',
    transform: 'translateY(' + ((1 - outCubic(since / 0.3)) * fs * 0.8).toFixed(1) + 'px)', opacity: smooth(since / 0.25) }, label) : null;
  const step = box({ right: W - x1, top: y + bh + fs * 0.75, fontFamily: 'Space Mono', fontWeight: 700, fontSize: fs * 0.7, color, opacity: 0.85, textShadow: shadow }, (now + 1) + '/' + n);
  const scrim = box({ left: 0, top: 0, width: W, height: y + bh + fs * 3.2, background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.25) 70%, rgba(0,0,0,0))' });
  return h(AbsoluteFill, { style: { opacity: fade } }, scrim, bars, lab, step);`);

export const LOADING_BAR_CODE = graphicComponent('LoadingBar', String.raw`
  const label = items[0] || 'loading...';
  const done = items[1] || '100%';
  const retro = P.look !== 'clean';
  const bw = tall ? W * 0.78 : W * 0.42;
  const cy = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.6 : 0.6);
  const endAt = Math.max(0.8, total - exitLen - 0.6);
  // stutters: a few stalls, stuck at 99 for a moment, then 100 on the beat before the end
  const k = clamp(t / (endAt * 0.82), 0, 1);
  const stall = Math.floor(k * 7);
  const raw = (stall + smooth((k * 7 - stall) * 1.6)) / 7;
  const prog = t >= endAt ? 1 : Math.min(0.99, raw * 0.99);
  const pct = Math.floor(prog * 100);
  const full = t >= endAt;
  const pop = backOut((t - endAt) / 0.3);
  const fs = S * (tall ? 0.04 : 0.032);
  const blocks = [];
  const nb = 20;
  for (let i = 0; i < nb; i += 1) blocks.push(h('div', { key: i, style: { flex: 1, margin: '0 ' + (fs * 0.06) + 'px', background: i < Math.round(prog * nb) ? (full ? accent : color) : 'transparent', opacity: i < Math.round(prog * nb) ? 1 : 0 } }));
  const bar = retro
    ? h('div', { style: { display: 'flex', width: bw, height: fs * 1.25, padding: fs * 0.14, border: (fs * 0.12) + 'px solid ' + color, boxSizing: 'border-box', background: 'rgba(0,0,0,0.45)' } }, blocks)
    : h('div', { style: { width: bw, height: fs * 0.5, borderRadius: fs, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' } },
      h('div', { style: { width: (prog * 100).toFixed(2) + '%', height: '100%', borderRadius: fs, background: full ? accent : 'linear-gradient(90deg, ' + color + ', ' + accent + ')' } }));
  return h(AbsoluteFill, { style: { opacity: smooth(t / 0.25) * leave } },
    box({ left: W * 0.5 - bw / 2, top: cy - fs * 2.2, width: bw, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: retro ? 'Space Mono' : 'Inter', fontWeight: 700, fontSize: fs, color, textShadow: shadow, whiteSpace: 'nowrap' },
      [h('span', { key: 'l' }, full ? '' : label), h('span', { key: 'p', style: { opacity: full ? 0 : 1 } }, pct + '%')]),
    full ? box({ left: W * 0.5, top: cy - fs * 2.6, transform: 'translate(-50%, 0) scale(' + pop.toFixed(3) + ')', fontFamily: retro ? 'Space Mono' : 'Inter', fontWeight: 800, fontSize: fs * 1.25, color: accent, textShadow: shadow, whiteSpace: 'nowrap' }, done) : null,
    box({ left: W * 0.5 - bw / 2, top: cy }, bar));`);

export const CAMCORDER_CODE = graphicComponent('Camcorder', String.raw`
  const inset = S * 0.06;
  const topY = tall ? H * 0.12 : inset;
  const botY = tall ? H * 0.74 : H - inset;
  const fs = S * 0.046;
  const ink = '#ffffff';
  const blink = Math.floor(t * 1.6) % 2 === 0;
  const play = P.mode === 'play';
  const secs = (P.clockFrom || 0) + t;
  const tc = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, Math.floor(secs) % 60].map((v) => String(v).padStart(2, '0')).join(':') + ':' + String(Math.floor((secs % 1) * 30)).padStart(2, '0');
  const corner = (x, y, sx, sy) => h('div', { key: x + '-' + y, style: { position: 'absolute', left: x, top: y, width: S * 0.07, height: S * 0.07, borderLeft: sx ? '3px solid ' + ink : 'none', borderRight: sx ? 'none' : '3px solid ' + ink, borderTop: sy ? '3px solid ' + ink : 'none', borderBottom: sy ? 'none' : '3px solid ' + ink, transform: 'translate(' + (sx ? 0 : '-100%') + ',' + (sy ? 0 : '-100%') + ')', opacity: 0.9 } });
  const mono = { fontFamily: 'Space Mono', fontWeight: 700, fontSize: fs, color: ink, textShadow: '0 0 6px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', letterSpacing: '0.06em' };
  const stamp = items[0] || P.date;
  return h(AbsoluteFill, { style: { opacity: smooth(t / 0.2) * leave } },
    corner(inset, topY - fs * 0.5, true, true), corner(W - inset, topY - fs * 0.5, false, true), corner(inset, botY + fs * 1.6, true, false), corner(W - inset, botY + fs * 1.6, false, false),
    box(Object.assign({ left: inset + S * 0.03, top: topY }, mono), play ? '▶ PLAY' : [h('span', { key: 'd', style: { color: '#ff2a2a', opacity: blink ? 1 : 0.15 } }, '● '), 'REC']),
    box(Object.assign({ right: inset + S * 0.03, top: topY }, mono), tc),
    box({ right: inset + S * 0.03, top: topY + fs * 1.5, width: fs * 1.7, height: fs * 0.8, border: '2px solid ' + ink, borderRadius: 3, padding: 2, boxSizing: 'border-box' },
      h('div', { style: { width: '70%', height: '100%', background: ink } })),
    box(Object.assign({ left: inset + S * 0.03, top: botY }, mono, { fontSize: fs * 0.8 }), play ? 'SP' : 'SP  ' + (P.label || '')),
    stamp ? box(Object.assign({ right: inset + S * 0.03, top: botY }, mono, { color: P.color && P.color !== '#ffffff' ? P.color : '#ffb02e', fontSize: fs * 1.05, textShadow: '0 0 8px rgba(255,140,0,0.6), 0 0 2px rgba(0,0,0,0.8)' }), String(stamp).toUpperCase()) : null,
    box({ left: W / 2 - fs * 0.6, top: H / 2 - 1, width: fs * 1.2, height: 2, background: ink, opacity: 0.5 }),
    box({ left: W / 2 - 1, top: H / 2 - fs * 0.6, width: 2, height: fs * 1.2, background: ink, opacity: 0.5 }));`);
