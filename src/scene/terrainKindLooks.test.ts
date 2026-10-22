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

// The look table's one writer (ticket 450): a fresh save draws every species' skin with no rarity
// (ticket 698), the debug switch shows every kind's rarity, and an unchanged frame rewrites nothing.

const SEED = 83921

function shownSlots(): number[] {
  const read = readDrawnKindLooks()
  return read.ok ? read.looks.shown.map((look) => look.slot) : []
}

function shownLeads(): number[] {
  const read = readDrawnKindLooks()
  return read.ok ? read.looks.shown.map((look) => look.rarityLead) : []
}

describe('terrain kind looks', () => {
  beforeEach(() => resetGameStore())
  afterEach(() => showSeenKindLooksOnly())

  it('draws every species of a fresh save in its own skin with no rarity (ticket 698)', () => {
    const material = createTerrainMaterial()
    fitKindLooksToViewer(material, freshPlanetParamsFor(SEED, 1))
    expect(shownSlots().length).toBeGreaterThan(1)
    expect(new Set(shownLeads())).toEqual(new Set([0]))
    expect(material.uniforms.uKindLooks.value[0].x).toBeGreaterThan(0)
  })

  it('shows the rarity of every kind once the debug switch asks for it, and stops after', () => {
    const material = createTerrainMaterial()
    const params = freshPlanetParamsFor(SEED, 1)
    showEveryKindLook()
    fitKindLooksToViewer(material, params)
    const skins = material.uniforms.uKindLooks.value.map((look: { x: number }) => look.x)
    expect(Math.max(...shownLeads())).toBeGreaterThan(0)
    showSeenKindLooksOnly()
    fitKindLooksToViewer(material, params)
    expect(new Set(shownLeads())).toEqual(new Set([0]))
    expect(material.uniforms.uKindLooks.value.map((look: { x: number }) => look.x)).toEqual(skins)
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
