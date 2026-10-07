import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import {
  describeItem,
  ITEM_DESCRIBER_REGISTRY,
  type ItemRef,
} from '../../../systems/registries/itemDescriber'
import {
  ITEM_DESCRIPTION_ENTRY_REGISTRY,
  type ItemDescriptionEntry,
} from '../../../systems/registries/itemDescriptionEntries'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { addToRegistry, entriesOf, withFreshRegistrySet } from '../../../systems/registries/seal'
import { milestonesOf } from './markMilestones'
import {
  MILESTONE_LINE_LABEL,
  milestoneLineSpecsOf,
  NO_MILESTONE_AHEAD_TEXT,
} from './milestoneCardLine'
import type { MarkLadder } from './techNode'

// The #164 item card with a Mark milestone line (the GD lock on #256), drawn by the one describer
// the loaded slices registered, for a fixture boost whose lane authored all three verbs.

const BOOST: ItemRef = { kind: 'vehicle-item', id: 'power.steam_boost' }

const BOOST_LADDER: MarkLadder = {
  isIncomeItem: false,
  cooldown: 240,
  magnitude: { base: 30 },
  charges: 3,
  milestones: milestonesOf('charged', {
    secondTap: 'a sideways air-dash',
    hold: 'a longer burn',
    siblingLink: {
      verb: 'fires the ballast at half lift',
      siblingId: 'consumable.emergency_ballast',
    },
  }),
}

function boostEntryOf(ladder: MarkLadder): ItemDescriptionEntry {
  return {
    id: 'tech-tree.fixture_boost',
    matches: { kind: BOOST.kind, id: BOOST.id },
    flavour: 'A burst of steam.',
    statLines: milestoneLineSpecsOf(ladder),
  }
}

/** The card's lines for the boost at a researched Mark, from the registered describer. */
function cardLinesAt(ladder: MarkLadder, level: number) {
  const [describer] = entriesOf(ITEM_DESCRIBER_REGISTRY)
  const state = createAuthorityState({ planetIndex: 2, planetSeed: 83921, playerIds: ['p1'] })
  const ctx = { playerId: 'p1', planetIndex: 2, level, view: itemSnapshotViewOf(state, 'p1') }
  return withFreshRegistrySet(
    () => {
      addToRegistry(ITEM_DESCRIBER_REGISTRY, 'descriptions', describer)
      addToRegistry(ITEM_DESCRIPTION_ENTRY_REGISTRY, 'tech-tree', boostEntryOf(ladder))
    },
    () => describeItem(BOOST, ctx)?.statLines ?? [],
  )
}

describe('item describer: Mark milestones', () => {
  it('the card shows the next milestone verb in one line', () => {
    expect(cardLinesAt(BOOST_LADDER, 1)).toEqual([
      {
        label: MILESTONE_LINE_LABEL,
        kind: 'linearInt',
        now: 'Mk III, tap twice: a sideways air-dash',
      },
    ])
    expect(cardLinesAt(BOOST_LADDER, 3)[0].now).toBe('Mk VI, hold: a longer burn')
    expect(cardLinesAt(BOOST_LADDER, 8)[0].now).toBe('Mk IX, link: fires the ballast at half lift')
  })

  it('says every milestone is reached once Mark 9 is researched', () => {
    expect(cardLinesAt(BOOST_LADDER, 9)[0].now).toBe(NO_MILESTONE_AHEAD_TEXT)
  })

  it('adds no line for an item without milestones, so its card is unchanged', () => {
    expect(cardLinesAt({ ...BOOST_LADDER, milestones: undefined }, 1)).toEqual([])
  })
})
