import { describe, expect, it } from 'vitest'
import {
  BODY_HALF_SIZE_MM,
  CASING_LINING_WIDTH_MM,
  DRILL_BORE_ROWS,
  DRILL_SIDE_CLEARANCE_RANGE_MM,
} from '../../constants/balance'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { casingRingAround } from '../world/casingLining'
import { casingRingLagMm, drillStampLiftMm, drillStampRadiusMm } from './drillBore'
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
