import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { ECONOMY } from '../../../systems/economy/economy'
import { STANDARD_LINING_TYPE } from '../../../systems/economy/heatEconomy'
import type { ItemCtx } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { liningItemOf } from '../../../systems/registries/kernelItems'
import { describeItemCard } from './describeItemCard'
import { liningLinesOf } from './moduleEntries'

const CEMENT_GRADES = ECONOMY.casing.cementGrades.liningTypes
const CASED_LINE = "Cased: the ground around this lining won't collapse"

const casedLabelsOf = (liningType: string) =>
  liningLinesOf(liningType)
    .filter(({ label }) => label === 'Cased')
    .map(({ label, textOf }) => `${label}: ${textOf?.(0) ?? ''}`)

/** The card as the shop draws it on `planetIndex`, nothing bought. */
function shopCtxOnPlanet(planetIndex: number): ItemCtx {
  const view = itemSnapshotViewOf(
    createAuthorityState({ planetIndex, planetSeed: 83921, playerIds: ['p1'] }),
    'p1',
  )
  return { playerId: 'p1', planetIndex, level: 0, source: { kind: 'shop' }, view }
}

describe('descriptions: the lining cards (ticket 367)', () => {
  it('puts the Cased line on exactly the three casing_cement grades', () => {
    expect(CEMENT_GRADES).toEqual(['refractory', 'insulated', 'grounded'])
    for (const liningType of CEMENT_GRADES) expect(casedLabelsOf(liningType)).toEqual([CASED_LINE])
  })

  it("reads the refractory card's hover line from data, with no wording that lining is required (#676)", () => {
    const flavour = describeItemCard(liningItemOf('refractory'), shopCtxOnPlanet(7))?.flavour
    expect(flavour).toBe('Holds a shaft wall against collapse.')
    expect(flavour).not.toMatch(/required|needed|must|P7/i)
  })

  it('gives the standard lining no Cased line', () => {
    expect(casedLabelsOf(STANDARD_LINING_TYPE)).toEqual([])
  })

  it('draws the Cased line on the refractory lining card, words with no next', () => {
    const lines = describeItemCard(liningItemOf('refractory'), shopCtxOnPlanet(8))?.statLines ?? []
    expect(lines.find(({ label }) => label === 'Cased')).toEqual({
      label: 'Cased',
      kind: 'linearInt',
      now: "the ground around this lining won't collapse",
    })
  })
})
