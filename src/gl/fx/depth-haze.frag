#version 300 es
precision highp float;
// Depth haze (RS-1260): air between the ridges. Far land fades toward the haze colour and loses contrast, more with
// distance (u_depth, white = near), like aerial perspective; what is nearer than `start` is left alone. The sky is far
// too, but it is not haze: it is kept out by the sky map (u_sky, made with the clip's still depth map) and, without one,
// by easing off at the farthest depth. The colour is taken from the far part of the frame by default (the horizon and
// sky); with `drift` the haze thins and thickens in slow banks moving across. Without a depth map the shot is unchanged.
uniform sampler2D u_input;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_hasDepth;
uniform float u_density;
uniform float u_start;
uniform float u_auto;
uniform vec3 u_color;
uniform float u_drift;
uniform sampler2D u_sky;
uniform float u_hasSky;
in vec2 v_texCoord;
out vec4 fragColor;
// --- skyAt (RS-1261; the same text in reel-mix, sky-recover and sky-swap: src/gl/fx/skyAt.glsl.txt) ---
// The sky at this pixel of this frame. u_sky: red = the sky in the frame the map was made from, green = where the sky can
// be in other frames of the shot. With the sky's colour model (u_hasSkyModel) the sky is found again in each frame by its
// colour: inside the map with a looser test (grey clouds stay in, a head that moves in drops out), and in the rest of the
// gate with the full one (sky a moving camera uncovers). Its colours run on a line from its own colour to grey.
uniform vec2 u_skyChroma;
uniform vec2 u_skySpread;
uniform float u_skyLimit;
uniform vec2 u_skyLuma; // x: the darkest sky; y: how bright a paler-than-sky pixel must be
uniform float u_hasSkyModel;
float skyColour(vec3 c, float widen, float needPale) {
  float s = c.r + c.g + c.b + 0.004;
  vec2 ch = vec2(c.r, c.g) / s;
  vec2 b = vec2(1.0 / 3.0) - u_skyChroma;
  float t = clamp(dot(ch - u_skyChroma, b) / max(dot(b, b), 1e-9), 0.0, 1.0);
  float d = length((ch - u_skyChroma - t * b) / max(u_skySpread, vec2(1e-4)));
  float lim = u_skyLimit * widen;
  float colour = 1.0 - smoothstep(lim * 0.85, lim * 1.2, d);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float bright = smoothstep(u_skyLuma.x - 0.04, u_skyLuma.x + 0.02, l);
  float pale = mix(1.0, smoothstep(u_skyLuma.y - 0.04, u_skyLuma.y + 0.02, l), smoothstep(0.15, 0.25, t) * needPale);
  float mx = max(c.r, max(c.g, c.b));
  float haze = (1.0 - smoothstep(0.2, 0.26, (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3))) * smoothstep(u_skyLuma.y - 0.04, u_skyLuma.y + 0.02, l) * needPale;
  return max(colour * bright * pale, haze);
}
// `pic`: the picture the colour is read from. The colour is averaged over a few pixels round uv, so far hazy land that is
// nearly sky-coloured comes out one way or the other in patches, not speckled.
float skyAt(vec2 uv, sampler2D pic) {
  vec4 m = texture(u_sky, uv);
  if (u_hasSkyModel < 0.5) return m.r;
  vec2 o = 6.0 / vec2(textureSize(pic, 0));
  vec3 c = (texture(pic, uv).rgb * 2.0 + texture(pic, uv + vec2(o.x, 0.0)).rgb + texture(pic, uv - vec2(o.x, 0.0)).rgb
    + texture(pic, uv + vec2(0.0, o.y)).rgb + texture(pic, uv - vec2(0.0, o.y)).rgb) / 6.0;
  return max(m.r * skyColour(c, 1.4, 0.0), m.g * skyColour(c, 0.8, 1.0));
}
// --- end skyAt ---

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec4 base = texture(u_input, v_texCoord);
  if (u_hasDepth < 0.5 || u_density <= 0.0) { fragColor = base; return; }
  // the haze's colour: the far pixels of a 6x8 grid, a little lighter
  vec3 far = vec3(0.0);
  float wsum = 0.0;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 6; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(6.0, 8.0);
    float w = pow(1.0 - texture(u_depth, uv).r, 6.0) + 1e-4;
    far += texture(u_input, uv).rgb * w;
    wsum += w;
  }
  vec3 haze = mix(u_color, min(vec3(1.0), far / wsum * 1.06 + 0.03), clamp(u_auto, 0.0, 1.0));
  float d = texture(u_depth, v_texCoord).r;
  // grows from nothing at `start` to its full density at the far end; the sky (or the very farthest depth) kept clear
  float fog = clamp(u_density, 0.0, 2.0) * 0.5 * pow(1.0 - smoothstep(0.0, max(u_start, 1e-3), d), 1.5);
  float sky = u_hasSky > 0.5 ? skyAt(v_texCoord, u_input) : 1.0 - smoothstep(0.004, 0.03, d);
  fog *= 1.0 - 0.85 * sky;
  if (u_drift > 0.0) {
    vec2 p = v_texCoord * vec2(2.5, 6.0) + vec2(u_time * 0.04 * u_drift, 0.0);
    float bank = noise(p) * 0.65 + noise(p * 2.1 + 3.7) * 0.35;
    fog *= mix(1.0, 0.55 + 0.9 * bank, min(1.0, u_drift) * 0.6);
  }
  fog = clamp(fog, 0.0, 0.85);
  // contrast eased under the haze, then the haze laid over it
  float l = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 flat_ = mix(base.rgb, vec3(l), fog * 0.35);
  fragColor = vec4(mix(flat_, haze, fog), base.a);
}
