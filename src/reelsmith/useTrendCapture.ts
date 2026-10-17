import { useEffect } from 'react';
import { captureTrendReply, type ChatLine } from '../../shared/reelsmith/trendCapture';
import { showAppToast } from '../ui/appToast';

/** RS-1005: saves the agent's research reply as trend notes once the turn finishes (no pasting). */
export function useTrendCapture(messages: readonly ChatLine[], running: boolean): void {
  useEffect(() => {
    let result: ReturnType<typeof captureTrendReply> = null;
    try { result = captureTrendReply(window.localStorage, messages, running); } catch { return; }
    if (!result) return;
    if (result.notes) showAppToast(`Saved ${result.notes.briefs.length} trend idea${result.notes.briefs.length === 1 ? '' : 's'} to Ideas${result.warnings.length ? ` (${result.warnings.length} source warning${result.warnings.length === 1 ? '' : 's'})` : ''}`);
    else showAppToast(`Could not read the research reply as briefs: ${result.errors[0] ?? 'unknown problem'}. You can paste it in Ideas instead.`, { error: true });
  }, [messages, running]);
}
