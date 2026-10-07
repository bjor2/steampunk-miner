import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { VIEW_SHORT_AXIS_MAX_M } from '../../../constants/scene'
import { gunRangeTiles } from '../../../systems/economy/gunStats'
import { lastMarkOf } from '../../tech-tree'
import {
  energyPerShotLadder,
  extendedBarrelsAt,
  extendedBarrelsRangeMarks,
  longBarrelAt,
  longBarrelMasteredMark,
  longBarrelRangeMarks,
} from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

/** Tiles are one metre (#6), so a turret target inside the half view at full zoom-out is on screen. */
const METRES_PER_TILE = 1

describe('long barrel ladder', () => {
  it('reaches one cell further a Mark from 4 to the cap of 10: six range Marks', () => {
    expect(longBarrelRangeMarks()).toBe(6)
    expect([1, 2, 3, 4, 5, 6].map((mark) => longBarrelAt(mark).rangeCells)).toEqual([
      5, 6, 7, 8, 9, 10,
    ])
    expect(longBarrelAt(6).holdTicks).toBe(0)
    expect(longBarrelAt(6).isMastered).toBe(false)
  })

  it('never reaches past the cap: Mark 40 still bores 10 cells', () => {
    expect(longBarrelAt(40).rangeCells).toBe(10)
  })

  it('adds 3 ticks of hold a Mark past the cap up to 15, then is Mastered at Mark 11', () => {
    expect([7, 8, 9, 10, 11].map((mark) => longBarrelAt(mark).holdTicks)).toEqual([3, 6, 9, 12, 15])
    expect(longBarrelMasteredMark()).toBe(11)
    expect(longBarrelAt(10).isMastered).toBe(false)
    expect(longBarrelAt(11)).toEqual({ mark: 11, rangeCells: 10, holdTicks: 15, isMastered: true })
    expect(longBarrelAt(12).holdTicks).toBe(15)
  })

  it('keeps collapse able to happen at Mastered: the hold plus its cap stays under the 60-tick warning', () => {
    const quietWindow = GROUND_GUN.bore.collapseHoldTicks + GROUND_GUN.longBarrel.holdCap
    expect(quietWindow).toBe(45)
    expect(quietWindow).toBeLessThan(COLLAPSE_WARN_TICKS)
  })

  it('matches the turret cap: if it can hit it, you can see it', () => {
    expect(GROUND_GUN.bore.rangeCap).toBe(GROUND_GUN.turret.gunRangeCap)
  })
})

describe('extended barrels ladder', () => {
  it('reaches one tile further a Mark from the turret range of 8 to the cap of 10: two range Marks', () => {
    expect(gunRangeTiles()).toBe(8)
    expect(extendedBarrelsRangeMarks()).toBe(2)
    expect(extendedBarrelsAt(1)).toMatchObject({ rangeTiles: 9, energyPerShotMilli: 500 })
    expect(extendedBarrelsAt(2)).toMatchObject({ rangeTiles: 10, energyPerShotMilli: 500 })
    expect(extendedBarrelsAt(2).isMastered).toBe(false)
  })

  it('keeps every turret target on screen at full zoom-out', () => {
    expect(GROUND_GUN.turret.gunRangeCap * METRES_PER_TILE).toBeLessThanOrEqual(
      VIEW_SHORT_AXIS_MAX_M / 2,
    )
  })

  it('then cuts energy per shot by 0.92 a Mark from 0.500 to its 0.5 floor of 0.250, Mastered at Mark 11', () => {
    expect([3, 4, 5].map((mark) => extendedBarrelsAt(mark).energyPerShotMilli)).toEqual([
      460, 423, 389,
    ])
    expect(extendedBarrelsAt(10)).toMatchObject({ rangeTiles: 10, energyPerShotMilli: 257 })
    expect(extendedBarrelsAt(11)).toEqual({
      mark: 11,
      rangeTiles: 10,
      energyPerShotMilli: 250,
      isMastered: true,
    })
    expect(extendedBarrelsAt(12).energyPerShotMilli).toBe(250)
    expect(lastMarkOf(energyPerShotLadder())).toBe(10)
  })
})
