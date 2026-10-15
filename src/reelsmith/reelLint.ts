// Timeline lint for Reels (RS-303 wiring, RS-702 "lint before finishing").
import type { TimelineState } from '../editor/types';
import { resolveTrackId } from '../editor/types';
import { findMusicItem, readBeatGrid, timelineBeatFrames } from './beatSnap';
import { lintSafeZone } from './safeZone';

export interface LintIssue { level: 'error' | 'warning'; frame?: number; itemId?: string; message: string }

export function lintReel(state: TimelineState): { errors: number; warnings: number; issues: LintIssue[] } {
  const issues: LintIssue[] = [];
  const fps = state.fps;
  const canvas = { width: state.width, height: state.height };
  if (Math.abs(state.width / state.height - 9 / 16) > 0.01) {
    issues.push({ level: 'error', message: `canvas is ${state.width}x${state.height}, not 9:16 (1080x1920)` });
  }
  for (const z of lintSafeZone(state.items, canvas)) issues.push({ level: 'warning', frame: z.startFrame, itemId: z.itemId, message: z.message });

  const main = resolveTrackId(state, 'V1', 'video');
  const clips = state.items.filter((i) => i.track === main && i.kind !== 'audio').sort((a, b) => a.startFrame - b.startFrame);
  const end = Math.max(0, ...state.items.map((i) => i.startFrame + i.durationInFrames));
  let cursor = 0;
  for (const c of clips) {
    if (c.startFrame > cursor) issues.push({ level: 'error', frame: cursor, message: `gap on the main track from ${(cursor / fps).toFixed(2)} s to ${(c.startFrame / fps).toFixed(2)} s (black frames)` });
    cursor = Math.max(cursor, c.startFrame + c.durationInFrames);
    if (c.durationInFrames < Math.round(fps * 0.3)) issues.push({ level: 'warning', frame: c.startFrame, itemId: c.id, message: `"${c.name}" is only ${(c.durationInFrames / fps).toFixed(2)} s long` });
  }
  if (clips.length && cursor < end) issues.push({ level: 'warning', frame: cursor, message: `main track ends at ${(cursor / fps).toFixed(2)} s but the reel runs to ${(end / fps).toFixed(2)} s` });

  const music = findMusicItem(state);
  const grid = readBeatGrid(music);
  if (music && grid) {
    const beats = timelineBeatFrames(music, grid, fps, 1);
    const off = clips.slice(0, -1).map((c) => c.startFrame + c.durationInFrames)
      .filter((cut) => cut > music.startFrame && cut < music.startFrame + music.durationInFrames)
      .filter((cut) => !beats.some((b) => Math.abs(b - cut) <= 2));
    if (off.length) issues.push({ level: 'warning', message: `${off.length} cut(s) miss the beat by more than 2 frames (first at ${(off[0]! / fps).toFixed(2)} s); reels_snap_cuts_to_beats can fix them` });
  }
  if (end / fps > 90) issues.push({ level: 'warning', message: `reel is ${(end / fps).toFixed(1)} s; Instagram Reels are best under 90 s` });
  return { errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length, issues };
}
