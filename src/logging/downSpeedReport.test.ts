import { describe, expect, it } from 'vitest'
import type { DownBorePlanet } from '../systems/bot/downBores'
import { downSpeedLines } from './downSpeedReport'

// The effective down speed of the bot's legs (#724): metres bored down over their seconds,
// reported per seed and planet.

function runOf(...planets: DownBorePlanet[]) {
  return { worldSeed: 83921, run: { downBores: new Map(planets.map((p) => [p.planet, p])) } }
}

describe('down speed report (#724)', () => {
  it('prints one line per planet, lowest first, with the speed, the metres and the ramp share', () => {
    const lines = downSpeedLines([
      runOf(
        { planet: 2, metres: 120, boreTicks: 600, gravityBoundTicks: 150 },
        { planet: 1, metres: 60, boreTicks: 1200, gravityBoundTicks: 0 },
      ),
    ])
    expect(lines).toEqual([
      'seed 83921 · planet 1 · effective down speed 3.00 m/s over 60 m · gravity ramp 0.0% of the bore time',
      'seed 83921 · planet 2 · effective down speed 12.00 m/s over 120 m · gravity ramp 25.0% of the bore time',
    ])
  })

  it('prints nothing for a run with no bores down', () => {
    expect(downSpeedLines([runOf()])).toEqual([])
  })
})
