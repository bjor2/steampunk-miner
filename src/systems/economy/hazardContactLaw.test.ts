import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import { arcShareBp, hazardHitBp, hazardHullOf } from './hazardContactLaw'
import { onCurveSteps, vehicleStatsAt } from './vehicleStats'

// Crush, bite and scald on the hull law at g (ticket 848; the GD lock on #823 Q1, the VS's input
// 6388806602): a share of the planet's on-curve hull weighed by enemy contact's arc multipliers,
// never V(t), and a dive's hazard hits held to the row's cap.

describe('hazard contact law', () => {
  it('weighs a frontal hit at a quarter, a side hit whole and a rear hit double', () => {
    expect([arcShareBp('front'), arcShareBp('side'), arcShareBp('rear')]).toEqual([
      2500, 10000, 20000,
    ])
    expect(hazardHitBp(200, 'front', 0, 2500)).toBe(50)
    expect(hazardHitBp(200, 'side', 0, 2500)).toBe(200)
    expect(hazardHitBp(200, 'rear', 0, 2500)).toBe(400)
  })

  it('never takes more than the dive cap leaves', () => {
    expect(hazardHitBp(300, 'rear', 2300, 2500)).toBe(200)
    expect(hazardHitBp(300, 'rear', 2500, 2500)).toBe(0)
  })

  it('scales with the on-curve hull at g, never with ore value', () => {
    const hullAt = (g: number) => vehicleStatsAt(onCurveSteps(g)).hullMax
    expect(toCanonical(hullAt(1))).toBe('1.2544e+2')
    expect(toCanonical(hazardHullOf(1, 50))).toBe('6.272e-1')
    expect(toCanonical(hazardHullOf(1, 600))).toBe('7.5264e+0')
  })

  it('stays the same share of the on-curve hull at g = 1e6', () => {
    expect(toCanonical(hazardHullOf(1_000_000, 50))).toBe(
      '4.346293029268995487071052412530411908486e+295307',
    )
    expect(toCanonical(hazardHullOf(1_000_000, 600))).toBe(
      '5.215551635122794584485262895036494290184e+295308',
    )
  })
})
