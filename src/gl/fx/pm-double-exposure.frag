#version 300 es
precision highp float;
// Double exposure: the person is a silhouette filled with a drifting, zoomed copy of the scene in two ink colours, with the face
// still reading through; the rest of the frame is pale paper. Soft inner shading gives the silhouette depth.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform vec2 u_subjectSize;
uniform float u_zoom;
uniform float u_drift;
uniform float u_show;      // how much of the real picture (the face) shows through
uniform float u_scenery;   // faint scene in the paper background
uniform vec3 u_inkA;
uniform vec3 u_inkB;
uniform vec3 u_paper;
in vec2 v_texCoord;
out vec4 fragColor;
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  vec3 src = texture(u_input, uv).rgb;
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  // the scene that fills the person: zoomed about the subject, drifting slowly
  // the whole picture squeezed into the person's box, so the silhouette holds the entire scene (zoom > 1 closes in on the middle)
  vec2 box = max(u_subjectSize, vec2(0.15));
  vec2 lo = u_subjectCenter - box * 0.5;
  vec2 drift = vec2(sin(u_time * 0.5), cos(u_time * 0.37)) * 0.04 * u_drift;
  vec2 suv = clamp(0.5 + ((uv - lo) / box - 0.5) / max(u_zoom, 0.2) + drift, 0.0, 1.0);
  vec3 scene = texture(u_input, suv).rgb;
  float sl = dot(scene, vec3(0.299, 0.587, 0.114));
  sl = clamp((sl - 0.45) * 2.4 + 0.5, 0.0, 1.0);          // push the contrast so the scene reads in two inks
  vec3 duo = mix(u_inkA, u_inkB, sl);
  // soft inner shading from a blurred matte
  float inner = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    inner += maskAt(uv + vec2(cos(a) / aspect, sin(a)) * 0.028);
  }
  inner /= 12.0;
  vec3 fill = mix(duo, duo * 0.55, smoothstep(1.0, 0.45, inner) * 0.7);
  fill = mix(fill, mix(duo, src, 0.8), u_show * smoothstep(0.1, 0.9, l * 0.6 + 0.5 * inner));
  vec3 paper = u_paper * (0.95 + 0.05 * uv.y);
  paper = mix(paper, mix(paper, duo, 0.45), u_scenery * 0.5 * (1.0 - sl * 0.4));
  vec3 bgScene = mix(paper, mix(u_inkA, u_inkB, l) , u_scenery * 0.25);
  fragColor = vec4(mix(bgScene, fill, m), 1.0);
}
