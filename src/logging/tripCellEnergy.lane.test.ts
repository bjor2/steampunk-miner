import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { playLoggedSlice } from './sliceRunLog'
import {
  createTripCellEnergyFold,
  TRIP_TANK_MARGIN_FLOOR,
  tripTankMarginOf,
  type TripCellEnergy,
} from './tripCellEnergy'

// The paired pacing run's per-cell energy (ticket 529, Systems 6226531099 on #514, Done-when 3):
// the bot and scripted drills stay on the whole-tick clock, so the bot's own `tank_empty` and
// tank margin are no evidence for the player path. The bot slice is played on its three pacing
// seeds; every trip logs the energy the bot was charged beside the per-cell figure the player's
// exact report carve charges for the same cells (`tripCellEnergy.ts`), and every trip that broke a
// cell must keep the tank at least 1.138 times that figure. The bot's own bands and #524's baseline
// do not move with ticket 529 (its digests are unchanged), so main and the tip play the same
// trips and the pairing reads the same lines. A lane: it runs only when named, prints a line per
// seed and planet and writes balance-report/trip-cell-energy.ndjson.

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 3_600_000

interface SeededTrip extends TripCellEnergy {
  worldSeed: number
  margin: number
}

/** One seed's bot slice, its trips priced per cell. */
function tripsOnSeed(worldSeed: number): SeededTrip[] {
  const fold = createTripCellEnergyFold()
  playLoggedSlice({ ...SCENARIO, worldSeed }, { watchEvents: fold.note })
  return fold.trips().map((trip) => ({ ...trip, worldSeed, margin: tripTankMarginOf(trip) }))
}

/** A trip that cut something: one with no cell has no per-cell figure to keep a margin on. */
function isCuttingTrip(trip: SeededTrip): boolean {
  return trip.cells > 0
}

/** Per seed and planet: trips, the lowest margin, and the bot's and the per-cell totals. */
function formatPlanetLines(trips: readonly SeededTrip[]): string {
  const keys = [...new Set(trips.map((trip) => `${trip.worldSeed} P${trip.planet}`))]
  const header = 'seed planet | trips | min margin | bot charged | per-cell | per-cell / bot'
  const lines = keys.map((key) => {
    const here = trips.filter((trip) => `${trip.worldSeed} P${trip.planet}` === key)
    const charged = here.reduce((sum, trip) => sum + trip.chargedQuanta, 0)
    const perCell = here.reduce((sum, trip) => sum + trip.perCellQuanta, 0)
    const minMargin = Math.min(...here.map((trip) => trip.margin))
    const ratio = charged === 0 ? 0 : perCell / charged
    return `${key} | ${here.length} | ${minMargin.toFixed(3)} | ${charged} | ${perCell} | ${ratio.toFixed(3)}`
  })
  return [header, ...lines].join('\n')
}

function writeTrips(trips: readonly SeededTrip[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = trips.map((trip) => JSON.stringify({ ticket: 529, ...trip }))
  writeFileSync(new URL('trip-cell-energy.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

describe('bot trips priced per cell on the player path (ticket 529, Systems on #514)', () => {
  it(
    'keeps the tank at least 1.138 times the per-cell energy of every trip on every pacing seed',
    () => {
      const trips = PACING_WORLD_SEEDS['bot-slice'].flatMap(tripsOnSeed)
      console.log(formatPlanetLines(trips))
      writeTrips(trips)
      const cutting = trips.filter(isCuttingTrip)
      expect(cutting.length).toBeGreaterThan(0)
      const under = cutting.filter((trip) => trip.margin < TRIP_TANK_MARGIN_FLOOR)
      expect(under).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
