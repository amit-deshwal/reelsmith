// Postcard Collage graphics (postcard-collage@1). The editor has no animated crop, and its canvas-wide fit would zoom a
// portrait clip into a thin strip, so the strips and the finale are motion graphics that play the clips themselves.
//
// The graphic is a generic window player: `sources` are the clips (each with the source second it plays from and the
// graphic second it starts at), `windows` say which source shows where and when. A window has keyframed rectangles: the
// visible rectangle `win` and the `anchor` the picture is centred on. With cover "window" the picture covers the window
// (strips); with cover "frame" it covers the whole frame and the window only crops it (finale), so a window that changes
// shape crops rather than stretches. The scenes themselves are plain data built below in TypeScript.

export type Rect = [number, number, number, number];

export interface GraphicSource {
  src: string;
  kind: 'video' | 'image';
  width: number;
  height: number;
  /** source second shown when the source starts playing */
  inSec: number;
  /** graphic second at which the source starts playing */
  fromSec: number;
  /** restart from inSec when the clip runs out */
  loop?: boolean;
  /** point to keep in view, 0..1 from the top-left */
  focus?: [number, number];
}

export interface WindowKey { t: number; win: Rect; anchor?: Rect; opacity?: number; /** straight line to the next key */ linear?: boolean }
export interface GraphicWindow {
  /** source key, or null for a solid black window */
  s: string | null;
  from: number;
  to: number;
  cover: 'frame' | 'window';
  keys: WindowKey[];
}

export interface GraphicProps { sources: Record<string, GraphicSource>; windows: GraphicWindow[]; background?: string }

export const POSTCARD_GRAPHIC_CODE = String.raw`const PostcardGraphic = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = item.props || {};
  const sources = P.sources || {};
  const W = item.width;
  const H = item.height;
  const g = frame / fps;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (q) => q * q * (3 - 2 * q);
  const lerp = (a, b, q) => a.map((v, i) => v + (b[i] - v) * q);

  // the window's state at second g: keys hold before the first and after the last; segments ease unless linear
  const at = (keys) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= g) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const raw = b.t > a.t ? clamp((g - a.t) / (b.t - a.t), 0, 1) : 0;
    const q = a.linear ? raw : smooth(raw);
    const win = lerp(a.win, b.win, q);
    const anchor = lerp(a.anchor || a.win, b.anchor || b.win, q);
    const opacity = (a.opacity == null ? 1 : a.opacity) + ((b.opacity == null ? 1 : b.opacity) - (a.opacity == null ? 1 : a.opacity)) * q;
    return { win, anchor, opacity };
  };

  const media = (s, key) => {
    const style = { width: '100%', height: '100%', display: 'block' };
    if (s.kind === 'image') return React.createElement(Img, { key, src: s.src, style });
    const video = React.createElement(Video, { src: s.src, trimBefore: Math.max(0, Math.round(s.inSec * fps)), muted: true, loop: !!s.loop, style });
    return React.createElement(Sequence, { key, from: Math.round((s.fromSec || 0) * fps), layout: 'none' }, video);
  };

  const out = (P.windows || []).map((w, n) => {
    if (g < w.from || g >= w.to) return null;
    const { win, anchor, opacity } = at(w.keys);
    if (win[2] <= 0.5 || win[3] <= 0.5 || opacity <= 0.001) return null;
    const box = { position: 'absolute', left: win[0], top: win[1], width: win[2], height: win[3], overflow: 'hidden', opacity };
    const s = w.s == null ? null : sources[w.s];
    if (!s) return React.createElement('div', { key: 'w' + n, style: { ...box, background: '#000' } });
    const f = s.focus || [0.5, 0.5];
    let pw, ph, x, y;
    if (w.cover === 'window') {
      const k = Math.max(win[2] / Math.max(1, s.width), win[3] / Math.max(1, s.height));
      pw = s.width * k; ph = s.height * k;
      // the focus point as central as the edges allow
      x = clamp(win[0] + win[2] / 2 - f[0] * pw, win[0] + win[2] - pw, win[0]);
      y = clamp(win[1] + win[3] / 2 - f[1] * ph, win[1] + win[3] - ph, win[1]);
    } else {
      const k = Math.max(W / Math.max(1, s.width), H / Math.max(1, s.height));
      pw = s.width * k; ph = s.height * k;
      // covers the frame around the anchor's centre, shifted toward the focus by the overflow
      x = anchor[0] + (anchor[2] - pw) / 2 + (0.5 - f[0]) * (pw - W);
      y = anchor[1] + (anchor[3] - ph) / 2 + (0.5 - f[1]) * (ph - H);
    }
    return React.createElement('div', { key: 'w' + n, style: box },
      React.createElement('div', { style: { position: 'absolute', left: x - win[0], top: y - win[1], width: pw, height: ph } }, media(s, 'm' + n)));
  });
  return React.createElement(AbsoluteFill, { style: { background: P.background || 'transparent', overflow: 'hidden' } }, out);
};`;

// ---- the opener's strips ------------------------------------------------------------------------------------------

/** Six columns, each 1/6 of the width, appearing at `at` (graphic seconds) and staying until `until`. */
export function stripWindows(W: number, H: number, at: readonly number[], until: number): GraphicWindow[] {
  return at.map((t, i) => {
    const x0 = Math.round((i * W) / at.length);
    const win: Rect = [x0, 0, Math.round(((i + 1) * W) / at.length) - x0, H];
    return { s: `strip${i + 1}`, from: t, to: until, cover: 'window', keys: [{ t, win }] };
  });
}

// ---- the finale ----------------------------------------------------------------------------------------------------

export type FinaleRole = 'middle' | 'top' | 'closer' | 'grid1' | 'grid2' | 'grid3';
export const FINALE_ROLES: readonly FinaleRole[] = ['middle', 'top', 'closer', 'grid1', 'grid2', 'grid3'];

/** Finale beats in graphic seconds (the graphic starts at 13.3 s of the film). */
export const FINALE = {
  open: [0.1, 0.65], topWipe: [0.65, 1.3], closerWipe: [0.81, 1.46], gutters: [0.65, 1.35],
  cards: [2.45, 3.2], grid: 3.2, gridLength: 0.42, gridStagger: 0.13,
  swaps: { top1a: 3.7, top0: 4.13, bottom0: 4.28, top1b: 4.42, bottom1: 4.56, bottom2: 4.7 },
  pano: [5.55, 6.25], fadeOthers: [5.55, 6.0], shut: [7.1, 7.87], end: 8.8,
} as const;
/** Graphic second at which the grid's own clips start playing. */
export const FINALE_GRID_FROM_SEC = FINALE.grid;
/** How long each role is on screen from the moment it starts playing. */
export const FINALE_NEEDS_SEC: Record<FinaleRole, number> = { middle: 3.7, top: 6.0, closer: 7.9, grid1: 2.8, grid2: 2.8, grid3: 2.8 };

/**
 * The finale as windows: the band the postcards left opens to the full frame on the middle clip; the top and closer
 * clips wipe in as bands over its top and bottom thirds; the bands become three tall cards; the cards split into a
 * 3 x 2 grid whose pictures swap; the top-right window grows into a panorama while the rest fade; the panorama shuts
 * into a thin line. `bandCover(s)` is the fraction of the height each band bar covers at film second s.
 */
export function finaleWindows(W: number, H: number, startSec: number, bandCover: (s: number) => number): GraphicWindow[] {
  const F = FINALE;
  const margin = W * 0.025;
  const gap = W * 0.007;
  const cw = (W - 2 * margin - 2 * gap) / 3;
  const gh = (H - 2 * margin - gap) / 2;
  const full: Rect = [0, 0, W, H];
  const inset = (s: number): Rect => { const c = bandCover(s) * H; return [0, c, W, H - 2 * c]; };
  const card = (i: number): Rect => [margin + i * (cw + gap), margin, cw, H - 2 * margin];
  const tile = (c: number, r: number): Rect => [margin + c * (cw + gap), margin + r * (gh + gap), cw, gh];
  const bandH = H / 3 - gap / 2;
  const bands: Rect[] = [[0, 0, W, bandH], [0, H / 3 + gap / 2, W, H / 3 - gap], [0, H - bandH, W, bandH]];
  const out: GraphicWindow[] = [];

  // the middle clip: in the band, opening to the full frame
  out.push({ s: 'middle', from: 0, to: F.cards[0], cover: 'frame', keys: [
    { t: 0, win: inset(startSec), anchor: full, linear: true },
    { t: F.open[0], win: inset(startSec + F.open[0]), anchor: full },
    { t: F.open[1], win: full, anchor: full },
  ] });
  // two bands wipe in over it, the top one from the left, the bottom one from the right, and the gutters open
  out.push({ s: 'top', from: F.topWipe[0], to: F.cards[0], cover: 'frame', keys: [
    { t: F.topWipe[0], win: [0, 0, 0, bandH], anchor: bands[0] }, { t: F.topWipe[1], win: bands[0], anchor: bands[0] },
  ] });
  out.push({ s: 'closer', from: F.closerWipe[0], to: F.cards[0], cover: 'frame', keys: [
    { t: F.closerWipe[0], win: [W, H - bandH, 0, bandH], anchor: bands[2] }, { t: F.closerWipe[1], win: bands[2], anchor: bands[2] },
  ] });
  for (const y of [H / 3, (2 * H) / 3]) {
    out.push({ s: null, from: F.gutters[0], to: F.cards[0], cover: 'frame', keys: [
      { t: F.gutters[0], win: [0, y, W, 0] }, { t: F.gutters[1], win: [0, y - gap / 2, W, gap] },
    ] });
  }
  // the bands become three tall cards
  (['top', 'middle', 'closer'] as const).forEach((role, i) => {
    out.push({ s: role, from: F.cards[0], to: F.grid, cover: 'frame', keys: [{ t: F.cards[0], win: bands[i]! }, { t: F.cards[1], win: card(i) }] });
  });

  // the grid: each top card shrinks into its top window, each bottom window grows up from its bottom edge
  const S = F.swaps;
  const topSchedule: Array<Array<[FinaleRole, number, number]>> = [
    [['top', F.grid, S.top0], ['grid1', S.top0, F.pano[1]]],
    [['middle', F.grid, S.top1a], ['grid2', S.top1a, S.top1b], ['grid3', S.top1b, F.pano[1]]],
    [['closer', F.grid, F.pano[0]]],
  ];
  const bottomSchedule: Array<Array<[FinaleRole, number, number]>> = [
    [['grid3', F.grid, S.bottom0], ['top', S.bottom0, F.pano[1]]],
    [['grid1', F.grid, S.bottom1], ['grid2', S.bottom1, F.pano[1]]],
    [['grid2', F.grid, S.bottom2], ['grid1', S.bottom2, F.pano[1]]],
  ];
  const fade = (r: Rect): WindowKey[] => [{ t: F.fadeOthers[0], win: r }, { t: F.fadeOthers[1], win: r, opacity: 0 }];
  [0, 1, 2].forEach((i) => {
    const t0 = F.grid + F.gridStagger * i;
    const t1 = t0 + F.gridLength;
    const top = tile(i, 0);
    const bottom = tile(i, 1);
    for (const [role, from, to] of topSchedule[i]!) {
      out.push({ s: role, from, to, cover: 'frame', keys: [{ t: t0, win: card(i) }, { t: t1, win: top }, ...(i === 2 ? [] : fade(top))] });
    }
    for (const [role, from, to] of bottomSchedule[i]!) {
      out.push({ s: role, from, to, cover: 'frame', keys: [
        { t: t0, win: [bottom[0], bottom[1] + bottom[3], bottom[2], 0], anchor: bottom }, { t: t1, win: bottom, anchor: bottom }, ...fade(bottom),
      ] });
    }
  });
  // the top-right window grows into the panorama, which then shuts into a line across its middle
  const pano: Rect = [W * 0.05, H * 0.1, W * 0.9, H * 0.8];
  const line: Rect = [pano[0], pano[1] + pano[3] / 2, pano[2], 0];
  out.push({ s: 'closer', from: F.pano[0], to: F.shut[1], cover: 'frame', keys: [
    { t: F.pano[0], win: tile(2, 0) }, { t: F.pano[1], win: pano }, { t: F.shut[0], win: pano, anchor: pano }, { t: F.shut[1], win: line, anchor: pano },
  ] });
  return out;
}
