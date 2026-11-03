#version 300 es
precision highp float;
// Reelsmith effect envelope: blends an effect's output (u_input) over the picture it started from (u_before) by
// u_amount, everywhere (region 0), only on the person (1), only behind them (2), only on the land (3) or only on the sky (4).
// Without a matte the person regions blend everywhere; without a sky map the land is everywhere and the sky is nowhere.
uniform sampler2D u_input;
uniform sampler2D u_before;
uniform sampler2D u_mask;
uniform sampler2D u_sky;
uniform float u_amount;
uniform float u_region;
uniform float u_hasMask;
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
void main() {
  vec4 fx = texture(u_input, v_texCoord);
  vec4 src = texture(u_before, v_texCoord);
  float w = 1.0;
  if (u_region > 2.5) {
    float s = u_hasSky > 0.5 ? skyAt(v_texCoord, u_before) : 0.0;
    w = u_region > 3.5 ? s : 1.0 - s;
  } else if (u_region > 0.5) {
    float m = u_hasMask > 0.5 ? smoothstep(0.35, 0.65, texture(u_mask, v_texCoord).r) : 1.0;
    w = u_region > 1.5 ? (u_hasMask > 0.5 ? 1.0 - m : 1.0) : m;
  }
  fragColor = mix(src, fx, clamp(u_amount, 0.0, 1.0) * w);
}
