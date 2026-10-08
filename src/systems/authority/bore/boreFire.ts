/**
 * `ground_gun.fire {bearing}` (ticket 313, the #309 GD decision): the bore gun's one command. The
 * authority clamps the bearing to the arc, walks the line from the rig's tile, and leaves a
 * pending bore whose cells open on the clock (`boreTick.ts`). It never repeats a shot by itself:
 * hold-to-repeat is the client sending the command again at the cadence.
 *
 * Refused, with nothing spent, when the vehicle cannot act or has no pose to aim from, before
 * `FeatureUnlocked(bore_gun)`, when the player has no gun (`boreGun` provider), before the last
 * shot's `nextShotTick` (`recovering`), or when the tank cannot pay for the first cell the line
 * would open. The shot keeps the rate level's numbers it fired with, so a level bought while it
 * recovers applies from the next shot.
 */
import type { UnlockSchedule } from '../../unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../../unlocks/unlockSchedule'
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { PlanetParams } from '../../world/planetParams'
import { boreGunOf, gunRecoveryTicks, type BoreGunStats } from '../../registries/boreGun'
import type { AuthorityCommand } from '../authorityCommand'
import { vehicleOf, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { isFeatureUnlockedIn } from '../featureUnlocks'
import { noPlanetRejection, planetParamsOf } from '../planetOfState'
import { BORE_BEARING_COUNT, boreDirectionOf, clampedBearing } from './boreAim'
import { openBoreCell, type CellOpening } from './boreCell'
import { boresOf, withBores, type BoreShot, type PendingBore } from './boreState'
import { boreCellsFrom } from './boreWalk'

/** The schedule row the gun opens with (#309: planet 1, Upgrade lane). */
export const BORE_GUN_ROW_ID = 'bore_gun'

type FireCommand = AuthorityCommand<'ground_gun.fire'>

/** The rule against `schedule`; the kernel's table reads the locked one. */
export function boreFireRule(schedule: UnlockSchedule): CommandRule<'ground_gun.fire'> {
  return {
    fields: { bearing: 'wholeNumber' },
    reject: (state, command) => boreFireRefusal(state, command, schedule),
    apply: fireBore,
  }
}

export const BORE_FIRE_RULES: { readonly 'ground_gun.fire': CommandRule<'ground_gun.fire'> } = {
  'ground_gun.fire': boreFireRule(LOCKED_SCHEDULE),
}

function boreFireRefusal(
  state: AuthorityState,
  { playerId, tick, payload }: FireCommand,
  schedule: UnlockSchedule,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => bearingRejection(payload.bearing),
    () => inactiveVehicleRejection(vehicle),
    () => noPoseRejection(vehicle.pose),
    () => lockedRowRejection(state, schedule),
    () => noGunRejection(state, playerId),
    () => recoveringRejection(state, playerId, tick),
    () => firstCellEnergyRejection(state, playerId, payload.bearing),
  ])
}

function fireBore(state: AuthorityState, { playerId, tick, payload }: FireCommand): RuleEffect {
  const stats = boreGunOf(state, playerId) as BoreGunStats
  const bore = pendingBoreOf(state, playerId, payload.bearing, tick, stats)
  return {
    state: withBores(state, [...boresOf(state), bore]),
    events: [
      {
        type: 'BoreFired',
        aimed: payload.bearing,
        bearing: clampedBearing(payload.bearing),
        rangeCells: stats.rangeCells,
      },
    ],
  }
}

function pendingBoreOf(
  state: AuthorityState,
  playerId: string,
  aimed: number,
  tick: number,
  stats: BoreGunStats,
): PendingBore {
  const pose = vehicleOf(state, playerId).pose as VehiclePose
  return {
    playerId,
    firedTick: tick,
    origin: { x: pose.x, y: pose.y },
    shot: shotOf(stats),
    cells: lineOf(pose, aimed, stats.rangeCells),
    nextOpenTick: tick + stats.openIntervalTicks,
    budgetLeft: stats.boreBudgetTicks,
    bored: [],
    checkTick: null,
    blocksChecked: 0,
    nextShotTick: tick + gunRecoveryTicks(0, stats),
  }
}

function shotOf(stats: BoreGunStats): BoreShot {
  return {
    gunFactorBp: stats.gunFactorBp,
    energyPerCellBp: stats.energyPerCellBp,
    openIntervalTicks: stats.openIntervalTicks,
    collapseHoldTicks: stats.collapseHoldTicks,
    boreBudgetTicks: stats.boreBudgetTicks,
    cooldownTicks: stats.cooldownTicks,
    kGunPct: stats.kGunPct,
  }
}

/** The cells the clamped bearing crosses from the rig's tile, in walk order. */
function lineOf(pose: VehiclePose, aimed: number, rangeCells: number) {
  const up = { x: pose.upx, y: pose.upy }
  return boreCellsFrom(tileOfPose(pose), boreDirectionOf(up, clampedBearing(aimed)), rangeCells)
}

function bearingRejection(bearing: number): Rejection | null {
  if (bearing < BORE_BEARING_COUNT) return null
  return rejectionOf(
    'out_of_range',
    `bearing must be 0 to ${BORE_BEARING_COUNT - 1}, got ${bearing}`,
  )
}

function inactiveVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function noPoseRejection(pose: VehiclePose | null): Rejection | null {
  if (pose !== null) return null
  return rejectionOf('invalid_pose', 'the vehicle has no reported pose to aim from')
}

function lockedRowRejection(state: AuthorityState, schedule: UnlockSchedule): Rejection | null {
  if (isFeatureUnlockedIn(schedule, state, BORE_GUN_ROW_ID)) return null
  return rejectionOf('feature_locked', `${BORE_GUN_ROW_ID} is not unlocked on this planet`)
}

function noGunRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (boreGunOf(state, playerId) !== null) return null
  return rejectionOf('no_bore_gun', 'the vehicle has no bore gun')
}

function recoveringRejection(
  state: AuthorityState,
  playerId: string,
  tick: number,
): Rejection | null {
  const nextShotTick = nextShotTickOf(state, playerId)
  if (tick >= nextShotTick) return null
  return rejectionOf('recovering', `the bore gun fires again at tick ${nextShotTick}`)
}

/** The first tick the player may fire again: after every shot of theirs still pending. */
export function nextShotTickOf(state: AuthorityState, playerId: string): number {
  return boresOf(state)
    .filter((bore) => bore.playerId === playerId)
    .reduce((latest, bore) => Math.max(latest, bore.nextShotTick), 0)
}

/** The tank cannot pay for the first cell the line would open; open air or a clank still fires. */
function firstCellEnergyRejection(
  state: AuthorityState,
  playerId: string,
  aimed: number,
): Rejection | null {
  if (!isStoppedByTank(firstCellOpening(state, playerId, aimed))) return null
  return rejectionOf('energy_short', 'the tank cannot pay for the first cell the bore would open')
}

/** How the first cell not already open would open now, asked as the clock will ask it. */
function firstCellOpening(
  state: AuthorityState,
  playerId: string,
  aimed: number,
): CellOpening | null {
  const params = planetParamsOf(state.planet) as PlanetParams
  const stats = boreGunOf(state, playerId) as BoreGunStats
  const pose = vehicleOf(state, playerId).pose as VehiclePose
  const budgetLeft = stats.boreBudgetTicks
  for (const tile of lineOf(pose, aimed, stats.rangeCells)) {
    const ask = { playerId, tick: state.tick, shot: shotOf(stats), budgetLeft, tile }
    const opening = openBoreCell(state, params, ask)
    if (opening.kind !== 'passed') return opening
  }
  return null
}

function isStoppedByTank(opening: CellOpening | null): boolean {
  return opening?.kind === 'stopped' && opening.stop === 'energy'
}
