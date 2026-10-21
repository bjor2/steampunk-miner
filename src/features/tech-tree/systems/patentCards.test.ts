import { describe, expect, it } from 'vitest'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import { LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, researchAll, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { markStepOf } from './markLadder'
import { markNodeIdOf } from './markNodes'
import { patentCardsOf, type PatentCard } from './patentCards'
import { markBearerOfItem, registeredTechTree } from './techTree'
import { affordabilityListOf } from './treeList'
import { treeScreenModelOf } from './treeScreenModel'

// The Patent Office (spec #678, ticket 687): the tech tree on the shared sheet, one card per node
// with gain text for the next Mark and the price greyed while the wallet is short.

const GRAPPLE = 'tech.mobility.grapple_winch'
const GRAPPLE_ITEM = 'power.grapple_winch'
const EVERYTHING = { search: '', filters: [] }

function cardsOn(planetIndex: number, money: string, researched: readonly string[] = []) {
  return withFixtureTree(() => {
    const session = sessionOnPlanet(planetIndex, '1e30')
    researchAll(session, researched)
    session.submit({ type: 'debug.setMoney', payload: { amount: money } })
    const tree = registeredTechTree()
    return patentCardsOf(treeScreenModelOf(session.state(), PLAYER, tree, EVERYTHING), tree)
  }, [LAB_FIXTURE_SLICE])
}

function cardOf(cards: readonly PatentCard[], nodeId: string): PatentCard {
  const card = cards.find((entry) => entry.nodeId === nodeId)
  if (card === undefined) throw new Error(`no card for ${nodeId}`)
  return card
}

describe('patent cards', () => {
  it('lists the nodes in the order the wallet reaches them, as the tree list does', () => {
    const ids = withFixtureTree(() => {
      const session = sessionOnPlanet(3, '5000')
      const tree = registeredTechTree()
      const model = treeScreenModelOf(session.state(), PLAYER, tree, EVERYTHING)
      return [patentCardsOf(model, tree), affordabilityListOf(model)] as const
    }, [LAB_FIXTURE_SLICE])
    expect(ids[0].map((card) => card.nodeId)).toEqual(ids[1].map((card) => card.id))
  })

  it('greys a node’s price while the wallet is short, and still researches it on a press', () => {
    const grapple = cardOf(cardsOn(3, '0'), GRAPPLE)
    expect(grapple).toMatchObject({ isMuted: true, researchNodeId: GRAPPLE })
    expect(grapple.priceText).not.toBeNull()
  })

  it('offers a researched item’s next Mark with the stat it steps as gain text', () => {
    const grapple = cardOf(cardsOn(3, '1e30', [GRAPPLE]), GRAPPLE)
    const ladder = withFixtureTree(() =>
      markBearerOfItem(registeredTechTree(), GRAPPLE_ITEM),
    )!.ladder
    const stepped = markStepOf(ladder, 2).stepped
    expect(grapple.researchNodeId).toBe(markNodeIdOf(GRAPPLE_ITEM, 2))
    expect(grapple.line).toMatch(
      new RegExp(`^Mk II: [+-][\\d.]+% ${stepped === 'magnitude' ? 'strength' : stepped}$`),
    )
    expect(grapple.isMuted).toBe(false)
  })

  it('reads a researched node without Marks as researched, with nothing left to press', () => {
    const cards = cardsOn(3, '1e30', [GRAPPLE])
    const done = cards.filter((card) => card.line === 'Researched')
    expect(done.every((card) => card.priceText === null && card.researchNodeId === null)).toBe(true)
  })

  it('keeps every title of the shipped tree to 3 words and every line to one of 12 words', () => {
    const session = sessionOnPlanet(40, '1e30')
    const tree = registeredTechTree()
    const cards = patentCardsOf(treeScreenModelOf(session.state(), PLAYER, tree, EVERYTHING), tree)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.filter((card) => wordCountOf(card.title) > 3).map((card) => card.title)).toEqual(
      [],
    )
    expect(cards.filter((card) => wordCountOf(card.line) > 12).map((card) => card.line)).toEqual([])
  })
})
