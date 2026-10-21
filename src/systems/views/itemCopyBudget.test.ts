import { describe, expect, it } from 'vitest'
import { TITLE_WORDS_MAX, TOOLTIP_LINE_WORDS_MAX } from '../../constants/uiParts'
import { createAuthorityState } from '../authority/authorityState'
import { listBuyableRefs } from '../registries/buyableRefs'
import { CONTENT_REGISTRY, type ContentRegistration } from '../registries/content'
import { describeItem, type ItemRef } from '../registries/itemDescriber'
import { itemSnapshotViewOf } from '../registries/itemSnapshotView'
import { entriesOf } from '../registries/seal'
import { DESIGN_TOKENS } from './designSystem'
import {
  contentItemCopyOf,
  describedItemCopyOf,
  itemCopyProblemsOf,
  type ItemCopy,
} from './itemCopyBudget'
import { itemCardIdOf } from './itemCardModel'

// Progression's copy audit (spec #678 GD lock, ticket 680): every item title in data is at most
// three words and every hover line at most twelve, on the loaded slices, so a new item or a longer
// line fails here before a screen draws it.

/** Generated refs reach this far, as the description coverage walks them (TD on #155). */
const LAST_PLANET = 100

const TWELVE_WORDS = 'A brass lattice locks the rock in place while you hold it.'

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

function copyOf(title: string | null, hoverLines: readonly string[]): ItemCopy {
  return { id: 'demo.clamp', title, hoverLines }
}

function describedCopiesUpTo(planetIndex: number): ItemCopy[] {
  return listBuyableRefs(planetIndex).flatMap(describedCopyOf)
}

function describedCopyOf(ref: ItemRef): ItemCopy[] {
  const ctx = { playerId: 'p1', planetIndex: 1, level: ref.grade ?? 1, view }
  const description = describeItem(ref, ctx)
  return description === null ? [] : [describedItemCopyOf(itemCardIdOf(ref), description)]
}

describe('item copy budget', () => {
  it('keeps the budgets the design tokens set', () => {
    expect(TITLE_WORDS_MAX).toBe(DESIGN_TOKENS.copy.titleWordsMax)
    expect(TOOLTIP_LINE_WORDS_MAX).toBe(DESIGN_TOKENS.copy.hoverWordsMax)
  })

  it('passes a three-word title and a twelve-word hover line', () => {
    expect(itemCopyProblemsOf(copyOf('Lode clamp lattice', [TWELVE_WORDS]))).toEqual([])
  })

  it('fails a title over three words', () => {
    expect(itemCopyProblemsOf(copyOf('The great lode clamp', []))).toEqual([
      'demo.clamp: the title "The great lode clamp" has 4 words, over 3',
    ])
  })

  it('fails a hover line over twelve words', () => {
    const long = 'A brass lattice that locks the rock in place while you hold it.'
    expect(itemCopyProblemsOf(copyOf(null, [long]))).toEqual([
      `demo.clamp: the hover line "${long}" has 13 words, over 12`,
    ])
  })

  it("reads a content entry's name, description and card notes", () => {
    const entry = {
      id: 'demo.clamp',
      iconId: 'icon',
      name: 'Lode clamp',
      description: 'Holds.',
      cardNotes: ['Does not stack.'],
    }
    const registration: ContentRegistration = { id: entry.id, kind: 'tech-node', entry }
    expect(contentItemCopyOf(registration)).toEqual({
      id: 'tech-node:demo.clamp',
      title: 'Lode clamp',
      hoverLines: ['Holds.', 'Does not stack.'],
    })
  })

  it('holds every registered content title and hover line to budget', () => {
    const copies = entriesOf(CONTENT_REGISTRY).map(contentItemCopyOf)
    expect(copies.filter((copy) => copy.title !== null).length).toBeGreaterThan(0)
    expect(copies.flatMap(itemCopyProblemsOf)).toEqual([])
  })

  it('holds the flavour of every buyable card up to planet 100 to budget', () => {
    const copies = describedCopiesUpTo(LAST_PLANET)
    expect(copies.length).toBeGreaterThan(0)
    expect(copies.flatMap(itemCopyProblemsOf)).toEqual([])
  })
})
