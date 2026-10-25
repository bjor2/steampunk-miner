/**
 * A `drain` contact (ticket 848; firedamp, ticket 651; the GD lock on #823 Q1 and the VS's input):
 * while the rig stands in a cut pocket of a drain kind, the gas chokes its boiler. Each command the
 * rig answers (a pose report, a scripted cut) settles the ticks since its last charged command at
 * the pose it stood at: `energyShareBp` of the owned energy track every `ticks`, scaled by the
 * contact's factor, never taking the tank below `floorBp` of the track, so the drain never
 * strands the rig. A settle that drains nothing says nothing; one that drains logs `hazard_drain`.
 * Off a drain pocket, or with the factor at 0, nothing changes.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { div, floor, fromSafeInteger, mul, toSafeInteger } from '../../money'
import {
  contactEffectOf,
  contactFactorBpOf,
  scaledByFactor,
  type ContactRowOf,
} from '../../registries/contactEffects'
import { tileOfPose } from '../../vehicle/vehiclePose'
import { energyMaxQuantaOf, isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { planetParamsOf } from '../planetOfState'
import { hazardKindAtTile } from './hazardCells'

interface StoodPocket {
  tile: TilePoint
  row: ContactRowOf<'drain'>
  factorBp: number
}

/** The drain of the ticks from `before`'s last charged command to `tick`, where it stood. */
export function drainInHazardPocket(
  state: AuthorityState,
  playerId: string,
  before: VehicleState,
  tick: number,
): RuleEffect {
  const pocket = drainPocketStoodIn(state, playerId, before)
  if (pocket === null) return unchanged(state)
  const ticks = Math.max(0, tick - before.accountedTick)
  const quanta = drainedQuantaOf(vehicleOf(state, playerId), pocket, ticks)
  if (quanta === 0) return unchanged(state)
  const vehicle = vehicleOf(state, playerId)
  const { kind } = pocket.row
  return {
    state: withVehicle(state, playerId, { ...vehicle, energy: vehicle.energy - quanta }),
    events: [{ type: 'HazardDrained', kind, ...pocket.tile, ticks, quanta }],
  }
}

/** The drain pocket the rig stood in, active, with a factor above 0; null for any other place. */
function drainPocketStoodIn(
  state: AuthorityState,
  playerId: string,
  before: VehicleState,
): StoodPocket | null {
  const params = planetParamsOf(state.planet)
  if (params === null || before.pose === null || !isVehicleActive(before)) return null
  const tile = tileOfPose(before.pose)
  const kind = hazardKindAtTile(state, params, tile)
  const row = kind === null ? null : contactEffectOf(kind)
  if (row === null || row.effect !== 'drain') return null
  const factorBp = contactFactorBpOf(state, playerId, row)
  return factorBp === 0 ? null : { tile, row, factorBp }
}

/** The quanta `ticks` drain, held so the tank keeps `floorBp` of the track. */
function drainedQuantaOf(vehicle: VehicleState, pocket: StoodPocket, ticks: number): number {
  const trackQuanta = energyMaxQuantaOf(vehicle)
  const shareBp = scaledByFactor(pocket.row.energyShareBp, pocket.factorBp)
  const asked = floorQuantaOf(trackQuanta, shareBp * ticks, BASIS_POINTS * pocket.row.ticks)
  const kept = floorQuantaOf(trackQuanta, pocket.row.floorBp, BASIS_POINTS)
  return Math.max(0, Math.min(asked, vehicle.energy - kept))
}

/** `floor(quanta * num / den)` in exact decimals, so a long stay never passes a safe integer. */
function floorQuantaOf(quanta: number, num: number, den: number): number {
  const share = div(mul(fromSafeInteger(quanta), fromSafeInteger(num)), fromSafeInteger(den))
  return toSafeInteger(floor(share))
}
