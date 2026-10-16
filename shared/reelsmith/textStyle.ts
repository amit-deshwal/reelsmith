// Text clip outline and shadow props, read by TextLayer and edited by src/reelsmith/ui/TextStyleControls.tsx.
// An explicit `textShadow` string (recipes, older projects) always wins.
export const DEFAULT_SHADOW = { blur: 16, y: 3, color: 'rgba(0,0,0,0.55)' } as const;

export function textShadowCss(props: Record<string, unknown>): string {
  if (props.textShadow !== undefined) return String(props.textShadow);
  if (props.shadowEnabled === false) return 'none';
  const blur = Number(props.shadowBlur ?? DEFAULT_SHADOW.blur);
  const y = Number(props.shadowY ?? DEFAULT_SHADOW.y);
  const color = String(props.shadowColor ?? DEFAULT_SHADOW.color);
  return `0 ${y}px ${blur}px ${color}`;
}
