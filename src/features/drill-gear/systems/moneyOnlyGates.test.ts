import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { activeForkBranchOf, CHOOSE_FORK_COMMAND, FORK_TIER, isUnlocked } from '../../tech-tree'
import { REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import { DEEP_BRANCH, WIDE_BRANCH } from './drillGearFork'
import { drillGearItemOf } from './drillGearItems'
import { TWIN_BIT_ID } from './twinBit'

// The drill gear's planet anchors are price bands only (GD lock on #308, ticket 624): a game one
// planet short of each old gate (side cutters P13, the fork P16, twin bit P19, reach boom P34)
// is refused only for money, and buys the gear once the wallet holds its price.

const RICH = '1e30'

/** On the planet before `gate`, docked at the Upgrade bay, every earlier node researched, broke. */
function brokeBefore(gate: number): ScriptedSession {
  const session = createScriptedSession()
  const planetIndex = gate - 1
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } } as CommandIntent)
  session.submit(0, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex },
  } as CommandIntent)
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } } as CommandIntent)
  session.submit(0, setMoney('0'))
  return session
}

function setMoney(amount: string): CommandIntent {
  return { type: 'debug.setMoney', payload: { amount } } as CommandIntent
}

function unlockNode(nodeId: string): CommandIntent {
  return { type: 'tech-tree.unlock_node', payload: { nodeId } } as CommandIntent
}

function chooseDrillBranch(branch: string): CommandIntent {
  return { type: CHOOSE_FORK_COMMAND, payload: { lane: 'drill-gear', branch } } as CommandIntent
}

const reasonsOf = (events: readonly DomainEvent[]) =>
  events.map((event) => ('reason' in event ? event.reason : event.type))

const ITEM_GATES = [
  { itemId: SIDE_CUTTERS_ID, gate: 13 },
  { itemId: TWIN_BIT_ID, gate: 19 },
  { itemId: REACH_BOOM_ID, gate: 34 },
]

describe('drill-gear: money is the only gate (ticket 624)', () => {
  it.each(ITEM_GATES)(
    'a game short of P$gate is refused $itemId only for money, then buys it',
    ({ itemId, gate }) => {
      const nodeId = drillGearItemOf(itemId)!.node.id
      expect(drillGearItemOf(itemId)!.node.unlockTier).toBe(gate)
      const session = brokeBefore(gate)
      expect(reasonsOf(session.submit(1, unlockNode(nodeId)))).toEqual(['money_short'])
      session.submit(2, setMoney(RICH))
      session.submit(3, unlockNode(nodeId))
      session.submit(4, buyVehicleItemCommand(itemId))
      expect(isUnlocked(session.state(), 'p1', nodeId)).toBe(true)
      expect(ownsItem(session.state(), 'p1', itemId)).toBe(true)
    },
  )

  it.each([WIDE_BRANCH, DEEP_BRANCH])(
    'a game short of P16 is refused the %s branch only for money, then chooses it',
    (branch) => {
      const session = brokeBefore(FORK_TIER)
      expect(reasonsOf(session.submit(1, chooseDrillBranch(branch)))).toEqual(['money_short'])
      session.submit(2, setMoney(RICH))
      session.submit(3, chooseDrillBranch(branch))
      expect(activeForkBranchOf(session.state(), 'p1', 'drill-gear')).toBe(branch)
    },
  )
})
