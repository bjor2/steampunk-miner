import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { placeHazardCommand } from '../../../systems/authority/hazards/hazardDebugRules'
import {
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import type { KitPolicy } from '../../../systems/bot/botCrates'
import { uncorkOnFiredampEntry } from '../../../systems/bot/botFlask'
import type { BotPilot } from '../../../systems/bot/botPilot'
import { createBotSession } from '../../../systems/bot/botSession'
import { botMoveSpeedOf, botTravelSpeedOf } from '../../../systems/bot/botWorld'
import { FACING } from '../../../systems/vehicle/vehiclePose'

// The pacing bot and the kit tools (ticket 881; the TD's seam on #850): under
// `kitPolicy.flask: 'on_firedamp_entry'` it uncorks a carried flask on the report that first
// stands it in firedamp, once per entry, and never with the policy off; with a tool acting, its
// climbs and sideways moves pay the tool's trade-off as a player's do.

const FLASK_ON: KitPolicy = { crates: 'never', flask: 'on_firedamp_entry' }
const FLASK_OFF: KitPolicy = { crates: 'never' }
const AWAY = { tx: GROUND.tx + 3, ty: GROUND.ty }

const grant = (itemId: string): CommandIntent =>
  ({ type: 'debug.planet-kit.grantKitItem', payload: { itemId } }) as CommandIntent

/** The bot on planet 1 carrying two flasks, a firedamp cell cut open at GROUND. */
function botBesideFiredamp(kitPolicy: KitPolicy) {
  const scripted = createScriptedSession()
  scripted.submit(100, grant('damp_flask'))
  scripted.submit(100, grant('damp_flask'))
  scripted.submit(100, placeHazardCommand('firedamp', GROUND.tx, GROUND.ty))
  mineTile(scripted, 101, GROUND)
  const session = createBotSession(scripted.state(), 'p1')
  const pilot: BotPilot = { position: AWAY, facing: FACING.left, kitPolicy }
  return { session, pilot }
}

function uncorks(session: ReturnType<typeof createBotSession>): number {
  return session.events().filter((event) => event.type === 'planet-kit.FlaskUncorked').length
}

describe('bot kit tools', () => {
  it('uncorks one flask on the report that first stands it in firedamp', () => {
    const { session, pilot } = botBesideFiredamp(FLASK_ON)
    uncorkOnFiredampEntry(session, pilot, AWAY)
    expect(uncorks(session)).toBe(0)
    uncorkOnFiredampEntry(session, pilot, GROUND)
    expect(uncorks(session)).toBe(1)
    uncorkOnFiredampEntry(session, pilot, GROUND)
    expect(uncorks(session)).toBe(1)
  })

  it('uncorks again only after leaving the pocket, once the first flask closed', () => {
    const { session, pilot } = botBesideFiredamp(FLASK_ON)
    uncorkOnFiredampEntry(session, pilot, GROUND)
    session.wait(3600)
    uncorkOnFiredampEntry(session, pilot, AWAY)
    uncorkOnFiredampEntry(session, pilot, GROUND)
    expect(uncorks(session)).toBe(2)
  })

  it('never uncorks with the flask policy off, and sends nothing', () => {
    const { session, pilot } = botBesideFiredamp(FLASK_OFF)
    uncorkOnFiredampEntry(session, pilot, GROUND)
    expect(session.commands()).toEqual([])
  })

  it('moves at its travel speed with no tool acting, and slower sideways while the vane acts', () => {
    const scripted = createScriptedSession()
    scripted.submit(100, grant('vent_vane'))
    const bare = botTravelSpeedOf(scripted.state(), 'p1')
    expect(botMoveSpeedOf(scripted.state(), 'p1', GROUND, AWAY)).toBe(bare)
    scripted.submit(100, placeHazardCommand('steamvent', GROUND.tx, GROUND.ty))
    scripted.submit(101, poseAbove(GROUND, FACING.down))
    expect(botMoveSpeedOf(scripted.state(), 'p1', GROUND, AWAY)).toBeCloseTo(bare * 0.7, 9)
    const up = { tx: GROUND.tx, ty: GROUND.ty + 3 }
    expect(botMoveSpeedOf(scripted.state(), 'p1', GROUND, up)).toBe(bare)
  })
})
