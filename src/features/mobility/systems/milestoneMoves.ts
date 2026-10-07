/**
 * The short pushes the Mark milestone verbs add (ticket 275, the GD lock on #256): a kick (a
 * burst at the boost's share of top speed for half a second), a pin (`hover`), a rise (`liftBp`)
 * and a drift (`driveBp`). They sit in the player's `mobility` section as `moves`, absent with
 * none, and reach the vehicle through one `vehicleMotionEffects` source, so the kernel folds them
 * under its +2000 bp cap and top-speed limit like every other mobility effect (#233).
 */
import type {
  MotionBurst,
  VehicleMotionEffect,
  VehicleMotionEffectSource,
} from '../../../systems/registries/vehicleMotionEffects'
import { mobilityOf, type MobilityState, type MoveWindow } from './mobilitySection'

export const MILESTONE_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.milestone-moves',
  effectOf: (state, playerId, tick) => {
    const running = runningMovesOf(mobilityOf(state, playerId), tick)
    return running.length === 0 ? null : foldedMovesOf(running)
  },
}

/** The section with one more push running. */
export function withMove(value: MobilityState, move: MoveWindow): MobilityState {
  return { ...value, moves: [...(value.moves ?? []), move] }
}

/** The pushes still running at `tick`; the field is left out once none is. */
export function withEndedMovesCleared(value: MobilityState, tick: number): MobilityState {
  if (value.moves === undefined) return value
  const running = runningMovesOf(value, tick)
  if (running.length === value.moves.length) return value
  const { moves: _ended, ...rest } = value
  return running.length === 0 ? rest : { ...rest, moves: running }
}

/** The first tick each running push ends. */
export function moveEndsOf(value: MobilityState): number[] {
  return (value.moves ?? []).map((move) => move.untilTick)
}

function runningMovesOf(value: MobilityState, tick: number): readonly MoveWindow[] {
  return (value.moves ?? []).filter((move) => tick < move.untilTick)
}

/** One effect: boosts summed (the kernel caps them), any pin holds, the last kick drives. */
function foldedMovesOf(moves: readonly MoveWindow[]): VehicleMotionEffect {
  const kick = [...moves].reverse().find((move) => move.burst !== undefined)
  return {
    liftBp: sumOf(moves.map((move) => move.liftBp ?? 0)),
    driveBp: sumOf(moves.map((move) => move.driveBp ?? 0)),
    hover: moves.some((move) => move.hover === true),
    ...(kick !== undefined && { burst: burstOf(kick) }),
  }
}

function burstOf(move: MoveWindow): MotionBurst {
  return { ...(move.burst as Omit<MotionBurst, 'untilTick'>), untilTick: move.untilTick }
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}
