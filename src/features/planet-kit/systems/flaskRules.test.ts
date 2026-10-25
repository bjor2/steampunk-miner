import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { placeHazardCommand } from '../../../systems/authority/hazards/hazardDebugRules'
import {
  continueScriptedSession,
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { UNCORK_FLASK_INTENT } from './flaskRules'
import { heldCountOf } from './kitHoldings'
import { kitHoldingsOf, kitHoldingsProblems } from './kitHoldingsSection'

// The Damp Flask uncorked on purpose (ticket 881; the HS's point 3 on #850, the TD's seam as
// amended): one carried flask spent, the lowest g first, open for 3600 ticks as a saved
// `flaskUntilTick`, firedamp's drain at none while it is open; refused at no cost with no flask
// carried or one still open.

const START = 100
const OPEN_TICKS = 3600
const BELOW = { tx: GROUND.tx, ty: GROUND.ty - 1 }

const grantFlask: CommandIntent = {
  type: 'debug.planet-kit.grantKitItem',
  payload: { itemId: 'damp_flask' },
} as CommandIntent
const setPlanet = (planetIndex: number): CommandIntent => ({
  type: 'debug.setPlanet',
  payload: { planetIndex },
})

function eventsOfType<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

function rejectionOf(events: readonly DomainEvent[]): string | null {
  const [rejected] = eventsOfType(events, 'CommandRejected')
  return rejected === undefined ? null : rejected.reason
}

function flasksOf(session: ScriptedSession): bigint {
  return heldCountOf(kitHoldingsOf(session.state(), 'p1'), 'damp_flask')
}

/** The rig standing in a cut firedamp pocket below the surface, `flasks` carried. */
function standingInFiredamp(flasks: number): ScriptedSession {
  const session = createScriptedSession()
  for (let flask = 0; flask < flasks; flask++) session.submit(START, grantFlask)
  session.submit(START, placeHazardCommand('firedamp', GROUND.tx, GROUND.ty))
  mineTile(session, START + 1, GROUND)
  session.submit(START + 60, poseAbove(BELOW, FACING.down))
  return session
}

function savedAndLoaded(session: ScriptedSession): ScriptedSession {
  const text = JSON.stringify(takeSnapshot(session.state()))
  const restored = readSnapshot(JSON.parse(text) as SessionSnapshot)
  if (!('state' in restored)) throw new Error(restored.problems.join('\n'))
  return continueScriptedSession(restored.state)
}

describe('damp flask uncork', () => {
  it('refuses with no flask carried and changes nothing', () => {
    const session = createScriptedSession()
    const before = stateDigest(session.state())
    expect(rejectionOf(session.submit(START, UNCORK_FLASK_INTENT))).toBe('planet-kit.no_flask')
    expect(stateDigest(session.state())).toBe(before)
  })

  it('spends the flask of the lowest g, opens it for 3600 ticks and says so', () => {
    const session = createScriptedSession()
    session.submit(START, setPlanet(2))
    session.submit(START, grantFlask)
    session.submit(START, setPlanet(1))
    session.submit(START, grantFlask)
    const events = session.submit(START + 5, UNCORK_FLASK_INTENT)
    expect(eventsOfType(events, 'planet-kit.FlaskUncorked')).toMatchObject([
      { itemId: 'damp_flask', g: '1', untilTick: START + 5 + OPEN_TICKS, left: '1' },
    ])
    expect(kitHoldingsOf(session.state(), 'p1').stacks).toEqual([
      { itemId: 'damp_flask', g: '2', count: '1' },
    ])
  })

  it('refuses a second uncork while one is open, at no cost, and takes one once it closed', () => {
    const session = standingInFiredamp(2)
    session.submit(START + 61, UNCORK_FLASK_INTENT)
    const before = stateDigest(session.state())
    const again = session.submit(START + 62, UNCORK_FLASK_INTENT)
    expect(rejectionOf(again)).toBe('planet-kit.flask_open')
    expect(stateDigest(session.state())).toBe(before)
    expect(flasksOf(session)).toBe(1n)
    expect(kitHoldingsOf(session.state(), 'p1').flaskUntilTick).toBe(START + 61 + OPEN_TICKS)
    const later = session.submit(START + 61 + OPEN_TICKS, UNCORK_FLASK_INTENT)
    expect(eventsOfType(later, 'planet-kit.FlaskUncorked')).toHaveLength(1)
    expect(flasksOf(session)).toBe(0n)
  })

  it('stops the firedamp drain while the flask is open, and drains again once it closed', () => {
    const session = standingInFiredamp(1)
    session.submit(START + 61, UNCORK_FLASK_INTENT)
    for (let tick = START + 240; tick < START + 61 + OPEN_TICKS; tick += 180) {
      const events = session.submit(tick, poseAbove(BELOW, FACING.down))
      expect(eventsOfType(events, 'HazardDrained')).toEqual([])
    }
    const closed = session.submit(START + 61 + OPEN_TICKS + 180, poseAbove(BELOW, FACING.down))
    expect(eventsOfType(closed, 'HazardDrained')).toHaveLength(1)
  })

  it('keeps the open flask’s window through a save and a load', () => {
    const session = standingInFiredamp(2)
    session.submit(START + 61, UNCORK_FLASK_INTENT)
    const loaded = savedAndLoaded(session)
    expect(kitHoldingsOf(loaded.state(), 'p1').flaskUntilTick).toBe(START + 61 + OPEN_TICKS)
    expect(rejectionOf(loaded.submit(START + 70, UNCORK_FLASK_INTENT))).toBe(
      'planet-kit.flask_open',
    )
  })

  it('saves the window only as a whole tick', () => {
    const holdings = { tools: [], stacks: [] }
    expect(kitHoldingsProblems({ ...holdings, flaskUntilTick: 3700 })).toEqual([])
    expect(kitHoldingsProblems({ ...holdings, flaskUntilTick: -1 })).toEqual([
      'kit holdings.flaskUntilTick must be a whole tick, or be left out',
    ])
    expect(kitHoldingsProblems({ ...holdings, flaskUntilTick: '3700' })).toEqual([
      'kit holdings.flaskUntilTick must be a whole tick, or be left out',
    ])
  })
})
