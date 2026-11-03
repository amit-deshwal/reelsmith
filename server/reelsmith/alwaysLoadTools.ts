// RS-1258: the editor tools a director run (and the chat edits after it) calls every time, sent to the agent's claude CLI
// with `_meta["anthropic/alwaysLoad"]` so they are in its prompt from the first turn. The editor offers 144 tools (~55k
// tokens), so the CLI defers all of them behind its own ToolSearch: measured over the director runs of 2026-10-20..11-02,
// every run spent 1-7 model round trips (2-10 s each) on ToolSearch before and between stages, and every follow-up turn
// started with one. The set is ~29k characters of schema (~7k tokens) of the catalogue's 210k, read from the prompt cache after
// the first turn. Verified against claude 2.1.317: a marked tool is called with no ToolSearch turn before it.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const ALWAYS_LOAD_TOOL_NAMES: ReadonlySet<string> = new Set([
  // session setup and finish, every turn
  'target_project', 'load_skill', 'begin_edit_session', 'review_edit_session', 'discard_edit_session',
  // the director's stages
  'reels_director_options', 'reels_find_shots', 'reels_director_treatment', 'reels_director_build', 'reels_director_critique', 'reels_director_fix',
  // what the chat edits after a directed reel reach for first
  'read_project', 'edit_item', 'view_timeline_frames',
]);

/** Claude Code reads this key on a tool's `_meta`: true keeps the tool out of ToolSearch (claude 2.1.3xx). */
export const ALWAYS_LOAD_META_KEY = 'anthropic/alwaysLoad';

export function withAlwaysLoad<T extends Pick<Tool, 'name' | '_meta'>>(tool: T): T {
  if (!ALWAYS_LOAD_TOOL_NAMES.has(tool.name)) return tool;
  return { ...tool, _meta: { ...(tool._meta ?? {}), [ALWAYS_LOAD_META_KEY]: true } };
}
