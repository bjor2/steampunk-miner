import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { startLevels, type UpgradeLevels } from '../economy/vehicleStats'
import { isBoilerStepDue, shortLoadShareOf } from './botBoiler'
import { paramsOfSession } from './botWorld'
import { newMineLayout, type MineLayout } from './mineLayout'

// Systems' boiler rule (section 3 of their rows on #553, ticket 553): a boiler step is due while
// the energy cap cuts the average full-hold load by more than 20%.

function layoutOnPlanet(planetIndex: number): MineLayout {
  const state = createAuthorityState({ planetIndex, planetSeed: 83921, playerIds: ['p1'] })
  return newMineLayout(paramsOfSession(state), dockSiteOfPlanet(state.planet)!)
}

function rigWith(changes: Partial<UpgradeLevels>): UpgradeLevels {
  return { ...startLevels(), drill_power: 12, drill_tip: 70, ...changes }
}

describe('bot boiler rule', () => {
  it('leaves the boiler alone while the tank fills the starting hold on every trip', () => {
    const layout = layoutOnPlanet(1)
    expect(shortLoadShareOf(layout, rigWith({}))).toBe(0)
    expect(isBoilerStepDue(layout, rigWith({}))).toBe(false)
  })

  it('wants a boiler step once the tank turns a big hold home short of full', () => {
    const layout = layoutOnPlanet(1)
    const bigHold = rigWith({ cargo_hold: 60 })
    expect(shortLoadShareOf(layout, bigHold)).toBeGreaterThan(1 / 5)
    expect(isBoilerStepDue(layout, bigHold)).toBe(true)
  })

  it('stops wanting one once the tank has caught up with the hold', () => {
    const layout = layoutOnPlanet(1)
    expect(isBoilerStepDue(layout, rigWith({ cargo_hold: 60, boiler: 60 }))).toBe(false)
  })

  it('weighs a shorter load as a larger share, never above the whole hold', () => {
    const layout = layoutOnPlanet(1)
    const shares = [30, 45, 60, 90].map((hold) =>
      shortLoadShareOf(layout, rigWith({ cargo_hold: hold })),
    )
    expect(shares).toEqual([...shares].sort((a, b) => a - b))
    expect(shares.every((share) => share >= 0 && share <= 1)).toBe(true)
  })
})
