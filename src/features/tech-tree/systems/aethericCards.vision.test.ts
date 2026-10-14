import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { oreFamilies } from '../../ores'
import { PLAYER, sessionOnPlanet } from '../treeTestSession'
import { registeredTechTree } from './techTree'
import type { TreeNode } from './techNode'
import { nodeCardModelOf } from './treeScreenModel'

// The GD lock on #245 (ticket 264): the Aetheric science lane's cards on the tree screen preview
// no vision-row feature and name no ore family past the first two, whatever planet shows them.

const VISION_ROWS = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')

/** Ore families 3-12 come with their acts. */
const LATER_FAMILIES = oreFamilies()
  .slice(2)
  .map((family) => family.name.toLowerCase())

function aethericNodes(): TreeNode[] {
  return registeredTechTree().authored.filter((node) => node.lane === 'aetheric')
}

/** Everything the player reads of the node's card on `planetIndex`. */
function cardTextOn(node: TreeNode, planetIndex: number): string {
  const session = sessionOnPlanet(planetIndex)
  const card = nodeCardModelOf(session.state(), PLAYER, registeredTechTree(), node.id)
  if (card === null) throw new Error(`no card for ${node.id} on P${planetIndex}`)
  return JSON.stringify(card).toLowerCase()
}

function forbiddenNamesIn(text: string): string[] {
  const rows = VISION_ROWS.filter(
    (row) => text.includes(row.id) || text.includes(row.name.toLowerCase()),
  ).map((row) => row.id)
  return [...rows, ...LATER_FAMILIES.filter((family) => text.includes(family))]
}

describe('tech tree screen: the aetheric cards', () => {
  it('shows the registered aetheric nodes, none claiming a schedule row', () => {
    const nodes = contentOf('tech-node').filter((node) => node.lane === 'aetheric')
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    expect(
      aethericNodes()
        .map((node) => node.id)
        .sort(),
    ).toEqual(nodes.map((node) => node.id).sort())
    expect(nodes.filter((node) => node.scheduleRowId !== undefined)).toEqual([])
  })

  it('names no vision row and no ore family 3-12 on any aetheric card', () => {
    expect(VISION_ROWS.length).toBeGreaterThan(0)
    expect(LATER_FAMILIES).toHaveLength(10)
    const shown = aethericNodes().flatMap((node) =>
      [3, node.unlockTier, 40].map((planet) => ({
        id: `${node.id} on P${planet}`,
        names: forbiddenNamesIn(cardTextOn(node, planet)),
      })),
    )
    expect(shown.filter((card) => card.names.length > 0)).toEqual([])
  })
})
