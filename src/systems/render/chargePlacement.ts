/**
 * Where a charge stands and where its blasts scorched (#109 "Visibility"): a planted charge's tile
 * centre in metres, turned so its up is the planet's radial up, and the last few blast centres on
 * the planet for the scorch shader. The charge's own look (rack, planted prop, lamp) is the
 * `dynamite-visuals` slice's since #215. Presentation only: nothing here reaches the authority.
 */
import { SCORCH_SLOTS } from '../../constants/scene'
import { MM_PER_METRE } from '../../constants/physics'
import type { DomainEvent } from '../authority/domainEvent'
import type { TilePoint } from '../world/tileGrid'
import type { MetrePoint } from './gunLook'

const HALF_TILE_MM = MM_PER_METRE / 2

/** Where a planted charge stands: its tile's centre in metres, turned so its up is radial. */
export interface ChargePlacement extends MetrePoint {
  turn: number
}

export function chargePlacementOf(charge: TilePoint): ChargePlacement {
  return writeChargePlacement(charge, { x: 0, y: 0, turn: 0 })
}

/** `chargePlacementOf` into `out`, so the scene's frame allocates nothing; returns `out`. */
export function writeChargePlacement(charge: TilePoint, out: ChargePlacement): ChargePlacement {
  out.x = (charge.tx * MM_PER_METRE + HALF_TILE_MM) / MM_PER_METRE
  out.y = (charge.ty * MM_PER_METRE + HALF_TILE_MM) / MM_PER_METRE
  out.turn = Math.atan2(out.y, out.x) - Math.PI / 2
  return out
}

/**
 * The blast centres to scorch after a batch of events, latest last: each `ChargeDetonated` adds
 * its tile, the oldest go past `SCORCH_SLOTS`, and arriving on a planet clears them.
 */
export function scorchesAfter(
  scorches: readonly ChargePlacement[],
  events: readonly DomainEvent[],
): ChargePlacement[] {
  return events.reduce<ChargePlacement[]>(
    (kept, event) => scorchesAfterEvent(kept, event),
    [...scorches],
  )
}

function scorchesAfterEvent(scorches: ChargePlacement[], event: DomainEvent): ChargePlacement[] {
  if (event.type === 'PlanetEntered') return []
  if (event.type !== 'ChargeDetonated') return scorches
  return [...scorches, chargePlacementOf(event)].slice(-SCORCH_SLOTS)
}
