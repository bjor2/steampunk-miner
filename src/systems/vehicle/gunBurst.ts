/**
 * Overpressure's held toggle on the `auto_guns` turret (K-burst, ticket 383; the TD lock on #319):
 * while it is on, the guns run a cycle of `burstTicks` at the faster cadence, then `ventTicks`
 * idle, from the tick it went on. Off, a burst under way vents in full from that tick, and a vent
 * under way runs out, so switching never skips a vent; switched on again during one, the next
 * burst starts when it ends.
 *
 * The cycle is the turret shape's `burst` as it was when the toggle went on, kept in the state, so
 * the shot path never reads the shape while the guns vent. Part of the vehicle (saved, travelling
 * with it); absent until the first switch, so with no Overpressure the state and digest are
 * unchanged.
 */

/** The shape's `burst` the toggle runs: Content's Overpressure stats on #319. */
export interface BurstCycle {
  burstTicks: number
  ventTicks: number
  intervalNumerator: number
  intervalDenominator: number
}

export interface GunBurst {
  /** The tick the running cycle's first burst starts; null while the toggle is off. */
  onSinceTick: number | null
  /** The guns are idle before this tick: a vent the toggle left running when it went off. */
  ventUntilTick: number
  cycle: BurstCycle
}

/** What the turret is doing under Overpressure at a tick: bursting, venting, or neither. */
export type BurstPhase = 'burst' | 'vent' | 'none'

export function burstPhaseOf(burst: GunBurst | undefined, tick: number): BurstPhase {
  if (burst === undefined) return 'none'
  if (tick < burst.ventUntilTick) return 'vent'
  if (burst.onSinceTick === null || tick < burst.onSinceTick) return 'none'
  return cyclePhaseOf(burst.cycle, tick - burst.onSinceTick)
}

export function isBurstOn(burst: GunBurst | undefined): boolean {
  return burst !== undefined && burst.onSinceTick !== null
}

/** The toggle on at `tick`: the next burst starts now, or when a vent under way ends. */
export function switchedOnBurst(
  burst: GunBurst | undefined,
  cycle: BurstCycle,
  tick: number,
): GunBurst {
  const ventUntilTick = Math.max(tick, burst?.ventUntilTick ?? tick)
  return { onSinceTick: ventUntilTick, ventUntilTick, cycle }
}

/** The toggle off at `tick`: whatever vent is due runs out in full before the guns fire again. */
export function switchedOffBurst(burst: GunBurst, tick: number): GunBurst {
  return { ...burst, onSinceTick: null, ventUntilTick: ventEndOf(burst, tick) }
}

/**
 * The ticks the guns wait after a shot at `tick`: the track's interval, or during a burst that
 * times `numerator / denominator`, rounded up so a burst never fires faster than its ratio.
 */
export function gunIntervalAt(
  burst: GunBurst | undefined,
  trackIntervalTicks: number,
  tick: number,
): number {
  if (burst === undefined || burstPhaseOf(burst, tick) !== 'burst') return trackIntervalTicks
  const { intervalNumerator, intervalDenominator } = burst.cycle
  return Math.ceil((trackIntervalTicks * intervalNumerator) / intervalDenominator)
}

function cyclePhaseOf(cycle: BurstCycle, ticksIntoCycles: number): BurstPhase {
  const intoCycle = ticksIntoCycles % (cycle.burstTicks + cycle.ventTicks)
  return intoCycle < cycle.burstTicks ? 'burst' : 'vent'
}

/** The tick the guns may fire again after switching off at `tick`. */
function ventEndOf(burst: GunBurst, tick: number): number {
  const { onSinceTick, ventUntilTick, cycle } = burst
  if (onSinceTick === null || tick < Math.max(onSinceTick, ventUntilTick)) return ventUntilTick
  const intoCycle = (tick - onSinceTick) % (cycle.burstTicks + cycle.ventTicks)
  if (intoCycle < cycle.burstTicks) return tick + cycle.ventTicks
  return tick + cycle.burstTicks + cycle.ventTicks - intoCycle
}
