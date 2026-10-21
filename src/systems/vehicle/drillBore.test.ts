import { describe, expect, it } from 'vitest'
import { BODY_HALF_SIZE_MM, DRILL_BORE_ROWS } from '../../constants/balance'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { casingRingLagMm, drillStampLiftMm, drillStampRadiusMm } from './drillBore'
import { WIDE_BORE_CLEARANCE_MM, withDrillSideClearance } from './drillBoreFixtures'

describe('drill bore', () => {
  it('cuts the body’s width plus the side clearance on each side', () => {
    const bodyWidthMm = VEHICLE_COLLIDER_SIZE * 1000
    const boreMm = 2 * drillStampRadiusMm()
    expect(boreMm).toBe(bodyWidthMm + 2 * DRILL_BORE_ROWS.sideClearanceMm)
    expect(BODY_HALF_SIZE_MM * 2).toBe(bodyWidthMm)
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
