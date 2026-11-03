#version 300 es
precision highp float;

// Silhouette portal (Reels, RS-1262). The next shot shows through the outgoing shot's person, inside their outline, then the
// outline grows about the person until it fills the frame. u_mask is the outgoing frame's person matte (MediaPipe, set per
// frame by GlTransition); with nobody clear in the shot (u_hasPerson 0) it plays as a circle wipe from the middle.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform sampler2D u_mask;
uniform float u_progress;
uniform float u_aspect;
uniform float u_hasPerson;
uniform vec2 u_subjectCenter;  // 0..1, y up
uniform vec2 u_subjectSize;    // share of the frame

in vec2 v_texCoord;
out vec4 fragColor;

float maskAt(vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(u_mask, uv).r;
}

void main() {
  float p = u_progress;
  vec2 uv = v_texCoord;
  vec3 a = texture(u_outgoing, uv).rgb;
  vec3 b = texture(u_incoming, uv).rgb;
  vec2 c = u_subjectCenter;

  // The outline keeps its own size while the next shot fades in inside it, then scales about the person until their box
  // reaches past every corner; the gaps the outline leaves (between arms and body) close over the last fifth.
  float g = smoothstep(0.22, 0.95, p);
  g = g * g;
  vec2 far = max(c, 1.0 - c);
  float need = max(far.x / max(u_subjectSize.x * 0.5, 0.02), far.y / max(u_subjectSize.y * 0.5, 0.02));
  float s = exp(log(max(need * 1.5, 1.0)) * g);
  float person = maskAt(c + (uv - c) / s);
  float portal = max(person * smoothstep(0.0, 0.18, p), smoothstep(0.8, 1.0, p));

  // no person: a plain circle from the middle
  vec2 d = (uv - vec2(0.5)) * vec2(u_aspect, 1.0);
  float edge = p * (length(vec2(u_aspect, 1.0) * 0.5) + 0.03);
  float circle = 1.0 - smoothstep(edge - 0.02, edge, length(d));

  float shown = mix(circle, portal, step(0.5, u_hasPerson));
  // a thin glow on the outline while it grows
  float rim = person * (1.0 - person) * 4.0 * max(sin(3.14159265 * p), 0.0) * step(0.5, u_hasPerson) * (1.0 - smoothstep(0.75, 0.95, p));
  vec3 col = mix(a, b, shown) + vec3(0.55) * rim;
  fragColor = vec4(col, 1.0);
}
