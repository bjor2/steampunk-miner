import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  readSnapshot,
  sectionsRestoredBy,
  takeSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import type { BotSession } from '../../../systems/bot/botSession'
import { fromSafeInteger, sub, toCanonical } from '../../../systems/money'
import { replayRun } from '../../../systems/replay/replayRun'
import { FORK_FIXTURE_SLICE, forkItemIdOf } from '../treeFixtureSlice'
import {
  PLAYER,
  research,
  researchAll,
  sessionOnPlanet,
  withFixtureTree,
  WORLD_SEED,
} from '../treeTestSession'
import { activeBranchOf } from './forkNode'
import { forkChoicesOf } from './forkSection'
import { researchedMarkOf } from './itemMarks'
import { markNodeIdOf } from './markNodes'
import { nodeCostOf } from './nodeCost'
import { unlockedNodeIdsOf } from './techTreeSection'
import { isItemResearched } from './unlockRules'

const WIDE = 'tech.drill_gear.fork.wide'
const DEEP = 'tech.drill_gear.fork.deep'
const WIDE_ITEM = forkItemIdOf('wide')
const DEEP_ITEM = forkItemIdOf('deep')

function withForks<T>(run: () => T): T {
  return withFixtureTree(run, [FORK_FIXTURE_SLICE])
}

function choose(session: BotSession, branch: string, lane = 'drill-gear') {
  return session.submit({ type: 'tech-tree.choose_fork', payload: { lane, branch } })
}

function rechoose(session: BotSession, branch: string, lane = 'drill-gear') {
  return session.submit({ type: 'tech-tree.rechoose_fork', payload: { lane, branch } })
}

function dockAtPlatform(session: BotSession): void {
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
}

function activeDrillBranch(session: BotSession): string | null {
  return activeBranchOf(forkChoicesOf(session.state(), PLAYER), 'drill-gear')
}

function walletOf(session: BotSession) {
  return session.state().players[PLAYER].wallet
}

/** Wide chosen on P22, its Mark 2 researched: Mark 3 is the next step. */
function wideAtMarkTwo(): BotSession {
  const session = sessionOnPlanet(22)
  choose(session, 'wide')
  researchAll(session, [markNodeIdOf(WIDE_ITEM, 2)])
  return session
}

function logLinesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_forks', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: PLAYER, planet: 22, depthTiles: 0 }, events)
  return sink.events.filter((line) => String(line.event).startsWith('tech-tree.fork_'))
}

describe('tech tree: fork choice', () => {
  it('choosing a branch deactivates the other', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      const before = walletOf(session)
      const events = choose(session, 'wide')
      const cost = nodeCostOf(WIDE, 16)!
      expect(events).toMatchObject([
        { type: 'tech-tree.ForkChosen', lane: 'drill-gear', branch: 'wide' },
        { type: 'MoneyChanged' },
      ])
      expect(events[0]).toMatchObject({ cost: toCanonical(cost) })
      expect(walletOf(session)).toEqual(sub(before, cost))
      expect(activeDrillBranch(session)).toBe('wide')
      expect(isItemResearched(session.state(), PLAYER, WIDE_ITEM)).toBe(true)
      expect(isItemResearched(session.state(), PLAYER, DEEP_ITEM)).toBe(false)

      dockAtPlatform(session)
      rechoose(session, 'deep')
      expect(activeDrillBranch(session)).toBe('deep')
      expect(isItemResearched(session.state(), PLAYER, DEEP_ITEM)).toBe(true)
      expect(isItemResearched(session.state(), PLAYER, WIDE_ITEM)).toBe(false)
    })
  })

  it('opens a branch only through the fork commands, one choice per lane', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      expect(research(session, WIDE)).toMatchObject([
        { type: 'tech-tree.TechNodeRefused', reason: 'fork_branch' },
      ])
      choose(session, 'wide')
      expect(choose(session, 'deep')).toMatchObject([
        { type: 'tech-tree.ForkRefused', reason: 'already_chosen' },
      ])
      expect(research(session, DEEP)).toMatchObject([{ reason: 'fork_branch' }])
      expect(choose(session, 'narrow')).toMatchObject([{ reason: 'unknown_branch' }])
      expect(choose(session, 'scout', 'sensing-gear')).toMatchObject([{ reason: 'unknown_branch' }])
      expect(activeDrillBranch(session)).toBe('wide')
    })
  })

  it('refuses a choice before P16 and on a short wallet', () => {
    withForks(() => {
      expect(choose(sessionOnPlanet(15), 'wide')).toMatchObject([{ reason: 'locked_tier' }])
      expect(choose(sessionOnPlanet(16, '1'), 'wide')).toMatchObject([{ reason: 'money_short' }])
    })
  })

  it('re-choice is refused away from the platform', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      expect(rechoose(session, 'deep')).toMatchObject([{ reason: 'not_chosen' }])
      choose(session, 'wide')
      dockAtPlatform(session)
      session.submit({ type: 'undock', payload: {} })
      const before = session.state()
      expect(rechoose(session, 'deep')).toMatchObject([
        { type: 'tech-tree.ForkRefused', lane: 'drill-gear', branch: 'deep' },
      ])
      expect(rechoose(session, 'deep')[0]).toMatchObject({ reason: 'not_at_platform' })
      expect(walletOf(session)).toEqual(before.players[PLAYER].wallet)
      expect(activeDrillBranch(session)).toBe('wide')
      dockAtPlatform(session)
      expect(rechoose(session, 'wide')).toMatchObject([{ reason: 'same_branch' }])
    })
  })

  it('re-choice charges one Mark step at the current planet, refunds nothing and keeps Marks', () => {
    withForks(() => {
      const session = wideAtMarkTwo()
      dockAtPlatform(session)
      const before = walletOf(session)
      const step = nodeCostOf(markNodeIdOf(WIDE_ITEM, 3), 22)!
      const events = rechoose(session, 'deep')
      expect(events).toMatchObject([
        {
          type: 'tech-tree.ForkRechosen',
          lane: 'drill-gear',
          from: 'wide',
          to: 'deep',
          cost: toCanonical(step),
        },
        { type: 'MoneyChanged', from: toCanonical(before), to: toCanonical(sub(before, step)) },
      ])
      expect(walletOf(session)).toEqual(sub(before, step))
      expect(researchedMarkOf(session.state(), PLAYER, DEEP_ITEM)).toBe(2)
      expect(researchedMarkOf(session.state(), PLAYER, WIDE_ITEM)).toBe(0)
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual(
        expect.arrayContaining([
          WIDE,
          markNodeIdOf(WIDE_ITEM, 2),
          DEEP,
          markNodeIdOf(DEEP_ITEM, 2),
        ]),
      )
    })
  })

  it('prices a re-choice the same whichever branch is active, and a branch held before keeps its Marks', () => {
    withForks(() => {
      const session = wideAtMarkTwo()
      dockAtPlatform(session)
      rechoose(session, 'deep')
      const before = walletOf(session)
      const events = rechoose(session, 'wide')
      const step = nodeCostOf(markNodeIdOf(DEEP_ITEM, 3), 22)!
      expect(step).toEqual(nodeCostOf(markNodeIdOf(WIDE_ITEM, 3), 22))
      expect(events[0]).toMatchObject({ from: 'deep', to: 'wide', cost: toCanonical(step) })
      expect(walletOf(session)).toEqual(sub(before, step))
      expect(researchedMarkOf(session.state(), PLAYER, WIDE_ITEM)).toBe(2)
    })
  })

  it('takes Marks only on the active branch', () => {
    withForks(() => {
      const session = wideAtMarkTwo()
      dockAtPlatform(session)
      rechoose(session, 'deep')
      expect(research(session, markNodeIdOf(WIDE_ITEM, 3))).toMatchObject([
        { type: 'tech-tree.TechNodeRefused', reason: 'fork_branch' },
      ])
      researchAll(session, [markNodeIdOf(DEEP_ITEM, 3)])
      expect(researchedMarkOf(session.state(), PLAYER, DEEP_ITEM)).toBe(3)
    })
  })

  it('refuses a re-choice the wallet cannot pay, changing nothing', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      choose(session, 'wide')
      dockAtPlatform(session)
      session.submit({ type: 'debug.setMoney', payload: { amount: '1' } })
      expect(rechoose(session, 'deep')).toMatchObject([{ reason: 'money_short' }])
      expect(walletOf(session)).toEqual(fromSafeInteger(1))
      expect(activeDrillBranch(session)).toBe('wide')
    })
  })

  it('logs fork_chosen and fork_rechosen with their cost, valid against the schema', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      const events = [...choose(session, 'wide'), ...rechoose(session, 'deep')]
      dockAtPlatform(session)
      events.push(...rechoose(session, 'deep'))
      const lines = logLinesOf(events)
      expect(lines.map((line) => [line.event, line.data])).toEqual([
        [
          'tech-tree.fork_chosen',
          { lane: 'drill-gear', branch: 'wide', cost: toCanonical(nodeCostOf(WIDE, 16)!) },
        ],
        [
          'tech-tree.fork_refused',
          { lane: 'drill-gear', branch: 'deep', reason: 'not_at_platform' },
        ],
        [
          'tech-tree.fork_rechosen',
          {
            lane: 'drill-gear',
            from: 'wide',
            to: 'deep',
            cost: toCanonical(nodeCostOf(markNodeIdOf(WIDE_ITEM, 2), 16)!),
          },
        ],
      ])
      expect(lines.flatMap(runEventProblems)).toEqual([])
    })
  })

  it('replays a choice and a re-choice to the same digests at 30 and 144 frames per second', () => {
    withForks(() => {
      const session = wideAtMarkTwo()
      dockAtPlatform(session)
      rechoose(session, 'deep')
      session.wait(600)
      const commands = session.commands()
      const endTick = session.tick()
      const at30 = replayRun(WORLD_SEED, commands, { endTick, framesPerSecond: 30 })
      const at144 = replayRun(WORLD_SEED, commands, { endTick, framesPerSecond: 144 })
      expect(at144.digests).toEqual(at30.digests)
      expect(forkChoicesOf(at30.state, PLAYER)).toEqual({ 'drill-gear': 'deep' })
    })
  })

  it('leaves the fork section out of the state until a lane chooses', () => {
    withForks(() => {
      const session = sessionOnPlanet(16)
      session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 30 } })
      expect(session.state().players[PLAYER].slices?.['tech-tree.forks']).toBeUndefined()
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).not.toContain(WIDE)
      choose(session, 'wide')
      expect(session.state().players[PLAYER].slices?.['tech-tree.forks']).toEqual({
        'drill-gear': 'wide',
      })
    })
  })

  it('restores the active branch from a save, and a save from before forks with none chosen', () => {
    withForks(() => {
      const session = wideAtMarkTwo()
      const saved = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
      const restored = readSnapshot(saved)
      if (!('state' in restored)) throw new Error(restored.problems.join('; '))
      expect(forkChoicesOf(restored.state, PLAYER)).toEqual({ 'drill-gear': 'wide' })

      const beforeForks = JSON.parse(JSON.stringify(takeSnapshot(sessionOnPlanet(16).state())))
      delete beforeForks.state.players[PLAYER].slices['tech-tree.forks']
      expect(sectionsRestoredBy(beforeForks)).toEqual(['tech-tree.forks'])
      const fresh = readSnapshot(beforeForks)
      if (!('state' in fresh)) throw new Error(fresh.problems.join('; '))
      expect(forkChoicesOf(fresh.state, PLAYER)).toEqual({})
    })
  })

  it('refuses a saved fork section that names no lane', () => {
    withForks(() => {
      const saved = JSON.parse(JSON.stringify(takeSnapshot(wideAtMarkTwo().state())))
      saved.state.players[PLAYER].slices['tech-tree.forks'].body = { 'drill-bit': 'wide' }
      expect(readSnapshot(saved).problems.join('; ')).toContain('names no lane drill-bit')
    })
  })
})
