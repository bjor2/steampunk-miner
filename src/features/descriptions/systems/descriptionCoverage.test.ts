import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { listBuyableRefs } from '../../../systems/registries/buyableRefs'
import type { ItemDescription, ItemRef } from '../../../systems/registries/itemDescriber'
import { ITEM_DESCRIPTION_ENTRY_REGISTRY } from '../../../systems/registries/itemDescriptionEntries'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { entriesOf } from '../../../systems/registries/seal'
import { describeItemCard, flavourOf } from './describeItemCard'
import { COVERAGE_MAX_PLANET, descriptionCoverageProblems } from './descriptionCoverage'
import { flavourProblemsOf } from './flavourRules'

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

function describeOnPlanetOne(ref: ItemRef): ItemDescription | null {
  return describeItemCard(ref, { playerId: 'p1', planetIndex: 1, level: ref.grade ?? 1, view })
}

const DRILL: ItemRef = { kind: 'track', id: 'drill_power' }
const TIP: ItemRef = { kind: 'track', id: 'drill_tip' }
const CARD: ItemDescription = { flavour: 'A brass bit.', statLines: [] }

describe('description coverage', () => {
  it('gives every buyable up to planet 100 a flavour line and at least one stat line', () => {
    const refs = listBuyableRefs(COVERAGE_MAX_PLANET)
    expect(descriptionCoverageProblems(refs, describeOnPlanetOne)).toEqual([])
  })

  it('fails a buyable with no description', () => {
    expect(descriptionCoverageProblems([DRILL], () => null, [])).toEqual([
      'buyable "track:drill_power" has no description',
    ])
  })

  it('fails a description with no stat line', () => {
    expect(descriptionCoverageProblems([DRILL], () => CARD, [])).toHaveLength(1)
  })

  it('lets an allowlisted gap pass and asks for it to leave the list once described', () => {
    const describeTipOnly = (ref: ItemRef) =>
      ref.id === 'drill_tip' ? describeOnPlanetOne(ref) : null
    const allowlist = ['track:drill_power', 'track:drill_tip']
    expect(descriptionCoverageProblems([DRILL, TIP], describeTipOnly, allowlist)).toEqual([
      'buyable "track:drill_tip" is described now: take it off the allowlist',
    ])
  })

  it('keeps every registered entry’s flavour inside the copy rules', () => {
    const refs = listBuyableRefs(COVERAGE_MAX_PLANET)
    const problems = entriesOf(ITEM_DESCRIPTION_ENTRY_REGISTRY).flatMap((entry) =>
      refs
        .filter((ref) => entry.matches.kind === ref.kind)
        .flatMap((ref) => flavourProblemsOf(flavourOf(entry, ref)).map((p) => `${entry.id}: ${p}`)),
    )
    expect(problems).toEqual([])
  })
})
