/**
 * The effective down speed of the bot's legs (Bjor's ruling on #724, VS row): per planet, the
 * metres it bored down over the seconds those bores took, with the share of that time the gravity
 * ramp added over the drill's own. Reported only; the pacing and money bars judge the ramp. Read
 * off the bot's own tally (`bot/downBores.ts`), never written into the log (#11 section 3).
 */
import type { SliceRun } from '../systems/bot/playSlice'
import {
  effectiveDownSpeedOf,
  gravityBoundShareOf,
  type DownBorePlanet,
} from '../systems/bot/downBores'

interface SeededSliceRun {
  worldSeed: number
  run: Pick<SliceRun, 'downBores'>
}

/** One line per seed and planet with bores down, lowest planet first. */
export function downSpeedLines(runs: readonly SeededSliceRun[]): string[] {
  return runs.flatMap(({ worldSeed, run }) =>
    planetsInOrder(run.downBores).map((record) => downSpeedLine(worldSeed, record)),
  )
}

function planetsInOrder(tally: ReadonlyMap<number, DownBorePlanet>): DownBorePlanet[] {
  return [...tally.values()].sort((a, b) => a.planet - b.planet)
}

function downSpeedLine(worldSeed: number, record: DownBorePlanet): string {
  const speed = effectiveDownSpeedOf(record).toFixed(2)
  const share = (gravityBoundShareOf(record) * 100).toFixed(1)
  return (
    `seed ${worldSeed} · planet ${record.planet} · effective down speed ${speed} m/s over ` +
    `${record.metres} m · gravity ramp ${share}% of the bore time`
  )
}
