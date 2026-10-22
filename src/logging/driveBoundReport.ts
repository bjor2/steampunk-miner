/**
 * The drive-bound share of the bot's level legs (Bjor's ruling on #723, VS bar): per planet, the
 * share of its sideways bore ticks whose time the drive set rather than the drill, flagged where it
 * passes half from planet 3 on, which fails the ticket. Read off the bot's own tally
 * (`bot/sidewaysBores.ts`), never written into the log (#11 section 3).
 */
import type { SliceRun } from '../systems/bot/playSlice'
import { driveBoundShareOf, type SidewaysBorePlanet } from '../systems/bot/sidewaysBores'

/** From this planet on, a level leg over `DRIVE_BOUND_SHARE_MOST` drive-bound fails the bar. */
const FIRST_JUDGED_PLANET = 3
const DRIVE_BOUND_SHARE_MOST = 0.5

interface SeededSliceRun {
  worldSeed: number
  run: Pick<SliceRun, 'sidewaysBores'>
}

/** One line per seed and planet with sideways bores, lowest planet first. */
export function driveBoundLines(runs: readonly SeededSliceRun[]): string[] {
  return runs.flatMap(({ worldSeed, run }) =>
    planetsInOrder(run.sidewaysBores).map((record) => driveBoundLine(worldSeed, record)),
  )
}

/** Whether a planet's level legs fail the bar: past half drive-bound, from planet 3 on. */
export function isDriveBoundPastBar(record: SidewaysBorePlanet): boolean {
  return record.planet >= FIRST_JUDGED_PLANET && driveBoundShareOf(record) > DRIVE_BOUND_SHARE_MOST
}

function planetsInOrder(tally: ReadonlyMap<number, SidewaysBorePlanet>): SidewaysBorePlanet[] {
  return [...tally.values()].sort((a, b) => a.planet - b.planet)
}

function driveBoundLine(worldSeed: number, record: SidewaysBorePlanet): string {
  const share = (driveBoundShareOf(record) * 100).toFixed(1)
  const flag = isDriveBoundPastBar(record) ? ' · over half: fails the ticket 723 bar' : ''
  return (
    `seed ${worldSeed} · planet ${record.planet} · drive-bound ${share}% of ` +
    `${Math.round(record.boreTicks)} level-leg bore ticks${flag}`
  )
}
