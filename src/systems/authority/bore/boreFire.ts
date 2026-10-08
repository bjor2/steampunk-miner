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
 *
 * Auto mode (ticket 317, the #310 GD decision) fires through the same path (`fireAutoBore`), and a
 * manual shot always wins: while the steam sear's mode is on, a manual shot folds the wait after
 * it (the sear's `manualWaitTicks`) into its own `nextShotTick`, the one clock (the TD on #313), so
 * auto waits on it; and an auto shot fired in the very tick of a manual one is withdrawn before
 * its first cell opens (`AutoActOverridden`), so the manual bearing is the one bored.
 */
import type { UnlockSchedule } from '../../unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../../unlocks/unlockSchedule'
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { PlanetParams } from '../../world/planetParams'
import {
  boreAutoShootOf,
  boreGunOf,
  gunRecoveryTicks,
  type BoreGunStats,
} from '../../registries/boreGun'
import { isAutoModeOn } from '../autoMode/autoModeState'
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

/** The module whose research opens the gun's auto mode (Content's node table on #310, GD lock). */
export const STEAM_SEAR_ITEM_ID = 'weapon.steam_sear'

type FireCommand = AuthorityCommand<'ground_gun.fire'>

/** The rule against `schedule`; the kernel's table reads the locked one. */
export function boreFireRule(schedule: UnlockSchedule): CommandRule<'ground_gun.fire'> {
  return {
    fields: { bearing: 'wholeNumber' },
    reject: (state, { playerId, tick, payload }) =>
      boreShotRefusal(state, { playerId, tick, bearing: payload.bearing }, schedule),
    apply: fireManualBore,
  }
}

export const BORE_FIRE_RULES: { readonly 'ground_gun.fire': CommandRule<'ground_gun.fire'> } = {
  'ground_gun.fire': boreFireRule(LOCKED_SCHEDULE),
}

/** One shot asked of the gun: by a command, or by auto mode on the clock. */
export interface ShotAsk {
  playerId: string
  tick: number
  bearing: number
}

/** Why the gun would not fire this shot now, or null; an auto shot asks it as a command does. */
export function boreShotRefusal(
  state: AuthorityState,
  { playerId, tick, bearing }: ShotAsk,
  schedule: UnlockSchedule = LOCKED_SCHEDULE,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => bearingRejection(bearing),
    () => inactiveVehicleRejection(vehicle),
    () => noPoseRejection(vehicle.pose),
    () => lockedRowRejection(state, schedule),
    () => noGunRejection(state, playerId),
    () => recoveringRejection(state, playerId, tick),
    () => firstCellEnergyRejection(state, playerId, bearing),
  ])
}

/** A manual shot: it takes the place of an auto shot fired this tick, and waits the sear's wait. */
function fireManualBore(
  state: AuthorityState,
  { playerId, tick, payload }: FireCommand,
): RuleEffect {
  const overridden = withoutAutoBoreOf(state, playerId, tick)
  const stats = boreGunOf(overridden.state, playerId) as BoreGunStats
  const shot = manualShotOf(overridden.state, playerId, stats)
  const bore = pendingBoreOf(overridden.state, playerId, payload.bearing, tick, stats, shot)
  const fired = withFiredBore(overridden.state, bore, payload.bearing, stats)
  return { state: fired.state, events: [...overridden.events, ...fired.events] }
}

/** Auto mode's shot along `bearing` (ticket 317): the same fire, marked with its aim. */
export function fireAutoBore(state: AuthorityState, ask: ShotAsk): RuleEffect {
  const stats = boreGunOf(state, ask.playerId) as BoreGunStats
  const bore = pendingBoreOf(state, ask.playerId, ask.bearing, ask.tick, stats, shotOf(stats))
  return withFiredBore(state, { ...bore, autoAim: ask.bearing }, ask.bearing, stats)
}

function withFiredBore(
  state: AuthorityState,
  bore: PendingBore,
  aimed: number,
  stats: BoreGunStats,
): RuleEffect {
  return {
    state: withBores(state, [...boresOf(state), bore]),
    events: [
      {
        type: 'BoreFired',
        aimed,
        bearing: clampedBearing(aimed),
        rangeCells: stats.rangeCells,
      },
    ],
  }
}

/**
 * The rate's numbers, with the sear's wait after a manual shot as its least wait while the mode
 * is on: the one clock auto reads (the TD on #313), so auto fires nothing before it runs out.
 */
function manualShotOf(state: AuthorityState, playerId: string, stats: BoreGunStats): BoreShot {
  const sear = boreAutoShootOf(state, playerId)
  const shot = shotOf(stats)
  if (sear === null || !isAutoModeOn(state, playerId, STEAM_SEAR_ITEM_ID)) return shot
  return { ...shot, cooldownTicks: Math.max(shot.cooldownTicks, sear.manualWaitTicks) }
}

/** The state without the player's auto shot of this tick, with its withdrawal, when there is one. */
function withoutAutoBoreOf(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const auto = autoBoreFiredAt(state, playerId, tick)
  if (auto === null) return { state, events: [] }
  return {
    state: withBores(
      state,
      boresOf(state).filter((bore) => bore !== auto),
    ),
    events: [
      { type: 'AutoActOverridden', itemId: STEAM_SEAR_ITEM_ID, aim: auto.autoAim as number },
    ],
  }
}

/** An auto shot fired at `tick` has opened nothing yet: its first cell is due a tick later at least. */
function autoBoreFiredAt(
  state: AuthorityState,
  playerId: string,
  tick: number,
): PendingBore | null {
  return (
    boresOf(state).find(
      (bore) => bore.playerId === playerId && bore.autoAim !== undefined && bore.firedTick === tick,
    ) ?? null
  )
}

function pendingBoreOf(
  state: AuthorityState,
  playerId: string,
  aimed: number,
  tick: number,
  stats: BoreGunStats,
  shot: BoreShot,
): PendingBore {
  const pose = vehicleOf(state, playerId).pose as VehiclePose
  return {
    playerId,
    firedTick: tick,
    origin: { x: pose.x, y: pose.y },
    shot,
    cells: lineOf(pose, aimed, stats.rangeCells),
    nextOpenTick: tick + stats.openIntervalTicks,
    budgetLeft: stats.boreBudgetTicks,
    bored: [],
    checkTick: null,
    blocksChecked: 0,
    nextShotTick: tick + gunRecoveryTicks(0, shot),
  }
}

/** The rate level's numbers and the gun's, as the shot fires with them. */
export function shotOf(stats: BoreGunStats): BoreShot {
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

/** Before the last shot's `nextShotTick`; an auto shot of this very tick gives way to the command. */
function recoveringRejection(
  state: AuthorityState,
  playerId: string,
  tick: number,
): Rejection | null {
  const nextShotTick = nextShotTickOf(withoutAutoBoreOf(state, playerId, tick).state, playerId)
  if (tick >= nextShotTick) return null
  return rejectionOf('recovering', `the bore gun fires again at tick ${nextShotTick}`)
}

/** The first tick the player may fire again: after every shot of theirs still pending. */
export function nextShotTickOf(state: AuthorityState, playerId: string): number {
  return boresOf(state)
    .filter((bore) => bore.playerId === playerId)
    .reduce((latest, bore) => Math.max(latest, bore.nextShotTick), 0)
}

/** Whether a shot of the player's is still opening cells, so its `nextShotTick` may still move. */
export function isShotOpening(state: AuthorityState, playerId: string): boolean {
  return boresOf(state).some((bore) => bore.playerId === playerId && bore.cells.length > 0)
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
