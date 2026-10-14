/**
 * The pending bores a fired shot leaves (ticket 313, #309; shapes from ticket 377): one per line,
 * each holding the numbers the shot fired with and the shot's whole dig budget, which the lines
 * then share on the clock (`boreTick.ts`). A shape adds its extra energy to every cell and names
 * the lining type its walls are laid in; with no shape a shot is exactly the gun's.
 */
import type { VehiclePose } from '../../vehicle/vehiclePose'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { gunRecoveryTicks, type BoreGunStats, type ShotShape } from '../../registries/boreGun'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'
import { shotLinesOf } from './boreShotLines'
import type { BoreShot, PendingBore } from './boreState'
import { liningTypeOfGrade } from './shotShape'

/** One shot asked of the gun: by a command, or by auto mode on the clock. */
export interface ShotAsk {
  playerId: string
  tick: number
  bearing: number
}

export function autoAimedBores(bores: readonly PendingBore[], aim: number): PendingBore[] {
  return bores.map((bore) => ({ ...bore, autoAim: aim }))
}

/** One pending bore per line of the shot, each with the shot's whole budget to share. */
export function pendingBoresOf(
  state: AuthorityState,
  ask: ShotAsk,
  stats: BoreGunStats,
  shot: BoreShot,
  shape: ShotShape | null,
): PendingBore[] {
  const params = planetParamsOf(state.planet) as PlanetParams
  const pose = vehicleOf(state, ask.playerId).pose as VehiclePose
  return shotLinesOf(state.world, params, pose, ask.bearing, stats.rangeCells, shape).map((cells) =>
    pendingBoreOf(ask, pose, stats, shot, cells),
  )
}

function pendingBoreOf(
  { playerId, tick }: ShotAsk,
  pose: VehiclePose,
  stats: BoreGunStats,
  shot: BoreShot,
  cells: TilePoint[],
): PendingBore {
  return {
    playerId,
    firedTick: tick,
    origin: { x: pose.x, y: pose.y },
    shot,
    cells,
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

/**
 * The shot as its shape bores it: the shape's extra energy on every cell, and the lining type its
 * grade lays; the shot itself with no shape.
 */
export function shapedShotOf(shot: BoreShot, shape: ShotShape | null): BoreShot {
  if (shape === null) return shot
  const energyPerCellBp = shot.energyPerCellBp + shape.extraEnergyPerCellBp
  const liningType = shape.liningGrade === null ? null : liningTypeOfGrade(shape.liningGrade)
  return liningType === null
    ? { ...shot, energyPerCellBp }
    : { ...shot, energyPerCellBp, liningType }
}
