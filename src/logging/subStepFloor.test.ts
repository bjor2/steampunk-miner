import { beforeAll, describe, expect, it } from 'vitest'
import { cutTrack } from '../systems/authority/digSpeedTrackFixtures'
import { blockHardness } from '../systems/economy/oreEconomy'
import { drillPower, startLevels, vehicleStatsAt } from '../systems/economy/vehicleStats'
import { div, toFixedText } from '../systems/money'
import { cutCellsPerSecondOf } from '../systems/vehicle/cutSpeed'
import { drillQuantumOnPlanet } from '../systems/vehicle/drillQuantum'
import { subStepsPerTileAt } from '../systems/vehicle/drillRule'

// The drill law past its old one-sub-step floor (ticket 558, #551 B1; the GD ruling on #551 and
// its amendment, VS and the TD 6254671302). At a fixed 60 sub-steps a tick a cell was paid in
// ceil(3600 H^3 / (D P^2)) sub-steps and never fewer than one, so on soft ground (planet 1 band 1,
// H = 1, the tip at step 0, P = 1) the step a purchase delivered left 1.181..1.305 at 24, was dead
// (x1.00) from 33 and stopped at 3600 cells/s from 37: ticket 552 carried that as known red, with
// this ticket as its expiry. The swept cut now counts in the rig's own drill quantum, the base
// doubled until a band-1 cell costs 100 sub-steps or more, so every purchase delivers its x1.243,
// within 1% of the law, and a drill cuts past 5000 cells/s.

const PURCHASE_BAND = { lowest: 1.181, highest: 1.305 }
const LAST_PURCHASE = 50
/** The kernel row past the old floor (#551 section 7, acceptance 6). */
const PAST_THE_FLOOR_CELLS_PER_SECOND = 5000
/** From here a soft-ground cut must be within 1% of the law (ticket 558's precision cliff row). */
const FAST_CELLS_PER_SECOND = 1000
const LAW_SHARE = 0.01
const PLANET = 1
const SOFT_GROUND = blockHardness(PLANET, 1)
/**
 * #551 acceptance 3: energy per metre new / today = D today / D new +-2% at L10, 20 and 30. Purchase
 * 1 is today's stored 1, so the bar reads each purchase's energy per metre of the same bore against
 * purchase 1's, beside D(1) / D(n); the band-1 level track of `digSpeedTrackFixtures.ts` at a speed
 * under each rig's cut, energy as the law charge (exact on law work) over the cells it removed.
 * Purchase 30 was the floor's own row (5 sub-steps a cell for a law of 4.3, +15%) until ticket 558.
 */
const ENERGY_RIGS = [
  { purchase: 1, speedMps: 1.4 },
  { purchase: 10, speedMps: 10 },
  { purchase: 20, speedMps: 85 },
  { purchase: 30, speedMps: 600 },
]
const ENERGY_TOLERANCE = 0.02

function drillAt(purchase: number) {
  return vehicleStatsAt({ ...startLevels(), drill_power: purchase })
}

/** Soft-ground cells a second at `purchase`, in its own drill quantum, the tip at step 0. */
function deliveredCellsPerSecondAt(purchase: number): number {
  const drill = drillAt(purchase)
  const quantum = drillQuantumOnPlanet(drill, PLANET)
  return cutCellsPerSecondOf(subStepsPerTileAt(quantum, drill, SOFT_GROUND) as number, quantum)
}

function lawCellsPerSecondAt(purchase: number): number {
  return Number(toFixedText(drillPower(purchase), 6))
}

/** The step purchase `purchase` delivers over the one before it, in cut speed. */
function deliveredStepOf(purchase: number): number {
  return deliveredCellsPerSecondAt(purchase) / deliveredCellsPerSecondAt(purchase - 1)
}

function purchasesBetween(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}

function isInBand(step: number): boolean {
  return step >= PURCHASE_BAND.lowest && step <= PURCHASE_BAND.highest
}

/** Law work a cell removed of the track's stretch, energy's measure on the law charge. */
function lawTicksPerCellAt(purchase: number, speedMps: number): number {
  const { stretch } = cutTrack({ speedMps, tilt: 'flat', section: 'level' }, 'swept', purchase)
  return stretch.law.ticks / stretch.law.cellsRemoved
}

interface EnergyRow {
  purchase: number
  ratio: number
  law: number
}

function energyRows(): EnergyRow[] {
  const [first, ...rest] = ENERGY_RIGS.map(({ purchase, speedMps }) => ({
    purchase,
    perCell: lawTicksPerCellAt(purchase, speedMps),
  }))
  return rest.map(({ purchase, perCell }) => ({
    purchase,
    ratio: perCell / first.perCell,
    law: Number(toFixedText(div(drillPower(first.purchase), drillPower(purchase)), 9)),
  }))
}

function isWithinEnergyTolerance({ ratio, law }: EnergyRow): boolean {
  return Math.abs(ratio / law - 1) <= ENERGY_TOLERANCE
}

function energyProblemOf(row: EnergyRow): string {
  return `purchase ${row.purchase} spends ${row.ratio.toFixed(5)} of purchase 1's energy a metre, the law ${row.law.toFixed(5)}`
}

describe('the drill law past the lifted sub-step floor (#551, ticket 558)', () => {
  let energy: EnergyRow[] = []

  beforeAll(() => {
    energy = energyRows()
    console.log(energy.map(energyProblemOf).join('\n'))
  }, 120_000)

  it('spends energy a metre at D today / D new within 2% at purchases 10, 20 and 30', () => {
    expect(energy.map(({ purchase }) => purchase)).toEqual([10, 20, 30])
    expect(energy.filter((row) => !isWithinEnergyTolerance(row)).map(energyProblemOf)).toEqual([])
  })

  it('delivers 1.181 to 1.305 a purchase on soft ground through purchase 50, none of them dead', () => {
    const outside = purchasesBetween(2, LAST_PURCHASE).filter(
      (purchase) => !isInBand(deliveredStepOf(purchase)),
    )
    expect(outside).toEqual([])
  })

  it('cuts soft ground within 1% of the law from 1000 cells/s to purchase 50', () => {
    const fast = purchasesBetween(1, LAST_PURCHASE).filter(
      (purchase) => lawCellsPerSecondAt(purchase) >= FAST_CELLS_PER_SECOND,
    )
    const offLaw = fast.filter(
      (purchase) =>
        deliveredCellsPerSecondAt(purchase) < lawCellsPerSecondAt(purchase) * (1 - LAW_SHARE),
    )
    expect(fast.length).toBeGreaterThan(15)
    expect(offLaw).toEqual([])
  })

  it('cuts soft ground at 5000 cells/s and more, past the old 3600', () => {
    const fastest = deliveredCellsPerSecondAt(LAST_PURCHASE)
    expect(fastest).toBeGreaterThan(PAST_THE_FLOOR_CELLS_PER_SECOND)
    const first = purchasesBetween(1, LAST_PURCHASE).find(
      (purchase) => deliveredCellsPerSecondAt(purchase) >= PAST_THE_FLOOR_CELLS_PER_SECOND,
    )
    expect(lawCellsPerSecondAt(first as number)).toBeGreaterThanOrEqual(
      PAST_THE_FLOOR_CELLS_PER_SECOND,
    )
  })
})
