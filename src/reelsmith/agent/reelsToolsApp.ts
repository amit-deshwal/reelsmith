// In-app wiring for the Reelsmith agent tools: real analysis routes.
import type { AgentContext } from '../../agent/context';
import { analyzeApi } from '../analyzeApi';
import { loadSemanticFrames, loadShotTags } from '../shotTagApi';
import { execReelsTool } from './reelsTools';

export function execReelsAppTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  return execReelsTool(name, args, ctx, {
    api: analyzeApi,
    shotTags: (id) => (assets, progress) => loadShotTags(id, assets, progress),
    semantic: loadSemanticFrames,
  });
}
