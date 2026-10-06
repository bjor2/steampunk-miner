/**
 * The blasting charges in the scene (#109 "Visibility", art #110, `docs/art-pipeline.md`
 * "Blasting charges"): the rack on the vehicle once it is bolted on, drawn in the vehicle's frame
 * with `charge-<n>` shown while at least `n` charges are carried, so the rack shows exactly the
 * count on board; a planted charge on its wall tile, stood on the planet's radial up, with its
 * `fuse-lamp` blinking; and a scorch where each blast went off, kept for the last few blasts on
 * the planet. Presentation only: nothing here reaches the authority.
 */
import {
  FUSE_BLINK_LAST_SECOND_SECONDS,
  FUSE_BLINK_SECONDS,
  SCORCH_SLOTS,
} from '../../constants/scene'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { ArtCatalogue } from '../art/artCatalogue'
import { CHARGE_RACK_ASSET_ID, FUSE_LAMP_PART_ID, PLANTED_CHARGE_ASSET_ID } from '../art/artIds'
import { assetQuadsOf, atlasMapsOf, type AssetQuad, type AtlasMaps } from '../art/assetLook'
import type { DomainEvent } from '../authority/domainEvent'
import type { TilePoint } from '../world/tileGrid'
import type { MetrePoint } from './gunLook'

/** The asset's one look: every part is authored at tier 1. */
const ONLY_LOOK = 1
const RACK_FRAME_PART = 'charge-rack'
const CHARGE_PART = /^charge-([1-9][0-9]*)$/
const LAST_SECOND_TICKS = TICKS_PER_SECOND
const HALF_TILE_MM = MM_PER_METRE / 2

/** Where a planted charge stands: its tile's centre in metres, turned so its up is radial. */
export interface ChargePlacement extends MetrePoint {
  turn: number
}

/** The rack and the charges on it; nothing while no rack is bolted on (`rackCharges` null). */
export function chargeRackQuadsOf(art: ArtCatalogue, rackCharges: number | null): AssetQuad[] {
  if (rackCharges === null) return []
  return assetQuadsOf(art, CHARGE_RACK_ASSET_ID, ONLY_LOOK).filter((quad) =>
    isRackPartShown(quad.partId, rackCharges),
  )
}

export function chargeRackMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, CHARGE_RACK_ASSET_ID)
}

/** The planted charge's body, without its lamp. */
export function plantedChargeBodyQuadsOf(art: ArtCatalogue): AssetQuad[] {
  return plantedChargeQuadsOf(art).filter((quad) => quad.partId !== FUSE_LAMP_PART_ID)
}

/** The lamp alone, which blinks by being shown and hidden. */
export function fuseLampQuadsOf(art: ArtCatalogue): AssetQuad[] {
  return plantedChargeQuadsOf(art).filter((quad) => quad.partId === FUSE_LAMP_PART_ID)
}

export function plantedChargeMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, PLANTED_CHARGE_ASSET_ID)
}

/** Whether the lamp is lit `seconds` into its blinking with `ticksLeft` on the fuse. */
export function isFuseLampLit(seconds: number, ticksLeft: number): boolean {
  const period =
    ticksLeft <= LAST_SECOND_TICKS ? FUSE_BLINK_LAST_SECOND_SECONDS : FUSE_BLINK_SECONDS
  return Math.floor(seconds / period) % 2 === 0
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

function plantedChargeQuadsOf(art: ArtCatalogue): AssetQuad[] {
  return assetQuadsOf(art, PLANTED_CHARGE_ASSET_ID, ONLY_LOOK)
}

function isRackPartShown(partId: string, rackCharges: number): boolean {
  if (partId === RACK_FRAME_PART) return true
  const slot = CHARGE_PART.exec(partId)
  return slot !== null && Number.parseInt(slot[1], 10) <= rackCharges
}
