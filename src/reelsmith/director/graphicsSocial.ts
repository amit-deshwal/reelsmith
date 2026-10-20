// RS-1213: director graphics for people and energy, drawn in code: chat bubbles, phone notifications, hand-drawn marks
// that point at the person, stickers, confetti, a countdown and full-screen kinetic type. See graphicsKit.ts for the props
// every graphic gets.
import { graphicComponent } from './graphicsKit';

export const CHAT_BUBBLES_CODE = graphicComponent('ChatBubbles', String.raw`
  const light = P.theme === 'light';
  const every = P.every || 2;
  const msgs = (items.length ? items : ['...']).slice(0, 8).map((s, i, all) => {
    const mine = /^>/.test(s);
    return { text: s.replace(/^>\s*/, ''), mine };
  });
  // nobody marked with ">": take turns, them first
  if (!msgs.some((m) => m.mine)) msgs.forEach((m, i) => { m.mine = i % 2 === 1; });
  const fs = S * (tall ? 0.05 : 0.036);
  const colW = tall ? W * 0.84 : W * 0.42;
  const left = W * 0.5 - colW / 2;
  const bottom = H * (P.y != null && P.y >= 0 ? P.y : tall ? 0.7 : 0.75);
  const at = (i) => (i === 0 ? 0.15 : beatAt(i * every));
  const cpl = Math.max(8, Math.floor((colW * 0.72) / (fs * 0.52)));
  const heightOf = (m) => (isEmoji(m.text) && m.text.length <= 8 ? fs * 2.4 : (Math.ceil(m.text.length / cpl) * fs * 1.3 + fs * 1.1)) + fs * 0.35;
  const shown = msgs.filter((_, i) => t >= at(i) - 0.45);
  const bubbles = [];
  let y = bottom;
  for (let i = shown.length - 1; i >= 0; i -= 1) {
    const m = shown[i];
    const since = t - at(i);
    const hgt = heightOf(m);
    // the newest one grows into place; the ones above slide up with it
    const grow = i === shown.length - 1 ? outCubic(since / 0.25) : 1;
    const typing = !m.mine && since < 0;
    if (typing && i === shown.length - 1) {
      const dots = [0, 1, 2].map((k) => h('div', { key: k, style: { width: fs * 0.32, height: fs * 0.32, borderRadius: '50%', background: light ? '#8e8e93' : '#c7c7cc', margin: '0 ' + fs * 0.08 + 'px', opacity: 0.4 + 0.6 * Math.max(0, Math.sin(t * 9 - k * 0.9)) } }));
      bubbles.push(box({ left, top: y - fs * 1.6, display: 'flex', alignItems: 'center', padding: fs * 0.45 + 'px ' + fs * 0.6 + 'px', borderRadius: fs, background: light ? '#e9e9eb' : '#2c2c2e', transform: 'scale(' + smooth((since + 0.45) / 0.15).toFixed(3) + ')', transformOrigin: '0 100%' }, dots));
      y -= fs * 1.6 + fs * 0.35;
      continue;
    }
    if (since < 0) continue;
    y -= hgt * grow;
    const big = isEmoji(m.text) && m.text.length <= 8;
    const style = big
      ? { fontSize: fs * 2, lineHeight: 1.1 }
      : { maxWidth: colW * 0.72, padding: (fs * 0.45).toFixed(1) + 'px ' + (fs * 0.7).toFixed(1) + 'px', borderRadius: fs * 0.9, background: m.mine ? accent : light ? '#e9e9eb' : '#2c2c2e',
        color: m.mine ? '#ffffff' : light ? '#111' : '#fff', fontFamily: 'Inter', fontWeight: 500, fontSize: fs, lineHeight: 1.3, boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        borderBottomLeftRadius: m.mine ? fs * 0.9 : fs * 0.2, borderBottomRightRadius: m.mine ? fs * 0.2 : fs * 0.9 };
    bubbles.push(box({ left: m.mine ? undefined : left, right: m.mine ? W - left - colW : undefined, top: y, transformOrigin: m.mine ? '100% 100%' : '0 100%',
      transform: 'scale(' + (0.5 + 0.5 * backOut(since / 0.3)).toFixed(3) + ')', opacity: smooth(since / 0.12) }, h('div', { style }, m.text)));
  }
  const head = P.name ? box({ left, top: y - fs * 3.2, display: 'flex', alignItems: 'center', opacity: smooth(t / 0.3) },
    [h('div', { key: 'a', style: { width: fs * 1.8, height: fs * 1.8, borderRadius: '50%', background: 'linear-gradient(135deg,#9aa0ad,#5d6370)', color: '#fff', fontFamily: 'Inter', fontWeight: 700, fontSize: fs * 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, String(P.name).slice(0, 1).toUpperCase()),
     h('div', { key: 'n', style: { marginLeft: fs * 0.4, fontFamily: 'Inter', fontWeight: 700, fontSize: fs * 0.85, color: light ? '#111' : '#fff', textShadow: light ? 'none' : shadow } }, P.name)]) : null;
  return h(AbsoluteFill, { style: { opacity: leave } }, head, bubbles);`);

export const NOTIFICATION_CODE = graphicComponent('PhoneNotification', String.raw`
  const light = P.theme === 'light';
  const every = P.every || 2;
  // pairs of title / message; a single line is the message under the app's name
  const notes = [];
  if (items.length <= 1) notes.push({ title: P.app || 'Messages', body: items[0] || '' });
  else for (let i = 0; i + 1 < items.length && notes.length < 4; i += 2) notes.push({ title: items[i], body: items[i + 1] });
  const bw = tall ? W * 0.9 : W * 0.4;
  const fs = S * (tall ? 0.038 : 0.028);
  const bh = fs * 4.2;
  const gap = fs * 0.5;
  const x = W * 0.5 - bw / 2;
  const y0 = H * (tall ? 0.125 : 0.05);
  const at = (i) => (i === 0 ? 0.1 : beatAt(i * every));
  const arrived = notes.map((_, i) => t - at(i));
  const list = notes.map((n, i) => {
    const since = arrived[i];
    if (since < 0) return null;
    // newer ones land on top and push this one down
    const below = notes.reduce((s, _, k) => (k > i && arrived[k] >= 0 ? s + outCubic(arrived[k] / 0.35) : s), 0);
    const drop = backOut(since / 0.45);
    const y = y0 + below * (bh + gap) - (1 - drop) * (bh * 1.6);
    return box({ key: i, left: x, top: y, width: bw, height: bh, borderRadius: fs * 1.1, background: light ? 'rgba(246,246,248,0.9)' : 'rgba(38,38,40,0.82)', backdropFilter: 'blur(18px)',
      boxShadow: '0 ' + fs * 0.3 + 'px ' + fs * 1.2 + 'px rgba(0,0,0,0.35)', opacity: smooth(since / 0.15) * (1 - smooth(below - 2.2)), display: 'flex', alignItems: 'center', padding: '0 ' + fs * 0.7 + 'px', boxSizing: 'border-box', zIndex: 10 + i },
      [h('div', { key: 'i', style: { width: fs * 2.2, height: fs * 2.2, borderRadius: fs * 0.55, background: P.iconColor || '#34c759', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
         h('svg', { width: fs * 1.3, height: fs * 1.3, viewBox: '0 0 24 24' }, h('path', { d: 'M12 3C6.5 3 2 6.6 2 11c0 2.5 1.4 4.7 3.7 6.2L5 21l4.2-2.3c.9.2 1.8.3 2.8.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z', fill: '#fff' }))),
       h('div', { key: 't', style: { marginLeft: fs * 0.6, flex: 1, minWidth: 0, fontFamily: 'Inter', color: light ? '#111' : '#fff' } },
         h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: fs * 0.72, opacity: 0.6, fontWeight: 600, letterSpacing: '0.04em' } }, h('span', null, String(P.app || 'Messages').toUpperCase()), h('span', null, P.time || 'now')),
         h('div', { style: { fontSize: fs * 0.95, fontWeight: 700, marginTop: fs * 0.12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, n.title),
         h('div', { style: { fontSize: fs * 0.9, fontWeight: 400, marginTop: fs * 0.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, n.body))]);
  });
  return h(AbsoluteFill, { style: { opacity: leave } }, list);`);

export const ANNOTATE_CODE = graphicComponent('Annotate', String.raw`
  const shape = P.shape || 'circle';
  const ink = P.color && P.color !== '#ffffff' ? P.color : '#ff3b30';
  const tx = W * (P.tx != null ? P.tx : 0.5), ty = H * (P.ty != null ? P.ty : 0.4);
  const r = S * clamp(P.tr != null ? P.tr : 0.12, 0.05, 0.3);
  const sw = S * 0.012;
  // hand-drawn: the line boils (redrawn a little differently) every few frames
  const boil = Math.floor(frame / 4);
  const jit = (i) => (hash(i * 13.7 + boil * 3.1) - 0.5) * S * 0.006;
  const pts = [];
  let tail = [tx, ty];
  if (shape === 'circle') {
    for (let k = 0; k <= 70; k += 1) { const a = -2.2 + (k / 70) * Math.PI * 2.25; const rr = 1 + 0.06 * Math.sin(a * 2 + 1); pts.push([tx + Math.cos(a) * r * 1.25 * rr + jit(k), ty + Math.sin(a) * r * 1.05 * rr + jit(k + 99)]); }
    tail = [tx + r * 1.1, ty - r * 1.3];
  } else if (shape === 'box') {
    const c = [[tx - r * 1.3, ty - r * 1.2], [tx + r * 1.35, ty - r * 1.15], [tx + r * 1.3, ty + r * 1.2], [tx - r * 1.32, ty + r * 1.18], [tx - r * 1.3, ty - r * 1.3]];
    for (let i = 0; i < c.length - 1; i += 1) for (let k = 0; k < 12; k += 1) pts.push([mix(c[i][0], c[i + 1][0], k / 12) + jit(i * 20 + k), mix(c[i][1], c[i + 1][1], k / 12) + jit(i * 20 + k + 50)]);
    tail = [tx + r * 1.2, ty - r * 1.5];
  } else if (shape === 'underline') {
    for (let k = 0; k <= 30; k += 1) { const u = k / 30; pts.push([tx - r * 1.6 + u * r * 3.2 + jit(k), ty + r * 1.35 + Math.sin(u * 9) * S * 0.004 + jit(k + 40)]); }
    tail = [tx - r * 1.6, ty + r * 1.6];
  } else if (shape === 'cross') {
    for (let k = 0; k <= 16; k += 1) pts.push([mix(tx - r, tx + r, k / 16) + jit(k), mix(ty - r, ty + r, k / 16) + jit(k + 30)]);
    pts.push(null);
    for (let k = 0; k <= 16; k += 1) pts.push([mix(tx + r, tx - r, k / 16) + jit(k + 60), mix(ty - r, ty + r, k / 16) + jit(k + 90)]);
    tail = [tx + r * 1.1, ty - r * 1.3];
  } else {
    // arrow: from the label, in a curve, stopping short of the target
    const fromRight = tx < W * 0.5;
    const sx = clamp(tx + (fromRight ? 1 : -1) * W * 0.3, W * 0.12, W * 0.88), sy = clamp(ty - H * (tall ? 0.16 : 0.22), H * 0.16, H * 0.8);
    const ang = Math.atan2(ty - sy, tx - sx);
    const ex = tx - Math.cos(ang) * r * 1.05, ey = ty - Math.sin(ang) * r * 1.05;
    const mx = (sx + ex) / 2 + Math.sin(ang) * S * 0.08 * (fromRight ? 1 : -1), my = (sy + ey) / 2 - Math.abs(Math.cos(ang)) * S * 0.06;
    for (let k = 0; k <= 30; k += 1) { const u = k / 30; pts.push([(1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * ex + jit(k), (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * ey + jit(k + 40)]); }
    const end = pts[pts.length - 1], prev = pts[pts.length - 4];
    const a = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
    pts.push(null, [end[0] - Math.cos(a - 0.5) * S * 0.05, end[1] - Math.sin(a - 0.5) * S * 0.05], end, [end[0] - Math.cos(a + 0.5) * S * 0.05, end[1] - Math.sin(a + 0.5) * S * 0.05]);
    tail = [sx, sy];
  }
  // split into strokes at null, and draw them on one after another
  const strokes = [[]];
  pts.forEach((p) => { if (p) strokes[strokes.length - 1].push(p); else strokes.push([]); });
  const lens = strokes.map((s) => { const L = lengths(s); return L[L.length - 1]; });
  const totalLen = lens.reduce((a, b) => a + b, 0);
  const drawn = outCubic((t - 0.1) / 0.5) * totalLen;
  let used = 0;
  const paths = strokes.map((s, i) => {
    const show = clamp(drawn - used, 0, lens[i]);
    used += lens[i];
    return h('path', { key: i, d: pathOf(s), fill: 'none', stroke: ink, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: lens[i].toFixed(1), strokeDashoffset: (lens[i] - show).toFixed(1) });
  });
  const label = items[0] || '';
  const fs = S * (P.size || 1) * 0.08;
  const lq = (t - 0.45) / 0.45;
  const above = tail[1] > H * 0.25;
  const half = label.length * fs * 0.22;
  const lab = label ? box({ left: clamp(tail[0], half + W * 0.05, W - half - W * 0.05), top: above ? tail[1] - fs * 1.15 : tail[1] + fs * 0.1, transform: 'translate(-50%, 0) rotate(-4deg)', whiteSpace: 'nowrap',
    fontFamily: 'Caveat', fontWeight: 700, fontSize: fs, color: ink, textShadow: '0 2px 6px rgba(0,0,0,0.45)', clipPath: 'inset(-20% ' + ((1 - outCubic(lq)) * 100).toFixed(1) + '% -20% 0)' }, label) : null;
  return h(AbsoluteFill, { style: { opacity: leave } },
    h('svg', { width: W, height: H, style: { position: 'absolute', left: 0, top: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' } }, paths), lab);`);

export const STICKER_CODE = graphicComponent('Sticker', String.raw`
  const list = (items.length ? items : ['✨']).slice(0, 4);
  const every = P.every || 1;
  const spots = [[0.74, 0.27], [0.25, 0.35], [0.72, 0.58], [0.27, 0.64]];
  const size = S * 0.17 * (P.size || 1);
  const stickers = list.map((s, i) => {
    const since = t - (i === 0 ? 0.05 : beatAt(i * every));
    if (since < 0) return null;
    const spot = i === 0 && P.x != null && P.x >= 0 ? [P.x, P.y != null && P.y >= 0 ? P.y : spots[0][1]] : spots[(i + (P.seed || 0)) % spots.length];
    const rest = (hash(i + 2) - 0.5) * 24;
    const pop = backOut(since / 0.32);
    const wig = Math.sin(t * 6 + i * 2) * 3 * clamp(since / 0.5, 0, 1);
    const sc = pop * (1 + 0.03 * Math.sin(t * 4 + i)) * (since > 0 ? 1 : 0);
    const emoji = isEmoji(s);
    const outline = 'drop-shadow(' + size * 0.025 + 'px 0 0 #fff) drop-shadow(-' + size * 0.025 + 'px 0 0 #fff) drop-shadow(0 ' + size * 0.025 + 'px 0 #fff) drop-shadow(0 -' + size * 0.025 + 'px 0 #fff) drop-shadow(0 ' + size * 0.04 + 'px ' + size * 0.06 + 'px rgba(0,0,0,0.4))';
    const face = emoji
      ? h('div', { style: { fontSize: size, lineHeight: 1, filter: outline } }, s)
      : h('div', { style: { fontFamily: 'Archivo Black', fontSize: size * 0.34, color: '#fff', background: i % 2 ? (P.color && P.color !== '#ffffff' ? P.color : '#1d9bf0') : accent, padding: size * 0.06 + 'px ' + size * 0.14 + 'px', borderRadius: size * 0.1, border: size * 0.035 + 'px solid #fff', boxShadow: '0 ' + size * 0.04 + 'px ' + size * 0.08 + 'px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', textTransform: 'uppercase' } }, s);
    return box({ key: i, left: W * spot[0], top: H * spot[1], transform: 'translate(-50%,-50%) rotate(' + (mix(-30, rest, outCubic(since / 0.35)) + wig).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')' }, face);
  });
  const out = (total - t) < 0.2 ? backOut((total - t) / 0.2) : 1;
  return h(AbsoluteFill, { style: { transform: 'scale(1)', opacity: out } }, stickers);`);

export const CONFETTI_CODE = graphicComponent('Confetti', String.raw`
  const kind = P.kind || 'confetti';
  const rain = P.mode === 'rain';
  const count = clamp(Math.round(P.count || (rain ? 80 : 140)), 10, 180);
  const palette = [accent, '#ffd23f', '#3ec1ff', '#7cff6b', '#ffffff', '#ff7ab6'];
  const glyph = items[0] || '\u{1F389}';
  // two cannons in the bottom corners; drag k and gravity g scaled to the frame height so the burst reaches mid-frame
  const g = H * 1.3, k = 1.6;
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const r1 = hash(i * 1.37), r2 = hash(i * 2.71 + 4), r3 = hash(i * 3.13 + 9), r4 = hash(i * 5.9 + 1);
    let x, y, t0;
    if (rain) {
      t0 = r1 * Math.max(0.3, total * 0.6);
      const tau = t - t0;
      if (tau < 0) continue;
      x = W * r2 + Math.sin(tau * (2 + r3 * 2) + r4 * 6) * S * 0.03;
      y = -S * 0.05 + (S * (0.35 + 0.3 * r3)) * tau;
    } else {
      t0 = r1 * 0.12;
      const tau = t - t0;
      if (tau < 0) continue;
      const leftGun = i % 2 === 0;
      const ang = -Math.PI / 2 + (leftGun ? 1 : -1) * (0.22 + 0.4 * r2);
      const v = H * (1.7 + 1.0 * r3);
      const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
      const x0 = leftGun ? W * 0.04 : W * 0.96, y0 = H * 1.02;
      const e = 1 - Math.exp(-k * tau);
      x = x0 + (vx / k) * e + (tau > 0.5 ? Math.sin(tau * 5 + r4 * 6) * S * 0.012 : 0);
      y = y0 + (g / k) * tau + ((vy - g / k) / k) * e;
    }
    if (y > H * 1.1) continue;
    const tau = t - t0;
    const spin = (r4 - 0.5) * 14 * tau;
    const flip = Math.cos(tau * (6 + 8 * r2) + r1 * 6);
    const c = palette[i % palette.length];
    const sz = S * (0.018 + 0.016 * r3);
    let el;
    if (kind === 'hearts') el = h('svg', { width: sz * 2.2, height: sz * 2, viewBox: '0 0 24 22' }, h('path', { d: 'M12 21.6 10.3 20C4.2 14.5.2 10.9.2 6.4.2 2.8 3 0 6.6 0c2 0 4 .9 5.4 2.4C13.4.9 15.4 0 17.4 0 21 0 23.8 2.8 23.8 6.4c0 4.5-4 8.1-10.1 13.6z', fill: i % 3 ? accent : '#ff7ab6' }));
    else if (kind === 'sparkles') el = h('svg', { width: sz * 2.4, height: sz * 2.4, viewBox: '-12 -12 24 24', style: { transform: 'scale(' + (0.6 + 0.4 * Math.abs(Math.sin(tau * 7 + r1 * 9))).toFixed(3) + ')' } }, h('path', { d: 'M0-12C1 -3 3 -1 12 0 3 1 1 3 0 12-1 3-3 1-12 0-3-1-1-3 0-12z', fill: i % 2 ? '#fff6c8' : '#ffffff' }));
    else if (kind === 'emoji') el = h('div', { style: { fontSize: sz * 2.4, lineHeight: 1 } }, glyph);
    else el = h('div', { style: { width: sz, height: sz * 1.7, background: c, borderRadius: 1, transform: 'scaleY(' + flip.toFixed(3) + ')' } });
    parts.push(box({ key: i, left: x, top: y, transform: 'translate(-50%,-50%) rotate(' + (spin * 57).toFixed(1) + 'deg)' }, el));
  }
  return h(AbsoluteFill, { style: { opacity: leave, overflow: 'hidden' } }, parts);`);

export const COUNTDOWN_CODE = graphicComponent('Countdown', String.raw`
  const list = (items.length ? items : ['3', '2', '1']).slice(0, 6);
  const every = P.every || 1;
  const starts = list.map((_, i) => beatAt(i * every));
  const now = starts.reduce((k, s, i) => (t >= s ? i : k), 0);
  const since = t - starts[now];
  const len = (now + 1 < list.length ? starts[now + 1] : Math.max(starts[now] + 0.6, total - exitLen)) - starts[now];
  const last = now === list.length - 1;
  const word = list[now];
  const fs = Math.min(S * (last && word.length > 2 ? 0.26 : 0.42), (W * 0.84) / Math.max(1, word.length * 0.5));
  const q = outCubic(since / 0.22);
  const R = S * 0.3;
  const ring = clamp(since / Math.max(0.1, len), 0, 1);
  const circ = 2 * Math.PI * R;
  const dim = P.dim === false ? 0 : 0.35 * smooth(t / 0.2) * leave;
  return h(AbsoluteFill, { style: { background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,' + (dim * 0.6).toFixed(3) + '), rgba(0,0,0,' + dim.toFixed(3) + '))' } },
    last ? null : h('svg', { width: R * 2 + 20, height: R * 2 + 20, style: { position: 'absolute', left: W / 2 - R - 10, top: H * 0.46 - R - 10, transform: 'rotate(-90deg)', opacity: leave } },
      h('circle', { cx: R + 10, cy: R + 10, r: R, fill: 'none', stroke: 'rgba(255,255,255,0.25)', strokeWidth: S * 0.012 }),
      h('circle', { cx: R + 10, cy: R + 10, r: R, fill: 'none', stroke: color, strokeWidth: S * 0.012, strokeLinecap: 'round', strokeDasharray: circ.toFixed(1), strokeDashoffset: (circ * (1 - ring)).toFixed(1) })),
    box({ left: W / 2, top: H * 0.46, transform: 'translate(-50%,-50%) scale(' + mix(1.7, 1, q).toFixed(3) + ')', opacity: smooth(since / 0.08) * leave, filter: 'blur(' + ((1 - q) * 10).toFixed(1) + 'px)',
      fontFamily: 'Anton', fontSize: fs, lineHeight: 1, color: last ? accent : color, textShadow: shadow, whiteSpace: 'nowrap', textTransform: 'uppercase' }, word));`);

export const TYPE_STACK_CODE = graphicComponent('TypeStack', String.raw`
  const words = (items.length ? items : ['YOUR', 'WORDS', 'HERE']).slice(0, 6).map((s) => s.toUpperCase());
  const every = P.every || 1;
  const n = words.length;
  const solid = P.background && P.background !== 'none';
  const maxW = W * 0.86;
  const sizes = words.map((w) => Math.min((maxW) / Math.max(1, w.length * 0.47), (H * (tall ? 0.6 : 0.8)) / n / 0.92));
  const blockH = sizes.map((s) => s * 0.98);
  const totalH = blockH.reduce((a, b) => a + b, 0);
  let y = H * (P.y != null && P.y >= 0 ? P.y : 0.47) - totalH / 2;
  const wipe = 0.16;
  const out = total - exitLen - 0.05;
  const rows = words.map((w, i) => {
    const s = (i === 0 ? 0.05 : beatAt(i * every));
    const top = y; y += blockH[i];
    const a = (t - s) / wipe;
    const shown = a >= 1;
    // a block wipes in from the left, then off to the right, leaving the word; at the end the rows leave upward in turn
    const blockIn = clamp(a, 0, 1), blockOut = clamp(a - 1, 0, 1);
    const fill = i % 2 ? color : accent;
    const leaveQ = smooth((t - out - i * 0.04) / 0.22);
    return h('div', { key: i, style: { position: 'absolute', left: W * 0.5 - maxW / 2, top, width: maxW, height: blockH[i], overflow: 'hidden', transform: 'translateY(' + (-leaveQ * blockH[i] * 1.2).toFixed(1) + 'px)', opacity: 1 - leaveQ } },
      shown ? h('div', { style: { fontFamily: 'Anton', fontSize: sizes[i], lineHeight: 0.98, color: i % 2 && !solid ? accent : color, textAlign: 'center', whiteSpace: 'nowrap', textShadow: solid ? 'none' : shadow } }, w) : null,
      a > 0 && blockOut < 1 ? h('div', { style: { position: 'absolute', inset: 0, background: fill, transformOrigin: blockIn < 1 ? '0 50%' : '100% 50%', transform: 'scaleX(' + (blockIn < 1 ? outCubic(blockIn) : 1 - outCubic(blockOut)).toFixed(3) + ')' } }) : null);
  });
  const bg = solid ? P.background : 'rgba(0,0,0,' + (0.38 * smooth(t / 0.2) * leave).toFixed(3) + ')';
  return h(AbsoluteFill, { style: { background: solid ? bg : bg, opacity: solid ? smooth(t / 0.12) * (1 - smooth((t - out - 0.2) / 0.2)) : 1 } }, rows);`);
