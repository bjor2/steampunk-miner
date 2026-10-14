import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { sub, toCanonical } from '../../../systems/money'
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

/** The research lab standing from its schedule row's planet, P15, as the dock buildings stamp it. */
const LAB_PROBE: SliceDefinition = {
  id: 'lab-probe',
  register: (r) => r.dockFacility({ id: 'lab-probe.lab', scheduleRowId: 'research_lab' }),
}

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
  it('the entry node is refused no_lab before the research lab stands', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      expect(refusalIn(research(session, ENTRY))).toBe('no_lab')
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual([])
    })
  })

  it('researches the entry node at the standing lab for its price in money', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      const before = session.state().players[PLAYER].wallet
      const cost = nodeCostOf(ENTRY, 15)!
      const events = research(session, ENTRY)
      expect(events[0]).toMatchObject({
        type: 'tech-tree.TechNodeUnlocked',
        nodeId: ENTRY,
        lane: 'aetheric',
        cost: toCanonical(cost),
      })
      expect(session.state().players[PLAYER].wallet).toEqual(sub(before, cost))
    }, [LAB_PROBE])
  })

  it('the lane is closed before P15', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(14)
      session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 14 } })
      expect(refusalIn(research(session, ENTRY))).toBe('locked_tier')
      const researched = unlockedNodeIdsOf(session.state(), PLAYER)
      expect(researched.filter((id) => id.startsWith('tech.aetheric.'))).toEqual([])
      const open = availableNodes(session.state(), PLAYER)
      expect(open.filter((node) => node.lane === 'aetheric')).toEqual([])
    }, [LAB_PROBE])
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
    }, [LAB_PROBE])
  })

  it('every aetheric node prices through bandOrePriceAt and the Mark ladder', () => {
    withFixtureTree(() => {
      const tree = registeredTechTree()
      const sensing = tree.authored.filter((node) => node.lane === 'sensing')
      aethericNodesOf(tree).forEach((node, slot) => {
        expect(nodeOreCostOf(node), node.id).toEqual(nodeOreCostOf(sensing[slot]))
        ;[node.unlockTier, 40, 86].forEach((planet) =>
          expect(nodeCost(node, planet)).toEqual(
            bandOrePriceAt(nodeOreCostOf(node), planet, node.unlockTier),
          ),
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
        expect(nodeCost(markThree, 40)).toEqual(
          bandOrePriceAt(nodeOreCostOf(markThree), 40, markThree.unlockTier),
        )
      })
    })
  })
})
