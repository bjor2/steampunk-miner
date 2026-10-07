import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { replayRun } from '../../../systems/replay/replayRun'
import {
  PLAYER,
  research,
  researchAll,
  sessionOnPlanet,
  withFixtureTree,
  WORLD_SEED,
} from '../treeTestSession'
import { unlockedNodeIdsOf } from './techTreeSection'

function logLinesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_tree', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: PLAYER, planet: 3, depthTiles: 0 }, events)
  return sink.events
}

function playedResearch() {
  const session = sessionOnPlanet(8)
  researchAll(session, ['tech.sensing.echo_sounder', 'tech.mark.power.echo_sounder.2'])
  research(session, 'tech.terrain.cradle_4')
  session.wait(4000)
  return session
}

describe('tech tree: commands and logs', () => {
  it('replays research to the same digests, jumping or at 30 and 144 frames per second', () => {
    withFixtureTree(() => {
      const session = playedResearch()
      const commands = session.commands()
      const jumped = replayRun(WORLD_SEED, commands, { endTick: session.tick() })
      expect(
        replayRun(WORLD_SEED, commands, { endTick: session.tick(), framesPerSecond: 30 }).digests,
      ).toEqual(jumped.digests)
      expect(
        replayRun(WORLD_SEED, commands, { endTick: session.tick(), framesPerSecond: 144 }).digests,
      ).toEqual(jumped.digests)
      expect(unlockedNodeIdsOf(jumped.state, PLAYER)).toEqual(
        unlockedNodeIdsOf(session.state(), PLAYER),
      )
    })
  })

  it('logs each research and refusal as its run event, valid against the schema', () => {
    withFixtureTree(() => {
      const lines = logLinesOf(playedResearch().events())
      const treeLines = lines
        .filter((line) => String(line.event).startsWith('tech-tree.'))
        .map((line) => ({ event: line.event, data: line.data as Record<string, unknown> }))
      expect(treeLines.map((line) => [line.event, line.data.nodeId])).toEqual([
        ['tech-tree.tech_node_unlocked', 'tech.sensing.echo_sounder'],
        ['tech-tree.tech_node_unlocked', 'tech.mark.power.echo_sounder.2'],
        ['tech-tree.tech_node_refused', 'tech.terrain.cradle_4'],
      ])
      expect(treeLines[1].data).toMatchObject({ lane: 'sensing', kind: 'mark', mark: 2 })
      expect(treeLines[2].data.reason).toBe('locked_tier')
      expect(lines.flatMap(runEventProblems)).toEqual([])
    })
  })

  it('grants every node through a planet as a debug command, logged as debug_command_applied', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      const events = session.submit({
        type: 'debug.tech-tree.unlockThrough',
        payload: { planetIndex: 10 },
      })
      expect(session.state().debugApplied).toBe(true)
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toContain('tech.mobility.cradle_3')
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).not.toContain('tech.sensing.flare_mortar')
      expect(logLinesOf(events).map((line) => line.event)).toEqual(['debug_command_applied'])
    })
  })

  it('refuses a malformed payload before any tree rule runs', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3)
      const events = session.submit({
        type: 'tech-tree.unlock_node',
        payload: { nodeId: 7 } as never,
      })
      expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_payload' }])
    })
  })
})
