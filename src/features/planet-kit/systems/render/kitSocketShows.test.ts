import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../../systems/authority/authorityCommand'
import { placeHazardCommand } from '../../../../systems/authority/hazards/hazardDebugRules'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../../systems/authority/stateDigest'
import { FACING } from '../../../../systems/vehicle/vehiclePose'
import { UNCORK_FLASK_INTENT } from '../flaskRules'
import { kitHoldingsOf } from '../kitHoldingsSection'
import { KIT_SOCKETS } from '../kitSockets'
import { kitSocketsShownOf } from './kitSocketShows'

// The tool-acting deployed pose (ticket 883, PK4c look): an owned tool hangs on its socket,
// deployed while it acts and through its 30-tick tail, idle after; the flask rack holds the
// carried flasks and, while one is open, the uncorked one vented beside them. Look-only: reading
// it leaves the state and its digest as they were.

const START = 100
const TAIL_TICKS = 30
const AWAY = { tx: GROUND.tx + 3, ty: GROUND.ty }

const grantKitItem = (itemId: string): CommandIntent =>
  ({ type: 'debug.planet-kit.grantKitItem', payload: { itemId } }) as CommandIntent

const HOME_HAZARD: Record<string, string> = {
  scree_plough: 'rockfall',
  shard_tongs: 'spinecrystal',
  vent_vane: 'steamvent',
}

function shownAt(session: ScriptedSession, tick: number) {
  return kitSocketsShownOf(session.state(), 'p1', KIT_SOCKETS, tick).map(({ socket, show }) => ({
    itemId: socket.itemId,
    ...show,
  }))
}

/** Planet 1 with the tool owned and its home hazard placed in GROUND. */
function sessionWithTool(itemId: string): ScriptedSession {
  const session = createScriptedSession()
  session.submit(START, grantKitItem(itemId))
  session.submit(START, placeHazardCommand(HOME_HAZARD[itemId]!, GROUND.tx, GROUND.ty))
  return session
}

describe('kit sockets shown on the rig', () => {
  it('shows no socket while the player owns no kit item', () => {
    expect(shownAt(createScriptedSession(), START)).toEqual([])
  })

  it.each(Object.keys(HOME_HAZARD))(
    'hangs %s idle away from its hazard, deployed by it and through its tail, idle after',
    (itemId) => {
      const session = sessionWithTool(itemId)
      session.submit(START + 1, poseAbove(AWAY, FACING.right))
      expect(shownAt(session, START + 1)).toEqual([{ itemId, heldFlasks: 0, isActing: false }])
      session.submit(START + 2, poseAbove(GROUND, FACING.down))
      expect(shownAt(session, START + 2)).toEqual([{ itemId, heldFlasks: 0, isActing: true }])
      session.submit(START + 2 + TAIL_TICKS - 1, poseAbove(AWAY, FACING.right))
      expect(shownAt(session, START + 1 + TAIL_TICKS)).toEqual([
        { itemId, heldFlasks: 0, isActing: true },
      ])
      session.submit(START + 2 + TAIL_TICKS, poseAbove(AWAY, FACING.right))
      expect(shownAt(session, START + 2 + TAIL_TICKS)).toEqual([
        { itemId, heldFlasks: 0, isActing: false },
      ])
    },
  )

  it('racks one flask per carried flask, idle while none is open', () => {
    const session = createScriptedSession()
    session.submit(START, grantKitItem('damp_flask'))
    session.submit(START, grantKitItem('damp_flask'))
    expect(shownAt(session, START)).toEqual([
      { itemId: 'damp_flask', heldFlasks: 2, isActing: false },
    ])
  })

  it('keeps the uncorked flask in the rack, vented, while it is open, and drops it once closed', () => {
    const session = createScriptedSession()
    session.submit(START, grantKitItem('damp_flask'))
    session.submit(START + 1, UNCORK_FLASK_INTENT)
    expect(shownAt(session, START + 1)).toEqual([
      { itemId: 'damp_flask', heldFlasks: 1, isActing: true },
    ])
    const untilTick = kitHoldingsOf(session.state(), 'p1').flaskUntilTick!
    expect(shownAt(session, untilTick - 1)).toHaveLength(1)
    expect(shownAt(session, untilTick)).toEqual([])
  })

  it('leaves the state and its digest as they were', () => {
    const session = sessionWithTool('scree_plough')
    session.submit(START + 1, poseAbove(GROUND, FACING.down))
    const before = stateDigest(session.state())
    shownAt(session, START + 1)
    expect(stateDigest(session.state())).toBe(before)
  })
})
