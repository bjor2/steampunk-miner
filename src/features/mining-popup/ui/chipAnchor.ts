/**
 * A chip's world point, read by the overlay's projector every frame (#208): the vehicle's drawn
 * centre plus the chip's offset in the vehicle's local frame, so the chip rides with the hull and
 * turns with local up (#172 §1, anchored to the vehicle). Getters over the scene's presence
 * registries and one scratch point, so a frame allocates nothing.
 */
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import type { Vec2 } from '../../../ui/projection/worldToScreen'
import {
  chipOffsetOf,
  placeInLocalFrame,
  type LocalDirection,
} from '../systems/render/chipPlacement'

export function chipAnchorOf(away: LocalDirection, slot: number): Vec2 {
  const offset = chipOffsetOf(away, slot)
  const point = { x: 0, y: 0 }
  const placed = () => {
    placeInLocalFrame(vehiclePresence, drillPresence.up, offset, point)
    return point
  }
  return {
    get x() {
      return placed().x
    },
    get y() {
      return placed().y
    },
  }
}
