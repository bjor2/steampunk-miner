import { describe, expect, it } from 'vitest'
import { dockSiteOfPlanet } from '../../../../systems/authority/planetOfState'
import { createScriptedSession } from '../../../../systems/authority/scriptedSession'
import { bayCentreColumnOf } from '../../../../systems/world/dockBays'
import type { DockSite } from '../../../../systems/world/dockSite'
import { dockAddOnOfRow } from '../dockAddOns'
import { dockAddOnLookPointOf, dockAddOnOriginOf } from './dockAddOnPlacement'

function planetOneSite(): DockSite {
  return dockSiteOfPlanet(createScriptedSession().state().planet)!
}

describe('dock add-on placement', () => {
  it('stands the scanner mast up the Assay & Exchange, from the Sell zone centre on the pad top', () => {
    const site = planetOneSite()
    const mast = dockAddOnOfRow('scanner_station')!
    const origin = dockAddOnOriginOf(site, mast)
    expect(origin.x).toBeCloseTo(bayCentreColumnOf(site, 'sell') + mast.atM[0], 9)
    expect(origin.y).toBeCloseTo(site.padRow + 1 + mast.atM[1], 9)
    expect(origin.x).toBeGreaterThan(bayCentreColumnOf(site, 'sell'))
    expect(origin.y).toBeGreaterThan(site.padRow + 1)
  })

  it('puts the annex at pad level behind the Works and the hangar on its roof', () => {
    const site = planetOneSite()
    const annex = dockAddOnOriginOf(site, dockAddOnOfRow('research_lab')!)
    const hangar = dockAddOnOriginOf(site, dockAddOnOfRow('drone_bay')!)
    const worksX = bayCentreColumnOf(site, 'upgrade')
    expect(annex.y).toBe(site.padRow + 1)
    expect(annex.x).toBeLessThan(worksX)
    expect(hangar.y).toBeGreaterThan(site.padRow + 1 + 4)
    expect(hangar.x).toBeGreaterThan(worksX)
  })

  it('looks at a point on the add-on itself for the unlock pan', () => {
    const site = planetOneSite()
    const mast = dockAddOnOfRow('scanner_station')!
    const origin = dockAddOnOriginOf(site, mast)
    const look = dockAddOnLookPointOf(site, mast)
    expect(look.x).toBeCloseTo(origin.x + mast.lookAtM[0], 9)
    expect(look.y).toBeCloseTo(origin.y + mast.lookAtM[1], 9)
  })
})
