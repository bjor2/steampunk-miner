/**
 * The jump between solar systems' bar (ticket 759; the Producer's GD lock on #759): the system
 * jump's hardness step k_jump is judged on the arrival felt speed, at least 0.9x, measured from the
 * bot run at the levels the bot leaves system 1's last planet with, after the drive and the jump's
 * fuel are paid, never from the paper figure (about 0.91x). The run plays to planet 5's core
 * (`starMapTravel.lane.test.ts`), buys the jump drive and the fuel, and jumps to system 2's first
 * planet; the felt speed there, on rock k_jump harder, is set against planet 5's average.
 *
 * A miss moves only the step (`starMap.systemJump.hardnessStep` in economy.json), never the bot.
 */
import { campaignIndex, planetIndexOfCampaign } from '../systems/starMap/campaignIndex'
import { ECONOMY } from '../systems/economy/economy'
import { feltCellsPerSecondInSystem } from './drillPace'
import { planetMediansOf } from './drillPaceBars'
import type { StarMapTravelRun } from './starMapTravelBars'

export const SYSTEM_JUMP_BARS = { arrivalFeltRatioMin: 0.9 } as const

/** The system jump the run makes: out of system 1's last planet into system 2's first. */
const FROM_PLANET = ECONOMY.starMap.planetsPerSystem
const TO_SYSTEM = 2n
const TO_PLANET = planetIndexOfCampaign(campaignIndex(TO_SYSTEM, 1n))

/** The gated bar, as problems; empty when it holds. */
export function gatedSystemJumpProblemsOf(runs: readonly StarMapTravelRun[]): string[] {
  const ratio = arrivalRatioOf(runs)
  if (ratio === null) return [`the bot never jumped out of system 1's planet ${FROM_PLANET}`]
  if (ratio >= SYSTEM_JUMP_BARS.arrivalFeltRatioMin) return []
  return [
    `system jump P${FROM_PLANET}->S2P1 felt ${ratio.toFixed(2)}x planet ${FROM_PLANET}'s average, under 0.9`,
  ]
}

/** The line the lane prints beside the gate. */
export function printedSystemJumpLinesOf(runs: readonly StarMapTravelRun[]): string[] {
  const arrival = medianOf(runs.map(arrivalFeltOf))
  const ratio = arrivalRatioOf(runs)
  if (arrival === null || ratio === null) return []
  return [
    `system jump P${FROM_PLANET}->S2P1: felt ${arrival.toFixed(2)} cells/s on arrival, ` +
      `${ratio.toFixed(2)}x planet ${FROM_PLANET}'s average`,
  ]
}

function arrivalRatioOf(runs: readonly StarMapTravelRun[]): number | null {
  const arrival = medianOf(runs.map(arrivalFeltOf))
  const before = departureFeltOf(runs)
  if (arrival === null || before === null || before === 0) return null
  return arrival / before
}

/** Planet 5's median average felt speed over the seeds. */
function departureFeltOf(runs: readonly StarMapTravelRun[]): number | null {
  const medians = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  return medians.find((median) => median.planet === FROM_PLANET)?.averageFelt ?? null
}

/** The felt speed on system 2's first planet at the levels the bot jumped there with. */
function arrivalFeltOf(run: StarMapTravelRun): number | null {
  const levels = run.systemJumpLevels ?? null
  return levels === null ? null : feltCellsPerSecondInSystem(levels, TO_PLANET, TO_SYSTEM)
}

/** The middle value, a null (never reached) sorting after every number. */
function medianOf(values: readonly (number | null)[]): number | null {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
  return sorted[Math.floor(sorted.length / 2)] ?? null
}
