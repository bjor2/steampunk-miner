import { describe, expect, it } from 'vitest'
import { cmp } from '../../../systems/money'
import { PLAYER, researchAll, sessionOnPlanet } from '../treeTestSession'
import type { NodeCardModel, NodeStatus } from './nodeCardModel'
import { registeredTechTree } from './techTree'
import { affordabilityListOf, nextAffordableNodeIdOf } from './treeList'
import { treeScreenModelOf, type TreeQuery } from './treeScreenModel'

const EVERYTHING: TreeQuery = { search: '', filters: [] }

const STATUS_ORDER: readonly NodeStatus[] = ['affordable', 'available', 'locked', 'researched']

function listOn(planetIndex: number, money: string, researched: readonly string[] = []) {
  const session = sessionOnPlanet(planetIndex, money)
  researchAll(session, researched)
  const model = treeScreenModelOf(session.state(), PLAYER, registeredTechTree(), EVERYTHING)
  return { model, list: affordabilityListOf(model) }
}

function isInOrder(before: NodeCardModel, after: NodeCardModel): boolean {
  const rank = STATUS_ORDER.indexOf(after.status) - STATUS_ORDER.indexOf(before.status)
  return rank > 0 || (rank === 0 && cmp(before.cost, after.cost) <= 0)
}

/** The cheapest researchable node on planet 3, bought so the list holds a researched one too. */
function firstAffordableOn(planetIndex: number, money: string): string {
  return listOn(planetIndex, money).list[0].id
}

describe('tech tree list sorted by affordability', () => {
  it('lists every node the map shows, each once', () => {
    const { model, list } = listOn(3, '1e6')
    const shown = model.lanes.flatMap((lane) => lane.nodes.map((node) => node.id))
    expect(list.map((card) => card.id).sort()).toEqual([...shown].sort())
    expect(new Set(list.map((card) => card.id)).size).toBe(list.length)
  })

  it('puts researchable nodes first, then those the wallet is short for, then locked, then researched, cheapest first in each', () => {
    const { list } = listOn(3, '1e4', [firstAffordableOn(3, '1e4')])
    const statuses = new Set(list.map((card) => card.status))
    expect([...statuses].sort()).toEqual([...STATUS_ORDER].sort())
    const outOfOrder = list.slice(1).filter((card, index) => !isInOrder(list[index], card))
    expect(outOfOrder.map((card) => card.id)).toEqual([])
  })
})

describe('tech tree next affordable', () => {
  it('picks the cheapest researchable node first, then the next one, then round to the first', () => {
    const { list } = listOn(3, '1e4')
    const affordable = list.filter((card) => card.status === 'affordable').map((card) => card.id)
    expect(affordable.length).toBeGreaterThan(1)
    expect(nextAffordableNodeIdOf(list, null)).toBe(affordable[0])
    expect(nextAffordableNodeIdOf(list, affordable[0])).toBe(affordable[1])
    expect(nextAffordableNodeIdOf(list, affordable.at(-1)!)).toBe(affordable[0])
  })

  it('starts from the first researchable node when the picked node is not one', () => {
    const { list } = listOn(3, '1e4')
    const locked = list.find((card) => card.status === 'locked')!
    expect(nextAffordableNodeIdOf(list, locked.id)).toBe(list[0].id)
  })

  it('has none to pick while the wallet reaches no node', () => {
    const { list } = listOn(3, '0')
    expect(list.some((card) => card.status === 'affordable')).toBe(false)
    expect(nextAffordableNodeIdOf(list, null)).toBeNull()
  })
})
