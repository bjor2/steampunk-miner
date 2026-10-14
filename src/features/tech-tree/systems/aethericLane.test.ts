import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { sub, toCanonical } from '../../../systems/money'
import { LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, research, researchAll, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { markNodeIdOf } from './markNodes'
import { nodeCost, nodeCostOf, nodeOreCostOf } from './nodeCost'
import { registeredTechTree, treeNodeOf, type TechTree } from './techTree'
import type { TreeNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { availableNodes } from './unlockRules'

// The sixth lane (GD lock on #245, ticket 260), on the fixture tree with the stand-in ladder.

const ENTRY = 'tech.aetheric.resonance_whistle'
const GOVERNOR = 'tech.aetheric.chronometric_governor'
const CONDENSER = 'tech.aetheric.aether_condenser'

function refusalIn(events: readonly DomainEvent[]): string | null {
  const refused = events.find((event) => event.type === 'tech-tree.TechNodeRefused')
  return refused?.type === 'tech-tree.TechNodeRefused' ? refused.reason : null
}

function nodeOf(tree: TechTree, id: string): TreeNode {
  const node = treeNodeOf(tree, id)
  if (node === null) throw new Error(`no node ${id}`)
  return node
}

function aethericNodesOf(tree: TechTree): TreeNode[] {
  return tree.authored.filter((node) => node.lane === 'aetheric')
}

describe('tech tree: the Aetheric science lane', () => {
  it('the entry node is held while no building stands for the research lab', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      expect(refusalIn(research(session, ENTRY))).toBe('held_feature')
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual([])
    })
  })

  it('researches the entry node at the standing lab for its price in money', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      const before = session.state().players[PLAYER].wallet
      const cost = nodeCostOf(ENTRY)!
      const events = research(session, ENTRY)
      expect(events[0]).toMatchObject({
        type: 'tech-tree.TechNodeUnlocked',
        nodeId: ENTRY,
        lane: 'aetheric',
        cost: toCanonical(cost),
      })
      expect(session.state().players[PLAYER].wallet).toEqual(sub(before, cost))
    }, [LAB_FIXTURE_SLICE])
  })

  it('researches the entry node on planet 1 at its P15 price, the lab standing (#411)', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      const before = session.state().players[PLAYER].wallet
      const open = availableNodes(session.state(), PLAYER)
      expect(open.filter((node) => node.lane === 'aetheric').map((node) => node.id)).toEqual([
        ENTRY,
      ])
      research(session, ENTRY)
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual([ENTRY])
      expect(session.state().players[PLAYER].wallet).toEqual(sub(before, nodeCostOf(ENTRY)!))
    }, [LAB_FIXTURE_SLICE])
  })

  it('opens P24 and P29 on the entry node alone, so a P16 fork re-choice strands neither', () => {
    withFixtureTree(() => {
      const tree = registeredTechTree()
      expect(aethericNodesOf(tree).map((node) => [node.id, node.unlockTier, node.prereqs])).toEqual(
        [
          [ENTRY, 15, []],
          [GOVERNOR, 24, [ENTRY]],
          [CONDENSER, 29, [ENTRY]],
        ],
      )
      const session = sessionOnPlanet(29)
      researchAll(session, [ENTRY, GOVERNOR, CONDENSER])
    }, [LAB_FIXTURE_SLICE])
  })

  it('every aetheric node prices through bandOrePriceAt and the Mark ladder', () => {
    withFixtureTree(() => {
      const tree = registeredTechTree()
      const sensing = tree.authored.filter((node) => node.lane === 'sensing')
      aethericNodesOf(tree).forEach((node, slot) => {
        expect(nodeOreCostOf(node), node.id).toEqual(nodeOreCostOf(sensing[slot]))
        expect(nodeCost(node)).toEqual(
          bandOrePriceAt(nodeOreCostOf(node), node.unlockTier, node.unlockTier),
        )
        const itemId = node.unlocks.itemId
        const markThree = nodeOf(tree, markNodeIdOf(itemId, 3))
        expect(markThree).toMatchObject({
          lane: 'aetheric',
          costKind: 'mark',
          unlockTier: node.unlockTier + 6,
          prereqs: [markNodeIdOf(itemId, 2)],
          unlocks: { itemId, mark: 3 },
        })
        expect(nodeCost(markThree)).toEqual(
          bandOrePriceAt(nodeOreCostOf(markThree), markThree.unlockTier, markThree.unlockTier),
        )
      })
    })
  })
})
