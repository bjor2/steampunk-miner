import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../../world/dockSite'
import { planetParamsFor } from '../../world/planetParams'
import { dockedBayOf } from '../dockRules'
import type { DomainEvent } from '../domainEvent'
import { WORLD_SEED } from '../scriptedSession'
import { dockAtBayOf, REFINERY_SITE, sessionOnPlanet } from './refineryFixtures'

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

describe('refinery bay docking', () => {
  it('docks at the Refinery bay from planet 3 and says so in dock_entered', () => {
    const session = sessionOnPlanet(3)
    const events = dockAtBayOf(session, 10, REFINERY_SITE, 'refinery')
    expect(events.find((event) => event.type === 'DockEntered')).toMatchObject({ bay: 'refinery' })
    expect(dockedBayOf(session.state(), 'p1')).toBe('refinery')
  })

  it('refuses a dock at the Refinery bay before planet 3 with refinery_locked', () => {
    const session = sessionOnPlanet(2)
    const site = dockSiteOf(planetParamsFor(WORLD_SEED, 2))
    expect(rejectionOf(dockAtBayOf(session, 10, site, 'refinery'))).toMatchObject({
      reason: 'refinery_locked',
    })
  })

  it('refuses the quick service at the Refinery bay as wrong_bay (#170)', () => {
    const session = sessionOnPlanet(3, '1000')
    dockAtBayOf(session, 10, REFINERY_SITE, 'refinery')
    session.submit(11, { type: 'debug.setEnergy', payload: { energy: '75' } })
    const events = session.submit(12, { type: 'quickService', payload: {} })
    expect(rejectionOf(events)).toMatchObject({ reason: 'wrong_bay' })
  })

  it('docks the yard at the Refinery bay, between the two shops (#170)', () => {
    const session = sessionOnPlanet(3)
    const events = dockAtBayOf(session, 10, REFINERY_SITE, 'refinery')
    expect(events.find((event) => event.type === 'DockEntered')).toMatchObject({ bay: 'refinery' })
    expect(session.state().players.p1.vehicle.pose?.x).toBe(0)
  })

  it('refuses a debug teleport to the Refinery bay before planet 3', () => {
    const session = sessionOnPlanet(2)
    const events = session.submit(10, {
      type: 'debug.teleportToDock',
      payload: { bay: 'refinery' },
    })
    expect(rejectionOf(events)).toMatchObject({ reason: 'refinery_locked' })
  })
})
