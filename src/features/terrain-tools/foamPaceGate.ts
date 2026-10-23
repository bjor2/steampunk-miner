/**
 * How stabiliser foam's pace gate reads its runs (Systems ruling on #664, option (b), with its
 * addendum; ticket 664). The holders' refractory lining (ticket 367) carries the rig through
 * collapse cascades the bare rig dies to, which is cement's survival value, not foam's pace, so:
 *
 * - the 0.98x gate judges only the seed pairs where both rigs survive, and needs at least two of
 *   them: the three pacing seeds first, then the pinned extra seeds in order, one at a time, until
 *   two pairs survive. A gate whose seeds run out fails; it never passes on fewer pairs.
 * - cement keeps a pin of its own: on the pinned planet 7 seeds where the bare rig dies (at least
 *   two of them), the holder rig's time to core stays within 5% of the ticks frozen below.
 *   Re-pinning is a change named on a ticket, never a re-measure.
 *
 * Only specs use it.
 */
import { BASIS_POINTS, coreTicksOf } from './magnetPaceRuns'
import { FOAM_PACE_SEEDS, hasRigDied, liningShareBpOf, type FoamPaceRuns } from './foamPaceRuns'

/** Played after the pacing seeds, in this order, only while too few pairs survive. */
export const FOAM_PACE_EXTRA_SEEDS = [16180, 14142, 17320, 11235, 57721, 66743] as const
/** The fewest surviving pairs the gate judges (Systems addendum on #664). */
export const MIN_SURVIVED_PAIRS = 2

/**
 * Cement's pin, measured on d47e5dee1 (ticket 664) on the pacing seeds whose bare rig a P7
 * collapse cascade destroys: the holder rig's ticks from arrival to the core. Re-pinned on
 * b5326c785 by ticket 723's "level-leg pacing re-pin (drive-bound)": a sideways cut is held to the
 * drive and travel no longer grows with the drill, so the bot's legs take longer (31507 and 31784
 * ticks before, +5.2% and +4.8%); cement and foam are unchanged.
 */
export const CEMENT_PIN = {
  planet: 7,
  measuredOn: 'b5326c785',
  holderCoreTicks: [
    { seed: 83921, ticks: 33154 },
    { seed: 31415, ticks: 33312 },
  ],
} as const
/** The fewest pinned seeds whose bare rig must die for the pin to judge anything. */
export const MIN_CEMENT_PIN_RUNS = 2
/** How far the holder's time may stray from its pinned ticks, in basis points (+-5%). */
export const CEMENT_PIN_TOLERANCE_BP = 500

/**
 * The seeds whose planet 7 cement-pin and lining-share rows wait as `it.todo` on ticket 742 (TD
 * and GD rulings on #724). The down-cut ramp moves a crawler's meeting, and the test bot's combat
 * hold under a warned, unlined block then kills seed 83921's holder rig. That is a bot bug, so the
 * gate is not bent around it: no survivor filter, no seed swap, every other seed judged at full
 * strength, and the held seed's numbers still reported. Ticket 742 empties this list.
 */
export const COMBAT_HOLD_HELD = { ticket: 742, seeds: [83921] } as const

/** One held seed's planet 7 numbers, written beside the gate so the gap stays visible. */
export interface HeldSeedReport {
  row: 'foam_pace_held_seed'
  planet: number
  seed: number
  heldBy: number
  isBareRigDestroyed: boolean
  isHolderRigDestroyed: boolean
  cementPinDriftBp: number
  liningShareBp: number
}

export interface FoamGateRuns {
  /** Every pair played, pacing seeds first. */
  played: FoamPaceRuns[]
  /** The pairs where neither rig was destroyed: the ones the gate judges. */
  survived: FoamPaceRuns[]
}

/** The pacing seeds' pairs, then extra seeds' until enough survive or the list runs out. */
export function playFoamGateRuns(runsOn: (seed: number) => FoamPaceRuns): FoamGateRuns {
  const played = FOAM_PACE_SEEDS.map(runsOn)
  for (const seed of FOAM_PACE_EXTRA_SEEDS) {
    if (survivedPairsOf(played).length >= MIN_SURVIVED_PAIRS) break
    played.push(runsOn(seed))
  }
  return { played, survived: survivedPairsOf(played) }
}

export function isSurvivedPair({ bare, withHolders }: FoamPaceRuns): boolean {
  return !hasRigDied(bare) && !hasRigDied(withHolders)
}

/** The middle value, or the floored mean of the middle two: two pairs both count. */
export function medianBpOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const upper = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[upper]
  return Math.floor((sorted[upper - 1] + sorted[upper]) / 2)
}

/** The pinned seeds' pairs whose bare rig was destroyed: the ones cement's pin judges. */
export function cementPinRunsOf(runsOn: (seed: number) => FoamPaceRuns): FoamPaceRuns[] {
  return CEMENT_PIN.holderCoreTicks.map(({ seed }) => runsOn(seed)).filter(hasBareRigDied)
}

/** The holder run's ticks to core off its pinned ticks, in basis points of the pin. */
export function cementPinDriftBpOf(runs: FoamPaceRuns): number {
  const pinned = pinnedTicksOf(runs.seed)
  return Math.floor((Math.abs(coreTicksOf(runs.withHolders) - pinned) * BASIS_POINTS) / pinned)
}

export function isHeldForCombatHold(seed: number): boolean {
  return COMBAT_HOLD_HELD.seeds.some((held) => held === seed)
}

export function heldSeedReportOf(runs: FoamPaceRuns): HeldSeedReport {
  return {
    row: 'foam_pace_held_seed',
    planet: runs.planet,
    seed: runs.seed,
    heldBy: COMBAT_HOLD_HELD.ticket,
    isBareRigDestroyed: hasRigDied(runs.bare),
    isHolderRigDestroyed: hasRigDied(runs.withHolders),
    cementPinDriftBp: cementPinDriftBpOf(runs),
    liningShareBp: liningShareBpOf(runs.withHolders),
  }
}

function survivedPairsOf(played: readonly FoamPaceRuns[]): FoamPaceRuns[] {
  return played.filter(isSurvivedPair)
}

function hasBareRigDied(runs: FoamPaceRuns): boolean {
  return hasRigDied(runs.bare)
}

function pinnedTicksOf(seed: number): number {
  const pin = CEMENT_PIN.holderCoreTicks.find((entry) => entry.seed === seed)
  if (pin === undefined) throw new Error(`seed ${seed} has no cement pin`)
  return pin.ticks
}
