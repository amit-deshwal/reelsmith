#version 300 es
precision highp float;
precision highp int;

// Lost signal (Reels). An old TV loses signal: bars, rolling lines, then the next shot. Retro, nostalgia, a 90s joke.
// Adapted from GL Transitions "old_tv_lost_signal" (MIT, gl-transitions contributors): wrapped in the two-input contract,
// tunable uniforms fixed at their defaults. Regenerate with server/reelsmith/import-gl-transitions.mts.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

float progress;
float ratio;
vec4 getFromColor(vec2 uv) { return texture(u_outgoing, uv); }
vec4 getToColor(vec2 uv) { return texture(u_incoming, uv); }

// ---- GL Transitions source ----
// Author: mernking (gitlab.com/Godswork)
// License: MIT
// Description: A crossfade with drifting tracking lines and tearing, like a TV losing its signal
// Tags: retro, glitch, scanlines

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {

    float p = progress;
    float strength = sin(p * 3.14159265);

    vec2 tv = uv;

    vec4 fromColor = getFromColor(tv);
    vec4 toColor   = getToColor(tv);

    vec4 color = mix(fromColor, toColor, p);

    // horizontal tracking lines (key effect)
    float lineY = floor(tv.y * 120.0);

    float noise = hash(vec2(lineY, p * 20.0));

    float line = step(0.92, noise);

    // make lines drift during transition
    float drift =
        sin(tv.y * 30.0 + p * 10.0)
        * 0.02
        * strength;

    vec4 shiftedFrom = getFromColor(tv + vec2(drift, 0.0));
    vec4 shiftedTo   = getToColor(tv + vec2(drift, 0.0));

    vec4 lineColor = mix(shiftedFrom, shiftedTo, p);

    // apply tearing only on selected scanlines
    color = mix(color, lineColor, line * strength);

    // mild scanline darkening (CRT feel)
    float scan =
        sin(tv.y * 900.0) * 0.03;

    color.rgb -= scan * strength;

    return color;
}

// ---- end ----

void main() {
  progress = u_progress;
  ratio = u_aspect;
  fragColor = vec4(transition(v_texCoord).rgb, 1.0);
}
