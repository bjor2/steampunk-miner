import { describe, expect, it } from 'vitest'
import { bandOfTile } from '../world/planetGeometry'
import { coreDepthOf } from '../world/openedDepth'
import { freshPlanetParamsFor, radiusTilesUnder, type PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { depthDialOf, depthPermilleOf, depthScaleOf, type DepthScale } from './depthDial'

// Ticket 716 (Systems' line): the depth dial's fill is depth over R(p) from the #707 planet-row
// registry, and its band and core marks are the planet's data, never placed by hand. Checked on
// P1 to P10, past the rows at P41 and far out at P1e6.

const SEED = 20261022
const PLANETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 41, 1_000_000]
const DIAL_BANDS = [2, 3, 4, 5]

/** The shallowest depth on the dock column where the HUD's band readout reads `band` or deeper. */
function firstDepthInBand(params: PlanetParams, band: number): number {
  const surfaceRow = surfaceRowOfColumn(0, params.radiusTiles)
  let depth = 0
  while (bandOfTile(params, 0, surfaceRow - depth) < band) depth += 1
  return depth
}

function bandMarkDepthsOf(scale: DepthScale): number[] {
  return scale.marks.filter((mark) => mark.kind === 'band').map((mark) => mark.depthTiles)
}

describe('depth dial (ticket 716)', () => {
  it.each(PLANETS)('scales P%i by the planet row radius R(p)', (planet) => {
    const params = freshPlanetParamsFor(SEED, planet)
    const scale = depthScaleOf(params)
    expect(scale.radiusTiles).toBe(radiusTilesUnder(planet, params.oreRulesVersion))
    expect(scale.radiusTiles).toBe(params.radiusTiles)
  })

  it.each(PLANETS)('marks P%i where the band readout turns, from the planet data', (planet) => {
    const params = freshPlanetParamsFor(SEED, planet)
    const expected = DIAL_BANDS.map((band) => firstDepthInBand(params, band))
    expect(bandMarkDepthsOf(depthScaleOf(params))).toEqual(expected)
  })

  it.each(PLANETS)('marks the core of P%i at its top tile on the dock column', (planet) => {
    const params = freshPlanetParamsFor(SEED, planet)
    const core = depthScaleOf(params).marks.filter((mark) => mark.kind === 'core')
    expect(core).toEqual([{ kind: 'core', depthTiles: coreDepthOf(params) }])
  })

  it.each(PLANETS)('lays the marks of P%i from the surface down to the core', (planet) => {
    const marks = depthScaleOf(freshPlanetParamsFor(SEED, planet)).marks.map((m) => m.depthTiles)
    expect(marks).toEqual([...marks].sort((a, b) => a - b))
    expect(marks[0]).toBeGreaterThan(0)
  })

  it('fills the needle as depth over R(p), cut toward zero', () => {
    const params = freshPlanetParamsFor(SEED, 41)
    const scale = depthScaleOf(params)
    const depth = coreDepthOf(params)
    expect(depthDialOf(depth, scale).needlePermille).toBe(
      Math.floor((depth * 1000) / params.radiusTiles),
    )
    expect(depthDialOf(0, scale).needlePermille).toBe(0)
  })

  it('meets the core mark when the rig reaches the core', () => {
    const params = freshPlanetParamsFor(SEED, 1_000_000)
    const dial = depthDialOf(coreDepthOf(params), depthScaleOf(params))
    const core = dial.markers.find((marker) => marker.kind === 'core')
    expect(core?.permille).toBe(dial.needlePermille)
  })

  it('holds the needle to the dial past the radius and rests it with no planet', () => {
    expect(depthPermilleOf(5000, 300)).toBe(1000)
    expect(depthPermilleOf(-3, 300)).toBe(0)
    expect(depthDialOf(120, null)).toEqual({ needlePermille: 0, markers: [] })
  })
})
