import { describe, expect, it } from 'vitest'
import { RARITY_REVEAL_SECONDS } from '../constants/speciesReveal'
import { speciesRevealPresence } from './speciesRevealPresence'
import { createTerrainMaterial } from './terrainMaterial'
import { fitRarityRevealToClock, startRevealFlourish } from './terrainRarityReveal'

// The terrain's first-contact flourish (GD ruling on #698): a reveal raises its slot's rarity from
// the material's clock at that frame, once, and a material made after a reveal never replays it.

const REVEAL = { slot: 3, speciesId: 'probe-species', rarityLead: 2 }

describe('terrain rarity reveal (ticket 698)', () => {
  it('starts the slot met on the material clock of the next frame, and only once', () => {
    const material = createTerrainMaterial()
    fitRarityRevealToClock(material)
    material.uniforms.uTime.value = 5
    startRevealFlourish(REVEAL)
    fitRarityRevealToClock(material)
    material.uniforms.uTime.value = 6
    fitRarityRevealToClock(material)
    expect(material.uniforms.uRarityReveal.value.toArray()).toEqual([
      3,
      5,
      RARITY_REVEAL_SECONDS,
      0,
    ])
  })

  it('replays no flourish started before the material was made', () => {
    startRevealFlourish(REVEAL)
    const material = createTerrainMaterial()
    fitRarityRevealToClock(material)
    expect(material.uniforms.uRarityReveal.value.x).toBe(0)
  })

  it('counts each flourish and names the species of the last', () => {
    const fired = speciesRevealPresence.fired
    startRevealFlourish(REVEAL)
    expect(speciesRevealPresence).toMatchObject({
      fired: fired + 1,
      lastSlot: 3,
      lastSpeciesId: 'probe-species',
    })
  })
})
