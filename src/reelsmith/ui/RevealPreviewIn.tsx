// Travel Diary reveals in the editor's playback preview. The editor draws transitions it does not select with a cheap
// CSS stand-in (a dissolve for custom shaders); for our reveals that hid the whole look. This draws the same bars and
// window by clipping the incoming clip, which is already playing, plus the white flash, so no extra video decoders run.
// Exports and the selected transition still use the real shader (REVEAL_FRAG).
import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { REVEAL_FRAG, revealRects } from '../travelDiaryReveal';

export function revealPreviewUniforms(t: { type: string; customFrag?: string; customUniforms?: Record<string, number> }): Record<string, number> | undefined {
  return t.type === 'custom-shader' && t.customFrag === REVEAL_FRAG && t.customUniforms ? t.customUniforms : undefined;
}

export function RevealPreviewIn({ uniforms, frames, width, height, children }: {
  uniforms: Record<string, number>; frames: number; width: number; height: number; children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const rects = revealRects(uniforms, Math.max(0, Math.min(1, frame / Math.max(1, frames))));
  // keep the same tree before, during and after the reveal: remounting the clip makes the player re-seek
  const clipPath = rects === null ? undefined
    : rects.length === 0 ? 'inset(0 0 100% 0)'
    : `path('${rects.map((r) => `M${r.x * width} ${r.y * height}H${(r.x + r.w) * width}V${(r.y + r.h) * height}H${r.x * width}Z`).join(' ')}')`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath }}>{children}</AbsoluteFill>
      {(rects ?? []).filter((r) => r.flash > 0.01).map((r, i) => (
        <div key={i} style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: '#fff', opacity: r.flash }} />
      ))}
    </AbsoluteFill>
  );
}
