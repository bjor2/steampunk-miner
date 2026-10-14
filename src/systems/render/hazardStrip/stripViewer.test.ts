import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../authority/authorityState'
import { planetParamsFor } from '../../world/planetParams'
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

  it('reads the band of the drill nose, and band 1 above the surface', () => {
    const params = planetParamsFor(83921, 1)
    expect(viewerOnPlanet(1, { x: 0.5, y: params.radiusTiles - 1 }).rigBand).toBe(1)
    expect(viewerOnPlanet(1, { x: 0.5, y: 20 }).rigBand).toBe(5)
    expect(viewerOnPlanet(1, { x: 0.5, y: params.radiusTiles + 5 }).rigBand).toBe(1)
  })
})
