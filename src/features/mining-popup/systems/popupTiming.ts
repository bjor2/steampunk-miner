/**
 * The popup's clock (#172 decision, sections 1 and 2), in authority ticks: the chips and the
 * plaque age with the game, so a pause holds them and a test steps them exactly. Every number is
 * the spec's, in milliseconds, turned into whole ticks at 60 per second.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'

const MS_PER_SECOND = 1000

function ticksOfMs(ms: number): number {
  return (ms * TICKS_PER_SECOND) / MS_PER_SECOND
}

/** §1: pickups of one type this close together merge into its chip. */
export const CHIP_MERGE_TICKS = ticksOfMs(1200)
/** §1: a chip rises about 24 px over 1 s, then fades over 0.4 s. */
export const CHIP_RISE_TICKS = ticksOfMs(1000)
export const CHIP_FADE_TICKS = ticksOfMs(400)
/** §1: a merge extends a chip's life up to 3 s from its first pickup. */
export const CHIP_LIFE_CAP_TICKS = ticksOfMs(3000)
/** §1: at most 3 chips on screen; the oldest gives way. */
export const MOST_CHIPS_SHOWN = 3
/** §1: from the 4th chip of a type on a planet, only the icon and count show. */
export const NAMED_CHIPS_PER_PLANET = 3

/** §2 tier 0: 0.25 s in, 2.5 s hold, 0.6 s fade (about 3.3 s). */
export const PLAQUE_IN_TICKS = ticksOfMs(250)
export const PLAQUE_HOLD_TICKS = ticksOfMs(2500)
export const PLAQUE_FADE_TICKS = ticksOfMs(600)
/** §2 merging: moments that land together share one plaque, on screen at most 6 s. */
export const PLAQUE_LIFE_CAP_TICKS = ticksOfMs(6000)
