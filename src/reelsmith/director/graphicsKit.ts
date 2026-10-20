// RS-1213: the shared start of every director graphic (graphicsTravel.ts, graphicsSocial.ts). Graphics are motion-graphic
// items whose code runs in the template sandbox (src/template-host.ts): no imports, only the injected Remotion globals,
// so these helpers are pasted into each component body instead of imported.
//
// Every graphic gets these props from graphics.ts: items (the plan's text split on "/"), beats (seconds of each beat of
// the song from the item start), sections (seconds where each section it spans starts), total (its length in seconds),
// accent and color, and its own params.

export const GRAPHIC_PRELUDE = String.raw`
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = item.props || {};
  const W = item.width;
  const H = item.height;
  const S = Math.min(W, H);
  const tall = H > W * 1.2;
  const t = frame / fps;
  const total = P.total || 3;
  const h = React.createElement;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, q) => a + (b - a) * q;
  const smooth = (q) => { q = clamp(q, 0, 1); return q * q * (3 - 2 * q); };
  const outCubic = (q) => { q = clamp(q, 0, 1); return 1 - Math.pow(1 - q, 3); };
  const inOut = (q) => { q = clamp(q, 0, 1); return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2; };
  const backOut = (q) => { q = clamp(q, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(q - 1, 3) + c * Math.pow(q - 1, 2); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const items = Array.isArray(P.items) ? P.items.map(String) : [];
  const beatList = Array.isArray(P.beats) && P.beats.length ? P.beats : null;
  // seconds of beat b (fractions allowed) from the item start; 0.5 s a beat without a song
  const beatAt = (b) => {
    if (!beatList) return b * 0.5;
    const i = Math.floor(b);
    const at = (k) => (k < beatList.length ? beatList[k] : beatList[beatList.length - 1] + (k - beatList.length + 1) * (beatList.length > 1 ? (beatList[beatList.length - 1] - beatList[0]) / (beatList.length - 1) : 0.5));
    return at(i) + (b - i) * (at(i + 1) - at(i));
  };
  const exitLen = Math.min(0.35, total * 0.15);
  const leave = 1 - smooth((t - (total - exitLen)) / Math.max(0.01, exitLen));
  const accent = P.accent || '#ff3b5c';
  const color = P.color || '#ffffff';
  // numbers in a string roll up from zero as q goes 0..1, keeping their commas and decimals
  const countUp = (s, q) => String(s).replace(/\d[\d,.]*\d|\d/g, (m) => {
    const target = Number(m.replace(/,/g, ''));
    if (!Number.isFinite(target)) return m;
    const dec = (m.split('.')[1] || '').length;
    const v = (target * outCubic(q)).toFixed(dec);
    return m.indexOf(',') >= 0 ? Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v;
  });
  const isEmoji = (s) => /\p{Extended_Pictographic}/u.test(s) && !/[A-Za-z0-9]/.test(s);
  // a polyline's cumulative lengths, and the point and heading at length d along it
  const lengths = (pts) => { const L = [0]; for (let i = 1; i < pts.length; i += 1) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; };
  const pointAt = (pts, L, d) => {
    let i = 1;
    while (i < pts.length - 1 && L[i] < d) i += 1;
    const seg = Math.max(1e-6, L[i] - L[i - 1]);
    const q = clamp((d - L[i - 1]) / seg, 0, 1);
    const a = pts[i - 1], b = pts[i];
    return { x: a[0] + (b[0] - a[0]) * q, y: a[1] + (b[1] - a[1]) * q, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
  };
  const pathOf = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  // the first part of a polyline, up to length d
  const partOf = (pts, L, d) => { const end = pointAt(pts, L, d); return pts.slice(0, end.i).concat([[end.x, end.y]]); };
  // a smooth curve through the points (Catmull-Rom), as a polyline
  const curve = (ps, per) => {
    const out = [];
    for (let i = 0; i < ps.length - 1; i += 1) {
      const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
      for (let k = 0; k < per; k += 1) {
        const u = k / per, u2 = u * u, u3 = u2 * u;
        out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3)));
      }
    }
    out.push(ps[ps.length - 1]);
    return out;
  };
  const shadow = '0 ' + (S * 0.004).toFixed(1) + 'px ' + (S * 0.018).toFixed(1) + 'px rgba(0,0,0,0.55)';
  const box = (style, children) => h('div', { style: Object.assign({ position: 'absolute' }, style) }, children);
`;

/** A component named `name` whose body is the prelude followed by `body`. */
export const graphicComponent = (name: string, body: string) => `const ${name} = ({ item }) => {${GRAPHIC_PRELUDE}${body}\n};`;
