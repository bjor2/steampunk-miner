import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { oreFamilies } from '../../ores'
import { PLAYER, sessionOnPlanet } from '../treeTestSession'
import { registeredTechTree } from './techTree'
import { nodeCardModelOf } from './treeScreenModel'

// The GD lock on #255 (ticket 269): the registered P16 fork branches' cards name no vision row and
// no ore family past the first two, and none names a terrain magnet (#246), on whatever planet
// shows them. Build 6 walks all twelve branches; this walks the ones the lanes register now.

const VISION_ROWS = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')

/** Ore families 3-12 come with their acts. */
const LATER_FAMILIES = oreFamilies()
  .slice(2)
  .map((family) => family.name.toLowerCase())

function cardTextOn(nodeId: string, planetIndex: number): string {
  const session = sessionOnPlanet(planetIndex)
  const card = nodeCardModelOf(session.state(), PLAYER, registeredTechTree(), nodeId)
  if (card === null) throw new Error(`no card for ${nodeId} on P${planetIndex}`)
  return JSON.stringify(card).toLowerCase()
}

function forbiddenNamesIn(text: string): string[] {
  const rows = VISION_ROWS.filter(
    (row) => text.includes(row.id) || text.includes(row.name.toLowerCase()),
  ).map((row) => row.id)
  const magnet = text.includes('magnet') ? ['magnet'] : []
  return [...rows, ...LATER_FAMILIES.filter((family) => text.includes(family)), ...magnet]
}

describe('tech tree screen: the fork branch cards', () => {
  it('names no vision row, ore family 3-12 or magnet on any registered branch card', () => {
    const branches = registeredTechTree().forkBranches
    expect(branches.map((fork) => `${fork.lane}.${fork.branch}`)).toEqual(
      expect.arrayContaining(['sensing.scout', 'sensing.diviner', 'terrain.bracer']),
    )
    const shown = branches.flatMap((fork) =>
      [3, 16, 40].map((planet) => ({
        id: `${fork.node.id} on P${planet}`,
        names: forbiddenNamesIn(cardTextOn(fork.node.id, planet)),
      })),
    )
    expect(shown.filter((card) => card.names.length > 0)).toEqual([])
  })
})
