#version 300 es
precision highp float;
// Sky swap (RS-1261): a new sky in the sky map's region (u_sky, white = sky): a sunset (style 0) or a deep blue sky (1),
// with soft clouds drifting across, and the land warmed or cooled a little to sit under it. Without a sky map nothing
// changes: a sky painted over a guess would cover heads and ridges.
uniform sampler2D u_input;
uniform sampler2D u_sky;
uniform float u_hasSky;
uniform float u_style;
uniform float u_clouds;
uniform float u_drift;
uniform float u_match;
uniform float u_time;
uniform vec2 u_resolution;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec4 src = texture(u_input, v_texCoord);
  if (u_hasSky < 0.5) { fragColor = src; return; }
  // the map widened by about two pixels, so none of the old sky's light shows along a ridge or a head
  vec2 px = 2.0 / max(u_resolution, vec2(1.0));
  vec2 dx = vec2(px.x, 0.0), dy = vec2(0.0, px.y);
  float m = skyAt(v_texCoord, u_input);
  m = max(m, max(max(skyAt(v_texCoord + dx, u_input), skyAt(v_texCoord - dx, u_input)),
                 max(skyAt(v_texCoord + dy, u_input), skyAt(v_texCoord - dy, u_input))));
  float y = v_texCoord.y;
  bool sunset = u_style < 0.5;
  // the sky's colour from the horizon (y about 0.35) up to the top
  float h = smoothstep(0.3, 1.0, y);
  vec3 sky = sunset
    ? mix(mix(vec3(1.0, 0.78, 0.45), vec3(0.98, 0.5, 0.3), smoothstep(0.0, 0.45, h)), vec3(0.24, 0.22, 0.48), smoothstep(0.4, 1.0, h))
    : mix(vec3(0.68, 0.84, 0.98), vec3(0.16, 0.42, 0.85), h);
  // clouds stretched wide, drifting sideways
  vec2 p = vec2(v_texCoord.x * (u_resolution.x / max(u_resolution.y, 1.0)) * 2.2 + u_time * u_drift * 0.05, y * 5.0);
  float cl = smoothstep(0.45, 0.8, fbm(p)) * clamp(u_clouds, 0.0, 1.0) * (0.4 + 0.6 * h);
  vec3 cloud = sunset ? mix(vec3(1.0, 0.62, 0.5), vec3(0.55, 0.42, 0.6), h) : vec3(0.97);
  sky = mix(sky, cloud, cl);
  // the land takes a little of the new light
  vec3 tint = sunset ? vec3(1.08, 0.97, 0.86) : vec3(0.98, 1.0, 1.04);
  vec3 land = src.rgb * mix(vec3(1.0), tint, clamp(u_match, 0.0, 1.0));
  fragColor = vec4(mix(land, sky, m), src.a);
}
