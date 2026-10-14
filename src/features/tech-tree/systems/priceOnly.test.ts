import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleItemBuyRefusal } from '../../../systems/authority/vehicleItemRules'
import { toCanonical } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { PLAYER, research, sessionOnPlanet } from '../treeTestSession'
import { nodeCost } from './nodeCost'
import { registeredTechTree, researchFrontierOf, type TechTree } from './techTree'
import type { TreeNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { treeScreenModelOf } from './treeScreenModel'
import { availableNodes, researchRefusalOf, unlockRefusalOf } from './unlockRules'

// Bjor's ruling on #411: the tree is gated by money alone. The shipped tree, as the slices
// register it, answers a player on planet 1 exactly as one on planet 200: the same refusal, the
// same price and the same screen, so the host's answer reads no player's planet.

const FAR_PLANET = 200
const RICH = '1e300'
const EVERYTHING = { search: '', filters: [] } as const

/** The reasons a node stays shut once the money is there: none of them is a planet. */
const NON_PLANET_REFUSALS = ['fork_branch', 'not_owned', 'held_feature', 'already_unlocked']

function stateOn(planetIndex: number, nodeIds: readonly string[], money = RICH): AuthorityState {
  const session = sessionOnPlanet(planetIndex, money)
  nodeIds.forEach((nodeId) => research(session, nodeId))
  return session.state()
}

/** Researches every authored node it can on `planetIndex`, round after round, until none is left. */
function researchEverythingOn(tree: TechTree, planetIndex = 1): AuthorityState {
  const session = sessionOnPlanet(planetIndex, RICH)
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  for (let open = authoredOpen(session.state(), tree); open.length > 0;) {
    open.forEach((node) => research(session, node.id))
    open = authoredOpen(session.state(), tree)
  }
  return session.state()
}

function authoredOpen(state: AuthorityState, tree: TechTree): TreeNode[] {
  const authored = new Set(tree.authored.map((node) => node.id))
  return availableNodes(state, PLAYER, tree).filter((node) => authored.has(node.id))
}

function frontierOf(state: AuthorityState, tree: TechTree): TreeNode[] {
  return researchFrontierOf(tree, new Set(unlockedNodeIdsOf(state, PLAYER)))
}

describe('tech tree: price only (#411)', () => {
  it('refuses every node of the shipped tree alike on planet 1 and planet 200', () => {
    const tree = registeredTechTree()
    const researched = [tree.authored[0].id]
    const near = stateOn(1, researched)
    const far = stateOn(FAR_PLANET, researched)
    const answersOn = (state: AuthorityState) =>
      frontierOf(state, tree).map((node) => [node.id, unlockRefusalOf(state, PLAYER, node.id)])
    expect(answersOn(near)).toEqual(answersOn(far))
  })

  it('refuses a short wallet on planet 1 with money_short, and nothing for a planet', () => {
    const tree = registeredTechTree()
    const broke = stateOn(1, [], '0')
    const reasons = tree.authored.map((node) => unlockRefusalOf(broke, PLAYER, node.id))
    const known = ['money_short', 'missing_prereq', ...NON_PLANET_REFUSALS]
    expect(reasons).toContain('money_short')
    expect(reasons.filter((reason) => !known.includes(reason ?? ''))).toEqual([])
  })

  it('prices every frontier node the same whatever planet the player stands on', () => {
    const tree = registeredTechTree()
    const state = stateOn(1, [])
    const pricesOn = (onState: AuthorityState) =>
      frontierOf(onState, tree).map((node) => toCanonical(nodeCost(node)))
    expect(pricesOn(stateOn(FAR_PLANET, []))).toEqual(pricesOn(state))
  })

  it('draws the same tree screen on planet 1 and planet 200 but for the ruler', () => {
    const tree = registeredTechTree()
    const near = treeScreenModelOf(stateOn(1, []), PLAYER, tree, EVERYTHING)
    const far = treeScreenModelOf(stateOn(FAR_PLANET, []), PLAYER, tree, EVERYTHING)
    expect(near.lanes).toEqual(far.lanes)
    expect(near.nextUp).toEqual(far.nextUp)
  })

  it('researches on planet 1 every authored node whose prerequisites are met, money in hand', () => {
    const tree = registeredTechTree()
    const state = researchEverythingOn(tree)
    const unresearched = tree.authored.filter(
      (node) => researchRefusalOf(state, PLAYER, node, tree) !== 'already_unlocked',
    )
    const stuckOn = unresearched.map((node) => researchRefusalOf(state, PLAYER, node, tree))
    expect(stuckOn.filter((reason) => !NON_PLANET_REFUSALS.includes(reason ?? ''))).toEqual([])
    expect(unlockedNodeIdsOf(state, PLAYER).length).toBeGreaterThan(tree.authored.length / 2)
  })

  it('sells every researched store item alike on planet 1 and planet 200, price and refusal', () => {
    const tree = registeredTechTree()
    const storeOn = (state: AuthorityState) =>
      contentOf('vehicle-item').map((item) => ({
        itemId: item.id,
        refusal: vehicleItemBuyRefusal(state, PLAYER, item.id)?.reason ?? null,
        price: offerPriceOf(item.id),
      }))
    const near = storeOn(researchEverythingOn(tree, 1))
    expect(near.filter((row) => row.refusal === null).length).toBeGreaterThan(10)
    expect(storeOn(researchEverythingOn(tree, FAR_PLANET))).toEqual(near)
  })
})

function offerPriceOf(itemId: string): string | null {
  const offer = vehicleItemOfferOf(itemId)
  return offer === null ? null : toCanonical(offer.price)
}
