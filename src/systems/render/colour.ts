/**
 * Display colours for the flat-vector look (#13): sRGB channels in 0..1, as the renderer writes
 * them. Luma is Rec. 601, the weighting a greyscale conversion uses, because #13's readability bar
 * is judged on greyscale screenshots.
 */

export type Rgb = readonly [r: number, g: number, b: number]

const HEX_COLOUR = /^#[0-9a-f]{6}$/i
const CHANNEL_MAX = 255

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOUR.test(value)
}

/** `#rrggbb` to channels in 0..1. */
export function rgbOfHex(hex: string): Rgb {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX
  return [channel(1), channel(3), channel(5)]
}

export function lumaOf([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** `share` 0 gives `from`, 1 gives `to`. */
export function mixRgb(from: Rgb, to: Rgb, share: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
    from[2] + (to[2] - from[2]) * share,
  ]
}

export function scaleRgb([r, g, b]: Rgb, factor: number): Rgb {
  return [clampUnit(r * factor), clampUnit(g * factor), clampUnit(b * factor)]
}

/**
 * The same hue at exactly the target luma: mixed toward white to brighten, scaled toward black
 * to darken. Both are linear in luma, so the result hits the target with no search.
 */
export function withLuma(colour: Rgb, targetLuma: number): Rgb {
  const luma = lumaOf(colour)
  if (luma >= targetLuma) return scaleRgb(colour, luma === 0 ? 0 : targetLuma / luma)
  return mixRgb(colour, [1, 1, 1], (targetLuma - luma) / (1 - luma))
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
