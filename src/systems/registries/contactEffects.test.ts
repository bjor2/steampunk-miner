import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import {
  contactEffectOf,
  contactFactorBpOf,
  type ContactEffectRow,
  type ContactFactor,
} from './contactEffects'

// The contact-effect registry (ticket 848; the GD lock on #823 Q1, the HS's one generic registry):
// one row per hazard kind, every number behind the row's factor, and a tool's factor hook on top,
// the smallest applying, never stacked. Fake slices register, so no real slice is imported.

const BITE: ContactEffectRow = {
  id: 'hazards.spinecrystal',
  kind: 'spinecrystal',
  effect: 'bite',
  factorBp: 10000,
  hullShareBp: 200,
}
const PLAYER = 'p1'

function hazardSlice(rows: readonly ContactEffectRow[], factors: readonly ContactFactor[] = []) {
  const slice: SliceDefinition = {
    id: 'hazards',
    register: (r) => {
      rows.forEach((row) => r.contactEffect(row))
      factors.forEach((factor) => r.contactFactor(factor))
    },
  }
  return slice
}

function factorOf(id: string, kind: string, factorBp: number | null): ContactFactor {
  return { id: `hazards.${id}`, kind, factorBpOf: () => factorBp }
}

function aState(): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
}

describe('contact effects', () => {
  it("finds a hazard kind's row, and none for a kind no slice registered", () => {
    withRegistrations([hazardSlice([BITE])], () => {
      expect(contactEffectOf('spinecrystal')).toEqual(BITE)
      expect(contactEffectOf('rockfall')).toBeNull()
    })
  })

  it('refuses two rows for one kind at load', () => {
    const twin = { ...BITE, id: 'hazards.twin' }
    expect(() => withRegistrations([hazardSlice([BITE, twin])], () => null)).toThrow(
      /kind spinecrystal has more than one row/,
    )
  })

  it('applies the row factor with no hook answering', () => {
    withRegistrations([hazardSlice([{ ...BITE, factorBp: 4000 }])], () => {
      const row = contactEffectOf('spinecrystal') as ContactEffectRow
      expect(contactFactorBpOf(aState(), PLAYER, row)).toBe(4000)
    })
  })

  it('takes the smallest hook for the kind on top of the row, never their product', () => {
    const hooks = [
      factorOf('tongs', 'spinecrystal', 4000),
      factorOf('salve', 'spinecrystal', 7000),
      factorOf('idle', 'spinecrystal', null),
      factorOf('other', 'rockfall', 0),
    ]
    withRegistrations([hazardSlice([{ ...BITE, factorBp: 5000 }], hooks)], () => {
      const row = contactEffectOf('spinecrystal') as ContactEffectRow
      expect(contactFactorBpOf(aState(), PLAYER, row)).toBe(2000)
    })
  })

  it('holds a hook answer to 0 to the whole, so a hook never adds to a hazard', () => {
    withRegistrations([hazardSlice([BITE], [factorOf('boost', 'spinecrystal', 15000)])], () => {
      expect(contactFactorBpOf(aState(), PLAYER, BITE)).toBe(10000)
    })
  })
})
