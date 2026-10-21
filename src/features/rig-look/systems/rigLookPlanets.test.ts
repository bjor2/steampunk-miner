import { describe, expect, it } from 'vitest'
import type { TrackLookRows } from './render/rigLookIndex'
import { stepPlanetMissesOf, stepPlanetProblemsOf, type TrackPurchase } from './rigLookPlanets'
import { RIG_LOOK_TABLE } from './rigLookTable'

const ENGINE: TrackLookRows = {
  track: 'engine',
  slot: 'chassis.drive',
  glowSlots: [['piston']],
  glowCap: 'rigBody',
  steps: [
    { from: 2, planet: 1, part: null, card: null, colour: '#d9a066', glows: [0.3] },
    { from: 18, planet: 5, part: null, card: null, colour: '#ff8c42', glows: [0.5] },
  ],
  tail: { delta: 1, palette: ['#ffd27a', '#8fffb0'], plating: ['bright', 'blued'], glow: [[0.6]] },
}

function planetsOf(track: string): (number | undefined)[] | undefined {
  return RIG_LOOK_TABLE.tracks
    .find((rows) => rows.track === track)
    ?.steps.map((step) => step.planet)
}

/** One engine purchase per entry: `[planet, toLevel]`. */
function enginePurchases(...made: [number, number][]): TrackPurchase[] {
  return made.map(([planet, toLevel]) => ({ track: 'engine', planet, toLevel }))
}

function withPlanets(...planets: (number | undefined)[]): TrackLookRows {
  return { ...ENGINE, steps: ENGINE.steps.map((step, at) => ({ ...step, planet: planets[at] })) }
}

describe('rig look step planets', () => {
  it("takes each step's planet from Systems' table, the planet left at its count", () => {
    expect(planetsOf('drill_tip')).toEqual([1, 2, 3, 5, 8])
    expect(planetsOf('cargo_hold')).toEqual([1, 5, 8])
    expect(planetsOf('engine')).toEqual([1, 5, 8])
    expect(planetsOf('boiler')).toEqual([1])
    expect(planetsOf('hull')).toEqual([1, 2, 3, 5, 8])
  })

  it("leaves #554's drill_power rows without planets", () => {
    expect(new Set(planetsOf('drill_power'))).toEqual(new Set([undefined]))
  })

  it('refuses planets that do not rise, so a track never steps twice on one planet', () => {
    expect(stepPlanetProblemsOf(withPlanets(1, 5))).toEqual([])
    expect(stepPlanetProblemsOf(withPlanets(5, 5))).toEqual(['step from 18: planet does not rise'])
    expect(stepPlanetProblemsOf(withPlanets(0, 5))).toEqual(['step from 2: planet is not from 1'])
  })

  it('refuses a planet on some steps but not all', () => {
    expect(stepPlanetProblemsOf(withPlanets(1, undefined))).toEqual([
      'names a planet on some steps, not all',
    ])
    expect(stepPlanetProblemsOf(withPlanets(undefined, undefined))).toEqual([])
  })

  it('passes a run that first shows each step on its planet or one either side', () => {
    expect(stepPlanetMissesOf(ENGINE, enginePurchases([1, 1], [1, 2], [4, 18]), 6)).toEqual([])
    expect(stepPlanetMissesOf(ENGINE, enginePurchases([2, 2], [6, 18]), 6)).toEqual([])
  })

  it('names a step that first shows more than one planet from its row', () => {
    expect(stepPlanetMissesOf(ENGINE, enginePurchases([1, 2], [3, 18]), 6)).toEqual([
      'engine: step from 18 (P5) first shows on P3',
    ])
  })

  it('reads where a step first shows from the first purchase that reaches its count', () => {
    const jumped = enginePurchases([1, 3], [5, 20], [9, 40])
    expect(stepPlanetMissesOf(ENGINE, jumped, 9)).toEqual([])
  })

  it('names a step never shown once the run finished the last planet it could show on', () => {
    const early = enginePurchases([1, 2])
    expect(stepPlanetMissesOf(ENGINE, early, 5)).toEqual([])
    expect(stepPlanetMissesOf(ENGINE, early, 6)).toEqual([
      "engine: step from 18 (P5) never shows by P6's core",
    ])
  })

  it('names a planet a track steps on twice', () => {
    const rows = withPlanets(1, 2)
    expect(stepPlanetMissesOf(rows, enginePurchases([2, 18]), 3)).toEqual([
      'engine: steps twice on P2',
    ])
  })

  it("counts only the track's own purchases", () => {
    const others: TrackPurchase[] = [{ track: 'hull', planet: 1, toLevel: 18 }]
    expect(stepPlanetMissesOf(ENGINE, [...others, ...enginePurchases([1, 2])], 5)).toEqual([])
  })
})
