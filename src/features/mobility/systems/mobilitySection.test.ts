import { describe, expect, it } from 'vitest'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { press, sessionWith, standInCavity } from '../mobilityTestSession'
import { MOBILITY_ITEM } from './itemIds'
import { readMobilityEconomy } from './mobilityEconomy'
import { MOBILITY_SECTION, mobilityOf, NO_MOBILITY_EFFECTS } from './mobilitySection'
import MOBILITY_ECONOMY_FILE from '../mobility.economy.json'

// The `mobility` section v1 and the lane's numbers: running windows round-trip through the save,
// a malformed body or file is refused whole, and every window clears itself when it ends.

describe('mobility section', () => {
  it('round-trips running windows through its portable form', () => {
    const session = sessionWith({
      'powerup.1': MOBILITY_ITEM.grappleWinch,
      'powerup.2': MOBILITY_ITEM.smokeCanister,
    })
    standInCavity(session, 5, FACING.up)
    session.submit(10, press())
    session.submit(20, press('powerup.2'))
    session.advanceTo(26)
    const value = mobilityOf(session.state(), 'p1')
    expect(value.reel).not.toBeNull()
    expect(value.smoke).not.toBeNull()
    const portable = JSON.parse(JSON.stringify(MOBILITY_SECTION.toPortable(value)))
    expect(MOBILITY_SECTION.problems(portable)).toEqual([])
    expect(MOBILITY_SECTION.ofPortable(portable)).toEqual(value)
  })

  it('refuses a body with a malformed window, naming it', () => {
    expect(MOBILITY_SECTION.problems({ ...NO_MOBILITY_EFFECTS, smoke: { x: 1 } })).toEqual([
      'mobility.smoke must be null or {x, y, untilTick} integers',
    ])
    expect(MOBILITY_SECTION.problems('nothing')).toEqual(['mobility must be an object'])
  })

  it('goes back to its initial value once every window has ended', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.steamShield })
    session.submit(10, press())
    session.advanceTo(20)
    expect(session.state().players.p1.slices?.mobility).toBeDefined()
    session.advanceTo(136)
    expect(session.state().players.p1.slices?.mobility).toBeUndefined()
  })
})

describe('mobility economy file', () => {
  it('reads the committed numbers', () => {
    expect(readMobilityEconomy(MOBILITY_ECONOMY_FILE)).toHaveProperty('economy')
  })

  it('refuses a negative or missing number, naming its path', () => {
    const file = structuredClone(MOBILITY_ECONOMY_FILE) as {
      mobility: { smoke: Record<string, unknown> }
    }
    file.mobility.smoke.radiusTiles = -1
    delete file.mobility.smoke.windowTicks
    const reading = readMobilityEconomy(file)
    expect('problems' in reading && reading.problems.join('\n')).toMatch(
      /mobility\.smoke\.radiusTiles[\s\S]*mobility\.smoke\.windowTicks|mobility\.smoke\.windowTicks[\s\S]*mobility\.smoke\.radiusTiles/,
    )
  })
})
