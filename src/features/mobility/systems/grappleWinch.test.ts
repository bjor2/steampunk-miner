import { describe, expect, it } from 'vitest'
import { PARAMS } from '../../../systems/authority/scriptedSession'
import { FACING, tileOfMillimetres } from '../../../systems/vehicle/vehiclePose'
import { isAirCell, isSolidCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { chargesLeftOf } from '../../power-up-core'
import {
  CAVITY,
  CAVITY_RADIUS_MM,
  MM,
  ofType,
  press,
  sessionWith,
  standInCavity,
} from '../mobilityTestSession'
import { aimOf, isInAimCone } from './grappleHook'
import { MOBILITY_ITEM } from './itemIds'
import { mobilityOf } from './mobilitySection'

// The grapple winch (#162 row, G&V feel pass item 7, GD lock on #204 Q5): it fires straight up, or
// 45° up to the side the miner faces, bites the nearest solid cell in range, and reels the miner
// to the open tile short of it. No hook: refused, no charge spent, no gate line.

const GRAPPLE = { 'powerup.1': MOBILITY_ITEM.grappleWinch }

describe('grapple winch: aim', () => {
  it('fires straight up facing up or down, and 45° up toward the side faced', () => {
    const upright = { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024 }
    expect(aimOf({ ...upright, facing: FACING.up })).toEqual({ x: 0, y: 1024 })
    expect(aimOf({ ...upright, facing: FACING.down })).toEqual({ x: 0, y: 1024 })
    expect(aimOf({ ...upright, facing: FACING.right })).toEqual({ x: 1024, y: 1024 })
    expect(aimOf({ ...upright, facing: FACING.left })).toEqual({ x: -1024, y: 1024 })
  })

  it('takes a hook within 20° of the line and never one behind the miner', () => {
    const up = { x: 0, y: 1024 }
    expect(isInAimCone({ x: 360, y: 1000 }, up, 364)).toBe(true)
    expect(isInAimCone({ x: 370, y: 1000 }, up, 364)).toBe(false)
    expect(isInAimCone({ x: 0, y: -1000 }, up, 364)).toBe(false)
  })
})

describe('grapple winch: in play', () => {
  it('hooks the cavity roof straight above and reels the miner to the open tile beneath it', () => {
    const session = sessionWith(GRAPPLE)
    standInCavity(session, 5, FACING.up)
    session.submit(10, press())
    const events = session.advanceTo(16)
    const [hooked] = ofType(events, 'mobility.GrappleHooked')
    expect(hooked).toMatchObject({ playerId: 'p1', hookTx: CAVITY.x / MM - 0.5 })
    if (hooked?.type !== 'mobility.GrappleHooked') throw new Error('no hook')
    const world = session.state().world
    expect(isSolidCell(cellAt(world, PARAMS, { tx: hooked.hookTx, ty: hooked.hookTy }))).toBe(true)
    expect(isAirCell(cellAt(world, PARAMS, { tx: hooked.toTx, ty: hooked.toTy }))).toBe(true)
    expect(hooked.hookTy - hooked.toTy).toBe(1)
    expect(hooked.hookTy * MM).toBeGreaterThan(CAVITY.y + CAVITY_RADIUS_MM - 2 * MM)
    expect(mobilityOf(session.state(), 'p1').reel).toMatchObject({
      tx: hooked.toTx,
      ty: hooked.toTy,
    })
    expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(3)
  })

  it('lets go once its window ends, leaving the section as if it never ran', () => {
    const session = sessionWith(GRAPPLE)
    standInCavity(session, 5, FACING.up)
    session.submit(10, press())
    session.advanceTo(16)
    const reel = mobilityOf(session.state(), 'p1').reel!
    session.advanceTo(reel.untilTick)
    expect(mobilityOf(session.state(), 'p1').reel).toBeNull()
    expect(session.state().players.p1.slices?.mobility).toBeUndefined()
  })

  it('is refused at no cost with nothing to hook in the open sky above', () => {
    const session = sessionWith(GRAPPLE, FACING.up)
    session.submit(10, press())
    const events = session.advanceTo(30)
    expect(ofType(events, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: MOBILITY_ITEM.grappleWinch, reason: 'mobility.no_hook', chargesLeft: 4 },
    ])
    expect(ofType(events, 'power-up-core.PowerUpBlocked')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(4)
    expect(mobilityOf(session.state(), 'p1').reel).toBeNull()
  })

  it('changes no cell of the world, hooked or not', () => {
    const session = sessionWith(GRAPPLE)
    standInCavity(session, 5, FACING.up)
    const before = session.state().world
    session.submit(10, press())
    session.advanceTo(40)
    expect(session.state().world).toBe(before)
    expect(tileOfMillimetres(CAVITY.x, CAVITY.y)).toEqual({
      tx: CAVITY.x / MM - 0.5,
      ty: CAVITY.y / MM - 0.5,
    })
  })
})
