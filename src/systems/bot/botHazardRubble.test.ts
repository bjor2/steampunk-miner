import { describe, expect, it } from 'vitest'
import { placeHazardCommand } from '../authority/hazards/hazardDebugRules'
import { createScriptedSession, drill, GROUND, mineTile } from '../authority/scriptedSession'
import { tileKindAt } from './botWorld'

// Ticket 848: a rockfall cell the bot bored fills back with rubble, which the bot reads as ground
// and bores out again before it enters, as a player must; a cut cell with no hazard stays open.

describe('bot hazard rubble', () => {
  it('reads a refilled rockfall cell as ground until its rubble is bored out', () => {
    const session = createScriptedSession()
    session.submit(100, placeHazardCommand('rockfall', GROUND.tx, GROUND.ty))
    mineTile(session, 101, GROUND)
    expect(tileKindAt(session.state(), GROUND)).toBe('ground')
    session.submit(200, drill(GROUND, 40))
    expect(tileKindAt(session.state(), GROUND)).toBe('open')
  })

  it('reads a cut cell with no hazard as open', () => {
    const session = createScriptedSession()
    mineTile(session, 101, GROUND)
    expect(tileKindAt(session.state(), GROUND)).toBe('open')
  })
})
