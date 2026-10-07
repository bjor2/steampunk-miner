import { describe, expect, it } from 'vitest'
import { GROUND } from '../../../systems/authority/scriptedSession'
import { press, sensingSession, standInPocket } from '../sensingTestSession'
import { boardAfterHeard } from './revealBoard'
import { EMPTY_SENSING_VIEW, PASSIVE_READ_EVERY_TICKS, sensingViewAt } from './sensingView'

// One client's sensing view on the frame clock (#203): the passives read a few times a second,
// the board kept until a new planet or a clock that went back starts it afresh.

const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }

function pingedSession() {
  const session = sensingSession({ 'powerup.1': 'power.echo_sounder' })
  standInPocket(session, 2, UNDERGROUND)
  const from = session.events().length
  session.submit(10, press('powerup.1'))
  session.advanceTo(16)
  return { session, events: session.events().slice(from) }
}

describe('sensing view', () => {
  it('reads the passives at once, then keeps them until the next read is due', () => {
    const { session } = pingedSession()
    const state = session.state()
    const first = sensingViewAt(EMPTY_SENSING_VIEW, state, 'p1', 20)
    expect(first.passives.lens).not.toBeNull()
    const soon = sensingViewAt(first, state, 'p1', 20 + PASSIVE_READ_EVERY_TICKS - 1)
    expect(soon).toBe(first)
    const due = sensingViewAt(first, state, 'p1', 20 + PASSIVE_READ_EVERY_TICKS)
    expect(due.passives).toBe(first.passives)
    expect(due.readTick).toBe(20 + PASSIVE_READ_EVERY_TICKS)
  })

  it('starts afresh when the clock goes back, as on a restored session', () => {
    const { session, events } = pingedSession()
    const state = session.state()
    const view = sensingViewAt(EMPTY_SENSING_VIEW, state, 'p1', 20)
    const pinged = { ...view, board: boardAfterHeard(view.board, events, state, 'p1') }
    expect(sensingViewAt(pinged, state, 'p1', 21).board.marks.length).toBeGreaterThan(0)
    expect(sensingViewAt(pinged, state, 'p1', 5).board.marks).toEqual([])
  })
})
