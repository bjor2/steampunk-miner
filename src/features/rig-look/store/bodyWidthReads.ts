/**
 * The local rig's drawn width and its held mounts' seats (ticket 666), for the debug read: the
 * width level the authority grants, the collider's half side the local presence carries, the
 * body's drawn width and each mount's seat on it, so a browser spec waits for the width to settle
 * and asserts no mount floats, never reading pixels.
 */
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { widthLevelOf } from '../../../systems/registries/boreWidth'
import { bodyWidthReadingOf, type BodyWidthReading } from '../systems/render/heldMountSeats'

export interface LocalBodyWidthReading extends BodyWidthReading {
  widthLevel: number
}

export function readLocalBodyWidth(): LocalBodyWidthReading {
  const widthLevel = widthLevelOf(readAuthorityState(), useGameStore.getState().playerId)
  const rig = { bodyHalfSide: vehiclePresence.bodyHalfSide }
  return { widthLevel, ...bodyWidthReadingOf(SHIPPED_ART, rig) }
}
