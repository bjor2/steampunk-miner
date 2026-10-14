import { describe, expect, it } from 'vitest'
import type { BotSession } from '../../../systems/bot/botSession'
import { FORK_FIXTURE_SLICE, forkItemIdOf } from '../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { activeBranchOf } from './forkNode'
import { forkChoicesOf } from './forkSection'
import { isItemResearched } from './unlockRules'

function withForks<T>(run: () => T): T {
  return withFixtureTree(run, [FORK_FIXTURE_SLICE])
}

function force(session: BotSession, branch: string, lane = 'drill-gear') {
  return session.submit({ type: 'debug.tech-tree.forceFork', payload: { lane, branch } })
}

function activeDrillBranch(session: BotSession): string | null {
  return activeBranchOf(forkChoicesOf(session.state(), PLAYER), 'drill-gear')
}

function walletOf(session: BotSession) {
  return session.state().players[PLAYER].wallet
}

// The forced-branch start of `balance:forks` (#255 build 2, ticket 267): the bot plays P3-P10 on
// one branch, so the start grants it outside its P16 tier, free, as a scenario's debug command.
describe('tech tree: forced fork branch', () => {
  it('makes the branch active on planet 3, free, its item researched and the other not', () => {
    withForks(() => {
      const session = sessionOnPlanet(3, '1000')
      const before = walletOf(session)
      const events = force(session, 'deep')
      expect(events.map((event) => event.type)).toEqual(['DebugCommandApplied'])
      expect(walletOf(session)).toEqual(before)
      expect(activeDrillBranch(session)).toBe('deep')
      expect(isItemResearched(session.state(), PLAYER, forkItemIdOf('deep'))).toBe(true)
      expect(isItemResearched(session.state(), PLAYER, forkItemIdOf('wide'))).toBe(false)
    })
  })

  it('refuses a branch no pair registers and changes nothing', () => {
    withForks(() => {
      const session = sessionOnPlanet(3)
      const before = session.state()
      expect(force(session, 'narrow')).toContainEqual(
        expect.objectContaining({ type: 'tech-tree.ForkRefused', reason: 'unknown_branch' }),
      )
      expect(forkChoicesOf(session.state(), PLAYER)).toEqual(forkChoicesOf(before, PLAYER))
    })
  })

  it('leaves the other lanes unchosen', () => {
    withForks(() => {
      const session = sessionOnPlanet(3)
      force(session, 'scout', 'sensing')
      expect(forkChoicesOf(session.state(), PLAYER)).toEqual({ sensing: 'scout' })
    })
  })
})
