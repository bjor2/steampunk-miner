import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { onCurveLevel } from '../economy/vehicleStats'
import { digestsOf } from '../replay/replayRun'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import type { ChargePolicy } from './botCharges'
import { playSlice, type SliceRun } from './playSlice'

const WORLD_SEED = 83921
/** Three minutes on planet 7: past the first dock visit, where the rack was once always bought. */
const ON_CURVE_BUDGET_TICKS = 3 * 60 * 60
/** Fifteen minutes: the trip that meets a slow tile, the visit that buys the rack, the blasts. */
const BEHIND_BUDGET_TICKS = 15 * 60 * 60
/** A drill this far behind the curve meets tiles over the 96-tick threshold (#109 bot policy). */
const DRILL_LEVELS_BEHIND = 12
const DRILL_TRACKS: readonly UpgradeId[] = ['drill_power', 'drill_tip']
/** Enough for a rack of three (about 450k on planet 7) from the first visit, with no charges. */
const MONEY = '700000'

/** Arrived on planet 7 with no charges, money for the rack and the drill `drillBehind` levels back. */
function arrivedOnPlanet7(drillBehind: number): CommandIntent[] {
  return [
    setPlanetCommand(7),
    setPlanetSeedCommand(WORLD_SEED),
    { type: 'debug.setMoney', payload: { amount: MONEY } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, arrivalLevel(id, drillBehind))),
  ]
}

function arrivalLevel(upgradeId: UpgradeId, drillBehind: number): number {
  const onCurve = onCurveLevel(upgradeId, 7)
  return DRILL_TRACKS.includes(upgradeId) ? onCurve - drillBehind : onCurve
}

function planet7Run(drillBehind: number, chargePolicy: ChargePolicy, maxTicks: number): SliceRun {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  return playSlice(start, {
    maxTicks,
    lastPlanet: 7,
    startCommands: arrivedOnPlanet7(drillBehind),
    chargePolicy,
  })
}

const typesOf = (run: SliceRun) => run.events.map((event) => event.type)

describe('pacing bot charge rack (#129)', () => {
  it('plays exactly like a run without charges when no tile is slower than the threshold', () => {
    const blasting = planet7Run(0, 'blast', ON_CURVE_BUDGET_TICKS)
    const drilling = planet7Run(0, 'never', ON_CURVE_BUDGET_TICKS)
    expect(typesOf(blasting)).not.toContain('ChargesRestocked')
    expect(blasting.commands).toEqual(drilling.commands)
    expect(digestsOf(blasting.events)).toEqual(digestsOf(drilling.events))
    expect(blasting.state).toEqual(drilling.state)
  })

  it('buys the rack at the visit after a trip that met a slow tile with none, then blasts', () => {
    const types = typesOf(planet7Run(DRILL_LEVELS_BEHIND, 'blast', BEHIND_BUDGET_TICKS))
    const firstDeparture = types.indexOf('DockLeft')
    const firstRestock = types.indexOf('ChargesRestocked')
    expect(firstDeparture).toBeGreaterThanOrEqual(0)
    expect(firstRestock).toBeGreaterThan(firstDeparture)
    expect(types.indexOf('ChargeDetonated')).toBeGreaterThan(firstRestock)
  })
})
