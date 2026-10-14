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

describe('descriptions: the lining cards (ticket 367)', () => {
  it('puts the Cased line on exactly the three casing_cement grades', () => {
    expect(CEMENT_GRADES).toEqual(['refractory', 'insulated', 'grounded'])
    for (const liningType of CEMENT_GRADES) expect(casedLabelsOf(liningType)).toEqual([CASED_LINE])
  })

  it('gives the standard lining no Cased line', () => {
    expect(casedLabelsOf(STANDARD_LINING_TYPE)).toEqual([])
  })

  it('draws the Cased line on the refractory lining card, words with no next', () => {
    const view = itemSnapshotViewOf(
      createAuthorityState({ planetIndex: 8, planetSeed: 83921, playerIds: ['p1'] }),
      'p1',
    )
    const ctx: ItemCtx = {
      playerId: 'p1',
      planetIndex: 8,
      level: 0,
      source: { kind: 'shop' },
      view,
    }
    const lines = describeItemCard(liningItemOf('refractory'), ctx)?.statLines ?? []
    expect(lines.find(({ label }) => label === 'Cased')).toEqual({
      label: 'Cased',
      kind: 'linearInt',
      now: "the ground around this lining won't collapse",
    })
  })
})
