import { describe, expect, it } from 'vitest'
import type { HeldArtefact } from '../authority/heldArtefact'
import { isCacheLive, isOreWhispering } from './artefactLook'

const holding = (id: HeldArtefact['id']): HeldArtefact => ({
  id,
  fromPlanet: 1,
  breathingRoomCharges: 0,
})

describe('artefact look (#46)', () => {
  it('whispers ore only with ore_whisper held and the vehicle undocked', () => {
    expect(isOreWhispering(holding('artefact.ore_whisper'), 'active')).toBe(true)
    expect(isOreWhispering(holding('artefact.ore_whisper'), 'stranded')).toBe(true)
    expect(isOreWhispering(holding('artefact.ore_whisper'), 'docked')).toBe(false)
    expect(isOreWhispering(holding('artefact.assay_beacon'), 'active')).toBe(false)
    expect(isOreWhispering(null, 'active')).toBe(false)
  })

  it('draws the cache live while nothing is held and as a husk on every planet after', () => {
    expect(isCacheLive(null, 2)).toBe(true)
    expect(isCacheLive(holding('artefact.assay_beacon'), 1)).toBe(false)
    expect(isCacheLive(holding('artefact.assay_beacon'), 2)).toBe(false)
  })
})
