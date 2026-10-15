import { describe, expect, it } from 'vitest'
import { kindOfBodySpeedTick, summariseBodySpeed, type BodySpeedTick } from './bodySpeedDips'

const COMMANDED = 78.24

/** A tick commanded at the 78 m/s rig's `vCut`, with an open slab unless `tick` says otherwise. */
function tickOf(tick: Partial<BodySpeedTick>): BodySpeedTick {
  return { commanded: COMMANDED, speed: COMMANDED, slabSolidBefore: 0, slabSolidAfter: 0, ...tick }
}

describe('body speed dips (ticket 440)', () => {
  it('holds a tick within 5% short of the commanded speed, whatever the ground', () => {
    const near = tickOf({ speed: COMMANDED * 0.96, slabSolidBefore: 4, slabSolidAfter: 4 })
    expect(kindOfBodySpeedTick(near)).toBe('held')
  })

  it('blames the stale halo for a dip into ground the tick’s own cut opened', () => {
    const dip = tickOf({ speed: 57.6, slabSolidBefore: 6, slabSolidAfter: 0 })
    expect(kindOfBodySpeedTick(dip)).toBe('staleHalo')
  })

  it('blames uncut ground for a dip into ground still standing after the cut', () => {
    const dip = tickOf({ speed: 30, slabSolidBefore: 6, slabSolidAfter: 2 })
    expect(kindOfBodySpeedTick(dip)).toBe('uncutGround')
  })

  it('leaves a dip through a slab open before and after the cut unexplained', () => {
    expect(kindOfBodySpeedTick(tickOf({ speed: 40 }))).toBe('unexplained')
  })

  it('counts a leg’s dips by cause, with the lowest share of the commanded speed moved', () => {
    const leg = [
      tickOf({}),
      tickOf({ speed: 57.6, slabSolidBefore: 6 }),
      tickOf({}),
      tickOf({ speed: 39.12, slabSolidBefore: 3, slabSolidAfter: 3 }),
      tickOf({ speed: 70 }),
    ]
    expect(summariseBodySpeed(leg)).toEqual({
      ticks: 5,
      dips: 3,
      staleHalo: 1,
      uncutGround: 1,
      unexplained: 1,
      lowestShare: 0.5,
    })
  })

  it('reports a share of 1 for a leg with no cut ticks', () => {
    expect(summariseBodySpeed([]).lowestShare).toBe(1)
  })
})
