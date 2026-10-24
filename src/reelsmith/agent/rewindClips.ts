// RS-1223: the director's rewind move lays its backwards part out as an ordinary clip marked `rsRewind`; before the build
// is committed, each one is swapped for a reversed copy of exactly the span it covers, made by the local server.
import type { AtomicAction } from '../../editor/reducerActions';
import type { TimelineItem } from '../../editor/types';
import { reversedItem, reverseSpanOf } from '../clipOps';
import type { AnalyzeApi } from '../runRecipe';

type Add = Extract<AtomicAction, { type: 'add' }>;

/** Swap every rewind clip in `actions` (in place) for its reversed copy; one message per clip that stays forwards. */
export async function rewindClips(actions: AtomicAction[], api: Pick<AnalyzeApi, 'reverseClip'>, fps: number, onProgress?: (msg: string) => void): Promise<string[]> {
  const marked = actions.filter((a): a is Add => a.type === 'add' && a.item.kind === 'video' && !!a.item.src && (a.item.props as { rsRewind?: unknown } | undefined)?.rsRewind === true);
  if (!marked.length) return [];
  const messages: string[] = [];
  for (const a of marked) {
    const item = a.item as TimelineItem;
    onProgress?.(`Rewinding ${item.name}`);
    const span = reverseSpanOf(item, fps);
    const rev = api.reverseClip ? await api.reverseClip(item.src!, span.startSec, span.frames, fps).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) : { error: 'reversing is not available' };
    if ('error' in rev) { messages.push(`the rewind of ${item.name} plays forwards: ${rev.error}`); continue; }
    a.item = reversedItem(item, rev) as Add['item'];
  }
  return messages;
}
