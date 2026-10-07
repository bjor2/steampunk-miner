import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { playSlice } from '../../systems/bot/playSlice'
import { UPGRADE_IDS } from '../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../systems/economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { press } from './drillGearTestSession'

// The Vertical Scaler's added acceptance on #205 (Q4 a): drill gear adds reach, never pace. The
// pacing bot arrives on planets 7 and 10 with on-curve levels and plays to the core twice, once
// bare and once with the vibratory bit in the head and the side cutters and reach boom switched
// on, on the three pacing seeds. The median of the per-seed ratios (with gear over bare) must stay
// at or above 0.98 (#84: judged on the median of three seeds, so one run's combat cannot flip it).
// Long: a dozen bot runs, for the box Tester (`npx vitest run src/features/drill-gear/drillGearPace.test.ts`).

const PLANETS = [7, 10] as const
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const MIN_RATIO = 0.98
/** Two hours on one planet: room for a slow core on either run. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const ARRIVAL_MONEY = '20000'
const TIMEOUT_MS = 60 * 60 * 1000

const GEAR_SLOTS = {
  'drill.head': 'gear.vibratory_bit',
  'drill.flank': 'gear.side_cutters',
  'drill.collar': 'gear.reach_boom',
}

/** On `planet` with the on-curve levels and a little money, as a bot arriving there. */
function arrivalOn(planet: number, worldSeed: number): CommandIntent[] {
  return [
    setPlanetCommand(planet),
    setPlanetSeedCommand(worldSeed),
    { type: 'debug.setMoney', payload: { amount: ARRIVAL_MONEY } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet)))),
  ]
}

/** The gear slotted and its two toggles switched on before the first trip. */
const GEAR_ON: CommandIntent[] = [
  setVehicleLoadoutCommand(GEAR_SLOTS),
  press('drill.flank'),
  press('drill.collar'),
]

/** Ticks from arrival to the planet's core; the whole budget when the core is never reached. */
function coreTicksOn(planet: number, worldSeed: number, isGeared: boolean): number {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: worldSeed, playerIds: ['p1'] })
  const run = playSlice(start, {
    maxTicks: BUDGET_TICKS,
    lastPlanet: planet,
    startCommands: [...arrivalOn(planet, worldSeed), ...(isGeared ? GEAR_ON : [])],
  })
  return run.isFinished ? run.state.tick : BUDGET_TICKS
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

describe('drill-gear pace (Vertical Scaler on #205)', () => {
  it.each(PLANETS)(
    'reaches planet %i core no faster than 0.98x the bare time with the gear on',
    (planet) => {
      const ratios = SEEDS.map((seed) => {
        const bare = coreTicksOn(planet, seed, false)
        const geared = coreTicksOn(planet, seed, true)
        console.log(`P${planet} seed ${seed}: bare ${bare}, geared ${geared} ticks`)
        return geared / bare
      })
      expect(median(ratios)).toBeGreaterThanOrEqual(MIN_RATIO)
    },
    TIMEOUT_MS,
  )
})
