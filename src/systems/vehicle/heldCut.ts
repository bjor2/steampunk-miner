/**
 * What the motor carries of a cut from one tick to the next (tickets 400 and 430), and the cut it
 * follows while the cut gate is shut.
 *
 * The gate's dwell is counted in ticks but the gap from a broken cell to the next one entering the
 * leading slab is a distance, so below some 5 m/s the gate shuts in every cell (TD shape on #430).
 * Travel then sped the body to the face ahead of the drill, where it stalled. So while the gate is
 * shut the body coasts on the last `vCut` it followed, for at most `CUT_COAST_METRES`, while the
 * drive pushes along the same facing and the drill still bites with no span stop ahead; the hold's
 * count carries through, so the next cell meets a body already at the drill's speed. And once the
 * drive lets go of a followed cut, the cut-follow's stop ramp runs its `CUT_FOLLOW_TICKS` to zero
 * even if the gate shuts or the drill loses the ground mid-ramp (TD addendum on #430): the stop
 * follows the drive, not the contact.
 *
 * Neither ever opens the gate: the motor's gate stays the authority's (#333), and with the gate
 * shut the body is bounded and collides as a travelling one.
 */
import { CUT_COAST_METRES, CUT_FOLLOW_TICKS } from '../../constants/balance'
import { PHYSICS_TIMESTEP } from '../../constants/physics'
import { followedTicksAfter, isFollowingDrill, type CutFollowMotion } from './cutFollowMotion'
import type { Facing } from './vehiclePose'

/** The last `vCut` the drive followed, along its facing. */
export interface FollowedCut {
  /** m/s along the facing. */
  speed: number
  facing: Facing
}

export interface CutMemory {
  /** Ticks the cut has followed the drill with no stop: past the ramp it holds `vCut` (400). */
  followedTicks: number
  /** The last cut the drive followed; null before one, and once travel drives again. */
  last: FollowedCut | null
  /** Ticks the gate has been shut under this cut. */
  shutTicks: number
  /** Ticks since the drive let go of this cut, up to `CUT_FOLLOW_TICKS`. */
  releasedTicks: number
}

export const FRESH_CUT_MEMORY: CutMemory = Object.freeze({
  followedTicks: 0,
  last: null,
  shutTicks: 0,
  releasedTicks: 0,
})

/** What a step with the gate shut says about the drive and the drill. */
export interface ShutGateStep {
  /** The pose's facing this step. */
  facing: Facing
  /** The drive pushes along the facing, with energy to act. */
  isPushing: boolean
  /** The drill still bites with no span stop in its slab and the wheels not held. */
  canCoast: boolean
}

/** What a tick did with the cut, for the memory after it. */
export interface CutTick {
  /** The cut that set the speed this tick: the open gate's, a held one, or none. */
  cut: CutFollowMotion | undefined
  isGateOpen: boolean
  isWaitingForCut: boolean
}

/**
 * The cut the motor follows on a step whose gate is shut: a coast on the last `vCut` while the
 * drive pushes and the drill can carry on, the stop ramp while the drive has let go, else none.
 */
export function heldCutOf(memory: CutMemory, step: ShutGateStep): CutFollowMotion | undefined {
  const { last } = memory
  if (last === null || last.facing !== step.facing) return undefined
  if (step.isPushing) return isCoastLeft(memory, step) ? coastOf(last, memory) : undefined
  return memory.releasedTicks < CUT_FOLLOW_TICKS ? stopRampOf(last, memory) : undefined
}

/** The open gate's speed over a slab it has already cleared: the last `vCut`, not travel's. */
export function clearedSlabSpeedOf(memory: CutMemory, facing: Facing): number | undefined {
  return memory.last?.facing === facing ? memory.last.speed : undefined
}

/** The memory after `tick`; a tick travel drove forgets the cut. */
export function cutMemoryAfter(memory: CutMemory, tick: CutTick): CutMemory {
  const { cut } = tick
  if (cut === undefined) return FRESH_CUT_MEMORY
  return {
    followedTicks: followedTicksAfter(cut, tick.isWaitingForCut),
    last: lastFollowedOf(memory.last, cut, tick.isWaitingForCut),
    shutTicks: tick.isGateOpen ? 0 : memory.shutTicks + 1,
    releasedTicks: cut.isPushing ? 0 : Math.min(CUT_FOLLOW_TICKS, memory.releasedTicks + 1),
  }
}

/** The drill can carry on, and the coast has carried the body less than `CUT_COAST_METRES`. */
function isCoastLeft(memory: CutMemory, step: ShutGateStep): boolean {
  return step.canCoast && coastedMetresOf(memory) < CUT_COAST_METRES
}

function coastedMetresOf({ shutTicks, last }: CutMemory): number {
  return shutTicks * (last?.speed ?? 0) * PHYSICS_TIMESTEP
}

function coastOf(last: FollowedCut, memory: CutMemory): CutFollowMotion {
  return { ...last, isPushing: true, followedTicks: memory.followedTicks }
}

function stopRampOf(last: FollowedCut, memory: CutMemory): CutFollowMotion {
  return { ...last, isPushing: false, followedTicks: 0, releasedTicks: memory.releasedTicks }
}

/** A cut the drive follows is the one to hold; a let-go one keeps it for its stop; else none. */
function lastFollowedOf(
  last: FollowedCut | null,
  cut: CutFollowMotion,
  isWaitingForCut: boolean,
): FollowedCut | null {
  if (!cut.isPushing) return last
  if (!isFollowingDrill(cut, isWaitingForCut)) return null
  if (last?.speed === cut.speed && last.facing === cut.facing) return last
  return { speed: cut.speed, facing: cut.facing }
}
