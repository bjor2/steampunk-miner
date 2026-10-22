import { describe, expect, it } from 'vitest'
import type { SidewaysBorePlanet } from '../systems/bot/sidewaysBores'
import { driveBoundLines, isDriveBoundPastBar } from './driveBoundReport'

// The drive-bound share of the bot's level legs (ticket 723): reported per planet, failing past
// half from planet 3 on.

function planetWith(planet: number, boreTicks: number, driveBoundTicks: number) {
  return { planet, boreTicks, driveBoundTicks }
}

function runOf(...planets: SidewaysBorePlanet[]) {
  return { worldSeed: 83921, run: { sidewaysBores: new Map(planets.map((p) => [p.planet, p])) } }
}

describe('drive-bound report (ticket 723)', () => {
  it('prints one line per planet, lowest first, with the share and the level-leg ticks', () => {
    const lines = driveBoundLines([runOf(planetWith(2, 400, 100), planetWith(1, 1000, 0))])
    expect(lines).toEqual([
      'seed 83921 · planet 1 · drive-bound 0.0% of 1000 level-leg bore ticks',
      'seed 83921 · planet 2 · drive-bound 25.0% of 400 level-leg bore ticks',
    ])
  })

  it('flags a planet past half drive-bound from planet 3 on, never before', () => {
    expect(isDriveBoundPastBar(planetWith(2, 100, 90))).toBe(false)
    expect(isDriveBoundPastBar(planetWith(3, 100, 50))).toBe(false)
    expect(isDriveBoundPastBar(planetWith(3, 100, 51))).toBe(true)
    expect(driveBoundLines([runOf(planetWith(4, 100, 60))])[0]).toContain(
      'fails the ticket 723 bar',
    )
  })

  it('reads a planet with no level-leg ticks as none drive-bound', () => {
    expect(isDriveBoundPastBar(planetWith(5, 0, 0))).toBe(false)
  })
})
