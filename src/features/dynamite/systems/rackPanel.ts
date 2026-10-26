/**
 * The HUD rack panel (#153 section 1: "the HUD rack shows the selected size"; #149 scope): the size
 * the plant key plants, its radius and how many of it the rack holds, the key that steps the size,
 * and, while a charge is live, whether the plant key now detonates it or the interlock holds it.
 * The kernel HUD keeps the rack's slots and the fuse warning (#109).
 * Text says it, never colour alone (#33 section 7). Nothing until the rack is bolted on (#90).
 * The radius is the ground the size clears at the planter's Blast Radius level, and a size whose
 * ground is narrower than the rig's bore is marked: soft information only, never a refusal (D1
 * #860).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import { promptLabelOf, type PromptSource } from '../../../systems/input/promptLabel'
import { chargeSizeToPlantOf, nextChargeSizeOf } from '../../../systems/vehicle/chargeSelection'
import { carriedOf, type VehicleCharges } from '../../../systems/vehicle/vehicleCharges'
import { groundReachMmOf, isSmallerThanCut } from './chargeRings'
import { dynamiteSizeIconIdOf } from './dynamiteSizes'
import { isWithinInterlock, liveChargeOf } from './plunger'

export interface RackPanel {
  size: number
  iconId: string
  /** "Size 3 · 4.5 m": the size and the radius of the ground it clears. */
  sizeText: string
  /** "Narrower than your bore" for a size whose ground disc the rig's cut already covers. */
  cutText: string | null
  /** Charges of that size in the rack. */
  carried: number
  /** "Next size (V)" while the rack holds two sizes or more; else null. */
  nextSizeText: string | null
  /** While the plunger can fire the live charge: "Detonate (B)", or the interlock's hold. */
  plungerText: string | null
}

/** What the panel reads: the local player's replica, the chosen size and the prompts' device. */
export interface RackPanelSource {
  state: AuthorityState
  playerId: string
  chosenSize: number
  prompts: PromptSource
}

const NARROWER_THAN_CUT = 'Narrower than your bore'
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
    sizeText: sizeTextOf(source, size),
    cutText: cutTextOf(source, size),
    carried: carriedOf(charges, size),
    nextSizeText: nextSizeTextOf(charges, source),
    plungerText: plungerTextOf(source),
  }
}

/** The size and the ground it clears at the planter's level, its own radius off a planet. */
function sizeTextOf({ state, playerId }: RackPanelSource, size: number): string {
  const radiusMm = groundReachMmOf(state, playerId, size) ?? chargeRadiusMm(size)
  return `Size ${size} · ${metresTextOf(radiusMm)} m`
}

function cutTextOf({ state, playerId }: RackPanelSource, size: number): string | null {
  return isSmallerThanCut(state, playerId, size) ? NARROWER_THAN_CUT : null
}

function nextSizeTextOf(charges: VehicleCharges, source: RackPanelSource): string | null {
  if (nextChargeSizeOf(charges, source.chosenSize) === null) return null
  return `Next size (${promptLabelOf('next_charge_size', source.prompts, source.prompts.inputDevice)})`
}

function plungerTextOf({ state, playerId, prompts }: RackPanelSource): string | null {
  const charge = liveChargeOf(state, playerId)
  if (charge === null) return null
  if (isWithinInterlock(vehicleOf(state, playerId).pose, charge)) return 'Back off to detonate'
  return `Detonate (${promptLabelOf('plant_charge', prompts, prompts.inputDevice)})`
}

/** Whole millimetres as metres to a tenth, the tenth only when there is one: "2.5", "24". */
function metresTextOf(mm: number): string {
  const tenths = Math.floor(mm / MM_PER_TENTH_METRE)
  const metres = Math.floor(tenths / TENTHS_PER_METRE)
  const tenth = tenths % TENTHS_PER_METRE
  return tenth === 0 ? `${metres}` : `${metres}.${tenth}`
}
