// RS-703: what Reelsmith sends to the agent, and the per-project switch "Allow frames to be sent to my agent".
// Stored per project in this browser/app profile. When off, frame tools are refused before they render and any
// image a tool result would carry (__images) is stripped before it can reach the model.
const NOTICE_KEY = 'reelsmith:agent-privacy-notice-seen';
const framesKey = (projectId: string) => `reelsmith:frames:${projectId}`;

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const subscribePrivacy = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function framesAllowed(projectId: string | undefined): boolean {
  if (!projectId) return true;
  return storage()?.getItem(framesKey(projectId)) !== '0';
}
export function setFramesAllowed(projectId: string, allowed: boolean): void {
  storage()?.setItem(framesKey(projectId), allowed ? '1' : '0');
  emit();
}
export function privacyNoticeSeen(): boolean {
  return storage()?.getItem(NOTICE_KEY) === '1';
}
export function markPrivacyNoticeSeen(): void {
  storage()?.setItem(NOTICE_KEY, '1');
  emit();
}

/** Tools whose whole purpose is to send pictures to the model. */
export const FRAME_TOOLS = new Set(['view_timeline_frames', 'view_asset_frames', 'reels_selection_sheet']);

export const FRAMES_OFF_MESSAGE = 'Frame sharing is off for this project (Reelsmith privacy switch "Allow frames to be sent to my agent"). '
  + 'Work from names, durations, scores and transcripts instead, or ask the user to turn frame sharing on.';

/** Refuse a frame tool up front (null = allowed). */
export function frameToolGate(name: string, projectId: string | undefined): { error: string } | null {
  return FRAME_TOOLS.has(name) && !framesAllowed(projectId) ? { error: FRAMES_OFF_MESSAGE } : null;
}

/** Remove images from any tool result when frames are off. */
export function stripFramesIfOff(result: unknown, projectId: string | undefined): unknown {
  if (framesAllowed(projectId) || !result || typeof result !== 'object' || !('__images' in result)) return result;
  const { __images: _dropped, ...rest } = result as Record<string, unknown>;
  return { ...rest, framesWithheld: FRAMES_OFF_MESSAGE };
}

export const PRIVACY_NOTICE_LINES = [
  'Your messages to the agent.',
  'Facts about the timeline: clip names, durations, positions, text and caption content, effect settings.',
  'Transcript excerpts of your clips when the agent reads or edits speech.',
  'Small JPEG frames or contact sheets (cells about 320 px wide) when the agent looks at clips or the timeline. You can turn this off per project.',
];
export const PRIVACY_NOT_SENT = 'Your video and audio files are never uploaded; they stay on this computer. Sign-in tokens stay inside your own claude/codex CLI.';
