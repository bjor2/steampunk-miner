/**
 * What the player sees of the placed containers (ticket 823; the TD's final ruling on #823,
 * points 7 and 8): one row per container the session shows, the session planet's first, then the
 * other planets by their stable id, each in id order. A departed owner's containers stay hidden
 * until they come back. The map markers draw this planet's rows at their cells; the list draws
 * every row, so it grows with the containers and never caps.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cargoUnitsOf } from '../../../systems/vehicle/vehicleState'
import { pickupRejectionOf } from './containerRules'
import { placedContainersIn, sessionPlanetKeyOf } from './containerSection'
import { shownContainersOn, type PlacedContainer } from './placedContainers'
import { PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'

export interface ContainerRow {
  /** `s:p#containerId`: unique across planets. */
  key: string
  planetKey: string
  containerId: number
  kind: string
  /** The kit item's name for its kind (`Cache Crate`). */
  name: string
  ownerId: string
  isOwn: boolean
  cell: TilePoint
  units: number
  /** On the session's planet: drawn as a marker, and the only ones a pickup reaches. */
  isHere: boolean
  /** Whether `pickup_container` would move cargo now. */
  canTake: boolean
}

export function containerRowsOf(state: AuthorityState, playerId: string): ContainerRow[] {
  const here = sessionPlanetKeyOf(state)
  return planetKeysHereFirst(state, here).flatMap((planetKey) =>
    shownContainersOn(placedContainersIn(state), planetKey, Object.keys(state.players)).map(
      (container) => rowOf(state, playerId, planetKey, container),
    ),
  )
}

/** The rows of the session's planet: the map markers. */
export function containerMarkersOf(state: AuthorityState, playerId: string): ContainerRow[] {
  return containerRowsOf(state, playerId).filter((row) => row.isHere)
}

function rowOf(
  state: AuthorityState,
  playerId: string,
  planetKey: string,
  container: PlacedContainer,
): ContainerRow {
  const isHere = planetKey === sessionPlanetKeyOf(state)
  return {
    key: `${planetKey}#${container.containerId}`,
    planetKey,
    containerId: container.containerId,
    kind: container.kind,
    name: kitItemOf(PLANET_KITS, container.kind)?.name ?? container.kind,
    ownerId: container.ownerId,
    isOwn: container.ownerId === playerId,
    cell: container.cell,
    units: cargoUnitsOf(container.cargo),
    isHere,
    canTake: isHere && pickupRejectionOf(state, playerId, container.containerId) === null,
  }
}

function planetKeysHereFirst(state: AuthorityState, here: string): string[] {
  const others = Object.keys(placedContainersIn(state))
    .filter((key) => key !== here)
    .sort(byPlanetKey)
  return [here, ...others]
}

/** `s:p` keys in (s, p) order: index text has no leading zeros, so a longer part is larger. */
function byPlanetKey(a: string, b: string): number {
  const [as, ap] = a.split(':')
  const [bs, bp] = b.split(':')
  return byIndexText(as, bs) || byIndexText(ap, bp)
}

function byIndexText(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}
