import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readDrawnKindLooks,
  showEveryKindLook,
  showSeenKindLooksOnly,
} from '../debug/debugKindLooks'
import { resetGameStore } from '../store/gameStore'
import { freshPlanetParamsFor, planetParamsFor } from '../systems/world/planetParams'
import { kindLookPresence } from './kindLookPresence'
import { createTerrainMaterial } from './terrainMaterial'
import { fitKindLooksToViewer } from './terrainKindLooks'

// The look table's one writer (ticket 450): a fresh save shows no species, the debug switch shows
// every kind of the planet, and an unchanged frame rewrites nothing.

const SEED = 83921

function shownSlots(): number[] {
  const read = readDrawnKindLooks()
  return read.ok ? read.looks.shown.map((look) => look.slot) : []
}

describe('terrain kind looks', () => {
  beforeEach(() => resetGameStore())
  afterEach(() => showSeenKindLooksOnly())

  it('shows no species on a fresh save, so every kind draws its family look', () => {
    fitKindLooksToViewer(createTerrainMaterial(), freshPlanetParamsFor(SEED, 1))
    expect(shownSlots()).toEqual([])
  })

  it('shows every kind of the planet once the debug switch asks for it, and stops after', () => {
    const material = createTerrainMaterial()
    const params = freshPlanetParamsFor(SEED, 1)
    showEveryKindLook()
    fitKindLooksToViewer(material, params)
    expect(shownSlots().length).toBeGreaterThan(1)
    expect(material.uniforms.uKindLooks.value[0].x).toBeGreaterThan(0)
    showSeenKindLooksOnly()
    fitKindLooksToViewer(material, params)
    expect(shownSlots()).toEqual([])
    expect(material.uniforms.uKindLooks.value[0].x).toBe(0)
  })

  it('rewrites nothing on a frame where the planet and the sightings are unchanged', () => {
    const material = createTerrainMaterial()
    const params = freshPlanetParamsFor(SEED, 1)
    fitKindLooksToViewer(material, params)
    const written = kindLookPresence.table
    fitKindLooksToViewer(material, params)
    expect(kindLookPresence.table).toBe(written)
  })

  it('draws a planet with no roster with an empty table even when every kind is shown', () => {
    showEveryKindLook()
    fitKindLooksToViewer(createTerrainMaterial(), planetParamsFor(SEED, 1))
    expect(shownSlots()).toEqual([])
  })
})
