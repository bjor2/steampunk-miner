import { describe, expect, it } from 'vitest'
import { FIRE_EAST, PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { fireTileOf } from './fireTile'
import { mountedLevels } from './gunLevels'

const FIRE_TICK = 10
const setLevels: CommandIntent = { type: 'debug.ground-gun.setLevels', payload: mountedLevels() }

function firedSession() {
  const session = createScriptedSession()
  session.submit(0, setLevels)
  standInPocket(session, PLAIN_RIG, 0)
  session.submit(FIRE_TICK, FIRE_EAST)
  session.advanceTo(FIRE_TICK + 20)
  return session
}

describe('ground-gun: the fire tile ring', () => {
  it('shows no tile before the gun is mounted', () => {
    expect(fireTileOf(createScriptedSession().state(), 'p1')).toBeNull()
  })

  it('stands full and ready with no shot recovering', () => {
    const session = createScriptedSession()
    session.submit(0, setLevels)
    expect(fireTileOf(session.state(), 'p1')).toEqual({
      recoveryFilledPercent: 100,
      isRecovering: false,
    })
  })

  it('fills with the share of the wait already run, and is full once the gun may fire', () => {
    const session = firedSession()
    const nextShotTick = nextShotTickOf(session.state(), 'p1')
    const halfway = FIRE_TICK + Math.floor((nextShotTick - FIRE_TICK) / 2)
    session.advanceTo(halfway)
    const tile = fireTileOf(session.state(), 'p1')
    expect(tile?.isRecovering).toBe(true)
    expect(tile?.recoveryFilledPercent).toBeGreaterThanOrEqual(49)
    expect(tile?.recoveryFilledPercent).toBeLessThanOrEqual(50)
    session.advanceTo(nextShotTick)
    expect(fireTileOf(session.state(), 'p1')).toEqual({
      recoveryFilledPercent: 100,
      isRecovering: false,
    })
  })
})
