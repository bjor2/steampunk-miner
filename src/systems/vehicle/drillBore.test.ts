import { describe, expect, it } from 'vitest'
import {
  BODY_HALF_SIZE_MM,
  CASING_LINING_WIDTH_MM,
  DRILL_BORE_ROWS,
  DRILL_SIDE_CLEARANCE_RANGE_MM,
} from '../../constants/balance'
import { AIM_STEPS_PER_TURN, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { casingRingAround } from '../world/casingLining'
import { AIM, aimDirectionOf } from './aim'
import {
  BARE_WIDTH_LEVEL,
  bodyWidthMmAt,
  boreCellsPerMetreAt,
  boreRadiusMmAlongAt,
  boreRadiusMmAt,
  casingRingLagMm,
  casingRingLagMmAt,
  drillStampLiftMm,
  drillStampRadiusMm,
  drillStampRadiusMmAlong,
  widestStampRadiusMm,
} from './drillBore'
import { WIDE_BORE_CLEARANCE_MM, withDrillSideClearance } from './drillBoreFixtures'

describe('drill bore', () => {
  it('cuts the body’s width plus the side clearance on each side', () => {
    const bodyWidthMm = VEHICLE_COLLIDER_SIZE * 1000
    const boreMm = 2 * drillStampRadiusMm()
    expect(boreMm).toBe(bodyWidthMm + 2 * DRILL_BORE_ROWS.sideClearanceMm)
    expect(BODY_HALF_SIZE_MM * 2).toBe(bodyWidthMm)
  })

  it('ships a side clearance inside the GD’s 0.10 to 0.20 m', () => {
    expect(DRILL_BORE_ROWS.sideClearanceMm).toBeGreaterThanOrEqual(
      DRILL_SIDE_CLEARANCE_RANGE_MM.min,
    )
    expect(DRILL_BORE_ROWS.sideClearanceMm).toBeLessThanOrEqual(DRILL_SIDE_CLEARANCE_RANGE_MM.max)
  })

  it('cuts a 1.2 m bore round the 0.9 m body with nothing lifted above it', () => {
    expect(2 * drillStampRadiusMm()).toBe(1200)
    expect(drillStampLiftMm()).toBe(0)
  })

  it('lines the ring from the bore wall’s full-weight edge to a quarter metre past the wall', () => {
    const ring = casingRingAround(0, 0)
    expect(ring.clearMm).toBe(drillStampRadiusMm() - CASING_LINING_WIDTH_MM)
    expect(ring.clearMm + ring.widthMm).toBe(drillStampRadiusMm() + CASING_LINING_WIDTH_MM)
  })

  it('widens the bore across a diagonal aim to the body’s corners plus the clearance (ticket 791)', () => {
    expect(drillStampRadiusMmAlong(AIM.down)).toBe(drillStampRadiusMm())
    expect(drillStampRadiusMmAlong(AIM.right)).toBe(drillStampRadiusMm())
    // 45 degrees: the 0.9 m square is 1.27 m across its path, its half 637 mm rounded up.
    expect(drillStampRadiusMmAlong(40)).toBe(637 + 150)
    expect(widestStampRadiusMm()).toBe(637 + 150)
  })

  it('fits the body’s width across its path and the clearance either side at every aim', () => {
    for (let aim = 0; aim < AIM_STEPS_PER_TURN; aim++) {
      const { along, up } = aimDirectionOf(aim)
      // The square's half width across the path: its corners' reach at a quarter turn on.
      const halfAcrossMm = (BODY_HALF_SIZE_MM * (Math.abs(along) + Math.abs(up))) / 1024
      const clearMm = drillStampRadiusMmAlong(aim) - halfAcrossMm
      expect(clearMm).toBeGreaterThanOrEqual(DRILL_BORE_ROWS.sideClearanceMm)
      expect(clearMm).toBeLessThan(DRILL_BORE_ROWS.sideClearanceMm + 1)
    }
  })

  it('cuts decision #36’s 1.9 m bore, lift and ring lag at a clearance of 0.5 m', () => {
    withDrillSideClearance(WIDE_BORE_CLEARANCE_MM, () => {
      expect(drillStampRadiusMm()).toBe(950)
      expect(drillStampLiftMm()).toBe(250)
      expect(casingRingLagMm()).toBe(2150)
    })
  })

  it('follows the row at call time and puts the shipped row back after', () => {
    const shipped = DRILL_BORE_ROWS.sideClearanceMm
    expect(withDrillSideClearance(200, () => drillStampRadiusMm())).toBe(650)
    expect(DRILL_BORE_ROWS.sideClearanceMm).toBe(shipped)
  })

  it('lifts a level cut only by the clearance past one density sample, never below the centre', () => {
    expect(withDrillSideClearance(150, () => drillStampLiftMm())).toBe(0)
    expect(withDrillSideClearance(250, () => drillStampLiftMm())).toBe(0)
    expect(withDrillSideClearance(300, () => drillStampLiftMm())).toBe(50)
  })

  it('lays a ring once the stamp is its radius plus the ring’s outer radius past it', () => {
    withDrillSideClearance(150, () => expect(casingRingLagMm()).toBe(600 + 600 + 250))
  })
})

describe('drill bore width levels (ticket 749)', () => {
  // Goldens at width levels 0, 1, 10 and 1e6 (VS on #662 Part B): body, R and cells a metre.
  it.each([
    { level: 0, bodyMm: 900, radiusMm: 600, cellsPerMetre: 1 },
    { level: 1, bodyMm: 1_900, radiusMm: 1_100, cellsPerMetre: 2 },
    { level: 10, bodyMm: 10_900, radiusMm: 5_600, cellsPerMetre: 11 },
    { level: 1e6, bodyMm: 1_000_000_900, radiusMm: 500_000_600, cellsPerMetre: 1_000_001 },
  ])(
    'grows the body to $bodyMm mm, the stamp to $radiusMm mm and the cut to $cellsPerMetre cells a metre at level $level',
    ({ level, bodyMm, radiusMm, cellsPerMetre }) => {
      expect(bodyWidthMmAt(level)).toBe(bodyMm)
      expect(boreRadiusMmAt(level)).toBe(radiusMm)
      expect(boreCellsPerMetreAt(level)).toBe(cellsPerMetre)
    },
  )

  it('cuts the bare bore at the bare level, so every rule without a width reads as before', () => {
    expect(boreRadiusMmAt(BARE_WIDTH_LEVEL)).toBe(drillStampRadiusMm())
    expect(casingRingLagMmAt(BARE_WIDTH_LEVEL)).toBe(casingRingLagMm())
    for (let aim = 0; aim < AIM_STEPS_PER_TURN; aim++) {
      expect(boreRadiusMmAlongAt(aim, BARE_WIDTH_LEVEL)).toBe(drillStampRadiusMmAlong(aim))
    }
  })

  it('keeps the side clearance round the wider body at every aim and level', () => {
    for (const level of [1, 10, 1e6]) {
      const halfMm = bodyWidthMmAt(level) / 2
      for (let aim = 0; aim < AIM_STEPS_PER_TURN; aim++) {
        const { along, up } = aimDirectionOf(aim)
        const halfAcrossMm = (halfMm * (Math.abs(along) + Math.abs(up))) / 1024
        const clearMm = boreRadiusMmAlongAt(aim, level) - halfAcrossMm
        expect(clearMm).toBeGreaterThanOrEqual(DRILL_BORE_ROWS.sideClearanceMm)
        expect(clearMm).toBeLessThan(DRILL_BORE_ROWS.sideClearanceMm + 1)
      }
    }
  })

  it('widens the bore by the row’s step a level, with no cap', () => {
    const step = DRILL_BORE_ROWS.bodyWidthPerLevelMm
    expect(boreRadiusMmAt(2) - boreRadiusMmAt(1)).toBe(step / 2)
    expect(boreRadiusMmAt(1e6 + 1) - boreRadiusMmAt(1e6)).toBe(step / 2)
  })

  it('lays the ring a level’s widening further behind the stamp', () => {
    expect(casingRingLagMmAt(1)).toBe(1_100 + 1_100 + CASING_LINING_WIDTH_MM)
  })
})
