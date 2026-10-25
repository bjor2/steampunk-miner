/**
 * A cased crater's rim glow (D8, ticket 868: "with Blast Casing on, the lined rim glows in the grade
 * tint as smoke clears"): the rim and trim decals' tint gain rises from the plate's own over the
 * blast's first ticks, holds its peak while the smoke clears, and settles back to the plate by
 * `RIM_GLOW_TICKS`. On the authority's clock, so a reload or a guest shows the same frame.
 */
import { RIM_GLOW_PEAK_GAIN, RIM_GLOW_RISE_TICKS, RIM_GLOW_TICKS } from './blastLookConstants'

/** The gain on a cased decal's tint `ticksSince` the blast: 1 before it and once settled. */
export function rimGlowGainOf(ticksSince: number): number {
  if (!isRimGlowing(ticksSince)) return 1
  const rise = Math.min(1, ticksSince / RIM_GLOW_RISE_TICKS)
  const settleTicks = RIM_GLOW_TICKS - RIM_GLOW_RISE_TICKS
  const settled = Math.max(0, (ticksSince - RIM_GLOW_RISE_TICKS) / settleTicks)
  return 1 + (RIM_GLOW_PEAK_GAIN - 1) * rise * (1 - settled)
}

export function isRimGlowing(ticksSince: number): boolean {
  return ticksSince >= 0 && ticksSince < RIM_GLOW_TICKS
}
