import { describe, expect, it } from 'vitest'
import { setArtefactCommand } from '../../../systems/artefacts/artefactCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import { TWISTS, type Twist } from './twistCatalogue'

// Ticket 329 (206c; GD lock on #206, decision 1): each twist answers its base item's `twist` point
// while the player holds it, and only then; the lane asks with base 0 and ceiling 1.

const BASE_ITEM_IDS = TWISTS.map((twist) => twist.baseItemId)

function twistValueOf(state: AuthorityState, playerId: string, twist: Twist): number {
  return scalarHookValueOf(state, playerId, {
    point: 'twist',
    parentItemId: twist.baseItemId,
    ctx: { tick: state.tick, mark: 1, magnitude: 0, origin: { tx: 0, ty: 0 }, candidates: [] },
    base: 0,
    ceiling: 1,
  })
}

/** Two players owning every base item; `p1` holds `optionId` when given. */
function sessionHolding(optionId: string | null) {
  const session = createScriptedSession(['p1', 'p2'])
  session.submit(1, setVehicleLoadoutCommand({}, BASE_ITEM_IDS))
  session.submit(1, setVehicleLoadoutCommand({}, BASE_ITEM_IDS), 'p2')
  if (optionId !== null) session.submit(2, setArtefactCommand(optionId))
  return session
}

describe('artefact twist hooks', () => {
  it('leave every base item untwisted while no twist is held', () => {
    const state = sessionHolding(null).state()
    expect(TWISTS.map((twist) => twistValueOf(state, 'p1', twist))).toEqual([0, 0, 0])
  })

  it.each(TWISTS.map((twist) => [twist.name, twist] as const))(
    'twist only the base item of %s, and only for the player who holds it',
    (_name, held) => {
      const state = sessionHolding(held.optionId).state()
      const expected = TWISTS.map((twist) => (twist === held ? 1 : 0))
      expect(TWISTS.map((twist) => twistValueOf(state, 'p1', twist))).toEqual(expected)
      expect(TWISTS.map((twist) => twistValueOf(state, 'p2', twist))).toEqual([0, 0, 0])
    },
  )

  it('leave the base items untwisted while a kernel artefact is held', () => {
    const state = sessionHolding('artefact.ore_whisper').state()
    expect(TWISTS.map((twist) => twistValueOf(state, 'p1', twist))).toEqual([0, 0, 0])
  })
})
