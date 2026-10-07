import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { dockSiteOfPlanet } from '../../../../systems/authority/planetOfState'
import { createScriptedSession } from '../../../../systems/authority/scriptedSession'
import { dockAddOnOfRow } from '../dockAddOns'
import { dockAddOnLookPointOf } from './dockAddOnPlacement'
import { dockAddOnUnlockedBy, dockUnlockPanOf, dockUnlockPanStagingOf } from './dockUnlockPan'
import { PAN_IN_TICKS, PAN_TICKS } from './unlockPan'

const ARRIVAL_TICK = 500

function onPlanet(planetIndex: number, tick = ARRIVAL_TICK): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  const state = session.state()
  return { ...state, tick }
}

const unlocked = (featureId: string): DomainEvent => ({
  type: 'FeatureUnlocked',
  featureId,
  tick: ARRIVAL_TICK,
})

describe('dock unlock pan', () => {
  it('pans onto the add-on whose row the events unlock, and on nothing else', () => {
    expect(dockAddOnUnlockedBy([unlocked('research_lab')])?.id).toBe('research_annex')
    expect(dockAddOnUnlockedBy([unlocked('refinery_bay')])).toBeNull()
    expect(dockAddOnUnlockedBy([{ type: 'PlanetUnlocked', planetIndex: 14, tick: 1 }])).toBeNull()
  })

  it('starts at the session tick and looks at the add-on on the planet it stands on', () => {
    const state = onPlanet(14)
    const mast = dockAddOnOfRow('scanner_station')!
    const shown = dockUnlockPanOf(mast, state)!
    expect(shown).toEqual({
      rowId: 'scanner_station',
      planetIndex: 14,
      pan: {
        startTick: ARRIVAL_TICK,
        lookAt: dockAddOnLookPointOf(dockSiteOfPlanet(state.planet)!, mast),
      },
    })
  })

  it('stages the camera on its planet while it runs, and never on another planet', () => {
    const shown = dockUnlockPanOf(dockAddOnOfRow('scanner_station')!, onPlanet(14))
    const restedOn = onPlanet(14, ARRIVAL_TICK + PAN_IN_TICKS)
    expect(dockUnlockPanStagingOf(restedOn, shown)?.cameraWeight).toBe(1)
    expect(dockUnlockPanStagingOf(onPlanet(1, ARRIVAL_TICK + PAN_IN_TICKS), shown)).toBeNull()
    expect(dockUnlockPanStagingOf(onPlanet(14, ARRIVAL_TICK + PAN_TICKS), shown)).toBeNull()
    expect(dockUnlockPanStagingOf(restedOn, null)).toBeNull()
  })
})
