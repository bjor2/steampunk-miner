import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { campaignIndex, planetIndexOfCampaign } from './campaignIndex'

const SYSTEM_ADVANCE = BigInt(ECONOMY.starMap.systemAdvance)

describe('star map campaign index', () => {
  it('is the planet index itself in system 1, so P1 onward keep their economy (#650 TD)', () => {
    const planets = [1n, 2n, 3n, 4n, 5n, 40n, 1000n, 2n ** 70n]
    expect(planets.map((planet) => campaignIndex(1n, planet))).toEqual(planets)
  })

  it('advances by the data advance from one system to the next (VS: g advancing by J)', () => {
    expect(campaignIndex(2n, 1n) - campaignIndex(1n, 1n)).toBe(SYSTEM_ADVANCE)
    expect(campaignIndex(10n, 7n) - campaignIndex(9n, 7n)).toBe(SYSTEM_ADVANCE)
  })

  it('rises with the planet inside every system', () => {
    expect(campaignIndex(3n, 5n) - campaignIndex(3n, 4n)).toBe(1n)
  })

  it('holds a system past the safe-integer range exactly', () => {
    const system = 10n ** 30n
    expect(campaignIndex(system, 1n)).toBe(1n + (system - 1n) * SYSTEM_ADVANCE)
  })

  it('refuses a system or a planet below 1', () => {
    expect(() => campaignIndex(0n, 1n)).toThrow(RangeError)
    expect(() => campaignIndex(1n, 0n)).toThrow(RangeError)
  })

  it('narrows to the safe-integer planet index and refuses one it would round', () => {
    expect(planetIndexOfCampaign(campaignIndex(1n, 5n))).toBe(5)
    expect(() => planetIndexOfCampaign(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError)
    expect(() => planetIndexOfCampaign(0n)).toThrow(RangeError)
  })
})
