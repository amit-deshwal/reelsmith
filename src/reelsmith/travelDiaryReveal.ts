// Travel Diary reveals: the next shot breaks in, in register (same framing it has after the cut), through
// five tall bars, five wide bars, or a window that grows in four steps. Each bar appears at its own landing time
// (given as transition progress, so the assembler puts them on the music's beats) and flashes white as it lands;
// the window steps have no flash. At progress 1 the transition ends exactly on the cut to the full-frame shot.
// Rendered as a `custom-shader` transition: the GLSL and its uniforms travel on the transition item.

export const REVEAL_MODES = { tall: 0, wide: 1, window: 2 } as const;
export type RevealKind = keyof typeof REVEAL_MODES;

export const REVEAL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_mode;   // 0 tall bars, 1 wide bars, 2 window
uniform float u_dur;    // transition length in seconds (flash timing)
uniform float u_l0;
uniform float u_l1;
uniform float u_l2;
uniform float u_l3;
uniform float u_l4;     // landing progress of bar/step 0..4 (window uses 0..3)
in vec2 v_texCoord;
out vec4 fragColor;

float landAt(int i) {
  if (i == 0) return u_l0;
  if (i == 1) return u_l1;
  if (i == 2) return u_l2;
  if (i == 3) return u_l3;
  return u_l4;
}

void main() {
  vec2 uv = v_texCoord;
  vec4 a = texture(u_outgoing, uv);
  vec4 b = texture(u_incoming, uv);
  float p = u_progress;
  if (p >= 0.999) { fragColor = b; return; }
  if (u_mode < 1.5) {
    bool tall = u_mode < 0.5;
    // tall: 5 columns across x 0.11-0.89, 0.03-0.97 high; wide: 5 rows across y 0.23-0.77, 0.04-0.96 wide
    float along = tall ? uv.x : uv.y;
    float across = tall ? uv.y : uv.x;
    float lo = tall ? 0.11 : 0.23;
    float hi = tall ? 0.89 : 0.77;
    float gapShare = tall ? 0.45 : 0.4;   // gap / bar width
    float margin = tall ? 0.03 : 0.04;
    float unit = (hi - lo) / (5.0 + 4.0 * gapShare);
    float rel = (along - lo) / (unit * (1.0 + gapShare));
    int i = int(floor(rel));
    bool inBar = along >= lo && along <= hi && i >= 0 && i < 5 && fract(rel) <= 1.0 / (1.0 + gapShare) && across >= margin && across <= 1.0 - margin;
    if (!inBar) { fragColor = a; return; }
    float land = landAt(i);
    if (p < land) { fragColor = a; return; }
    float since = (p - land) * u_dur;          // seconds since this bar landed
    float flash = clamp(1.0 - since / 0.16, 0.0, 1.0);
    fragColor = vec4(mix(b.rgb, vec3(1.0), 0.85 * flash * flash), 1.0);
    return;
  }
  // window: a frame-shaped rectangle left of centre that grows in four steps
  float step = 0.0;
  for (int i = 0; i < 4; i++) if (p >= landAt(i)) step = float(i + 1);
  if (step < 0.5) { fragColor = a; return; }
  float half1 = 0.07 + 0.075 * step;          // half size 0.145, 0.22, 0.295, 0.37 of the frame
  vec2 c = vec2(0.44, 0.5);
  vec2 d = abs(uv - c);
  fragColor = (d.x <= half1 && d.y <= half1) ? b : a;
}
`;

/** Uniforms for one reveal: landing times in seconds from the reveal start, length in seconds. */
export function revealUniforms(kind: RevealKind, landSec: number[], durSec: number): Record<string, number> {
  const p = (s: number | undefined) => (s === undefined ? 2 : Math.max(0, Math.min(0.999, s / durSec)));
  return {
    u_mode: REVEAL_MODES[kind], u_dur: durSec,
    u_l0: p(landSec[0]), u_l1: p(landSec[1]), u_l2: p(landSec[2]), u_l3: p(landSec[3]), u_l4: p(landSec[4]),
  };
}

export const REVEAL_LABELS: Record<RevealKind, string> = { tall: 'Tall bars reveal', wide: 'Wide bars reveal', window: 'Window reveal' };

export interface RevealRect { x: number; y: number; w: number; h: number; flash: number }

/**
 * What the reveal shows at progress `p`, as rectangles in screen fractions (y down) where the incoming shot is visible,
 * each with its white-flash strength. Same geometry and timing as REVEAL_FRAG (whose texture y runs up), so the
 * editor's playback preview can draw it with a CSS clip-path instead of a second pair of video decoders.
 * Returns null once the reveal is over (the incoming shot is full frame).
 */
export function revealRects(u: Record<string, number>, p: number): RevealRect[] | null {
  if (p >= 0.999) return null;
  const lands = [u.u_l0, u.u_l1, u.u_l2, u.u_l3, u.u_l4].map((x) => (typeof x === 'number' ? x : 2));
  const dur = u.u_dur ?? 1;
  const mode = u.u_mode ?? 0;
  if (mode < 1.5) {
    const tall = mode < 0.5;
    const lo = tall ? 0.11 : 0.23;
    const hi = tall ? 0.89 : 0.77;
    const gap = tall ? 0.45 : 0.4;
    const margin = tall ? 0.03 : 0.04;
    const unit = (hi - lo) / (5 + 4 * gap);
    const out: RevealRect[] = [];
    for (let i = 0; i < 5; i += 1) {
      if (p < lands[i]!) continue;
      const since = (p - lands[i]!) * dur;
      const f = Math.max(0, Math.min(1, 1 - since / 0.16));
      const a = lo + i * unit * (1 + gap);
      out.push(tall
        ? { x: a, y: margin, w: unit, h: 1 - 2 * margin, flash: 0.85 * f * f }
        : { x: margin, y: 1 - a - unit, w: 1 - 2 * margin, h: unit, flash: 0.85 * f * f });
    }
    return out;
  }
  let step = 0;
  for (let i = 0; i < 4; i += 1) if (p >= lands[i]!) step = i + 1;
  if (step === 0) return [];
  const half = 0.07 + 0.075 * step;
  return [{ x: 0.44 - half, y: 0.5 - half, w: 2 * half, h: 2 * half, flash: 0 }];
}
