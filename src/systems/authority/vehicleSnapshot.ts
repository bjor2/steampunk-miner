/**
 * The vehicle and world parts of the session snapshot (#11 section 5): the same plain JSON as the
 * state, with the hull BigStat, the lining bill and the visit's lining payment as canonical
 * strings. Reading checks the shape so a malformed snapshot is refused with listed problems before
 * anything is built from it; the digest check in `sessionSnapshot.ts` then catches any value that does not match.
 */
import { STANDARD_LINING_TYPE } from '../economy/heatEconomy'
import { fromCanonical, isNonNegativeMoneyText, toCanonical, type Money } from '../money'
import { isFacing, type VehiclePose } from '../vehicle/vehiclePose'
import { isGunMode } from '../vehicle/vehicleGun'
import { isLiningType } from '../vehicle/liningType'
import { upgradeLevelsProblems } from '../vehicle/vehicleStats'
import type { Cargo, VehicleMode, VehicleState } from '../vehicle/vehicleState'
import { isCasingValue, type ChunkDelta } from '../world/chunkDelta'
import { CHUNK_SAMPLES } from '../world/sampleGrid'
import { CHUNK_SIZE } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import { isJsonObject, isWholeNumber } from './payloadFields'

export type PortableVehicle = Omit<VehicleState, 'hull' | 'liningBill' | 'liningPaidThisVisit'> & {
  hull: string
  liningBill: string
  liningPaidThisVisit: string | null
}

export interface PortableWorld {
  chunks: Record<string, ChunkDelta>
}

const VEHICLE_MODES: readonly VehicleMode[] = ['docked', 'active', 'stranded', 'destroyed']
const POSE_FIELDS = ['x', 'y', 'vx', 'vy', 'upx', 'upy'] as const
const MAX_BYTE = 255

function isByte(value: number): boolean {
  return value <= MAX_BYTE
}

export function portableVehicleOf(vehicle: VehicleState): PortableVehicle {
  return {
    ...vehicle,
    hull: toCanonical(vehicle.hull),
    liningBill: toCanonical(vehicle.liningBill),
    liningPaidThisVisit: canonicalOrNull(vehicle.liningPaidThisVisit),
  }
}

export function vehicleOfPortable(vehicle: PortableVehicle): VehicleState {
  return {
    ...vehicle,
    hull: fromCanonical(vehicle.hull),
    liningBill: fromCanonical(vehicle.liningBill),
    liningPaidThisVisit:
      vehicle.liningPaidThisVisit === null ? null : fromCanonical(vehicle.liningPaidThisVisit),
  }
}

function canonicalOrNull(amount: Money | null): string | null {
  return amount === null ? null : toCanonical(amount)
}

/** The world is integers only since #36 (drill progress is density), so it travels as is. */
export function portableWorldOf(world: WorldState): PortableWorld {
  return { chunks: { ...world.chunks } }
}

export function worldOfPortable(world: PortableWorld): WorldState {
  return { chunks: world.chunks }
}

export function portableVehicleProblems(vehicle: unknown, path: string): string[] {
  if (!isJsonObject(vehicle)) return [`${path} must be an object`]
  return [
    ...(VEHICLE_MODES.includes(vehicle.mode as VehicleMode) ? [] : [`${path}.mode is not a mode`]),
    ...wholeNumberProblems(vehicle, ['modeSinceTick', 'energy', 'accountedTick'], path),
    ...upgradeLevelsProblems(vehicle.levels).map((problem) => `${path}.levels: ${problem}`),
    ...(isCasingGrade(vehicle.casingGrade)
      ? []
      : [`${path}.casingGrade must be a whole number >= 1`]),
    ...(vehicle.casingShortBand === null || isWholeNumber(vehicle.casingShortBand)
      ? []
      : [`${path}.casingShortBand must be null or a whole band`]),
    ...(isPortableCasingTrail(vehicle.casingTrail)
      ? []
      : [
          `${path}.casingTrail must hold safe-integer xMm and yMm points (and lengthMm on unlined ones)`,
        ]),
    ...(isPortableGun(vehicle.gun) ? [] : [`${path}.gun must hold a whole level and a gun mode`]),
    ...(isPortableCharges(vehicle.charges)
      ? []
      : [`${path}.charges must hold a rack flag, whole counts and a planted charge or null`]),
    ...(isPortableLining(vehicle.lining)
      ? []
      : [`${path}.lining must hold an owned active lining type and the owned types`]),
    ...(isNonNegativeMoneyText(vehicle.hull) ? [] : [`${path}.hull must be a decimal string`]),
    ...(isNonNegativeMoneyText(vehicle.liningBill)
      ? []
      : [`${path}.liningBill must be a decimal string`]),
    ...(vehicle.liningPaidThisVisit === null || isNonNegativeMoneyText(vehicle.liningPaidThisVisit)
      ? []
      : [`${path}.liningPaidThisVisit must be null or a decimal string`]),
    ...(isPortableCargo(vehicle.cargo) ? [] : [`${path}.cargo must hold whole units`]),
    ...(vehicle.pose === null || isPortablePose(vehicle.pose) ? [] : [`${path}.pose is malformed`]),
    ...(isWholeNumberList(vehicle.energyLowLogged) ? [] : [`${path}.energyLowLogged is malformed`]),
    ...(isPortableHeat(vehicle.heat)
      ? []
      : [`${path}.heat must hold a whole level, its settled tick and a lava touch tick or null`]),
  ]
}

export function portableWorldProblems(world: unknown): string[] {
  if (!isJsonObject(world)) return ['snapshot.state.world must be an object']
  const isValid = isJsonObject(world.chunks) && Object.values(world.chunks).every(isPortableDelta)
  return isValid ? [] : ['snapshot.state.world must hold chunk deltas']
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

function isCasingGrade(value: unknown): boolean {
  return isWholeNumber(value) && (value as number) >= 1
}

function isPortableCasingTrail(trail: unknown): boolean {
  return (
    isJsonObject(trail) &&
    (trail.lastAxisPoint === null || isRingPoint(trail.lastAxisPoint)) &&
    Array.isArray(trail.unlined) &&
    trail.unlined.every(isAxisPoint)
  )
}

function isAxisPoint(point: unknown): boolean {
  return isRingPoint(point) && isWholeNumber((point as { lengthMm: unknown }).lengthMm)
}

function isRingPoint(point: unknown): boolean {
  return isJsonObject(point) && Number.isSafeInteger(point.xMm) && Number.isSafeInteger(point.yMm)
}

function isPortableGun(gun: unknown): boolean {
  return isJsonObject(gun) && isWholeNumber(gun.level) && isGunMode(gun.mode)
}

function isPortableCharges(charges: unknown): boolean {
  return (
    isJsonObject(charges) &&
    typeof charges.isRackMounted === 'boolean' &&
    isWholeNumber(charges.slotLevel) &&
    isWholeNumber(charges.carried) &&
    (charges.planted === null || isPlantedCharge(charges.planted))
  )
}

function isPlantedCharge(planted: unknown): boolean {
  return (
    isJsonObject(planted) &&
    Number.isSafeInteger(planted.tx) &&
    Number.isSafeInteger(planted.ty) &&
    isWholeNumber(planted.detonateTick)
  )
}

function isPortableHeat(heat: unknown): boolean {
  return (
    isJsonObject(heat) &&
    isWholeNumber(heat.level) &&
    isWholeNumber(heat.settledTick) &&
    (heat.lavaTouchTick === null || isWholeNumber(heat.lavaTouchTick))
  )
}

/** The active type is one the vehicle owns, and it owns the standard lining (#113). */
function isPortableLining(lining: unknown): boolean {
  if (!isJsonObject(lining) || !Array.isArray(lining.owned)) return false
  const owned: unknown[] = lining.owned
  return (
    owned.every(isLiningType) &&
    owned.includes(STANDARD_LINING_TYPE) &&
    isLiningType(lining.active) &&
    owned.includes(lining.active)
  )
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
    isSampleRuns(delta.density, isByte) &&
    isSampleRuns(delta.casing, isCasingValue) &&
    isWholeNumberList(delta.yieldedRows) &&
    delta.yieldedRows.length === CHUNK_SIZE &&
    Array.isArray(delta.overrides) &&
    delta.overrides.every(isWholeNumberList) &&
    isWholeNumberList(delta.lavaFlips) &&
    delta.lavaFlips.length === CHUNK_SIZE &&
    isWholeNumber(delta.version)
  )
}

/** No runs, or `[count, value, ...]` pairs covering the chunk's samples exactly (#36, #41, #111). */
function isSampleRuns(runs: unknown, isValue: (value: number) => boolean): boolean {
  if (!isWholeNumberList(runs) || runs.length % 2 !== 0) return false
  const counts = runs.filter((_, at) => at % 2 === 0)
  const bytes = runs.filter((_, at) => at % 2 === 1)
  const total = counts.reduce((sum, count) => sum + count, 0)
  return (runs.length === 0 || total === CHUNK_SAMPLES) && bytes.every(isValue)
}

function isWholeNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isWholeNumber)
}
