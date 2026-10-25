import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import type { InputSituation } from '../../../systems/input/inputRouting'
import { UNCORK_FLASK_REACTION } from './flaskReaction'
import { UNCORK_FLASK_INTENT } from './flaskRules'
import { flaskToolFaceOf } from './flaskTile'

// The Damp Flask's cell and press (ticket 881): the cell shows only while a flask is carried, the
// flasks as its charges and an open flask's window as its ring; U sends the uncork only then.

const grantFlask = {
  type: 'debug.planet-kit.grantKitItem',
  payload: { itemId: 'damp_flask' },
} as CommandIntent

function situationOf(session: ReturnType<typeof createScriptedSession>): InputSituation {
  return { state: session.state(), playerId: 'p1', layer: 'vehicle' } as InputSituation
}

describe('damp flask cell', () => {
  it('shows nothing and sends nothing while no flask is carried', () => {
    const session = createScriptedSession()
    expect(flaskToolFaceOf(session.state(), 'p1')).toBeNull()
    expect(UNCORK_FLASK_REACTION.toIntent(situationOf(session))).toBeNull()
  })

  it('shows the flasks carried against the carry limit, and U uncorks one', () => {
    const session = createScriptedSession()
    session.submit(10, grantFlask)
    session.submit(10, grantFlask)
    expect(flaskToolFaceOf(session.state(), 'p1')).toMatchObject({
      iconId: 'item-kit-damp-flask',
      chargesLeft: 2,
      chargesMax: 3,
      cooldownPercent: 0,
      isActing: false,
    })
    expect(UNCORK_FLASK_REACTION.toIntent(situationOf(session))).toEqual(UNCORK_FLASK_INTENT)
  })

  it('rings the open window down from 100% and lights the cell while the flask is open', () => {
    const session = createScriptedSession()
    session.submit(10, grantFlask)
    session.submit(10, grantFlask)
    session.submit(20, UNCORK_FLASK_INTENT)
    expect(flaskToolFaceOf(session.state(), 'p1')).toMatchObject({
      chargesLeft: 1,
      cooldownPercent: 100,
      isOn: true,
      isActing: true,
    })
    session.submit(20 + 1800, { type: 'debug.grantMoney', payload: { amount: '1' } })
    expect(flaskToolFaceOf(session.state(), 'p1')?.cooldownPercent).toBe(50)
  })
})
