import { describe, expect, it } from 'vitest'
import type { BotSession } from '../../systems/bot/botSession'
import { activeForkBranchOf } from './systems/forkSection'
import { registeredTechTree } from './systems/techTree'
import { unlockedNodeIdsOf } from './systems/techTreeSection'
import { PLAYER, sessionOnPlanet } from './treeTestSession'
import { RUSH_FORK_BRANCH, RUSH_LANE, rushWhilePaid, withRushHand } from './rushHand'

// The greedy rush hand (#411, the Vertical Scaler's point 2) on the shipped tree: on planet 1 it
// researches drill-gear nodes anchored planets ahead, cheapest first, as the price-only tree lets
// any player.

function dockedOnPlanetOne(money: string): BotSession {
  const session = sessionOnPlanet(1, money)
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

function anchorsOf(session: BotSession): number[] {
  const tree = registeredTechTree()
  return unlockedNodeIdsOf(session.state(), PLAYER).map(
    (nodeId) => tree.authored.find((node) => node.id === nodeId)?.unlockTier ?? 0,
  )
}

describe('tech tree: the greedy rush hand (#411)', () => {
  it('researches drill-gear nodes anchored past planet 1, and the lane fork on Wide', () => {
    const session = dockedOnPlanetOne('1e40')
    rushWhilePaid(session)
    expect(Math.max(...anchorsOf(session))).toBeGreaterThan(1)
    const lanes = unlockedNodeIdsOf(session.state(), PLAYER).map(
      (nodeId) => registeredTechTree().authored.find((node) => node.id === nodeId)?.lane,
    )
    expect(lanes.filter((lane) => lane !== undefined && lane !== RUSH_LANE)).toEqual([])
    expect(activeForkBranchOf(session.state(), PLAYER, RUSH_LANE)).toBe(RUSH_FORK_BRANCH)
  })

  it('buys nothing the wallet cannot pay with the next service kept back', () => {
    const session = dockedOnPlanetOne('0')
    rushWhilePaid(session)
    expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual([])
  })

  it('acts only before a wait the miner makes docked', () => {
    const docked = dockedOnPlanetOne('1e40')
    withRushHand(docked).wait(1)
    expect(unlockedNodeIdsOf(docked.state(), PLAYER).length).toBeGreaterThan(0)
    const away = sessionOnPlanet(1, '1e40')
    withRushHand(away).wait(1)
    expect(unlockedNodeIdsOf(away.state(), PLAYER)).toEqual([])
  })
})
