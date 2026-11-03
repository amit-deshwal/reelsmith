// RS-1262: what the silhouette portal is told about the outgoing frame's person. The portal needs one clear person; a speck
// of matte (a distant figure, a false hit on a tree) plays the circle wipe instead.
import type { SubjectInfo } from '../gl/personMaskMath';

/** Share of the frame a person must cover for the portal (about a full-length figure a third of the frame tall). */
export const PORTAL_MIN_AREA = 0.02;

export function portalUniforms(subject: SubjectInfo | null): Record<string, number | number[]> {
  const found = !!subject && subject.area >= PORTAL_MIN_AREA;
  if (!found) return { u_hasPerson: 0, u_subjectCenter: [0.5, 0.5], u_subjectSize: [0.4, 0.6] };
  return { u_hasPerson: 1, u_subjectCenter: [subject.cx, subject.cy], u_subjectSize: [subject.w, subject.h] };
}
