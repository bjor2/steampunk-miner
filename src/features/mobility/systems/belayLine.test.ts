import { describe, expect, it } from 'vitest'
import { setArtefactCommand } from '../../../systems/artefacts/artefactCommands'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { chargesLeftOf } from '../../power-up-core'
import {
  CAVITY,
  MM,
  ofType,
  poseAt,
  press,
  sessionWith,
  standInCavity,
} from '../mobilityTestSession'
import { BELAY_MOTION } from './belayLine'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { mobilityOf } from './mobilitySection'

// The Belay Line twist on the grapple winch (spec #162 twist row, ticket 329): held, the shot plants
// a standing line instead of reeling, firing again moves it, and while it stands a fall within the
// grapple's reach of the hook is caught (a hover through the kernel motion seam); a cut down, slower
// than the catch speed, never is.

const GRAPPLE = { 'powerup.1': MOBILITY_ITEM.grappleWinch }
const BELAY_LINE = 'artefact.grapple_anchor'
const PRESS_TICK = 10
const ACT_TICK = 16
const CATCH = MOBILITY_ECONOMY.belay.catchSpeedMmPerS

/** In the cavity facing up with the line planted on its roof; the twist held when `isTwisted`. */
function sessionWithLine(isTwisted = true): ScriptedSession {
  const session = sessionWith(GRAPPLE)
  if (isTwisted) session.submit(2, setArtefactCommand(BELAY_LINE))
  standInCavity(session, 5, FACING.up)
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK)
  return session
}

/** The line's effect at the next tick after a pose report at the cavity centre moving down. */
function effectWhileFalling(session: ScriptedSession, downMmPerS: number, offsetMm = 0) {
  const tick = session.state().tick + 1
  session.submit(tick, poseAt(CAVITY.x + offsetMm, CAVITY.y, FACING.up, { vy: -downMmPerS }))
  return BELAY_MOTION.effectOf(session.state(), 'p1', tick)
}

describe('Belay Line: the shot', () => {
  it('plants a standing line on the hook instead of reeling, for one charge', () => {
    const session = sessionWithLine()
    const [hooked] = ofType(session.events(), 'mobility.GrappleHooked')
    if (hooked?.type !== 'mobility.GrappleHooked') throw new Error('no hook')
    const value = mobilityOf(session.state(), 'p1')
    expect(value.reel).toBeNull()
    expect(value.belay).toEqual({
      hookTx: hooked.hookTx,
      hookTy: hooked.hookTy,
      planetIndex: 1,
      reachTiles: MOBILITY_ECONOMY.grapple.rangeTiles,
      untilTick: ACT_TICK + MOBILITY_ECONOMY.belay.windowTicks,
    })
    expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(3)
  })

  it('moves the one line when fired again', () => {
    const session = sessionWithLine()
    const first = mobilityOf(session.state(), 'p1').belay!
    const again = ACT_TICK + MOBILITY_ECONOMY.grapple.cooldownTicks
    session.submit(again, poseAt(CAVITY.x, CAVITY.y, FACING.right))
    session.submit(again, press())
    session.advanceTo(again + MOBILITY_ECONOMY.grapple.windupTicks)
    const moved = mobilityOf(session.state(), 'p1').belay!
    expect([moved.hookTx, moved.hookTy]).not.toEqual([first.hookTx, first.hookTy])
    expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(2)
  })

  it('reels as before while a base artefact is held instead', () => {
    const session = sessionWith(GRAPPLE)
    session.submit(2, setArtefactCommand('artefact.ore_whisper'))
    standInCavity(session, 5, FACING.up)
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK)
    expect(mobilityOf(session.state(), 'p1').reel).not.toBeNull()
    expect(mobilityOf(session.state(), 'p1').belay).toBeUndefined()
  })
})

describe('Belay Line: the catch', () => {
  it('catches a fall faster than the catch speed within reach of the hook', () => {
    expect(effectWhileFalling(sessionWithLine(), CATCH + 1000)).toEqual({ hover: true })
  })

  it('lets a cut down, slower than the catch speed, through', () => {
    expect(effectWhileFalling(sessionWithLine(), CATCH)).toBeNull()
  })

  it('catches nothing beyond the grapple’s reach of the hook', () => {
    const beyond = (MOBILITY_ECONOMY.grapple.rangeTiles + 2) * MM
    expect(effectWhileFalling(sessionWithLine(), CATCH + 1000, beyond)).toBeNull()
  })

  it('lets go once its hook cell is cut away', () => {
    const session = sessionWithLine()
    const { hookTx, hookTy } = mobilityOf(session.state(), 'p1').belay!
    const hookCentre = { x: hookTx * MM + MM / 2, y: hookTy * MM + MM / 2 }
    session.submit(20, carveCircleCommand({ ...hookCentre, radius: 900, amount: SOLID_DENSITY }))
    expect(effectWhileFalling(session, CATCH + 1000)).toBeNull()
  })

  it('lets go at its window’s end, leaving the section as if it never ran', () => {
    const session = sessionWithLine()
    session.advanceTo(mobilityOf(session.state(), 'p1').belay!.untilTick)
    expect(mobilityOf(session.state(), 'p1').belay).toBeUndefined()
    expect(session.state().players.p1.slices?.mobility).toBeUndefined()
  })
})
