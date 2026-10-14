import { describe, expect, it } from 'vitest'
import {
  buyVehicleItemCommand,
  setVehicleLoadoutCommand,
} from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  typesOf,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { foamChargesOf, foamStartingCount } from './foamResearch'
import { STABILISER_FOAM_ID } from './stabiliserFoam'

// Foam's only charge source before the consumable restock (GD ruling on #381, option c): research
// of its terrain tier-3 node owns it with the json starting stack; no seller, drop or preview
// gives a charge, so a player who does not own foam has none.

const FOAM_NODE = 'tech.terrain.stabiliser_foam'
const FOAM_PLANET = 3

function onFoamPlanet(playerIds: readonly string[] = ['p1']): ScriptedSession {
  const session = createScriptedSession(playerIds)
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: FOAM_PLANET } })
  for (const playerId of playerIds) {
    session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e12' } }, playerId)
  }
  return session
}

const researchFoam = (session: ScriptedSession, tick: number, playerId = 'p1') =>
  session.submit(tick, { type: 'tech-tree.unlock_node', payload: { nodeId: FOAM_NODE } }, playerId)

describe('terrain-tools: researching foam is its only charge source (ticket 381)', () => {
  it('gives a player who does not own foam zero charges', () => {
    const session = onFoamPlanet()
    expect(ownsItem(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(false)
    expect(foamChargesOf(session.state(), 'p1')).toBe(0)
  })

  it('owns foam on research, with the json starting stack of 4, and logs it stocked', () => {
    const session = onFoamPlanet()
    const events = researchFoam(session, 1)
    expect(ownsItem(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(true)
    expect(foamStartingCount()).toBe(4)
    expect(foamChargesOf(session.state(), 'p1')).toBe(foamStartingCount())
    expect(events.filter((event) => event.type === 'terrain-tools.FoamStocked')).toEqual([
      expect.objectContaining({ playerId: 'p1', charges: 4 }),
    ])
  })

  it('stocks only the player who researched it', () => {
    const session = onFoamPlanet(['p1', 'p2'])
    researchFoam(session, 1, 'p2')
    expect(ownsItem(session.state(), 'p1', STABILISER_FOAM_ID)).toBe(false)
    expect(foamChargesOf(session.state(), 'p1')).toBe(0)
    expect(foamChargesOf(session.state(), 'p2')).toBe(4)
  })

  it('stocks no second stack for a player who already owns foam', () => {
    const session = onFoamPlanet()
    session.submit(1, setVehicleLoadoutCommand({ 'powerup.1': STABILISER_FOAM_ID }))
    expect(typesOf(researchFoam(session, 2))).not.toContain('terrain-tools.FoamStocked')
  })

  it('gives no charge through the debug tree grant or a buy: foam is never a one-off sale (#248)', () => {
    const session = onFoamPlanet()
    session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    session.submit(1, {
      type: 'debug.tech-tree.unlockThrough',
      payload: { planetIndex: FOAM_PLANET },
    })
    const bought = session.submit(2, buyVehicleItemCommand(STABILISER_FOAM_ID))
    expect(bought).toEqual([expect.objectContaining({ reason: 'not_for_sale' })])
    expect(foamChargesOf(session.state(), 'p1')).toBe(0)
  })
})
