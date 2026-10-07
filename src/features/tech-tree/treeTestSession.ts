/**
 * Spec plumbing for the tree's rules: the tech-tree slice with the #161 fixture tree registered,
 * and a one-player session standing on a planet with money, set up through `debug.*` commands
 * like a start scenario. Only specs use it.
 */
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { createBotSession, type BotSession } from '../../systems/bot/botSession'
import { slice as TECH_TREE_SLICE } from './register'
import { TREE_FIXTURE_SLICE } from './treeFixtureSlice'

export const WORLD_SEED = 83921
export const PLAYER = 'p1'

/** Runs `run` with the tree slice, the fixture tree and any `extra` slices registered. */
export function withFixtureTree<T>(run: () => T, extra: readonly SliceDefinition[] = []): T {
  return withRegistrations([TECH_TREE_SLICE, TREE_FIXTURE_SLICE, ...extra], run)
}

/** Runs `run` with the tree slice alone: no lane has registered a node. */
export function withNoLanes<T>(run: () => T): T {
  return withRegistrations([TECH_TREE_SLICE], run)
}

/** Player `p1` on `planetIndex`, holding `money` (a decimal string). */
export function sessionOnPlanet(planetIndex: number, money = '1e30'): BotSession {
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: WORLD_SEED,
    playerIds: [PLAYER],
  })
  const session = createBotSession(start, PLAYER)
  if (planetIndex !== 1) session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  return session
}

export function research(session: BotSession, nodeId: string): readonly DomainEvent[] {
  return session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId } })
}

/** Researches each node in order; throws on the first one refused. */
export function researchAll(session: BotSession, nodeIds: readonly string[]): void {
  nodeIds.forEach((nodeId) => {
    const refused = research(session, nodeId).find(
      (event) => event.type === 'tech-tree.TechNodeRefused',
    )
    if (refused !== undefined) throw new Error(`${nodeId} was refused: ${JSON.stringify(refused)}`)
  })
}
