// RS-1213: graphics the director writes itself (reels_custom_graphic), kept for this session so a plan can name them as
// custom:gfx-<name>. Their code also travels inside every item that uses them, so a later session can pick them up again
// from the timeline (adoptCustomGraphics) instead of asking the agent to write them twice.
import type { MoveParam } from './moveKit';

export interface CustomGraphic { id: string; name: string; looks: string; code: string; params: MoveParam[] }

const registry = new Map<string, CustomGraphic>();

export const customGraphicId = (name: string) => `custom:gfx-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'graphic'}`;

export function registerCustomGraphic(g: CustomGraphic): void { registry.set(g.id, g); }
export const getCustomGraphic = (id: string) => registry.get(id);
export const listCustomGraphics = () => [...registry.values()];

/** Custom graphics found on the timeline (items carry their code and params) are registered again when missing. */
export function adoptCustomGraphics(items: ReadonlyArray<{ kind: string; name?: string; code?: string; props?: Record<string, unknown> }>): void {
  for (const it of items) {
    const id = it.props?.rsGraphic;
    if (it.kind !== 'motion-graphic' || typeof id !== 'string' || !id.startsWith('custom:gfx-') || registry.has(id) || !it.code) continue;
    const params = Array.isArray(it.props?.rsGraphicParams) ? it.props.rsGraphicParams as MoveParam[] : [];
    registry.set(id, { id, name: it.name ?? id, looks: '', code: it.code, params });
  }
}

/** Test seam. */
export function __clearCustomGraphics(): void { registry.clear(); }
