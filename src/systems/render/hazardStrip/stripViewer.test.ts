import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../authority/authorityState'
import { ORE_RULES_VERSION, planetParamsFor, type PlanetParams } from '../../world/planetParams'
import { createStripViewer, writeStripViewer } from './stripViewer'

const PLAYER = 'p1'

function viewerOnPlanet(planetIndex: number, nose: { x: number; y: number }) {
  const state = createAuthorityState({ planetIndex, planetSeed: 83921, playerIds: [PLAYER] })
  const params = planetParamsFor(83921, planetIndex)
  return writeStripViewer(createStripViewer(), state, PLAYER, params, nose)
}

describe('strip viewer', () => {
  it('opens ore pips only from the planet scanner_station unlocks on, 14', () => {
    expect(viewerOnPlanet(13, { x: 0, y: 0 }).isScannerOpen).toBe(false)
    expect(viewerOnPlanet(14, { x: 0, y: 0 }).isScannerOpen).toBe(true)
  })

  it("reads the planet's top rarity lead: +2 on the legacy rows, +4 under the ore rules (ticket 445)", () => {
    const state = createAuthorityState({ planetIndex: 3, planetSeed: 83921, playerIds: [PLAYER] })
    const viewerOf = (params: PlanetParams) =>
      writeStripViewer(createStripViewer(), state, PLAYER, params, { x: 0, y: 0 }).topLead
    expect(viewerOf(planetParamsFor(83921, 3))).toBe(2)
    expect(viewerOf(planetParamsFor(83921, 3, ORE_RULES_VERSION))).toBe(4)
  })

  it('reads the band of the drill nose, and band 1 above the surface', () => {
    const params = planetParamsFor(83921, 1)
    expect(viewerOnPlanet(1, { x: 0.5, y: params.radiusTiles - 1 }).rigBand).toBe(1)
    expect(viewerOnPlanet(1, { x: 0.5, y: 20 }).rigBand).toBe(5)
    expect(viewerOnPlanet(1, { x: 0.5, y: params.radiusTiles + 5 }).rigBand).toBe(1)
  })
})
