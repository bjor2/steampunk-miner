/**
 * The coal tender's tail on the kernel vehicle (ticket 758; the GD lock on #650 and the #576
 * ladder; the log tail of ticket 809): above the ladder's top step every tank purchase wears the
 * next finish of its cycle, painted as a glow in the finish's colour on the wagon's part slot
 * through the vehicle look fold (the rig-look slice draws its pips beside it), the way the
 * rig-look slice paints its tracks' tails. One kernel source, reading only the player's tank level
 * from the state (HS on #576: no stat, price or planet read), answering a kept look per
 * finish so a frame allocates nothing; null on and below the top step, so the base wagons look as
 * they are. Never a flash.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import type { VehicleLook, VehicleLookSource } from '../registries/vehicleLooks'
import { fuelTankLevelOf } from '../vehicle/vehicleFuel'
import { FUEL_TENDER_TABLE, fuelTenderLookOf, type FuelTenderTable } from './fuelTenderLook'

export const FUEL_TENDER_LOOK_SOURCE_ID = 'kernel.fuel-tender'

export function createFuelTenderLookSource(
  table: FuelTenderTable = FUEL_TENDER_TABLE,
): VehicleLookSource {
  const looks = keepTailLooksOf(table)
  return {
    id: FUEL_TENDER_LOOK_SOURCE_ID,
    lookOf: (state, playerId) => lookOfTint(looks, tintOf(table, state, playerId)),
    flashOf: () => null,
  }
}

export const FUEL_TENDER_LOOK_SOURCE: VehicleLookSource = createFuelTenderLookSource()

function lookOfTint(looks: Map<string, VehicleLook>, tint: string | null): VehicleLook | null {
  return tint === null ? null : (looks.get(tint) ?? null)
}

/** The tail tint the player's tank level wears, null for a player not in the state. */
function tintOf(table: FuelTenderTable, state: AuthorityState, playerId: string): string | null {
  if (state.players[playerId] === undefined) return null
  return fuelTenderLookOf(fuelTankLevelOf(vehicleOf(state, playerId)), table).tint
}

/** One look per finish colour, on the top step's wagon slot. */
function keepTailLooksOf(table: FuelTenderTable): Map<string, VehicleLook> {
  const topPart = table.steps[table.steps.length - 1].part
  return new Map(
    table.tail.finishes.map(({ colour }) => [
      colour,
      {
        tint: null,
        opacity: 1,
        outline: null,
        glows: [{ slots: [topPart], colour, glow: table.tail.glow }],
      },
    ]),
  )
}
