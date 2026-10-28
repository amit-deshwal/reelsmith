#version 300 es
precision highp float;
// Photo parallax: a camera move through a still photo using its depth map (u_depth, white = near), so near things move
// more than far ones. Each screen pixel marches from near to far and takes the first part of the photo that covers it,
// so near edges pass correctly over what is behind them. What a move uncovers behind a near edge is filled by stretching
// the edge across it: the depth map's edges are snapped to the photo's own (server/reelsmith/depthMath.ts), so that strip
// is narrow and reads as the edge bending, not tearing. (Filling it from the background instead hollowed out thin things
// like conifers against water.) Without a depth map (flat grey) it is a plain push or pan.
uniform sampler2D u_input;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_progress;
uniform float u_move;
uniform float u_strength;
uniform float u_focus;
// 0 while the photo has no depth map: everything sits at one depth, so the moves pivot on the far plane and still move
uniform float u_hasDepth;
// the screen in this picture's texture coordinates (x0, y0, x1, y1); (0, 0, 1, 1) when the picture fills it exactly
uniform vec4 u_view;
in vec2 v_texCoord;
out vec4 fragColor;

const int STEPS = 48;

float depthAt(vec2 uv) { return texture(u_depth, clamp(uv, 0.0, 1.0)).r; }

void main() {
  float e = 0.5 - 0.5 * cos(3.14159265 * clamp(u_progress, 0.0, 1.0));
  float s = u_strength;
  // the part of the picture on screen (a photo filled into 9:16 shows a slice of it): the move is sized to it and
  // centred on it, and the picture beyond its edges is the margin a sideways move may use
  vec2 v0 = u_view.xy, v1 = u_view.zw;
  vec2 viewSize = max(v1 - v0, vec2(1e-3));
  float viewH = viewSize.y * u_resolution.y; // the screen's height in picture pixels
  // camera: everything scales by zoom * (1 + dolly * (depth - focus)) and shifts by pan * (depth - focus);
  // panMax is the largest pan the move reaches, which sets the margin it needs
  float zoom = 1.0;
  float dolly = 0.0;
  vec2 pan = vec2(0.0);
  vec2 panMax = vec2(0.0);
  float focus = u_focus;
  int move = int(u_move + 0.5);
  if (move == 0) {
    // dolly: the camera walks in; the foreground grows faster than the background
    zoom = 1.0 + 0.15 * s * e;
    dolly = 0.7 * s * e;
    focus = 0.0;
  } else if (move == 1) {
    // orbit: the camera slides sideways around the focus depth (a tenth of the screen's height); near and far drift in
    // opposite directions
    pan = vec2(0.1 * s * (e - 0.5) * viewH / u_resolution.x, 0.0);
    panMax = vec2(0.05 * s * viewH / u_resolution.x, 0.0);
  } else {
    // rise: the camera lifts; the foreground sinks out of frame faster than the horizon
    // (texture y runs upwards here, so a positive pan lifts the near layer; the camera rising sinks it)
    pan = vec2(0.0, -0.11 * s * (e - 0.5) * viewSize.y);
    panMax = vec2(0.0, 0.055 * s * viewSize.y);
    zoom = 1.0 + 0.08 * s * e;
    focus = 0.0;
  }
  if (u_hasDepth < 0.5) focus = 0.0;
  // overscan only where the margin beyond the screen's edges is not enough for the largest shift
  vec2 c = (v0 + v1) * 0.5;
  vec2 halfView = viewSize * 0.5;
  vec2 shift = panMax * max(focus, 1.0 - focus);
  vec2 room = max(min(c, 1.0 - c) - shift, vec2(1e-3));
  zoom *= max(1.0, max(halfView.x / room.x, halfView.y / room.y)) * 1.003;

  vec2 x = v_texCoord;
  // first depth h (from near to far) whose source pixel is at least that near
  float prevH = 1.0;
  float prevDiff = -1.0;
  vec2 hit = c + (x - c) / zoom;
  for (int i = 0; i <= STEPS; i++) {
    float h = 1.0 - float(i) / float(STEPS);
    float scale = zoom * max(0.05, 1.0 + dolly * (h - focus));
    vec2 src = c + (x - c - pan * (h - focus)) / scale;
    float diff = depthAt(src) - h;
    if (diff >= 0.0) {
      // between the last miss and this hit, where the ray crossed the surface
      float t = i == 0 ? 0.0 : prevDiff / (prevDiff - diff);
      float hh = mix(prevH, h, clamp(t, 0.0, 1.0));
      float sc = zoom * max(0.05, 1.0 + dolly * (hh - focus));
      hit = c + (x - c - pan * (hh - focus)) / sc;
      break;
    }
    prevH = h;
    prevDiff = diff;
  }
  fragColor = texture(u_input, clamp(hit, 0.0, 1.0));
}
