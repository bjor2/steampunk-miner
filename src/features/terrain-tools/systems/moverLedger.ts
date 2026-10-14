/**
 * The movers' trip ledger (ticket 408; Systems ruling 6167240683 on #385, GD ruling on #212 Q2
 * (a)): the ore an ore-shifter drags, a pocket lance pushes out or a lodestone beacon gathers
 * counts on the income trip every income item shares (extraction's `incomeTripOf`, #162 4.5), at
 * the sale price the drill will pay for it, so `tripCapAt` holds the movers as it holds the drain.
 * The cap is the band's at the use's tile (a gather's at its beacon), as the drain takes its use's.
 *
 * A plan moves a nodule only while its value fits the room left under the cap; a nodule that
 * would pass it stays where it is and is counted held back, so a use that moved nothing for that
 * reason is refused `trip_capped` at no cost. The drill's own cargo never passes through here:
 * whatever it cuts, Wide's flank cells too, is drill throughput (GD ruling on #385). The counter
 * resets at the dock before a beacon's gather there (reactions run in id order,
 * `extraction.trip-reset` first), so a gather counts on the trip it starts.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { minedOreOf } from '../../../systems/authority/minedOre'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import {
  add,
  cmp,
  fromCanonical,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { withSection } from '../../../systems/registries/saveSections'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { EXTRACTION_TRIP_SECTION, incomeTripOf, roomUnderCapOf, tripCapAt } from '../../extraction'
import type { GroundView } from './groundView'

/** What one plan may still bank this trip, and what it has banked and held back so far. */
export interface MoverLedger {
  cap: Money
  room: Money
  banked: Money
  heldBack: number
}

/** The ore value a plan moved onto the trip, and the cap it was held to. */
export interface BankedOre {
  value: Money
  cap: Money
}

/** The planning player's trip as it stands, under the cap of the band at `at`. */
export function openMoverLedger(view: GroundView, at: TilePoint): MoverLedger {
  const capacity = statsOfVehicle(vehicleOf(view.state, view.playerId)).cargoCapacity
  const cap = tripCapAt(view.params.planetIndex, bandOfTile(view.params, at.tx, at.ty), capacity)
  const used = fromCanonical(incomeTripOf(view.state, view.playerId).incomeItemValue)
  return { cap, room: roomUnderCapOf(used, cap), banked: ZERO_MONEY, heldBack: 0 }
}

/** What the drill pays for a unit of the ore cell `material`: its sale tier's price. */
export function oreValueOfCell(view: GroundView, at: TilePoint, material: number): Money {
  return oreSalePrice(minedOreOf(view.params, at, material).saleTier)
}

export function canBank(ledger: MoverLedger, value: Money): boolean {
  return cmp(add(ledger.banked, value), ledger.room) <= 0
}

export function bank(ledger: MoverLedger, value: Money): void {
  ledger.banked = add(ledger.banked, value)
}

export function holdBack(ledger: MoverLedger): void {
  ledger.heldBack += 1
}

export function isHeldByCap(ledger: MoverLedger): boolean {
  return ledger.heldBack > 0
}

/** The plan's banked ore; null when it moved none, so the trip is left as it was. */
export function bankedOreOf(ledger: MoverLedger): BankedOre | null {
  return cmp(ledger.banked, ZERO_MONEY) > 0 ? { value: ledger.banked, cap: ledger.cap } : null
}

/** The trip moved on by the banked ore, its cap the one this use was held to. */
export function withOreBanked(
  state: AuthorityState,
  playerId: string,
  banked: BankedOre,
): AuthorityState {
  const trip = incomeTripOf(state, playerId)
  const incomeItemValue = add(fromCanonical(trip.incomeItemValue), banked.value)
  return withSection(state, playerId, EXTRACTION_TRIP_SECTION, {
    ...trip,
    incomeItemValue: toCanonical(incomeItemValue),
    tripCap: toCanonical(banked.cap),
  })
}
