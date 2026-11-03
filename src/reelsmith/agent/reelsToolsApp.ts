// In-app wiring for the Reelsmith agent tools: real analysis routes.
import type { AgentContext } from '../../agent/context';
import { analyzeApi } from '../analyzeApi';
import { loadSemanticFrames, loadShotTags } from '../shotTagApi';
import { warmDirectorAnalysis, type WarmInput } from '../director/warmup';
import { warmShotTagsFor } from './directorTools';
import { execReelsTool } from './reelsTools';

/** RS-1258: the Director tab starts stage 1's analysis while the user writes the story (stage 1 then picks it up). */
export function warmDirectorInApp(input: WarmInput): Promise<void> {
  return warmDirectorAnalysis(input, {
    clipFeatures: (asset, fps) => analyzeApi.clipFeatures(asset, fps),
    mediaFps: (srcs) => analyzeApi.mediaFps!(srcs),
    shotTags: (id, assets) => warmShotTagsFor(id, assets, (list) => loadShotTags(id, list)),
  });
}

export function execReelsAppTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  return execReelsTool(name, args, ctx, {
    api: analyzeApi,
    shotTags: (id) => (assets, progress) => loadShotTags(id, assets, progress),
    semantic: loadSemanticFrames,
  });
}
