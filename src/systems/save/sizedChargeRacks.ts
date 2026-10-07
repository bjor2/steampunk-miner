/**
 * Snapshot 19 -> 20 (K8 #218), a save migration step's reshape: the charge rack's `carried` count
 * becomes `carriedBySize`, every one of them size 1 (the only size before the ladder), and a
 * planted charge gains `size: 1` and its planting tick, the shipped fuse before its
 * `detonateTick`. Nothing else in the state changes.
 */
import type { PortableState } from '../authority/sessionSnapshot'
import { fuseTicksOf } from '../economy/chargeSizes'
import type { PlantedCharge, VehicleCharges } from '../vehicle/vehicleCharges'

const SHIPPED_SIZE = 1

/** The rack as snapshots 15 to 19 wrote it (#109, #95). */
interface OneSizeCharges {
  isRackMounted: boolean
  slotLevel: number
  carried: number
  planted: { tx: number; ty: number; detonateTick: number } | null
}

export function withSizedChargeRacks(state: PortableState): PortableState {
  const players = Object.entries(state.players).map(([id, player]) => {
    const charges = sizedRackOf(player.vehicle.charges as unknown as OneSizeCharges)
    return [id, { ...player, vehicle: { ...player.vehicle, charges } }] as const
  })
  return { ...state, players: Object.fromEntries(players) }
}

function sizedRackOf({ isRackMounted, slotLevel, carried, planted }: OneSizeCharges) {
  const carriedBySize = carried > 0 ? { [String(SHIPPED_SIZE)]: carried } : {}
  const rack: VehicleCharges = { isRackMounted, slotLevel, carriedBySize, planted: null }
  return planted === null ? rack : { ...rack, planted: sizedPlantedOf(planted) }
}

function sizedPlantedOf(planted: NonNullable<OneSizeCharges['planted']>): PlantedCharge {
  const plantedTick = planted.detonateTick - (fuseTicksOf(SHIPPED_SIZE) as number)
  return { ...planted, size: SHIPPED_SIZE, plantedTick }
}
