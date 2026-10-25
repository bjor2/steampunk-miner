import { describe, expect, it } from 'vitest'
import { contactEffectOf } from '../../../systems/registries/contactEffects'

// The four #651 hazards are rows of the kernel's contact-effect registry (ticket 848), read from
// the planet registry's kind table at full factor.

describe('hazard contact rows', () => {
  it('registers one row per hazard kind of the planet registry, each at full factor', () => {
    expect(contactEffectOf('rockfall')).toEqual({
      id: 'ores.rockfall',
      kind: 'rockfall',
      effect: 'refill',
      diveHullCapBp: 2500,
      factorBp: 10000,
      refillShareBp: 10000,
      hullShareBp: 300,
    })
    expect(contactEffectOf('firedamp')?.effect).toBe('drain')
    expect(contactEffectOf('spinecrystal')?.effect).toBe('bite')
    expect(contactEffectOf('steamvent')?.effect).toBe('shove')
  })
})
