import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { contentOf } from '../../../systems/registries/content'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { isSlotOpen } from '../../../systems/vehicle/loadoutState'
import type { TechNode } from '../../tech-tree'
import type { PowerUpSlot } from './powerUpSlots'

// Ticket 251 on the loaded slices: the terrain lane registers the fourth cradle's node at P20 and
// the sensing lane the fifth's at P30. Researching one puts its cradle on sale at the Upgrade bay,
// and owning that opens its slot. A cradle node skips the vision-row guard, so it must never show,
// grant or preview a scheduled feature that is still a vision row.

interface CradleCase {
  nodeId: string
  itemId: string
  planetIndex: number
  slot: PowerUpSlot
}

const CRADLE_CASES: readonly CradleCase[] = [
  { nodeId: 'tech.terrain.cradle_4', itemId: 'slot.powerup_4', planetIndex: 20, slot: 'powerup.4' },
  { nodeId: 'tech.sensing.cradle_5', itemId: 'slot.powerup_5', planetIndex: 30, slot: 'powerup.5' },
]

const VISION_ROWS = LOCKED_SCHEDULE.rows.filter((row) => row.status === 'vision')

/** On the cradle's planet, docked at the Upgrade bay, every node before that planet researched. */
function dockedBeforeCradle(planetIndex: number): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit(0, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex: planetIndex - 1 },
  })
  return session
}

function isPowerUpSlotOpen(session: ScriptedSession, slot: PowerUpSlot): boolean {
  return isSlotOpen(session.state().players.p1.vehicle.loadout, slot)
}

function nodeOf(nodeId: string): TechNode {
  const node = contentOf('tech-node').find((candidate) => candidate.id === nodeId)
  if (node === undefined) throw new Error(`no registered node ${nodeId}`)
  return node
}

/** Everything the player sees of the cradle: its node, and its card at its node's planet. */
function shownTextOf({ nodeId, itemId, planetIndex }: CradleCase): string {
  const state = createAuthorityState({ planetIndex, planetSeed: 83921, playerIds: ['p1'] })
  const view = itemSnapshotViewOf(state, 'p1')
  const card = describeItem(
    { kind: 'vehicle-item', id: itemId },
    { playerId: 'p1', planetIndex, level: 0, view },
  )
  return JSON.stringify([nodeOf(nodeId), card]).toLowerCase()
}

function visionRowsShownBy(cradle: CradleCase): string[] {
  const text = shownTextOf(cradle)
  return VISION_ROWS.filter(
    (row) => text.includes(row.id) || text.includes(row.name.toLowerCase()),
  ).map((row) => `${cradle.nodeId} shows ${row.id}`)
}

describe('power-up cradles 4 and 5 on their lane nodes (ticket 251)', () => {
  it.each(CRADLE_CASES)('registers $nodeId on P$planetIndex, unlocking $itemId', (cradle) => {
    expect(nodeOf(cradle.nodeId)).toMatchObject({
      unlockTier: cradle.planetIndex,
      unlocks: cradle.itemId,
      costKind: 'slot',
      label: 'both',
    })
  })

  it.each(CRADLE_CASES)(
    'opens $slot once $nodeId is researched and its cradle bought',
    (cradle) => {
      const session = dockedBeforeCradle(cradle.planetIndex)
      const [refused] = session.submit(1, buyVehicleItemCommand(cradle.itemId))
      expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'not_researched' })
      session.submit(2, { type: 'tech-tree.unlock_node', payload: { nodeId: cradle.nodeId } })
      session.submit(3, buyVehicleItemCommand(cradle.itemId))
      expect(isPowerUpSlotOpen(session, cradle.slot)).toBe(true)
    },
  )

  it('previews no vision-row feature on either cradle node: no schedule row, nothing shown', () => {
    expect(VISION_ROWS.length).toBeGreaterThan(0)
    expect(CRADLE_CASES.map((cradle) => nodeOf(cradle.nodeId).scheduleRowId)).toEqual([
      undefined,
      undefined,
    ])
    expect(CRADLE_CASES.flatMap(visionRowsShownBy)).toEqual([])
  })
})
