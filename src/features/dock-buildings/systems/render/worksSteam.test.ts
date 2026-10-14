import { describe, expect, it } from 'vitest'
import { gantrySwayAt, WORKS_IDLE, type SteamVent } from './worksIdle'
import { ventRateAt, ventSprayOf } from './worksSteam'

const STEADY: SteamVent = {
  offsetM: [0, 0],
  dir: [0, 2],
  perSecond: 10,
  speed: 1,
  spreadRadians: 0.3,
  lifeSeconds: 2,
  puffSeconds: 0,
  puffShare: 1,
}
const PUFFING: SteamVent = {
  ...STEADY,
  offsetM: [0.7, -0.9],
  dir: [3, 4],
  puffSeconds: 2,
  puffShare: 1 / 4,
}

// The Works' stacks and gantry at idle (ticket 395).
describe('works steam and gantry', () => {
  it('vents from the stack top plus the vent’s offset, the way it blows as a unit vector', () => {
    const spray = ventSprayOf(PUFFING, [-4.6, 9.65])
    expect(spray.x).toBeCloseTo(-3.9, 9)
    expect(spray.y).toBeCloseTo(8.75, 9)
    expect([spray.dirX, spray.dirY]).toEqual([3 / 5, 4 / 5])
  })

  it('keeps a steady vent blowing and a puffing one only for its share of each cycle', () => {
    expect([0, 0.7, 13.3].map((seconds) => ventRateAt(STEADY, seconds))).toEqual([10, 10, 10])
    expect([0.1, 0.6, 2.2, 3.9].map((seconds) => ventRateAt(PUFFING, seconds))).toEqual([
      10, 0, 10, 0,
    ])
  })

  it('ships at least one vent on the stack the art names', () => {
    expect(WORKS_IDLE.steam.vents.length).toBeGreaterThan(0)
    expect(WORKS_IDLE.steam.vents[0].offsetM).toEqual([0, 0])
  })

  it('sways the gantry either side of its authored pose and back within one sway period', () => {
    const { swayRadians, swaySeconds } = WORKS_IDLE.gantry
    expect(gantrySwayAt(0)).toBe(0)
    expect(gantrySwayAt(swaySeconds / 4)).toBeCloseTo(swayRadians, 9)
    expect(gantrySwayAt((3 * swaySeconds) / 4)).toBeCloseTo(-swayRadians, 9)
  })
})
