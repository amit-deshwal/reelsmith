// In-app wiring for the Reelsmith agent tools: real analysis routes, the shared project KV, bundled recipes.
import type { AgentContext } from '../../agent/context';
import { kvGet, kvSet } from '../../persist/sharedKv';
import { analyzeApi } from '../analyzeApi';
import { bundledCatalog } from '../bundledRecipes';
import { execReelsTool } from './reelsTools';

export function execReelsAppTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  return execReelsTool(name, args, ctx, {
    api: analyzeApi,
    kv: { get: kvGet, set: kvSet },
    recipes: bundledCatalog.recipes,
  });
}
