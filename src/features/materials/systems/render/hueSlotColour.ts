/**
 * The display colour a hue slot paints its species in the ground (ticket 450): the slot's hue at
 * its saturation, set to exactly its Rec. 601 luma, which the table's guard holds above the
 * brightest host rock (#151), so the species reads as ore on every planet and band.
 */
import { withLuma, type Rgb } from '../../../../systems/render/colour'
import { rgbOfHsl } from '../../../ore-visuals'
import type { HueSlot } from '../materialTable'

const MID_LIGHTNESS = 0.5

export function hueSlotColourOf(slot: HueSlot): Rgb {
  return withLuma(rgbOfHsl(slot.hue, slot.saturation, MID_LIGHTNESS), slot.luma)
}
