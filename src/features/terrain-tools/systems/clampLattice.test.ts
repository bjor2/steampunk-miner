import { describe, expect, it } from 'vitest'
import {
  buildWeakTunnel,
  WEAK_TUNNEL_HOLD_TICKS,
} from '../../../systems/authority/collapse/collapseFixtures'
import { holdTicksOf, refillTickOf } from '../../../systems/authority/collapse/collapseState'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { telegraphProgress } from '../../../systems/render/collapseTelegraph'
import { intentToReleaseSlot } from '../../power-up-core'
import { ofType, press } from '../terrainTestSession'
import { clampLatticeOf } from './clampLattice'
import { clampHoldOf, LODE_CLAMP_ID } from './lodeClamp'

// What the lode clamp's lattice shows (G&V feel line 3 on #285, ticket 285), read from the
// authority state as the scene would: struts over exactly the braced blocks, each block's
// countdown frozen while braced and back at its full hold on the tick the brace ends, and the
// slot's hold running from the act to the field's length. The collapse specs' weak band-2 tunnel
// warns on tick 10 and, one grade short, holds 1200 ticks before it bursts (ticket 829); the clamp
// acts on tick 1166, 44 ticks before that, and is let go on tick 1240.

const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + WEAK_TUNNEL_HOLD_TICKS
const PRESS_TICK = REFILL_TICK - 50
const ACT_TICK = PRESS_TICK + 6
const RELEASE_TICK = REFILL_TICK + 30
const HOLD_TICKS = 180

function heldClamp(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
  buildWeakTunnel(session, WARN_TICK)
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK)
  return session
}

const latticeBlocks = (session: ScriptedSession) =>
  clampLatticeOf(session.state(), 'p1').map(({ block }) => block)

describe('lode clamp lattice', () => {
  it('lays the struts over exactly the blocks the field braces', () => {
    const session = heldClamp()
    const braced = ofType(session.events(), 'CollapseBraced').map((event) =>
      'block' in event ? event.block : '',
    )
    expect(braced.length).toBeGreaterThan(0)
    expect([...latticeBlocks(session)].sort()).toEqual([...braced].sort())
  })

  it('freezes each braced countdown at what it had left when the brace caught it', () => {
    const session = heldClamp()
    const caughtLeft = REFILL_TICK - ACT_TICK
    for (const tick of [ACT_TICK, ACT_TICK + 30, RELEASE_TICK - 1]) {
      session.advanceTo(tick)
      const lattice = clampLatticeOf(session.state(), 'p1')
      expect(lattice.map(({ frozenTicksLeft }) => frozenTicksLeft)).toEqual(
        lattice.map(() => caughtLeft),
      )
    }
  })

  it('takes the struts away and shows the full countdown on the tick the brace ends', () => {
    const session = heldClamp()
    const braced = latticeBlocks(session)
    session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
    const { collapse, tick } = session.state()
    expect(clampLatticeOf(session.state(), 'p1')).toEqual([])
    const fresh = collapse.blocks.filter((entry) => braced.includes(entry.block))
    expect(
      fresh.map((entry) => telegraphProgress(tick - entry.startTick, holdTicksOf(entry))),
    ).toEqual(braced.map(() => 0))
    expect(fresh.map((entry) => refillTickOf(entry) - tick)).toEqual(
      braced.map(() => WEAK_TUNNEL_HOLD_TICKS),
    )
  })

  it("runs the slot's hold from the act to the field's length, and drops it at the end", () => {
    const session = heldClamp()
    expect(clampHoldOf(session.state(), 'p1')).toEqual({
      startTick: ACT_TICK,
      finishTick: ACT_TICK + HOLD_TICKS,
    })
    session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
    expect(clampHoldOf(session.state(), 'p1')).toBeNull()
  })
})
