/**
 * The vehicle and world parts of the session snapshot (#11 section 5): the same plain JSON as the
 * state, with each BigStat (hull, drill work) as its canonical string. Reading checks the shape
 * so a malformed snapshot is refused with listed problems before anything is built from it; the
 * digest check in `sessionSnapshot.ts` then catches any value that does not match.
 */
import { fromCanonical, isNonNegativeMoneyText, toCanonical } from '../money'
import { isFacing, type VehiclePose } from '../vehicle/vehiclePose'
import { upgradeLevelsProblems } from '../vehicle/vehicleStats'
import type { Cargo, VehicleMode, VehicleState } from '../vehicle/vehicleState'
import type { ChunkDelta } from '../world/chunkDelta'
import type { WorldState } from '../world/worldState'
import { isJsonObject, isWholeNumber } from './payloadFields'

export type PortableVehicle = Omit<VehicleState, 'hull'> & { hull: string }

export interface PortableWorld {
  chunks: Record<string, ChunkDelta>
  tileWork: Record<string, string>
}

const VEHICLE_MODES: readonly VehicleMode[] = ['docked', 'active', 'stranded', 'destroyed']
const POSE_FIELDS = ['x', 'y', 'vx', 'vy', 'upx', 'upy'] as const

export function portableVehicleOf(vehicle: VehicleState): PortableVehicle {
  return { ...vehicle, hull: toCanonical(vehicle.hull) }
}

export function vehicleOfPortable(vehicle: PortableVehicle): VehicleState {
  return { ...vehicle, hull: fromCanonical(vehicle.hull) }
}

export function portableWorldOf(world: WorldState): PortableWorld {
  return {
    chunks: { ...world.chunks },
    tileWork: Object.fromEntries(
      Object.entries(world.tileWork).map(([key, work]) => [key, toCanonical(work)]),
    ),
  }
}

export function worldOfPortable(world: PortableWorld): WorldState {
  return {
    chunks: world.chunks,
    tileWork: Object.fromEntries(
      Object.entries(world.tileWork).map(([key, work]) => [key, fromCanonical(work)]),
    ),
  }
}

export function portableVehicleProblems(vehicle: unknown, path: string): string[] {
  if (!isJsonObject(vehicle)) return [`${path} must be an object`]
  return [
    ...(VEHICLE_MODES.includes(vehicle.mode as VehicleMode) ? [] : [`${path}.mode is not a mode`]),
    ...wholeNumberProblems(vehicle, ['modeSinceTick', 'energy', 'accountedTick'], path),
    ...upgradeLevelsProblems(vehicle.levels).map((problem) => `${path}.levels: ${problem}`),
    ...(isNonNegativeMoneyText(vehicle.hull) ? [] : [`${path}.hull must be a decimal string`]),
    ...(isPortableCargo(vehicle.cargo) ? [] : [`${path}.cargo must hold whole units`]),
    ...(vehicle.pose === null || isPortablePose(vehicle.pose) ? [] : [`${path}.pose is malformed`]),
    ...(isWholeNumberList(vehicle.energyLowLogged) ? [] : [`${path}.energyLowLogged is malformed`]),
  ]
}

export function portableWorldProblems(world: unknown): string[] {
  if (!isJsonObject(world)) return ['snapshot.state.world must be an object']
  const isValid =
    isJsonObject(world.chunks) &&
    Object.values(world.chunks).every(isPortableDelta) &&
    isJsonObject(world.tileWork) &&
    Object.values(world.tileWork).every(isNonNegativeMoneyText)
  return isValid ? [] : ['snapshot.state.world must hold chunk deltas and drill work strings']
}

function wholeNumberProblems(
  value: Record<string, unknown>,
  names: readonly string[],
  path: string,
): string[] {
  return names
    .filter((name) => !isWholeNumber(value[name]))
    .map((name) => `${path}.${name} must be a whole number`)
}

function isPortableCargo(cargo: unknown): cargo is Cargo {
  return (
    isJsonObject(cargo) &&
    isWholeNumber(cargo.coreFragments) &&
    isJsonObject(cargo.ore) &&
    Object.values(cargo.ore).every(isWholeNumber)
  )
}

function isPortablePose(pose: unknown): pose is VehiclePose {
  return (
    isJsonObject(pose) &&
    POSE_FIELDS.every((name) => Number.isSafeInteger(pose[name])) &&
    isFacing(pose.facing)
  )
}

function isPortableDelta(delta: unknown): delta is ChunkDelta {
  return (
    isJsonObject(delta) &&
    isWholeNumberList(delta.removedRows) &&
    Array.isArray(delta.overrides) &&
    delta.overrides.every(isWholeNumberList)
  )
}

function isWholeNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isWholeNumber)
}
