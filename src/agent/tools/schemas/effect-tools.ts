import type { AgentToolSchema } from '../../tool-schema';

export const EFFECT_TOOL_SCHEMAS: AgentToolSchema[] = [
  {
    name: 'manage_effects',
    description:
      'Shorthand for per-clip WebGL effects. Prefer browse_library followed by edit_item adds:[{type:"effect",targetItemId,assetId}]. action=list returns catalog; add/update/remove mutate the clip effect stack. Also covers LUT assetIds. For zoom/transitions use edit_item.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'remove'], description: 'What to do.' },
        targetItemId: { type: 'string', description: 'Clip id to affect (prefix ok). Required for add/update/remove. Must be a video or image clip.' },
        effectId: { type: 'string', description: 'update/remove: target effect instance id. Omit to target the first effect.' },
        assetId: { type: 'string', description: 'add: which effect, e.g. "builtin:fx-luma-key". Get ids from action="list" or browse_library.' },
        propertyOverrides: { type: 'object', description: 'add/update: sparse patch. Numeric properties use numbers; colors use RGB arrays in 0..1, e.g. {"color":[1,0,0]}. Omit for defaults.' },
        mix: { type: 'object', description: 'add/update: how strongly the effect shows over time and where, in seconds from the clip start: {amount 0-1, region "all"|"subject"|"background" (person matte)|"land"|"sky" (sky map), span [from,to], fadeIn, fadeOut, ramp "up"|"down", hits [seconds where it punches to full, e.g. the beats], decay (seconds a punch falls back), floor 0-1 (strength between punches)}. {} clears it (full strength everywhere).' },
      },
      required: ['action'],
    },
  },
];

export const EFFECT_TOOL_NAMES = new Set(EFFECT_TOOL_SCHEMAS.map((t) => t.name));
