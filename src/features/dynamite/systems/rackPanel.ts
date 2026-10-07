/**
 * The HUD rack panel (#153 section 1: "the HUD rack shows the selected size"; #149 scope): the size
 * the plant key plants, its radius and how many of it the rack holds, the key that steps the size,
 * and, while a charge is live and the plunger is open, whether the plant key now detonates it or
 * the interlock holds it. The kernel HUD keeps the rack's slots and the fuse warning (#109).
 * Text says it, never colour alone (#33 section 7). Nothing until the rack is bolted on (#90).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import { boundLabel, type Bindings } from '../../../systems/input/actionMap'
import { chargeSizeToPlantOf, nextChargeSizeOf } from '../../../systems/vehicle/chargeSelection'
import { carriedOf, type VehicleCharges } from '../../../systems/vehicle/vehicleCharges'
import { dynamiteSizeIconIdOf } from './dynamiteSizes'
import { isDetonatorOpen, isWithinInterlock, liveChargeOf } from './plunger'

export interface RackPanel {
  size: number
  iconId: string
  /** "Size 3 · 4.5 m": the size and its blast radius. */
  sizeText: string
  /** Charges of that size in the rack. */
  carried: number
  /** "Next size (V)" while the rack holds two sizes or more; else null. */
  nextSizeText: string | null
  /** While the plunger can fire the live charge: "Detonate (B)", or the interlock's hold. */
  plungerText: string | null
}

/** What the panel reads: the local player's replica, the chosen size and the key bindings. */
export interface RackPanelSource {
  state: AuthorityState
  playerId: string
  chosenSize: number
  bindings: Bindings
}

const MM_PER_TENTH_METRE = 100
const TENTHS_PER_METRE = 10

/** Null until the rack is bolted on. */
export function rackPanelOf(source: RackPanelSource): RackPanel | null {
  const { charges } = vehicleOf(source.state, source.playerId)
  if (!charges.isRackMounted) return null
  const size = chargeSizeToPlantOf(charges, source.chosenSize)
  return {
    size,
    iconId: dynamiteSizeIconIdOf(size),
    sizeText: `Size ${size} · ${metresTextOf(chargeRadiusMm(size))} m`,
    carried: carriedOf(charges, size),
    nextSizeText: nextSizeTextOf(charges, source),
    plungerText: plungerTextOf(source),
  }
}

function nextSizeTextOf(charges: VehicleCharges, source: RackPanelSource): string | null {
  if (nextChargeSizeOf(charges, source.chosenSize) === null) return null
  return `Next size (${boundLabel(source.bindings, 'next_charge_size')})`
}

function plungerTextOf({ state, playerId, bindings }: RackPanelSource): string | null {
  const charge = liveChargeOf(state, playerId)
  if (charge === null || !isDetonatorOpen(state)) return null
  if (isWithinInterlock(vehicleOf(state, playerId).pose, charge)) return 'Back off to detonate'
  return `Detonate (${boundLabel(bindings, 'plant_charge')})`
}

/** Whole millimetres as metres to a tenth, the tenth only when there is one: "2.5", "24". */
function metresTextOf(mm: number): string {
  const tenths = Math.floor(mm / MM_PER_TENTH_METRE)
  const metres = Math.floor(tenths / TENTHS_PER_METRE)
  const tenth = tenths % TENTHS_PER_METRE
  return tenth === 0 ? `${metres}` : `${metres}.${tenth}`
}
