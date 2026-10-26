import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { casingHardness } from '../economy/casingGrades'
import { onCurveSteps, vehicleStatsAt } from '../economy/vehicleStats'
import { subStepsPerTileAt, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { freshPlanetParamsFor } from '../world/planetParams'
import { drillSubStepsOfCells, drillTicksOfCells } from './groundDrill'
import { unshieldedShockTicksAt } from './magnetic/electrifiedShock'
import { WORLD_SEED } from './scriptedSession'

// Re-drilling lining (ticket 843): #41's Systems ruling makes own casing "boreable, not free and
// not a wall", band-G rock of its grade on the planet it lies on. The scratch floor compares the
// last tip major (#180 amendment 2), so lining had to leave it out: grade 5, planet 1's core grade
// carried to planet 2, was a wall there to a tip short of its first major.

const ANY_TILE = { tx: 0, ty: 0 }
const ANY_MATERIAL = 0
const GRADES = [1, 2, 3, 4, 5]
const PLANETS = [1, 2, 3]
/** Tip pips bought short of the first major: the gate still reads the starting tip. */
const EARLY_TIP_PIPS = [0, 3, 9]

function drillWithTipPips(pips: number): DrillStats {
  return vehicleStatsAt({ ...onCurveSteps(1), drill_tip: pips })
}

function liningTicksOf(planetIndex: number, drill: DrillStats, grade: number): number | null {
  const params = freshPlanetParamsFor(WORLD_SEED, planetIndex)
  return drillTicksOfCells(params, drill, unshieldedShockTicksAt)(ANY_TILE, ANY_MATERIAL, grade)
}

function liningSubStepsOf(planetIndex: number, drill: DrillStats, grade: number): number | null {
  const params = freshPlanetParamsFor(WORLD_SEED, planetIndex)
  const subStepsOf = drillSubStepsOfCells(params, drill, unshieldedShockTicksAt)
  return subStepsOf(ANY_TILE, ANY_MATERIAL, grade)
}

const LINED_CASES = PLANETS.flatMap((planetIndex) =>
  EARLY_TIP_PIPS.flatMap((pips) => GRADES.map((grade) => ({ planetIndex, pips, grade }))),
)

describe('re-drilling lining (ticket 843)', () => {
  it.each(LINED_CASES)(
    'times grade $grade lining on planet $planetIndex for a tip $pips pips short of its first major',
    ({ planetIndex, pips, grade }) => {
      const drill = drillWithTipPips(pips)
      expect(liningTicksOf(planetIndex, drill, grade)).toBeGreaterThan(0)
      expect(liningSubStepsOf(planetIndex, drill, grade)).toBeGreaterThan(0)
    },
  )

  // Planet 2's core grade on the ladder (ticket 829) is 9, the rock of its band 5.
  it("re-drills planet 2's core grade before the first tip major", () => {
    const drill = drillWithTipPips(9)
    expect(ticksPerTile(drill, casingHardness(2, 9n))).toBeNull()
    expect(liningTicksOf(2, drill, 9)).not.toBeNull()
  })

  it('takes longer to re-drill higher-grade lining on the same planet', () => {
    const drill = drillWithTipPips(3)
    const planet2Grades = GRADES.map((grade) => grade + 4)
    const ticks = planet2Grades.map((grade) => liningTicksOf(2, drill, grade) as number)
    ticks.slice(1).forEach((slower, index) => expect(slower).toBeGreaterThan(ticks[index]))
  })

  it('times lining a scratching tip cuts exactly as band-G rock, as before', () => {
    const drill = vehicleStatsAt(onCurveSteps(2))
    GRADES.forEach((grade) => {
      const hardness = casingHardness(2, BigInt(grade))
      expect(liningTicksOf(2, drill, grade)).toBe(ticksPerTile(drill, hardness))
      expect(liningSubStepsOf(2, drill, grade)).toBe(
        subStepsPerTileAt(DRILL_SUBSTEPS_PER_TICK, drill, hardness),
      )
    })
  })
})
