// RS-901: the output shapes a recipe may support. Sizes are fixed so a ratio always means the same canvas.
export const RATIO_IDS = ['9:16', '3:4', '4:5', '1:1', '16:9', '4:3'] as const;
export type RatioId = typeof RATIO_IDS[number];

export const RATIO_SIZES: Record<RatioId, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '3:4': { width: 1080, height: 1440 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
};

export const isRatioId = (value: unknown): value is RatioId => RATIO_IDS.includes(value as RatioId);

/** The ratio id of a canvas, or undefined when it is not one of the supported sizes. */
export function ratioOf(width: number, height: number): RatioId | undefined {
  return RATIO_IDS.find((id) => RATIO_SIZES[id].width === width && RATIO_SIZES[id].height === height);
}
